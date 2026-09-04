'use strict';
/* ツール: メモ（「メモ」と「リスナーメモ」を1つにまとめたもの）
   - メモ     : 配信中に気づいたこと・アイデアを一時的に書き留める（key: quickNotes）
   - リスナーメモ: リスナーさんごとに発言・覚えておきたいことを残す（key: listenerMemo）
   どちらもこの端末・ブラウザだけに保存される。 */
(function () {
  const { register, Store, h, uid, toast } = Gerbera;

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
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('コピーできませんでした'); }
    document.body.removeChild(ta);
  }
  function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
  function fmtTime(ts) {
    const d = new Date(ts);
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  register({
    id: 'memo', name: 'メモ', icon: '📝',
    mount(root) {
      let mode = Store.get('memo.mode', 'quick');
      const seg = h('div', { class: 'seg' },
        h('button', { onclick: () => setMode('quick') }, '🗒️ メモ'),
        h('button', { onclick: () => setMode('listener') }, '👤 リスナーメモ'));
      const pane = h('div', { class: 'mt12' });
      root.append(seg, pane);

      function setMode(m) {
        mode = m; Store.set('memo.mode', m);
        seg.children[0].classList.toggle('on', m === 'quick');
        seg.children[1].classList.toggle('on', m === 'listener');
        pane.replaceChildren();
        (m === 'quick' ? mountQuick : mountListener)(pane);
      }
      setMode(mode);

      /* ---- メモ ---- */
      function mountQuick(box) {
        const KEY = 'quickNotes';
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
                      h('button', { class: 'icon-btn', 'aria-label': 'コピー', onclick: () => copyText(n.text) }, '📋'),
                      h('button', { class: 'icon-btn danger', 'aria-label': '削除',
                        onclick: () => { notes = notes.filter(x => x.id !== n.id); save(); render(); } }, '🗑'))))
              : [h('div', { class: 'empty' }, '配信中に気づいたことやアイデアを、ここに気軽にメモできます🗒️')]));
        }
        render();
        box.append(
          h('div', { class: 'card' }, noteIn,
            h('button', { class: 'btn btn-primary btn-full mt12', onclick: () => {
              const v = noteIn.value.trim();
              if (!v) return;
              notes.unshift({ id: uid(), text: v, at: Date.now() });
              noteIn.value = ''; save(); render();
            } }, '＋ メモを追加')),
          h('div', { class: 'card' },
            h('div', { class: 'section-label' }, '🗒️ メモ一覧'),
            h('p', { class: 'note', style: 'margin:-2px 0 10px' },
              '※ この端末・ブラウザだけに保存されます。残しておきたい内容は📋でコピーしておいてください。'),
            listEl));
      }

      /* ---- リスナーメモ ---- */
      function mountListener(box) {
        const KEY = 'listenerMemo';
        const META = 'listenerMeta';
        let notes = Store.get(KEY, []);
        const save = () => Store.set(KEY, notes);

        /* リスナーごとの付帯情報（来訪スタンプ・危険/ブロック等のフラグ）。名前をキーに保存 */
        function allMeta() { return Store.get(META, {}); }
        function getMeta(name) {
          const m = allMeta()[name] || {};
          return { blocked: !!m.blocked, muted: !!m.muted, warned: !!m.warned, danger: !!m.danger, visits: m.visits || [] };
        }
        function setMeta(name, patch) {
          const store = allMeta();
          store[name] = Object.assign(getMeta(name), patch);
          const m = store[name];
          if (!m.blocked && !m.muted && !m.warned && !m.danger && (!m.visits || !m.visits.length)) delete store[name];
          Store.set(META, store);
        }
        function stampToday(name) {
          const t = Gerbera.Calendar ? Gerbera.Calendar.todayISO() : new Date().toISOString().slice(0, 10);
          const v = getMeta(name).visits.slice();
          if (v[v.length - 1] === t) { toast('今日はもう記録済みです'); return; }
          v.push(t);
          setMeta(name, { visits: v });
        }
        function fmtMd(iso) {
          const d = new Date(iso + 'T00:00:00');
          return isNaN(d) ? iso : `${d.getMonth() + 1}/${d.getDate()}`;
        }

        const nameListId = 'memoNames-' + uid();
        const nameDatalist = h('datalist', { id: nameListId });
        function refreshNameList() {
          const names = Array.from(new Set(notes.map(n => n.name.trim()).filter(Boolean)))
            .sort((a, b) => a.localeCompare(b, 'ja'));
          nameDatalist.replaceChildren(...names.map(nm => h('option', { value: nm })));
        }
        const nameIn = h('input', { class: 'input', placeholder: 'リスナーさんの名前（一覧から選ぶ・自由入力どちらもOK）', list: nameListId });
        const noteIn = h('textarea', { class: 'input', placeholder: '発言・覚えておきたいこと' });

        function groupByName(list) {
          const map = new Map(); const order = [];
          list.forEach(n => {
            const key = n.name.trim();
            if (!map.has(key)) { map.set(key, []); order.push(key); }
            map.get(key).push(n);
          });
          // メモは無いがフラグ／スタンプが付いているリスナーも表示する
          Object.keys(allMeta()).forEach(key => {
            if (!map.has(key)) { map.set(key, []); order.push(key); }
          });
          const groups = order.map(key => ({ name: key, items: map.get(key), meta: getMeta(key) }));
          // 危険リスナーを先頭へ
          groups.sort((a, b) => (b.meta.danger ? 1 : 0) - (a.meta.danger ? 1 : 0));
          return groups;
        }

        const FLAGS = [
          { key: 'blocked', label: 'ブロック', icon: '🚫' },
          { key: 'muted', label: 'ミュート', icon: '🔇' },
          { key: 'warned', label: '注意した', icon: '⚠️' }
        ];
        function metaPanel(g) {
          const m = g.meta;
          const visits = m.visits || [];
          const last = visits.length ? visits[visits.length - 1] : null;
          const stampDots = h('span', { class: 'lm-stamps' },
            visits.slice(-14).map(() => h('i', { class: 'lm-stamp' })),
            h('span', { class: 'lm-stamp-count' }, `来訪 ${visits.length}回`));
          const btns = h('div', { class: 'lm-meta-btns' },
            h('button', { class: 'btn btn-primary btn-sm', onclick: () => { stampToday(g.name); render(); } }, '＋ 今日来た'),
            ...FLAGS.map(f => h('button', {
              class: 'lm-flag-btn' + (m[f.key] ? ' on' : ''),
              onclick: () => { setMeta(g.name, { [f.key]: !m[f.key] }); render(); }
            }, f.icon + ' ' + f.label)),
            h('button', {
              class: 'lm-flag-btn lm-flag-danger' + (m.danger ? ' on' : ''),
              onclick: () => { setMeta(g.name, { danger: !m.danger }); render(); }
            }, '🚨 危険リスナー'));
          return h('div', { class: 'lm-meta' },
            h('div', { class: 'lm-meta-row' },
              h('span', { class: 'lm-meta-k' }, '最後に来た日'),
              h('span', { class: 'lm-meta-v' }, last ? fmtMd(last) + '（' + last + '）' : '記録なし')),
            stampDots,
            btns);
        }
        function flagChips(m) {
          const cs = [];
          if (m.danger) cs.push(h('span', { class: 'lm-chip danger' }, '🚨危険'));
          FLAGS.forEach(f => { if (m[f.key]) cs.push(h('span', { class: 'lm-chip' }, f.icon)); });
          return cs.length ? h('span', { class: 'lm-chips' }, cs) : null;
        }
        function tileFor(n) {
          const noteTa = h('textarea', {
            class: 'input memo-tile-note', style: 'font-size:14px;padding:8px 10px',
            oninput: e => { n.note = e.target.value; save(); autoGrow(noteTa); }
          }, n.note);
          return h('div', { class: 'memo-tile' }, noteTa,
            h('div', { class: 'memo-tile-actions' },
              h('button', { class: 'icon-btn icon-btn-sm', 'aria-label': 'コピー',
                onclick: () => copyText((n.name ? n.name + '\n' : '') + n.note) }, '📋'),
              h('button', { class: 'icon-btn icon-btn-sm danger', 'aria-label': '削除',
                onclick: () => {
                  if (!confirm('このメモを削除しますか？')) return;
                  notes = notes.filter(x => x.id !== n.id); save(); render();
                } }, '🗑')));
        }
        const openNames = new Set();          // 展開中のリスナー名
        let filter = '';
        const filterIn = h('input', {
          class: 'input', placeholder: '🔍 リスナー名でしぼりこむ',
          oninput: e => { filter = e.target.value.trim(); render(); }
        });
        const listEl = h('div');

        function render() {
          refreshNameList();
          if (!notes.length && !Object.keys(allMeta()).length) {
            listEl.replaceChildren(h('div', { class: 'empty' }, 'リスナーさんのことをメモしておくと、次の配信でも思い出せます📝'));
            return;
          }
          let groups = groupByName(notes);
          if (filter) groups = groups.filter(g => g.name.toLowerCase().includes(filter.toLowerCase()));
          // しぼりこみ中・グループが少ないときは自動で開く
          const autoOpen = !!filter || groups.length <= 2;

          if (!groups.length) {
            listEl.replaceChildren(h('div', { class: 'empty' }, `「${filter}」に一致するリスナーはいません`));
            return;
          }
          listEl.replaceChildren(...groups.map(g => {
            const isOpen = autoOpen || openNames.has(g.name) || g.meta.danger;
            const preview = (g.items[0] && g.items[0].note ? g.items[0].note : '').replace(/\s+/g, ' ').slice(0, 20);
            const det = h('details', { class: 'lm-group' + (g.meta.danger ? ' lm-danger' : ''), open: isOpen ? '' : null,
              ontoggle: e => { if (e.target.open) openNames.add(g.name); else openNames.delete(g.name); } },
              h('summary', {},
                h('span', { class: 'lm-name' }, `👤 ${g.name || '名前未設定'}`),
                h('span', { class: 'badge' }, g.items.length),
                flagChips(g.meta),
                preview ? h('span', { class: 'lm-preview' }, preview) : null),
              h('div', { class: 'lm-group-body' },
                metaPanel(g),
                g.items.length
                  ? h('div', { class: 'memo-grid', style: 'padding:8px 2px 4px' }, g.items.map(tileFor))
                  : h('p', { class: 'note', style: 'padding:8px 2px 2px' }, 'このリスナーのメモはまだありません。上のフォームから追加できます。')));
            return det;
          }));
          requestAnimationFrame(() => listEl.querySelectorAll('details[open] .memo-tile-note').forEach(autoGrow));
        }
        render();

        box.append(
          h('div', { class: 'card' },
            h('div', { class: 'vstack' }, nameIn, nameDatalist, noteIn),
            h('button', { class: 'btn btn-primary btn-full mt12', onclick: () => {
              if (!nameIn.value.trim() && !noteIn.value.trim()) return;
              notes.unshift({ id: uid(), name: nameIn.value.trim(), note: noteIn.value.trim() });
              openNames.add(nameIn.value.trim());
              nameIn.value = ''; noteIn.value = ''; save(); render();
            } }, '＋ メモを追加')),
          h('div', { class: 'card' },
            h('div', { class: 'section-label' }, '📝 メモ一覧（リスナーごと）'),
            h('p', { class: 'note', style: 'margin:-2px 0 10px' },
              'リスナー名をタップで開閉できます。'),
            filterIn,
            h('div', { style: 'margin-top:10px' }, listEl),
            h('p', { class: 'warn', style: 'margin:12px 0 0;line-height:1.6' },
              '※ ここでのメモはこの端末・ブラウザだけに保存され、消えてしまうことがあります。大事な内容は📋でコピーして、ご自身のメモ帳などに貼り付けておいてください。')));
      }
    }
  });
})();
