'use strict';
/* ツール: お知らせ（改善履歴の閲覧のみ。ツール選択の一覧には出さない） */
(function () {
  const { register, h } = Gerbera;

  register({
    id: 'announce', name: 'お知らせ', icon: '📣',
    mount(root) {
      const items = (Gerbera.ANNOUNCEMENTS || []).slice().sort((a, b) => b.date.localeCompare(a.date));
      root.append(
        h('div', { class: 'card' },
          h('div', { class: 'section-label' }, '📣 お知らせ・改善履歴'),
          items.length
            ? h('div', { class: 'vstack', style: 'gap:12px' }, items.map(it =>
                h('div', { class: 'card-soft' },
                  h('div', { class: 'row-sub', style: 'margin-bottom:5px' }, it.date),
                  h('div', { style: 'white-space:pre-wrap;line-height:1.75;font-size:13.5px' }, it.text))))
            : h('div', { class: 'empty' }, 'まだお知らせはありません'))
      );
    }
  });
})();
