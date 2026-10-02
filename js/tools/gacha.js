'use strict';
/* ツール: ガチャ（抽選結果編集・排出率設定・リスナー名入力・結果表示・複数連） */
(function () {
  const { register, Store, h, uid, toast, fmtNum, sharePost, shareResultImage } = Gerbera;
  const KEY = 'gacha.items';
  const PULL_PRESETS = [1, 10, 100];
  const MAX_PULL = 1000;
  const TALLY_SHOW_MAX = 8;

  register({
    id: 'gacha', name: 'ガチャ', icon: '🎁',
    mount(root) {
      let items = Store.get(KEY, []);
      const save = () => Store.set(KEY, items);
      let pullCount = 1;

      const nameInput = h('input', { class: 'input', placeholder: 'リスナーさんの名前（省略OK）' });
      const resultArea = h('div');
      let last = null; // {who, n, tally:[{name,count}], hitName}

      function tallyLines(cap) {
        const lines = last.tally.slice(0, cap).map(t => `・${t.name}×${t.count}`);
        if (last.tally.length > cap) lines.push(`他 ${last.tally.length - cap} 種`);
        return lines;
      }
      function postText() {
        if (last.n === 1) {
          const subject = last.who ? `${last.who}さんのガチャ結果` : 'ガチャ結果';
          return `【ガチャ】\n${subject}は${last.hitName}でした！`;
        }
        const subject = last.who ? `${last.who}さんの` : '';
        return `【ガチャ】\n${subject}${fmtNum(last.n)}連ガチャの結果！\n` + tallyLines(TALLY_SHOW_MAX).join('\n');
      }
      const postBtn = h('button', { class: 'btn btn-lav grow', hidden: true,
        onclick: () => { if (last) sharePost(postText()); } }, '🐦 文章でポスト');
      const postImgBtn = h('button', { class: 'btn btn-ghost grow', hidden: true,
        onclick: () => {
          if (!last) return;
          if (last.n === 1) {
            shareResultImage({ badge: '【ガチャ】' + (last.who ? `${last.who}さんの結果` : ''),
              main: last.hitName, note: '', postText: postText() });
          } else {
            shareResultImage({
              badge: '【ガチャ】' + (last.who ? `${last.who}さんの` : '') + `${fmtNum(last.n)}連ガチャ`,
              main: '',
              note: tallyLines(6).join('\n'),
              postText: postText()
            });
          }
        } }, '🖼️ 画像でポスト');
      const postRow = h('div', { class: 'hstack mt8' }, postBtn, postImgBtn);
      const emptyMsg = h('div', { class: 'empty', hidden: items.length > 0 },
        '景品がまだありません。', h('br'), '下の「景品と排出率を編集する」から追加してね');

      /* --- 引く回数 --- */
      const pullChips = PULL_PRESETS.map(n =>
        h('button', { class: 'chip' + (pullCount === n ? ' on' : ''),
          onclick: () => { pullCount = n; syncPullUI(); } }, n + '連'));
      const pullCustom = h('input', { class: 'input w-num', type: 'number', min: 1, max: MAX_PULL,
        inputmode: 'numeric', value: pullCount, 'aria-label': '引く回数（自由入力）',
        oninput: e => {
          const v = Math.max(1, Math.min(MAX_PULL, Math.floor(+e.target.value) || 1));
          pullCount = v;
          syncPullUI();
        } });
      function syncPullUI() {
        pullChips.forEach((el, i) => el.classList.toggle('on', pullCount === PULL_PRESETS[i]));
        if (+pullCustom.value !== pullCount) pullCustom.value = pullCount;
        drawBtn.textContent = pullCount === 1 ? '🎁 ガチャを回す' : `🎁 ${fmtNum(pullCount)}連ガチャを回す`;
      }

      function draw() {
        const pool = items.filter(it => (+it.rate || 0) > 0 && it.name.trim());
        const total = pool.reduce((a, b) => a + (+b.rate || 0), 0);
        if (!pool.length || total <= 0) { toast('景品と排出率を設定してね'); return; }

        function pullOnce() {
          let r = Math.random() * total;
          let hit = pool[pool.length - 1];
          for (const it of pool) {
            r -= (+it.rate || 0);
            if (r < 0) { hit = it; break; }
          }
          return hit;
        }

        const who = nameInput.value.trim();
        const n = pullCount;

        if (n === 1) {
          const hit = pullOnce();
          const pct = Math.round((+hit.rate / total) * 1000) / 10;
          last = { who, n: 1, hitName: hit.name, tally: [{ name: hit.name, count: 1 }] };
          resultArea.replaceChildren(
            h('div', { class: 'result-card pop' },
              h('div', { class: 'result-sub' }, who ? `${who} さんの結果` : 'ガチャの結果'),
              h('div', { class: 'result-main' }, '✨ ' + hit.name + ' ✨'),
              h('div', { class: 'result-note' }, `排出率 ${pct}%`)));
        } else {
          const counts = new Map();
          for (let i = 0; i < n; i++) {
            const hit = pullOnce();
            counts.set(hit.name, (counts.get(hit.name) || 0) + 1);
          }
          const tally = Array.from(counts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
          last = { who, n, tally };
          resultArea.replaceChildren(
            h('div', { class: 'result-card pop' },
              h('div', { class: 'result-sub' }, (who ? `${who} さんの` : '') + `${fmtNum(n)}連ガチャの結果`),
              h('div', { class: 'vstack mt8', style: 'gap:6px;text-align:left' },
                tally.map(t => h('div', { class: 'hstack', style: 'justify-content:space-between' },
                  h('span', {}, t.name),
                  h('span', { class: 'badge' }, '×' + fmtNum(t.count)))))));
        }
        postBtn.hidden = false;
        postImgBtn.hidden = false;
        /* 続けて別の人を引くとき、前の人の名前を毎回消さずに済むようにする
           （結果カードには引いた人の名前が残るので、消えても分からなくならない） */
        nameInput.value = '';
      }

      const drawBtn = h('button', { class: 'btn btn-primary btn-big btn-full mt12', onclick: draw }, '🎁 ガチャを回す');

      /* --- 景品編集 --- */
      const editHeader = h('div', { class: 'hstack', style: 'gap:9px;padding:0 2px' },
        h('span', { class: 'input-label', style: 'margin:0;flex:1' }, '景品名'),
        h('span', { class: 'input-label', style: 'margin:0;width:76px;text-align:center' }, '排出率'),
        h('span', { style: 'width:38px;flex-shrink:0' }));
      const editList = h('div');
      const totalNote = h('div', { class: 'note mt8' });
      function paintTotal() {
        const total = items.reduce((a, b) => a + (+b.rate || 0), 0);
        totalNote.textContent = `排出率の合計: ${total}（100でなくてもOK。割合で計算します）`;
      }
      function renderEditor() {
        editList.replaceChildren(...items.map(it =>
          h('div', { class: 'list-row' },
            h('input', { class: 'input grow', value: it.name, placeholder: '景品名',
              oninput: e => { it.name = e.target.value; save(); } }),
            h('input', { class: 'input w-num', type: 'number', min: 0, step: 'any', inputmode: 'decimal',
              value: it.rate, placeholder: '排出率', 'aria-label': '排出率',
              oninput: e => { it.rate = e.target.value === '' ? 0 : +e.target.value; save(); paintTotal(); } }),
            h('button', { class: 'icon-btn danger', 'aria-label': 'この景品を削除', 'data-lbl': '削除',
              onclick: () => {
                items = items.filter(x => x.id !== it.id);
                save();
                renderEditor();
                emptyMsg.hidden = items.length > 0;
              } }, '🗑'))));
        editHeader.hidden = items.length === 0;
        paintTotal();
      }
      renderEditor();

      root.append(
        h('div', { class: 'card' },
          nameInput,
          h('div', { class: 'mt12' },
            h('span', { class: 'input-label' }, '引く回数'),
            h('div', { class: 'hstack', style: 'flex-wrap:wrap;gap:6px' },
              pullChips,
              h('span', { class: 'note' }, 'または'),
              pullCustom)),
          drawBtn,
          h('div', { class: 'mt16' }, resultArea),
          postRow,
          emptyMsg,
          h('details', { class: 'editor' },
            h('summary', {}, '⚙️ 景品と排出率を編集する'),
            h('div', { class: 'editor-body' },
              editHeader,
              editList,
              totalNote,
              h('button', { class: 'btn btn-ghost btn-sm btn-full mt12',
                onclick: () => {
                  items.push({ id: uid(), name: '', rate: 10 });
                  save();
                  renderEditor();
                  emptyMsg.hidden = true;
                } }, '＋ 景品を追加'))))
      );
    }
  });
})();
