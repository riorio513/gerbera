'use strict';
/* ツール: 効果音（SE）。ボタンを押すと鳴る。音源の一覧は js/se.js */
(function () {
  const { register, h } = Gerbera;

  register({
    id: 'se', name: '効果音', icon: '🔊',
    mount(root) {
      const SE = Gerbera.SE;
      if (!SE) {
        root.append(h('div', { class: 'card' }, h('div', { class: 'empty' }, '効果音を読み込めませんでした')));
        return;
      }
      root.append(
        h('div', { class: 'card' },
          h('div', { class: 'hstack', style: 'justify-content:flex-end;margin-bottom:8px' },
            h('button', { class: 'btn btn-ghost btn-sm', 'aria-label': '鳴っている効果音をすべて止める',
              onclick: () => SE.stopAll() }, '■ 停止')),
          SE.categories.map((cat, i) =>
            h('div', { class: i ? 'mt12' : '' },
              h('div', { class: 'section-label' }, cat.label),
              h('div', { class: 'chip-wrap mt8' },
                SE.list.filter(se => se.category === cat.id).map(se =>
                  h('button', { class: 'chip', onclick: () => SE.play(se.file) }, se.label))))),
          h('p', { class: 'note mt12' }, '効果音は「効果音ラボ」の音源を使用しています。'))
      );
    }
  });
})();
