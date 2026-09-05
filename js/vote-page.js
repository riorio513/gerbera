'use strict';
/* リスナーが投票する画面（vote.html）。
   ライバーが決めたお題と選択肢しか出さない。ほかの人が何を選んだかは
   この画面からは一切わからない（集計はライバーの手元でしか開けない）。 */
(function () {
  const { h, modal, toast, Store } = Gerbera;
  const root = document.getElementById('vp');
  const pollId = new URLSearchParams(location.search).get('p') || '';

  /* この端末を表すID。同じ人が入れ直したときに二重に数えないためだけに使う */
  function voterId() {
    let v = Store.get('voterId', null);
    if (!/^[0-9a-f]{16,64}$/.test(v || '')) {
      const b = new Uint8Array(8);
      (window.crypto || window.msCrypto).getRandomValues(b);
      v = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
      Store.set('voterId', v);
    }
    return v;
  }
  const votedKey = id => 'voted.' + id;

  function fmtLeft(ms) {
    ms = Math.max(0, ms);
    const s = Math.floor(ms / 1000);
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    const p2 = n => String(n).padStart(2, '0');
    return (hh > 0 ? hh + ':' + p2(mm) : mm) + ':' + p2(ss);
  }

  function card(...kids) { return h('div', { class: 'card vp-card' }, ...kids); }
  function notice(icon, text, sub) {
    root.replaceChildren(card(
      h('div', { class: 'vp-notice-ico' }, icon),
      h('p', { class: 'vp-notice' }, text),
      sub ? h('p', { class: 'note center', style: 'margin-top:8px' }, sub) : null));
  }

  async function load() {
    if (!pollId) { notice('🔗', 'リンクが正しくありません', 'ライバーさんからもらったリンクをもう一度開いてみてください'); return; }
    root.replaceChildren(card(h('p', { class: 'note center' }, '読み込んでいます…')));
    let poll;
    try {
      const r = await fetch('/api/poll?id=' + encodeURIComponent(pollId), { cache: 'no-store' });
      poll = await r.json();
      if (!r.ok) throw new Error(poll && poll.error);
    } catch (e) {
      if (e && e.message === 'not_found') {
        notice('🌸', 'この投票は見つかりませんでした', 'すでに終了しているかもしれません');
      } else {
        notice('📶', '読み込めませんでした', '電波の状態を確かめて、もう一度開いてみてください');
      }
      return;
    }

    /* リンクを開いた時点で締め切りを過ぎていた場合 */
    if (poll.closed) { notice('⏰', '投票の制限時間を過ぎました'); return; }
    if (Store.get(votedKey(pollId), false)) { renderDone(); return; }
    renderVote(poll);
  }

  function renderDone() {
    notice('✅', '投票が完了しました。結果をお待ちください');
  }

  function renderVote(poll) {
    let ticking = null;
    const clock = poll.deadline ? h('div', { class: 'vote-clock' }) : null;

    const nameIn = h('input', { class: 'input', maxlength: 30, placeholder: 'お名前（入れなくてOK）' });
    const nameHint = h('p', { class: 'note', style: 'margin-top:4px' }, '無記名で匿名投票となります');
    nameIn.addEventListener('input', () => {
      nameHint.textContent = nameIn.value.trim()
        ? `「${nameIn.value.trim()}」として投票します`
        : '無記名で匿名投票となります';
    });

    const list = h('div', { class: 'vp-opts' },
      poll.options.map((label, i) =>
        h('button', { class: 'vp-opt', onclick: () => confirmChoice(i, label) },
          h('span', { class: 'vp-opt-mark' }, i + 1),
          h('span', { class: 'vp-opt-label' }, label))));

    /* 開いたまま制限時間を迎えて、まだ投票していない場合 */
    function paintClock() {
      if (!clock) return;
      const left = poll.deadline - Date.now();
      if (left <= 0) {
        clearInterval(ticking);
        notice('⏰', '制限時間が過ぎたため、投票できません');
        return;
      }
      clock.textContent = '残り ' + fmtLeft(left);
      clock.classList.toggle('soon', left <= 30000);
    }
    if (clock) { paintClock(); ticking = setInterval(paintClock, 500); }

    function confirmChoice(index, label) {
      modal({
        title: '確認',
        render(body, { close }) {
          body.append(
            h('p', { class: 'vp-confirm-q' }, 'この選択肢で投票しますか？'),
            h('div', { class: 'vp-confirm-choice' }, label),
            h('div', { class: 'hstack mt16', style: 'gap:10px' },
              h('button', { class: 'btn btn-ghost grow', onclick: close }, 'いいえ'),
              h('button', { class: 'btn btn-primary grow',
                onclick: () => { close(); send(index); } }, 'はい')));
        }
      });
    }

    async function send(index) {
      list.querySelectorAll('.vp-opt').forEach(b => { b.disabled = true; });
      try {
        const r = await fetch('/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: pollId, choice: index,
            name: nameIn.value.trim(), voterId: voterId()
          })
        });
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data && data.error);
        clearInterval(ticking);
        Store.set(votedKey(pollId), true);
        renderDone();
      } catch (e) {
        if (e && e.message === 'closed') {
          clearInterval(ticking);
          notice('⏰', '制限時間が過ぎたため、投票できません');
          return;
        }
        toast('送信できませんでした。もう一度お試しください');
        list.querySelectorAll('.vp-opt').forEach(b => { b.disabled = false; });
      }
    }

    root.replaceChildren(card(
      clock,
      h('h1', { class: 'vp-title' }, poll.title),
      h('div', { class: 'input-label', style: 'margin-top:14px' }, 'お名前'),
      nameIn,
      nameHint,
      h('div', { class: 'input-label', style: 'margin-top:14px' }, '選ぶ'),
      list,
      h('p', { class: 'note center', style: 'margin-top:14px' },
        'ほかの人がどれを選んだかは表示されません')));
  }

  load();
})();
