'use strict';
/* ツール: 投票（ライバー側）
   お題と選択肢を決めてリンクを発行し、リスナーに配って集計する。
   ガーベラで唯一サーバーを使う機能で、票は api/ 経由でだけ出し入れする。
   集計は投票を作ったときに一度だけ受け取る合言葉（ownerKey）が要るので、
   リンクを開いた人が途中経過を見ることはできない。

   画面は「つくる → 配る → 集計する」の3枚をスライドで送る。 */
(function () {
  const { register, Store, h, toast, modal, confirmDialog, sharePost, copyShareText } = Gerbera;
  const KEY = 'vote.current';       // 進行中の投票 {id, ownerKey, title, options, deadline}
  const MAX_OPTIONS = 5;
  const MIN_OPTIONS = 2;

  function voteUrl(id) {
    return new URL('vote.html?p=' + encodeURIComponent(id), location.href.split('#')[0]).href;
  }
  function fmtLeft(ms) {
    ms = Math.max(0, ms);
    const s = Math.floor(ms / 1000);
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    const p2 = n => String(n).padStart(2, '0');
    return (hh > 0 ? hh + ':' + p2(mm) : mm) + ':' + p2(ss);
  }
  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
    let data = null;
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((data && data.error) || 'request_failed');
    return data;
  }
  const ERRORS = {
    title_required: '投票内容を入力してください',
    need_two_options: '選択肢は2つ以上入れてください',
    too_many_options: `選択肢は最大${MAX_OPTIONS}つまでです`,
    option_too_long: '選択肢が長すぎます',
    title_too_long: '投票内容が長すぎます',
    limit_too_long: '制限時間は7日までです',
    storage_unconfigured: 'サーバー側の準備ができていません',
    not_found: 'この投票は見つかりませんでした',
    forbidden: 'この投票の集計を見る権限がありません'
  };
  const errText = e => ERRORS[e && e.message] || '通信できませんでした。電波の状態を確かめてもう一度お試しください';

  register({
    id: 'vote', name: '投票', icon: '🗳️',
    mount(root) {
      let poll = Store.get(KEY, null);
      let timeLimitOn = false;
      let openToAll = false;
      let options = ['', ''];
      let title = '';
      let ticking = null;

      const stage = h('div', { class: 'vote-stage' });
      root.append(stage);

      function show(el) {
        stage.replaceChildren(el);
        requestAnimationFrame(() => el.classList.add('in'));
      }

      /* ---------- 制限時間の残り（ライバー側の中央上部） ---------- */
      function countdownEl(deadline) {
        const el = h('div', { class: 'vote-clock' });
        const paint = () => {
          const left = deadline - Date.now();
          el.textContent = left > 0 ? '残り ' + fmtLeft(left) : '制限時間を過ぎました';
          el.classList.toggle('over', left <= 0);
        };
        paint();
        clearInterval(ticking);
        ticking = setInterval(paint, 500);
        return el;
      }

      /* ================= 1枚目：つくる ================= */
      function renderCompose() {
        clearInterval(ticking);
        const titleIn = h('textarea', { class: 'input vote-title-in', maxlength: 200,
          placeholder: '投票内容（例：次の歌枠で歌ってほしいのは？）' }, title);
        titleIn.addEventListener('input', () => { title = titleIn.value; });

        /* トグルを切り替えても小窓の高さが変わらないよう、行そのものは常に置いて
           中身の見え方だけ切り替える */
        function timeNum(max, label) {
          return h('input', { class: 'input w-num', type: 'number', min: 0, max,
            inputmode: 'numeric', placeholder: '0', 'aria-label': label });
        }
        const dIn = timeNum(7, '日'), hIn = timeNum(23, '時間'), mIn = timeNum(59, '分'), sIn = timeNum(59, '秒');
        const limitRow = h('div', { class: 'vote-limit' },
          h('span', { class: 'vote-limit-label' }, '制限時間'),
          dIn, h('b', {}, '日'), hIn, h('b', {}, '時'), mIn, h('b', {}, '分'), sIn, h('b', {}, '秒'));
        function paintLimit() {
          limitRow.classList.toggle('off', !timeLimitOn);
          [dIn, hIn, mIn, sIn].forEach(i => { i.disabled = !timeLimitOn; });
        }

        const toggle = h('button', { class: 'toggle' + (timeLimitOn ? ' on' : ''),
          role: 'switch', 'aria-checked': timeLimitOn ? 'true' : 'false',
          onclick: () => {
            timeLimitOn = !timeLimitOn;
            toggle.classList.toggle('on', timeLimitOn);
            toggle.setAttribute('aria-checked', timeLimitOn ? 'true' : 'false');
            paintLimit();
          } });
        paintLimit();

        /* 既定はOFF＝合言葉が要る限定公開。ONにすると合言葉なしで誰でも投票できる */
        const accessToggle = h('button', { class: 'toggle' + (openToAll ? ' on' : ''),
          role: 'switch', 'aria-checked': openToAll ? 'true' : 'false',
          onclick: () => {
            openToAll = !openToAll;
            accessToggle.classList.toggle('on', openToAll);
            accessToggle.setAttribute('aria-checked', openToAll ? 'true' : 'false');
            paintAccess();
          } });
        const accessNote = h('p', { class: 'vote-access-note' });
        function paintAccess() {
          accessNote.textContent = openToAll
            ? 'リンクを知っていれば誰でも投票できます（合言葉なし）'
            : '発行後に合言葉が表示されます。伝えた人だけが投票画面に進めます';
        }
        paintAccess();
        const accessRow = h('div', { class: 'vote-access' },
          h('span', { class: 'vote-access-label' }, '🔓 誰でも投票可能'),
          accessToggle);

        const optWrap = h('div', { class: 'vote-opts' });
        function paintOptions() {
          optWrap.replaceChildren(
            ...options.map((v, i) => {
              const inp = h('input', { class: 'input grow', maxlength: 60, value: v,
                placeholder: `選択肢${i + 1}`, 'aria-label': `選択肢${i + 1}` });
              inp.addEventListener('input', () => { options[i] = inp.value; });
              return h('div', { class: 'vote-opt-row' }, inp,
                h('button', { class: 'icon-btn danger', 'aria-label': `選択肢${i + 1}を削除`,
                  'data-lbl': '削除', disabled: options.length <= MIN_OPTIONS,
                  onclick: () => {
                    if (options.length <= MIN_OPTIONS) { toast(`選択肢は${MIN_OPTIONS}つ以上必要です`); return; }
                    options.splice(i, 1); paintOptions();
                  } }, '🗑'));
            }),
            h('button', { class: 'btn btn-ghost btn-sm btn-full mt8',
              disabled: options.length >= MAX_OPTIONS,
              onclick: () => {
                if (options.length >= MAX_OPTIONS) { toast(`選択肢は最大${MAX_OPTIONS}つまでです`); return; }
                options.push(''); paintOptions();
              } }, options.length >= MAX_OPTIONS ? `選択肢は${MAX_OPTIONS}つまで` : '＋ 選択肢を追加'));
        }
        paintOptions();

        const goBtn = h('button', { class: 'btn btn-primary btn-big btn-full mt12',
          onclick: async () => {
            const t = titleIn.value.trim();
            const opts = options.map(o => o.trim()).filter(Boolean);
            if (!t) { toast('投票内容を入力してください'); return; }
            if (opts.length < MIN_OPTIONS) { toast(`選択肢を${MIN_OPTIONS}つ以上入れてください`); return; }
            const limitSec = timeLimitOn
              ? (+dIn.value || 0) * 86400 + (+hIn.value || 0) * 3600 + (+mIn.value || 0) * 60 + (+sIn.value || 0)
              : 0;
            if (timeLimitOn && limitSec <= 0) { toast('制限時間を入力してください'); return; }

            goBtn.disabled = true;
            goBtn.textContent = 'リンクを発行しています…';
            try {
              const r = await api('/api/poll', {
                method: 'POST',
                body: JSON.stringify({ title: t, options: opts, limitSec, openToAll })
              });
              poll = { id: r.id, ownerKey: r.ownerKey, title: t, options: opts,
                deadline: r.deadline || null, pass: r.pass || null };
              Store.set(KEY, poll);
              renderShare();
            } catch (e) {
              toast(errText(e));
              goBtn.disabled = false;
              goBtn.textContent = '🗳️ 投票を行う';
            }
          } }, '🗳️ 投票を行う');

        const card = h('div', { class: 'card vote-card' },
          h('div', { class: 'vote-head' },
            h('span', { class: 'section-label', style: 'margin:0' }, '🗳️ 投票をつくる'),
            h('span', { class: 'vote-head-toggle' },
              h('span', { class: 'vote-toggle-label' }, '制限時間'), toggle)),
          accessRow,
          accessNote,
          titleIn,
          limitRow,
          h('div', { class: 'input-label', style: 'margin-top:10px' }, '選択肢'),
          optWrap,
          goBtn,
          h('p', { class: 'note center', style: 'margin-top:8px' },
            'リンクが発行されます。Xやファンサーバーなどに投稿してください'),
          poll ? h('button', { class: 'btn btn-ghost btn-sm btn-full mt12',
            onclick: () => renderResult() }, '前回の投票の集計にもどる') : null);

        show(h('div', { class: 'vote-pane' }, card));
      }

      /* ================= 2枚目：配る ================= */
      function renderShare() {
        const url = voteUrl(poll.id);
        const text = `【投票】${poll.title}\nこちらから投票してね！`;
        const urlBox = h('div', { class: 'vote-link' }, url);

        const card = h('div', { class: 'card vote-card' },
          poll.deadline ? countdownEl(poll.deadline) : null,
          h('div', { class: 'vote-done-mark' }, '✓'),
          h('p', { class: 'vote-done-text' }, '投票のリンクを発行しました'),
          h('p', { class: 'note center' }, poll.title),
          urlBox,
          poll.pass ? h('div', { class: 'vote-pass-box' },
            h('span', { class: 'vote-pass-label' }, '合言葉'),
            h('span', { class: 'vote-pass-value' }, poll.pass)) : null,
          poll.pass ? h('p', { class: 'note center', style: 'margin-top:6px' },
            'この合言葉を、投票してほしい人にだけ伝えてください') : null,
          h('button', { class: 'btn btn-ghost btn-full mt8',
            onclick: () => copyShareText(url).then(() => toast('📋 リンクをコピーしました')) }, '📋 リンクをコピー'),
          h('button', { class: 'btn btn-primary btn-full mt8',
            onclick: () => { sharePost(text, { url, title: 'どこで投票を配りますか？' }); renderResult(); } },
            '📣 リンクを配る'),
          h('button', { class: 'btn btn-lav btn-full mt12', onclick: () => renderResult() },
            '投票結果の画面へ進む ›'));

        show(h('div', { class: 'vote-pane' }, card));
      }

      /* ================= 3枚目：集計する ================= */
      function renderResult() {
        clearInterval(ticking);
        const body = h('div');
        const tallyBtn = h('button', { class: 'btn btn-primary btn-big vote-tally-btn',
          onclick: () => runTally() }, '📊 集計を行う');
        const head = h('div', { class: 'vote-result-head' },
          poll.deadline ? countdownEl(poll.deadline) : null, tallyBtn);

        async function runTally() {
          tallyBtn.disabled = true;
          tallyBtn.textContent = '集計しています…';
          try {
            const r = await api(`/api/results?id=${encodeURIComponent(poll.id)}&key=${encodeURIComponent(poll.ownerKey)}`);
            paintTally(r);
          } catch (e) {
            toast(errText(e));
          }
          tallyBtn.disabled = false;
          tallyBtn.textContent = '📊 集計をやり直す';
        }

        function paintTally(r) {
          const top = r.rows[0];
          const isTie = r.rows.length > 1 && r.rows[1].count === top.count && top.count > 0;
          const max = Math.max(1, top.count);
          body.replaceChildren(
            h('p', { class: 'vote-winner' },
              r.total === 0 ? 'まだ投票がありません'
                : isTie ? `同数で並んでいます` : `一番票が多かったのは${top.label}です`),
            h('p', { class: 'vote-total' }, `総投票数は${r.total}件でした`),
            h('div', { class: 'vote-bars' },
              r.rows.map(row => h('div', { class: 'vote-bar-row' },
                h('div', { class: 'vote-bar-head' },
                  h('span', { class: 'vote-bar-label' }, row.label),
                  h('span', { class: 'vote-bar-count' }, `${row.count}票・${row.percent}%`)),
                h('div', { class: 'vote-bar-track' },
                  h('i', { class: 'vote-bar-fill', style: `width:${Math.round((row.count / max) * 100)}%` })),
                row.names.length
                  ? h('div', { class: 'vote-bar-names' }, row.names.join('・'))
                  : null))),
            h('div', { class: 'vote-result-foot' },
              h('button', { class: 'btn btn-ghost btn-full', onclick: () => {
                confirmDialog('いまの集計を閉じて、新しい投票をつくりますか？', () => {
                  Store.remove(KEY);
                  poll = null; title = ''; options = ['', '']; timeLimitOn = false; openToAll = false;
                  renderCompose();
                }, { title: '新しく投票を行う', okLabel: 'つくる', danger: false });
              } }, '＋ 新しく投票を行う'),
              h('button', { class: 'btn btn-primary btn-full mt8', onclick: () => {
                const lines = r.rows.map(x => `・${x.label}　${x.count}票（${x.percent}%）`);
                sharePost(`【投票結果】${r.title}\n総投票数は${r.total}件でした\n${lines.join('\n')}`,
                  { title: 'どこに結果を出しますか？' });
              } }, '📣 結果を公開する')));
        }

        show(h('div', { class: 'vote-pane' }, h('div', { class: 'card vote-card' }, head, body)));
      }

      if (poll) renderResult(); else renderCompose();
      return () => clearInterval(ticking);
    }
  });
})();
