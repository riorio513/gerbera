'use strict';
/* ============================================================
   IRIAM 最新イベント情報（公式ページから毎月末に自動取得したもの）
   - data/iriam-feed.json を1回だけ読み込み、以降はキャッシュ表示
   - 配信管理画面：常に上位3件だけ表示（設定でオフにできる）
   - 「ぜんぶ見る」：今月・来月を軸に、月ごとの見出し（◯月の情報）で
     アコーディオン表示。ランキング／スコアイベントも公開ページで
     取得できた範囲で表示する。
   ============================================================ */
(function () {
  const { h, Store } = Gerbera;
  const SRC_URL = 'https://info.iriam.com/イベントキャンペーン等お知らせ';

  let feed = null;
  let tried = false;

  function load(cb) {
    if (feed || tried) { cb(feed); return; }
    fetch('data/iriam-feed.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { feed = j; tried = true; cb(feed); })
      .catch(() => { tried = true; cb(null); });
  }

  /* ---------- 正規化 ---------- */
  function normItems(f) {
    if (!f) return [];
    const out = [];
    (f.events || []).forEach(ev => out.push(Object.assign({ _t: 'event' }, ev)));
    (f.ranking || []).forEach(ev => out.push(Object.assign({ _t: 'event', kind: 'ranking' }, ev)));
    (f.xEvents || []).forEach(ev => out.push(Object.assign({ _t: 'x' }, ev)));
    (f.news || []).forEach(n => out.push({ _t: 'news', title: n.title, postedDate: n.date, url: n.url }));
    out.forEach(it => {
      const cat = (it.category || '') + ' ' + (it.title || '');
      if (!it.kind && /ランキング|スコア|ランク|SCORE/i.test(cat)) it.kind = 'ranking';
      it._sort = it.eventDateISO || it.postedDate || '0000-00-00';
    });
    // 新しい順
    out.sort((a, b) => (a._sort < b._sort ? 1 : a._sort > b._sort ? -1 : 0));
    // 重複除去（同じ告知＝タイトル＋URLが一致するもの）
    const seen = new Set();
    return out.filter(it => {
      const k = (it.title || '') + '|' + (it.url || '');
      return seen.has(k) ? false : seen.add(k);
    });
  }

  function tagFor(it) {
    if (it.kind === 'ranking') return h('span', { class: 'iriam-tag iriam-tag-rank' }, 'ランキング');
    if (it._t === 'x') return h('span', { class: 'iriam-tag iriam-tag-x' }, '公式X');
    if (it._t === 'news') return h('span', { class: 'iriam-tag iriam-tag-news' }, 'ニュース');
    const c = (it.category || '').replace('情報', '').trim();
    return h('span', { class: 'iriam-tag' }, c || 'イベント');
  }
  function metaFor(it) {
    const parts = [];
    if (it.eventDateText) parts.push('開催 ' + it.eventDateText);
    if (it.postedDate) parts.push('告知 ' + it.postedDate);
    return parts.join('　');
  }
  function itemRow(it) {
    return h('a', { class: 'iriam-item', href: it.url || SRC_URL, target: '_blank', rel: 'noopener' },
      h('span', { class: 'iriam-item-title' }, tagFor(it), it.title),
      metaFor(it) ? h('span', { class: 'iriam-item-meta' }, metaFor(it)) : null);
  }
  function srcRow() {
    return h('div', { class: 'iriam-src' }, '出典：',
      h('a', { href: SRC_URL, target: '_blank', rel: 'noopener' }, 'IRIAM公式 ↗'),
      '　',
      h('a', { href: 'https://x.com/iriam_event', target: '_blank', rel: 'noopener' }, '@iriam_event ↗'));
  }

  /* ---------- 月ごとのまとめ（ぜんぶ見る用） ---------- */
  function monthKey(it) {
    // 開催日テキストから月を推定（無ければ告知日の年月）
    const m = String(it.eventDateText || '').match(/(\d{1,2})\s*[\/月]/);
    if (m && it.postedDate) {
      const py = +it.postedDate.slice(0, 4), pm = +it.postedDate.slice(5, 7);
      let mo = +m[1];
      let y = py;
      if (mo < pm - 2) y = py + 1; // 年またぎ（告知が年末→開催が翌年）
      return `${y}-${String(mo).padStart(2, '0')}`;
    }
    if (it.postedDate) return it.postedDate.slice(0, 7);
    return 'その他';
  }
  function monthLabel(key) {
    if (key === 'その他') return 'その他の情報';
    const [y, mo] = key.split('-');
    const now = new Date();
    const sameYear = +y === now.getFullYear();
    return (sameYear ? '' : `${y}年`) + `${+mo}月の情報`;
  }

  /* ---------- 配信管理画面 ---------- */
  function renderKanri(view) {
    const S = Gerbera.Settings ? Gerbera.Settings.get() : { iriam: true };
    const wrap = h('div');
    view.replaceChildren(h('h1', { class: 'screen-title' }, '配信管理'), wrap);

    function paintCards() {
      const days = Gerbera.Settings ? Gerbera.Settings.debutDays() : null;
      const cal = Gerbera.Calendar;
      const now = new Date();
      const bds = cal ? cal.birthdaysInMonth(now.getFullYear(), now.getMonth()) : [];
      return h('div', { class: 'dash-row' },
        h('div', { class: 'dash-cell' },
          h('span', { class: 'dash-cell-label' }, 'デビューから今日で'),
          h('span', { class: 'dash-cell-val' }, days != null ? days + '日' : '—'),
          days == null ? h('span', { class: 'dash-cell-note' }, '設定でデビュー日を登録') : null),
        h('div', { class: 'dash-cell' },
          h('span', { class: 'dash-cell-label' }, '今月誕生日の人'),
          bds.length
            ? h('span', { class: 'dash-cell-val sm' }, bds.map(b => `${b.who}(${b.day}日)`).join('・'))
            : h('span', { class: 'dash-cell-val' }, '誰もいません')));
    }

    function paint(f) {
      const kids = [];
      if (S.iriam) {
        const items = normItems(f).slice(0, 3);
        kids.push(h('div', { class: 'kanri-iriam' },
          h('div', { class: 'kanri-iriam-head' },
            h('span', { class: 'section-label', style: 'margin:0' }, '📅 IRIAMの最新イベント情報'),
            h('button', { class: 'kanri-more', onclick: () => { location.hash = 'kanri/iriam'; } }, 'ぜんぶ見る ›')),
          items.length
            ? h('div', { class: 'iriam-body' }, items.map(itemRow), srcRow())
            : h('div', { class: 'empty' }, tried ? '最新情報を取得できませんでした' : '準備中です')));
      }
      kids.push(paintCards());
      kids.push(h('button', { class: 'btn btn-ghost btn-full mt12', onclick: () => { location.hash = 'calendar'; } },
        '🗓 カレンダーを開く'));
      wrap.replaceChildren(...kids);
    }

    paint(feed);
    if (!tried) load(paint);
  }

  /* ---------- ぜんぶ見る（月別アコーディオン） ---------- */
  function renderIriamAll(view) {
    const wrap = h('div');
    view.replaceChildren(h('h1', { class: 'screen-title' }, 'IRIAMの最新イベント情報'), wrap);

    function paint(f) {
      const items = normItems(f);
      if (!items.length) {
        wrap.replaceChildren(h('div', { class: 'empty' }, tried ? '最新情報を取得できませんでした' : '準備中です'));
        return;
      }
      const groups = new Map();
      items.forEach(it => {
        const k = monthKey(it);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(it);
      });
      const keys = Array.from(groups.keys()).sort((a, b) => {
        if (a === 'その他') return 1;
        if (b === 'その他') return -1;
        return a < b ? 1 : -1; // 新しい月を上に
      });
      wrap.replaceChildren(
        h('p', { class: 'note', style: 'margin-bottom:10px' }, '月の見出しをタップすると開閉します。'),
        ...keys.map((k, i) =>
          h('details', { class: 'iriam-month', open: i === 0 ? '' : null },
            h('summary', {}, monthLabel(k), h('span', { class: 'iriam-month-count' }, groups.get(k).length)),
            h('div', { class: 'iriam-body', style: 'padding:6px 2px 10px' }, groups.get(k).map(itemRow)))),
        srcRow());
    }

    paint(feed);
    if (!tried) load(paint);
  }

  Gerbera.Iriam = { load, normItems, itemRow };
  Gerbera.Screens = Object.assign(Gerbera.Screens || {}, {
    kanri: renderKanri,
    iriamAll: renderIriamAll
  });
})();
