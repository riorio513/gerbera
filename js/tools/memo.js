'use strict';
/* ツール: リスナーメモ（リスナー名・発言内容のメモ。ページ移動しても消えない）
   リスナーごとにまとめて表示する。名前入力は、一度でも使った名前なら
   input要素のリスト機能（datalist）でプルダウン的に選べつつ、
   新しい名前も自由に入力できるようにする。 */
(function () {
  const { register, Store, h, uid, toast } = Gerbera;
  const KEY = 'listenerMemo';

  function copyNote(n) {
    const text = (n.name ? n.name + '\n' : '') + n.note;
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
  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }
  function groupByName(notes) {
    const map = new Map();
    const order = [];
    notes.forEach(n => {
      const key = n.name.trim();
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key).push(n);
    });
    return order.map(key => ({ name: key, items: map.get(key) }));
  }

  register({
    id: 'memo', name: 'リスナーメモ', icon: '📝',
    mount(root) {
      let notes = Store.get(KEY, []);
      const save = () => Store.set(KEY, notes);

      const nameListId = 'memoNames-' + uid();
      const nameDatalist = h('datalist', { id: nameListId });
      function refreshNameList() {
        const names = Array.from(new Set(notes.map(n => n.name.trim()).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b, 'ja'));
        nameDatalist.replaceChildren(...names.map(nm => h('option', { value: nm })));
      }

      const nameIn = h('input', { class: 'input', placeholder: 'リスナーさんの名前（一覧から選ぶ・自由入力どちらもOK）', list: nameListId });
      const noteIn = h('textarea', { class: 'input', placeholder: '発言・覚えておきたいこと' });

      function tileFor(n) {
        const noteTa = h('textarea', {
          class: 'input memo-tile-note', style: 'font-size:12.5px;padding:7px 10px',
          oninput: e => { n.note = e.target.value; save(); autoGrow(noteTa); }
        }, n.note);
        return h('div', { class: 'memo-tile' },
          noteTa,
          h('div', { class: 'memo-tile-actions' },
            h('button', { class: 'icon-btn icon-btn-sm', 'aria-label': 'このメモをコピー',
              onclick: () => copyNote(n) }, '📋'),
            h('button', { class: 'icon-btn icon-btn-sm danger', 'aria-label': 'このメモを削除',
              onclick: () => {
                if (!confirm('このメモを削除しますか？')) return;
                notes = notes.filter(x => x.id !== n.id);
                save();
                render();
              } }, '🗑')));
      }

      const listEl = h('div');
      function render() {
        refreshNameList();
        if (!notes.length) {
          listEl.replaceChildren(h('div', { class: 'empty' }, 'リスナーさんのことをメモしておくと、次の配信でも思い出せます📝'));
          return;
        }
        const groups = groupByName(notes);
        listEl.replaceChildren(...groups.map(g =>
          h('div', { class: 'listener-group' },
            h('div', { class: 'section-label', style: 'margin:14px 2px 8px' },
              `👤 ${g.name || '名前未設定'}`, h('span', { class: 'badge' }, g.items.length)),
            h('div', { class: 'memo-grid' }, g.items.map(tileFor)))));
        requestAnimationFrame(() => listEl.querySelectorAll('.memo-tile-note').forEach(autoGrow));
      }
      render();

      root.append(
        h('div', { class: 'card' },
          h('div', { class: 'vstack' }, nameIn, nameDatalist, noteIn),
          h('button', { class: 'btn btn-primary btn-full mt12', onclick: () => {
            if (!nameIn.value.trim() && !noteIn.value.trim()) return;
            notes.unshift({ id: uid(), name: nameIn.value.trim(), note: noteIn.value.trim() });
            nameIn.value = ''; noteIn.value = '';
            save();
            render();
          } }, '＋ メモを追加')),
        h('div', { class: 'card' },
          h('div', { class: 'section-label' }, '📝 メモ一覧（リスナーごと）'),
          h('p', { class: 'warn', style: 'margin:-2px 0 10px;line-height:1.6' },
            '※ ここでのメモはこの端末・ブラウザだけに保存され、消えてしまうことがあります。大事な内容は📋でコピーして、ご自身のメモ帳などに貼り付けておいてください。'),
          listEl)
      );
    }
  });
})();
