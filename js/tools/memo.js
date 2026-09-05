'use strict';
/* ツール: メモ（「メモ」と「リスナーメモ」を1つにまとめたもの）
   - メモ       : 配信中に気づいたこと・アイデアを一時的に書き留める（key: quickNotes）
   - リスナーメモ: リスナーさんごとの記録（key: listenerMemo / listenerMeta）
     リスナーが増えても探しやすいよう「一覧（検索・50音・絞り込み）」と
     「詳細（そのリスナーの記録とメモ）」の2画面構成にしている。
   どちらもこの端末・ブラウザだけに保存される。 */
(function () {
  const { register, Store, h, uid, toast, modal, confirmDialog } = Gerbera;

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
  function todayISO() {
    return Gerbera.Calendar ? Gerbera.Calendar.todayISO()
      : (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  }
  function fmtMd(iso) {
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : `${d.getMonth() + 1}/${d.getDate()}`;
  }
  function daysSince(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return Infinity;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  /* 名前の頭文字を50音の行に振り分ける（読み仮名は持っていないので表記の先頭で判定） */
  const KANA_ROWS = [
    ['あ', 'あいうえおぁぃぅぇぉ'], ['か', 'かきくけこがぎぐげご'],
    ['さ', 'さしすせそざじずぜぞ'], ['た', 'たちつてとだぢづでどっ'],
    ['な', 'なにぬねの'], ['は', 'はひふへほばびぶべぼぱぴぷぺぽ'],
    ['ま', 'まみむめも'], ['や', 'やゆよゃゅょ'],
    ['ら', 'らりるれろ'], ['わ', 'わをんゐゑ']
  ];
  const INDEX_KEYS = KANA_ROWS.map(r => r[0]).concat(['A', '他']);
  function initialRow(name) {
    if (!name) return '他';
    let c = name[0];
    const code = c.charCodeAt(0);
    if (code >= 0x30A1 && code <= 0x30F6) c = String.fromCharCode(code - 0x60); // カタカナ→ひらがな
    for (const [row, chars] of KANA_ROWS) if (chars.indexOf(c) >= 0) return row;
    if (/[A-Za-z0-9]/.test(c)) return 'A';
    return '他';
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
                      h('button', { class: 'icon-btn', 'aria-label': 'コピー', 'data-lbl': 'コピー', onclick: () => copyText(n.text) }, '📋'),
                      h('button', { class: 'icon-btn danger', 'aria-label': '削除', 'data-lbl': '削除',
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
            listEl));
      }

      /* ---- リスナーメモ ---- */
      function mountListener(box) {
        const KEY = 'listenerMemo';
        const META = 'listenerMeta';
        let notes = Store.get(KEY, []);
        const save = () => Store.set(KEY, notes);

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
          const t = todayISO();
          const v = getMeta(name).visits.slice();
          if (v[v.length - 1] === t) { toast('今日はもう記録済みです'); return; }
          v.push(t);
          setMeta(name, { visits: v });
        }

        /* ボタンを押しても画面のスクロール位置が戻らないようにする */
        function scrollHost() { return box.closest('.sheet-body'); }
        function preserveScroll(fn) {
          const host = scrollHost();
          const y = host ? host.scrollTop : window.scrollY;
          fn();
          requestAnimationFrame(() => { if (host) host.scrollTop = y; else window.scrollTo(0, y); });
        }

        function listenerNames() {
          const set = new Set();
          notes.forEach(n => set.add((n.name || '').trim()));
          Object.keys(allMeta()).forEach(k => set.add(k));
          return Array.from(set);
        }
        function notesOf(name) { return notes.filter(n => (n.name || '').trim() === name); }
        function rowsAll() {
          return listenerNames().map(name => {
            const meta = getMeta(name);
            const items = notesOf(name);
            const last = meta.visits.length ? meta.visits[meta.visits.length - 1] : null;
            return { name, meta, items, last };
          }).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
        }

        const FLAGS = [
          { key: 'blocked', label: 'ブロック', icon: '🚫' },
          { key: 'muted', label: 'ミュート', icon: '🔇' },
          { key: 'warned', label: '注意した', icon: '⚠️' }
        ];

        /* ===== 画面状態 ===== */
        let view = 'list';       // 'list' | 'detail'
        let selected = null;     // 詳細で開いているリスナー名
        let query = '';
        let filter = 'all';      // all | danger | flagged | recent
        let indexKey = '';       // 50音の絞り込み（空＝すべて）

        const host = h('div');
        box.append(host);

        function render() { view === 'detail' ? renderDetail() : renderList(); }

        /* ===== 一覧 ===== */
        function renderList() {
          const searchIn = h('input', {
            class: 'input', type: 'search', placeholder: '🔍 名前で検索', value: query,
            oninput: e => { query = e.target.value.trim(); paintRows(); }
          });
          const newBtn = h('button', { class: 'btn btn-primary btn-sm', onclick: openNewListener }, '＋ 新規');

          const chips = h('div', { class: 'lm-chiprow' });
          function paintChips() {
            const defs = [['all', 'すべて'], ['danger', '🚨危険'], ['flagged', '要注意'], ['recent', '最近来た']];
            chips.replaceChildren(...defs.map(([k, lbl]) =>
              h('button', { class: 'chip' + (filter === k ? ' on' : ''),
                onclick: () => { filter = k; paintChips(); paintRows(); } }, lbl)));
          }
          paintChips();

          const idx = h('div', { class: 'lm-index' });
          function paintIndex() {
            const present = new Set(rowsAll().map(r => initialRow(r.name)));
            idx.replaceChildren(
              h('button', { class: 'lm-idx' + (indexKey === '' ? ' on' : ''),
                onclick: () => { indexKey = ''; paintIndex(); paintRows(); } }, '全'),
              ...INDEX_KEYS.map(k => h('button', {
                class: 'lm-idx' + (indexKey === k ? ' on' : '') + (present.has(k) ? '' : ' off'),
                onclick: () => { indexKey = (indexKey === k ? '' : k); paintIndex(); paintRows(); }
              }, k)));
          }
          paintIndex();

          const rowsEl = h('div', { class: 'lm-rows' });
          const countEl = h('span', { class: 'lm-count' });

          function filtered() {
            let rows = rowsAll();
            if (query) {
              const q = query.toLowerCase();
              rows = rows.filter(r => r.name.toLowerCase().includes(q)
                || r.items.some(n => (n.note || '').toLowerCase().includes(q)));
            }
            if (indexKey) rows = rows.filter(r => initialRow(r.name) === indexKey);
            if (filter === 'danger') rows = rows.filter(r => r.meta.danger);
            if (filter === 'flagged') rows = rows.filter(r => r.meta.danger || r.meta.blocked || r.meta.muted || r.meta.warned);
            if (filter === 'recent') rows = rows.filter(r => r.last && daysSince(r.last) <= 7);
            return rows;
          }
          function paintRows() {
            const rows = filtered();
            countEl.textContent = `${rows.length}人`;
            if (!rows.length) {
              rowsEl.replaceChildren(h('div', { class: 'empty' },
                rowsAll().length ? '条件に合うリスナーはいません' : 'まだ登録がありません。「＋ 新規」から追加できます👤'));
              return;
            }
            rowsEl.replaceChildren(...rows.map(r => {
              const sub = [];
              if (r.meta.visits.length) sub.push(`来訪${r.meta.visits.length}`);
              if (r.last) sub.push(`最後 ${fmtMd(r.last)}`);
              if (r.items.length) sub.push(`メモ${r.items.length}`);
              const marks = [];
              if (r.meta.danger) marks.push(h('span', { class: 'lm-chip danger' }, '🚨'));
              FLAGS.forEach(f => { if (r.meta[f.key]) marks.push(h('span', { class: 'lm-chip' }, f.icon)); });
              return h('button', { class: 'lmr' + (r.meta.danger ? ' lmr-danger' : ''),
                onclick: () => { selected = r.name; view = 'detail'; render(); } },
                h('span', { class: 'lmr-main' },
                  h('span', { class: 'lmr-name' }, r.name || '名前未設定'),
                  sub.length ? h('span', { class: 'lmr-sub' }, sub.join('・')) : null),
                marks.length ? h('span', { class: 'lmr-marks' }, marks) : null,
                h('span', { class: 'lmr-chev' }, '›'));
            }));
          }
          paintRows();

          host.replaceChildren(
            h('div', { class: 'card' },
              h('div', { class: 'hstack' }, h('span', { class: 'grow' }, searchIn), newBtn),
              h('div', { class: 'mt8' }, chips),
              idx),
            h('div', { class: 'card' },
              h('div', { class: 'section-label' }, '👤 リスナー一覧', countEl),
              rowsEl));
        }

        /* ===== 新規リスナー（名前だけ先に作る） ===== */
        function openNewListener() {
          modal({
            title: 'リスナーを追加',
            render: (mb, ctl) => {
              const nameIn = h('input', { class: 'input', placeholder: 'リスナーさんの名前' });
              const noteIn = h('textarea', { class: 'input', placeholder: '最初のメモ（省略OK）' });
              mb.append(
                h('div', { class: 'vstack' }, nameIn, noteIn),
                h('button', { class: 'btn btn-primary btn-full mt12', onclick: () => {
                  const nm = nameIn.value.trim();
                  if (!nm) { toast('名前を入力してください'); return; }
                  if (noteIn.value.trim()) {
                    notes.unshift({ id: uid(), name: nm, note: noteIn.value.trim() });
                    save();
                  } else {
                    setMeta(nm, {}); // 名前だけでも一覧に残す
                    const store = allMeta(); store[nm] = getMeta(nm); Store.set(META, store);
                  }
                  ctl.close();
                  selected = nm; view = 'detail'; render();
                } }, '追加'));
              setTimeout(() => nameIn.focus(), 60);
            }
          });
        }

        /* ===== 詳細 ===== */
        function renderDetail() {
          const name = selected;
          const meta = getMeta(name);
          const items = notesOf(name);
          const visits = meta.visits || [];
          const last = visits.length ? visits[visits.length - 1] : null;

          const backBtn = h('button', { class: 'lm-back', onclick: () => { view = 'list'; render(); } }, '‹ 一覧にもどる');

          const stampRow = h('div', { class: 'lm-stamps' },
            visits.slice(-14).map(() => h('i', { class: 'lm-stamp' })),
            h('span', { class: 'lm-stamp-count' }, `来訪 ${visits.length}回`));

          const btns = h('div', { class: 'lm-meta-btns' },
            h('button', { class: 'btn btn-primary btn-sm',
              onclick: () => preserveScroll(() => { stampToday(name); renderDetail(); }) }, '＋ 今日来た'),
            ...FLAGS.map(f => h('button', {
              class: 'lm-flag-btn' + (meta[f.key] ? ' on' : ''),
              onclick: () => preserveScroll(() => { setMeta(name, { [f.key]: !meta[f.key] }); renderDetail(); })
            }, f.icon + ' ' + f.label)),
            h('button', {
              class: 'lm-flag-btn lm-flag-danger' + (meta.danger ? ' on' : ''),
              onclick: () => preserveScroll(() => { setMeta(name, { danger: !meta.danger }); renderDetail(); })
            }, '🚨 危険リスナー'));

          const noteIn = h('textarea', { class: 'input', placeholder: '発言・覚えておきたいこと' });

          function tileFor(n) {
            const noteTa = h('textarea', {
              class: 'input memo-tile-note', style: 'font-size:14px;padding:8px 10px',
              oninput: e => { n.note = e.target.value; save(); autoGrow(noteTa); }
            }, n.note);
            return h('div', { class: 'memo-tile' }, noteTa,
              h('div', { class: 'memo-tile-actions' },
                h('button', { class: 'icon-btn icon-btn-sm', 'aria-label': 'コピー', 'data-lbl': 'コピー',
                  onclick: () => copyText((n.name ? n.name + '\n' : '') + n.note) }, '📋'),
                h('button', { class: 'icon-btn icon-btn-sm danger', 'aria-label': '削除', 'data-lbl': '削除',
                  onclick: () => {
                    confirmDialog('このメモを削除しますか？', () => {
                      preserveScroll(() => {
                        notes = notes.filter(x => x.id !== n.id); save(); renderDetail();
                      });
                    });
                  } }, '🗑')));
          }

          host.replaceChildren(
            backBtn,
            h('div', { class: 'card' + (meta.danger ? ' lm-danger-card' : '') },
              h('div', { class: 'lm-detail-head' },
                h('span', { class: 'lm-name' }, `👤 ${name || '名前未設定'}`),
                meta.danger ? h('span', { class: 'lm-chip danger' }, '🚨危険') : null),
              h('div', { class: 'lm-meta-row', style: 'margin-top:8px' },
                h('span', { class: 'lm-meta-k' }, '最後に来た日'),
                h('span', { class: 'lm-meta-v' }, last ? `${fmtMd(last)}（${last}）` : '記録なし')),
              stampRow,
              btns,
              h('button', { class: 'btn btn-danger btn-sm btn-full mt12', onclick: () => {
                confirmDialog(`「${name}」の記録とメモをすべて削除しますか？`, () => {
                  notes = notes.filter(n => (n.name || '').trim() !== name); save();
                  const store = allMeta(); delete store[name]; Store.set(META, store);
                  view = 'list'; render();
                });
              } }, 'このリスナーを削除')),
            h('div', { class: 'card' },
              h('div', { class: 'section-label' }, '📝 メモ'),
              noteIn,
              h('button', { class: 'btn btn-primary btn-full mt12', onclick: () => {
                const v = noteIn.value.trim();
                if (!v) return;
                preserveScroll(() => {
                  notes.unshift({ id: uid(), name, note: v }); save(); renderDetail();
                });
              } }, '＋ メモを追加'),
              items.length
                ? h('div', { class: 'memo-grid mt12' }, items.map(tileFor))
                : h('div', { class: 'empty mt12' }, 'このリスナーのメモはまだありません')));

          requestAnimationFrame(() => host.querySelectorAll('.memo-tile-note').forEach(autoGrow));
        }

        render();
      }
    }
  });
})();
