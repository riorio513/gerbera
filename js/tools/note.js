'use strict';
/* ツール: メモ（配信中に気づいたこと・アイデアなどを一時的に書き留める場所） */
(function () {
  const { register, Store, h, uid, toast } = Gerbera;
  const KEY = 'quickNotes';

  function copyText(text) {
    const done = () => toast('📋 コピーしました');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('コピーできませんでした'); }
    document.body.removeChild(ta);
  }
  function fmtTime(ts) {
    const d = new Date(ts);
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  register({
    id: 'note', name: 'メモ', icon: '🗒️',
    mount(root) {
      let notes = Store.get(KEY, []);
      const save = () => Store.set(KEY, notes);

      const noteIn = h('textarea', { class: 'input', placeholder: '気づいたこと・アイデアなどを自由にメモ' });

      const listEl = h('div');
      function render() {
        listEl.replaceChildren(...(
          notes.length
            ? notes.map(n =>
                h('div', { class: 'list-row', style: 'align-items:flex-start' },
                  h('div', { class: 'grow' },
                    h('div', { class: 'row-sub' }, fmtTime(n.at)),
                    h('div', { style: 'white-space:pre-wrap;overflow-wrap:anywhere;margin-top:2px;font-size:14px' }, n.text)),
                  h('div', { class: 'hstack', style: 'gap:6px' },
                    h('button', { class: 'icon-btn', 'aria-label': 'このメモをコピー',
                      onclick: () => copyText(n.text) }, '📋'),
                    h('button', { class: 'icon-btn danger', 'aria-label': 'このメモを削除',
                      onclick: () => {
                        notes = notes.filter(x => x.id !== n.id);
                        save();
                        render();
                      } }, '🗑'))))
            : [h('div', { class: 'empty' }, '配信中に気づいたことやアイデアを、ここに気軽にメモできます🗒️')]));
      }
      render();

      root.append(
        h('div', { class: 'card' },
          noteIn,
          h('button', { class: 'btn btn-primary btn-full mt12', onclick: () => {
            const v = noteIn.value.trim();
            if (!v) return;
            notes.unshift({ id: uid(), text: v, at: Date.now() });
            noteIn.value = '';
            save();
            render();
          } }, '＋ メモを追加')),
        h('div', { class: 'card' },
          h('div', { class: 'section-label' }, '🗒️ メモ一覧'),
          h('p', { class: 'note', style: 'margin:-2px 0 10px' },
            '※ この端末・ブラウザだけに保存されます。配信をまたいで残しておきたい内容は📋でコピーしておいてください。'),
          listEl)
      );
    }
  });
})();
