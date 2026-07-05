'use strict';
/* ツール: トークテーマガチャ（カテゴリー別・更新のたび新しいテーマ） */
(function () {
  const { register, h } = Gerbera;

  // カテゴリーごとに山札方式（使い切るまで同じテーマを出さない）
  const decks = {};
  function drawFrom(cat) {
    const src = Gerbera.DATA.talkThemes[cat] || [];
    if (!decks[cat] || !decks[cat].length) {
      decks[cat] = [...src].sort(() => Math.random() - 0.5);
    }
    return decks[cat].pop();
  }

  register({
    id: 'theme', name: 'トークテーマ', icon: '💬',
    mount(root) {
      const cats = Object.keys(Gerbera.DATA.talkThemes);
      let cat = cats[0];

      const themeEl = h('div', { class: 'result-card' });
      function draw() {
        const t = drawFrom(cat);
        themeEl.replaceChildren(
          h('div', { class: 'result-sub' }, cat),
          h('div', { class: 'result-main pop', style: 'font-size:24px' }, t || 'テーマがありません'));
      }

      const chipRow = h('div', { class: 'chip-wrap', style: 'justify-content:center' },
        cats.map(c =>
          h('button', { class: 'chip' + (c === cat ? ' on' : ''),
            onclick: e => {
              cat = c;
              chipRow.querySelectorAll('.chip').forEach(el => el.classList.remove('on'));
              e.currentTarget.classList.add('on');
              draw();
            } }, c)));

      root.append(
        h('div', { class: 'card' },
          chipRow,
          h('div', { class: 'mt12' }, themeEl),
          h('button', { class: 'btn btn-primary btn-big btn-full mt12', onclick: draw }, '💬 新しいテーマ'))
      );
      draw();
    }
  });
})();
