'use strict';
/* ツール: ガチャ（抽選結果編集・排出率設定・リスナー名入力・結果表示） */
(function () {
  const { register, Store, h, uid, toast } = Gerbera;
  const KEY = 'gacha.items';

  register({
    id: 'gacha', name: 'ガチャ', icon: '🎁',
    mount(root) {
      let items = Store.get(KEY, []);
      const save = () => Store.set(KEY, items);

      const nameInput = h('input', { class: 'input', placeholder: 'リスナーさんの名前（省略OK）' });
      const resultArea = h('div');
      const emptyMsg = h('div', { class: 'empty', hidden: items.length > 0 },
        '景品がまだありません。', h('br'), '下の「景品と排出率を編集する」から追加してね');

      function draw() {
        const pool = items.filter(it => (+it.rate || 0) > 0 && it.name.trim());
        const total = pool.reduce((a, b) => a + (+b.rate || 0), 0);
        if (!pool.length || total <= 0) { toast('景品と排出率を設定してね'); return; }
        let r = Math.random() * total;
        let hit = pool[pool.length - 1];
        for (const it of pool) {
          r -= (+it.rate || 0);
          if (r < 0) { hit = it; break; }
        }
        const who = nameInput.value.trim();
        const pct = Math.round((+hit.rate / total) * 1000) / 10;
        resultArea.replaceChildren(
          h('div', { class: 'result-card pop' },
            h('div', { class: 'result-sub' }, who ? `${who} さんの結果` : 'ガチャの結果'),
            h('div', { class: 'result-main' }, '✨ ' + hit.name + ' ✨'),
            h('div', { class: 'result-note' }, `排出率 ${pct}%`)));
      }

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
            h('button', { class: 'icon-btn danger', 'aria-label': 'この景品を削除',
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
          h('button', { class: 'btn btn-primary btn-big btn-full mt12', onclick: draw }, '🎁 ガチャを回す'),
          h('div', { class: 'mt16' }, resultArea),
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
