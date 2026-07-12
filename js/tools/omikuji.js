'use strict';
/* ツール: おみくじ（運勢・コメント編集、くじ追加削除、リスナー名、Xへポスト） */
(function () {
  const { register, Store, h, uid, toast, openX, shareResultImage } = Gerbera;
  const KEY = 'omikuji.lots';

  function loadLots() {
    let lots = Store.get(KEY, null);
    if (!lots || !lots.length) {
      lots = Gerbera.DATA.omikujiDefaults.map(d => ({ id: uid(), name: d.name, comment: d.comment }));
      Store.set(KEY, lots);
    }
    return lots;
  }

  register({
    id: 'omikuji', name: 'おみくじ', icon: '⛩️',
    mount(root) {
      let lots = loadLots();
      let last = null; // {listener, lot}

      const nameInput = h('input', { class: 'input', placeholder: 'リスナーさんの名前（省略OK）' });
      const resultArea = h('div');
      function subjectText() { return last.listener ? `${last.listener}さんの今日の運勢` : '今日の運勢'; }
      function postText() { return `【おみくじ】\n${subjectText()}は${last.lot.name}でした！${last.lot.comment}`; }
      const postBtn = h('button', { class: 'btn btn-lav grow', hidden: true,
        onclick: () => { if (last) openX(postText()); } }, '🐦 文章でポスト');
      const postImgBtn = h('button', { class: 'btn btn-ghost grow', hidden: true,
        onclick: () => {
          if (!last) return;
          shareResultImage({ badge: '【おみくじ】' + (last.listener ? `${last.listener}さんの結果` : ''),
            main: last.lot.name, note: last.lot.comment, postText: postText() });
        } }, '🖼️ 画像でポスト');
      const postRow = h('div', { class: 'hstack mt8' }, postBtn, postImgBtn);

      function draw() {
        if (!lots.length) { toast('くじがありません。編集から追加してね'); return; }
        const lot = lots[Math.floor(Math.random() * lots.length)];
        last = { listener: nameInput.value.trim(), lot };
        resultArea.replaceChildren(
          h('div', { class: 'result-card pop' },
            h('div', { class: 'result-sub' }, last.listener ? `${last.listener} さんの運勢` : '今日の運勢'),
            h('div', { class: 'result-main' }, lot.name),
            h('div', { class: 'result-note' }, lot.comment)));
        postBtn.hidden = false;
        postImgBtn.hidden = false;
      }

      /* --- くじ編集 --- */
      const editList = h('div');
      function renderEditor() {
        editList.replaceChildren(...lots.map(lot =>
          h('div', { class: 'list-row', style: 'align-items:flex-start' },
            h('div', { class: 'grow vstack', style: 'gap:6px' },
              h('input', { class: 'input', value: lot.name, placeholder: '運勢（例：大吉）',
                oninput: e => { lot.name = e.target.value; Store.set(KEY, lots); } }),
              h('input', { class: 'input', value: lot.comment, placeholder: 'コメント',
                oninput: e => { lot.comment = e.target.value; Store.set(KEY, lots); } })),
            h('button', { class: 'icon-btn danger', 'aria-label': 'このくじを削除',
              onclick: () => {
                lots = lots.filter(l => l.id !== lot.id);
                Store.set(KEY, lots);
                renderEditor();
              } }, '🗑'))));
      }
      renderEditor();

      root.append(
        h('div', { class: 'card' },
          nameInput,
          h('button', { class: 'btn btn-primary btn-big btn-full mt12', onclick: draw }, '⛩️ おみくじを引く'),
          h('div', { class: 'mt16' }, resultArea),
          postRow,
          h('details', { class: 'editor' },
            h('summary', {}, '⚙️ くじを編集する'),
            h('div', { class: 'editor-body' },
              editList,
              h('button', { class: 'btn btn-ghost btn-sm btn-full mt12',
                onclick: () => {
                  lots.push({ id: uid(), name: '', comment: '' });
                  Store.set(KEY, lots);
                  renderEditor();
                } }, '＋ くじを追加'))))
      );
    }
  });
})();
