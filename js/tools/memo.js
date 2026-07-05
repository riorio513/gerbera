'use strict';
/* ツール: リスナーメモ（リスナー名・発言内容のメモ。ページ移動しても消えない） */
(function () {
  const { register, Store, h, uid } = Gerbera;
  const KEY = 'listenerMemo';

  register({
    id: 'memo', name: 'リスナーメモ', icon: '📝',
    mount(root) {
      let notes = Store.get(KEY, []);
      const save = () => Store.set(KEY, notes);

      const nameIn = h('input', { class: 'input', placeholder: 'リスナーさんの名前' });
      const noteIn = h('textarea', { class: 'input', placeholder: '発言・覚えておきたいこと' });

      const listEl = h('div');
      function render() {
        listEl.replaceChildren(...(
          notes.length
            ? notes.map(n =>
                h('div', { class: 'list-row', style: 'align-items:flex-start' },
                  h('div', { class: 'grow vstack', style: 'gap:6px' },
                    h('input', { class: 'input', value: n.name, placeholder: '名前', style: 'font-weight:700',
                      oninput: e => { n.name = e.target.value; save(); } }),
                    h('textarea', { class: 'input', style: 'min-height:56px',
                      oninput: e => { n.note = e.target.value; save(); } }, n.note)),
                  h('button', { class: 'icon-btn danger', 'aria-label': 'このメモを削除',
                    onclick: () => {
                      if (!confirm(`「${n.name || 'メモ'}」を削除しますか？`)) return;
                      notes = notes.filter(x => x.id !== n.id);
                      save();
                      render();
                    } }, '🗑')))
            : [h('div', { class: 'empty' }, 'リスナーさんのことをメモしておくと、次の配信でも思い出せます📝')]));
      }
      render();

      root.append(
        h('div', { class: 'card' },
          h('div', { class: 'vstack' }, nameIn, noteIn),
          h('button', { class: 'btn btn-primary btn-full mt12', onclick: () => {
            if (!nameIn.value.trim() && !noteIn.value.trim()) return;
            notes.unshift({ id: uid(), name: nameIn.value.trim(), note: noteIn.value.trim() });
            nameIn.value = ''; noteIn.value = '';
            save();
            render();
          } }, '＋ メモを追加')),
        h('div', { class: 'card' },
          h('div', { class: 'section-label' }, '📝 メモ一覧'),
          listEl)
      );
    }
  });
})();
