'use strict';
/* ============================================================
   ガーベラ カレンダー
   - 予定（イベント／企画／誕生日／Todo）の保存と取り出し
   - カレンダー画面（月グリッド＋日付タップで入力小窓）
   - 今日の予約ツールページ（#planday）
   すべてこの端末・ブラウザのローカルストレージに保存される。
   ============================================================ */
(function () {
  const { Store, h, toast, modal, getTool } = Gerbera;
  const KEY = 'calendar';
  const EVENT_SPAN_DAYS = 7; // イベントは開始日から7日間、背景を薄く塗って一続きに見せる

  /* ---------- 日付ユーティリティ ---------- */
  function iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseISO(s) { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? null : d; }
  function todayISO() { return iso(new Date()); }
  function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
  function jpShort(s) { const d = parseISO(s); return d ? `${d.getMonth() + 1}月${d.getDate()}日` : s; }
  function mmdd(s) { const d = parseISO(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : s; }

  /* ---------- データ ---------- */
  function all() { return Store.get(KEY, []); }
  function save(list) { Store.set(KEY, list); }
  function syncPush() { if (Gerbera.Push && Gerbera.Push.sync) Gerbera.Push.sync(); }
  function add(item) {
    const list = all();
    item.id = item.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    list.push(item);
    save(list);
    syncPush();
    return item;
  }
  function update(id, patch) {
    const list = all().map(it => (it.id === id ? Object.assign(it, patch) : it));
    save(list);
    syncPush();
  }
  function remove(id) { save(all().filter(it => it.id !== id)); syncPush(); }

  function eventCovers(it, dateStr) {
    if (it.type !== 'event') return false;
    const start = it.date;
    const end = addDays(start, EVENT_SPAN_DAYS - 1);
    return dateStr >= start && dateStr <= end;
  }
  function birthdayOn(it, dateStr) {
    if (it.type !== 'birthday') return false;
    return it.date.slice(5) === dateStr.slice(5); // MM-DD 一致（毎年）
  }
  function itemsOn(dateStr) {
    return all().filter(it => {
      if (it.type === 'event') return eventCovers(it, dateStr);
      if (it.type === 'birthday') return birthdayOn(it, dateStr);
      return it.date === dateStr;
    });
  }
  function todayPlan() {
    return all().find(it => it.type === 'plan' && it.date === todayISO()) || null;
  }
  function birthdaysInMonth(year, month0) {
    return all()
      .filter(it => it.type === 'birthday' && +it.date.slice(5, 7) === month0 + 1)
      .map(it => ({ who: it.who || '', day: +it.date.slice(8, 10), id: it.id }))
      .sort((a, b) => a.day - b.day);
  }
  /* その日の「プラス」記録（IRIAMのデイリーランクスコア＋2/＋4/＋6）。無ければ null */
  function plusOn(dateStr) {
    return all().find(it => it.type === 'plus' && it.date === dateStr) || null;
  }
  function monthKeyStr(year, month0) { return `${year}-${String(month0 + 1).padStart(2, '0')}`; }
  function plusStats(year, month0) {
    const mk = monthKeyStr(year, month0);
    const rows = all().filter(it => it.type === 'plus' && it.date.slice(0, 7) === mk);
    const done = rows.filter(it => it.done);
    return {
      doneDays: done.length,
      doneTotal: done.reduce((s, it) => s + (+it.amount || 0), 0),
      planDays: rows.filter(it => it.plan && !it.done).length
    };
  }
  /* アプリを開いたときに出す「今日のリマインド」対象 */
  function todayReminders() {
    const t = todayISO();
    return all().filter(it => {
      if (!it.remind) return false;
      if (it.type === 'event') return it.date === t;      // 開始日に通知
      if (it.type === 'birthday') return birthdayOn(it, t);
      if (it.type === 'todo') return it.date === t && !it.done;
      return it.date === t;
    });
  }

  Gerbera.Calendar = {
    all, add, update, remove, itemsOn, todayPlan, birthdaysInMonth, todayReminders,
    plusOn, plusStats, todayISO, EVENT_SPAN_DAYS,
    mount: mountCalendar
  };

  /* ---------- 入力小窓（日付タップ） ---------- */
  const TABS = [
    { key: 'event', label: 'イベント', icon: '🎪' },
    { key: 'plan', label: '企画', icon: '🎬' },
    { key: 'plus', label: 'プラス', icon: '➕' },
    { key: 'birthday', label: '誕生日', icon: '🎂' },
    { key: 'todo', label: 'Todo', icon: '✅' }
  ];

  function reserveToolList() {
    const menu = (Gerbera.TOOL_MENU || []).filter(m => m.tool);
    if (menu.length) return menu.map(m => ({ id: m.tool, label: m.label }));
    return Array.from(Gerbera.tools.values()).map(t => ({ id: t.id, label: t.name }));
  }

  function openDayModal(dateStr, onChange) {
    let activeTab = 'event';
    modal({
      title: jpShort(dateStr) + '（' + '日月火水木金土'[parseISO(dateStr).getDay()] + '）',
      wide: true,
      onClose: onChange,
      render: (body) => {
        const tabStrip = h('div', { class: 'cal-tabs' });
        const pane = h('div', { class: 'cal-pane' });
        function paintTabs() {
          tabStrip.replaceChildren(...TABS.map(t =>
            h('button', { class: 'cal-tab' + (t.key === activeTab ? ' on' : ''),
              onclick: () => { activeTab = t.key; paintTabs(); paintPane(); } },
              t.icon + ' ' + t.label)));
        }
        function notifyHint() {
          return Gerbera.Settings && Gerbera.Settings.get().notify
            ? null
            : h('p', { class: 'note', style: 'margin-top:4px' },
                '※「リマインドする」を有効にするには、設定でプッシュ通知をONにしてください。');
        }
        function remindToggle(it) {
          const on = !!it.remind;
          return h('label', { class: 'cal-remind' },
            h('input', { type: 'checkbox', checked: on,
              onchange: e => { update(it.id, { remind: e.target.checked }); } }),
            'リマインドする');
        }
        function delBtn(it) {
          return h('button', { class: 'icon-btn danger icon-btn-sm', 'aria-label': '削除',
            onclick: () => { remove(it.id); paintPane(); } }, '🗑');
        }

        function paintPane() {
          pane.replaceChildren();
          const mine = itemsOn(dateStr).filter(it => it.type === activeTab);

          if (activeTab === 'event') {
            const title = h('input', { class: 'input', placeholder: 'イベント名' });
            pane.append(
              h('p', { class: 'note' },
                `開始日から${EVENT_SPAN_DAYS}日間（${mmdd(dateStr)}〜${mmdd(addDays(dateStr, EVENT_SPAN_DAYS - 1))}）を予定として表示します。`),
              h('div', { class: 'cal-add' }, title,
                h('button', { class: 'btn btn-primary btn-sm', onclick: () => {
                  if (!title.value.trim()) { toast('イベント名を入力してください'); return; }
                  add({ type: 'event', date: dateStr, title: title.value.trim(), remind: false });
                  title.value = ''; paintPane();
                } }, '追加')),
              notifyHint(),
              ...mine.map(it => h('div', { class: 'cal-item' },
                h('div', { class: 'cal-item-main' },
                  h('span', { class: 'cal-item-title' }, it.title),
                  h('span', { class: 'cal-item-sub' }, `${mmdd(it.date)}〜${mmdd(addDays(it.date, EVENT_SPAN_DAYS - 1))}`),
                  remindToggle(it)),
                delBtn(it))));

          } else if (activeTab === 'plan') {
            const title = h('input', { class: 'input', placeholder: '配信企画名' });
            const tools = reserveToolList();
            const checks = tools.map(t => {
              const cb = h('input', { type: 'checkbox', value: t.id });
              return { cb, wrap: h('label', { class: 'cal-tool-check' }, cb, t.label) };
            });
            pane.append(
              h('div', { class: 'cal-add' }, title,
                h('button', { class: 'btn btn-primary btn-sm', onclick: () => {
                  if (!title.value.trim()) { toast('企画名を入力してください'); return; }
                  const picked = checks.filter(c => c.cb.checked).map(c => c.cb.value);
                  add({ type: 'plan', date: dateStr, title: title.value.trim(), tools: picked, remind: false });
                  title.value = ''; checks.forEach(c => (c.cb.checked = false)); paintPane();
                } }, '追加')),
              h('p', { class: 'input-label', style: 'margin-top:10px' }, '当日使うツールを予約（任意）'),
              h('div', { class: 'cal-tool-grid' }, checks.map(c => c.wrap)),
              notifyHint(),
              ...mine.map(it => h('div', { class: 'cal-item' },
                h('div', { class: 'cal-item-main' },
                  h('span', { class: 'cal-item-title' }, it.title),
                  it.tools && it.tools.length
                    ? h('span', { class: 'cal-item-sub' }, '予約ツール：' +
                        it.tools.map(id => (getTool(id) || {}).name || id).join('・'))
                    : h('span', { class: 'cal-item-sub' }, 'ツール予約なし'),
                  remindToggle(it)),
                delBtn(it))));

          } else if (activeTab === 'plus') {
            const rec = plusOn(dateStr);
            const ensure = () => plusOn(dateStr) || add({ type: 'plus', date: dateStr, plan: false, done: false, amount: 0 });
            const tidy = () => { const r = plusOn(dateStr); if (r && !r.plan && !r.done) remove(r.id); };
            const opts = [['取れなかった / まだ', 0, false], ['＋2', 2, true], ['＋4', 4, true], ['＋6', 6, true]];
            pane.append(
              h('p', { class: 'note' },
                'IRIAMのデイリーランクスコア（＋2／＋4／＋6）の記録です。「取る予定の日」と「取れた日」をカレンダーで見返せます。'),
              h('label', { class: 'cal-tool-check', style: 'padding:8px 0' },
                h('input', { type: 'checkbox', checked: !!(rec && rec.plan),
                  onchange: e => { const r = ensure(); update(r.id, { plan: e.target.checked }); tidy(); paintPane(); } }),
                'この日にプラスを取る予定'),
              h('p', { class: 'input-label', style: 'margin-top:10px' }, '結果'),
              h('div', { class: 'seg' },
                opts.map(([lbl, amt, dn]) =>
                  h('button', {
                    class: ((rec && rec.done) ? (rec.amount === amt) : (!dn)) ? 'on' : '',
                    onclick: () => { const r = ensure(); update(r.id, { done: dn, amount: amt }); tidy(); paintPane(); }
                  }, lbl))));

          } else if (activeTab === 'birthday') {
            const who = h('input', { class: 'input', placeholder: '誰の誕生日？（名前）' });
            pane.append(
              h('p', { class: 'note' }, '毎年この日（' + mmdd(dateStr) + '）に表示されます。'),
              h('div', { class: 'cal-add' }, who,
                h('button', { class: 'btn btn-primary btn-sm', onclick: () => {
                  if (!who.value.trim()) { toast('名前を入力してください'); return; }
                  add({ type: 'birthday', date: dateStr, who: who.value.trim(), remind: false });
                  who.value = ''; paintPane();
                } }, '追加')),
              notifyHint(),
              ...mine.map(it => h('div', { class: 'cal-item' },
                h('div', { class: 'cal-item-main' },
                  h('span', { class: 'cal-item-title' }, (it.who || '') + ' さん'),
                  remindToggle(it)),
                delBtn(it))));

          } else { // todo
            const task = h('input', { class: 'input', placeholder: 'タスク内容' });
            pane.append(
              h('div', { class: 'cal-add' }, task,
                h('button', { class: 'btn btn-primary btn-sm', onclick: () => {
                  if (!task.value.trim()) { toast('タスク内容を入力してください'); return; }
                  add({ type: 'todo', date: dateStr, task: task.value.trim(), done: false, remind: false });
                  task.value = ''; paintPane();
                } }, '追加')),
              notifyHint(),
              ...mine.map(it => h('div', { class: 'cal-item' },
                h('div', { class: 'cal-item-main' },
                  h('label', { class: 'cal-tool-check' },
                    h('input', { type: 'checkbox', checked: !!it.done,
                      onchange: e => { update(it.id, { done: e.target.checked }); paintPane(); } }),
                    h('span', { style: it.done ? 'text-decoration:line-through;opacity:.6' : '' }, it.task)),
                  remindToggle(it)),
                delBtn(it))));
          }

          if (!mine.length && activeTab !== 'plus') {
            pane.append(h('div', { class: 'empty', style: 'margin-top:10px' }, 'この日の登録はまだありません'));
          }
        }

        body.append(tabStrip, pane);
        paintTabs();
        paintPane();
      }
    });
  }

  /* ---------- カレンダー本体（ホーム画面・カレンダー画面で共用） ---------- */
  function mountCalendar(container, opts) {
    opts = opts || {};
    let cur = new Date();
    cur.setDate(1);

    function paint() {
      const year = cur.getFullYear();
      const month0 = cur.getMonth();
      const startPad = new Date(year, month0, 1).getDay();
      const daysInMonth = new Date(year, month0 + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < startPad; i++) cells.push(null);
      for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month0, d));
      while (cells.length % 7) cells.push(null);

      const head = h('div', { class: 'cal-head' },
        h('button', { class: 'cal-nav', 'aria-label': '前の月', onclick: () => { cur.setMonth(cur.getMonth() - 1); paint(); } }, '‹'),
        h('span', { class: 'cal-month' }, `${year}年${month0 + 1}月`),
        h('button', { class: 'cal-nav', 'aria-label': '次の月', onclick: () => { cur.setMonth(cur.getMonth() + 1); paint(); } }, '›'));

      const dow = h('div', { class: 'cal-grid cal-dow' },
        ['日', '月', '火', '水', '木', '金', '土'].map((w, i) =>
          h('span', { class: 'cal-dow-c' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') }, w)));

      const grid = h('div', { class: 'cal-grid' },
        cells.map(dt => {
          if (!dt) return h('span', { class: 'cal-cell cal-cell-empty' });
          const ds = iso(dt);
          const items = itemsOn(ds);
          const hasEvent = items.some(it => it.type === 'event');
          const plus = plusOn(ds);
          const cls = ['cal-cell'];
          if (ds === todayISO()) cls.push('cal-today');
          if (hasEvent) cls.push('cal-has-event');
          const dots = [];
          if (items.some(it => it.type === 'plan')) dots.push(h('i', { class: 'cal-dot dot-plan' }));
          if (items.some(it => it.type === 'birthday')) dots.push(h('i', { class: 'cal-dot dot-bd' }));
          if (items.some(it => it.type === 'todo')) dots.push(h('i', { class: 'cal-dot dot-todo' }));
          const plusMark = plus && (plus.done || plus.plan)
            ? h('span', { class: 'cal-plus' + (plus.done ? ' done' : ' plan') },
                plus.done ? (plus.amount ? '＋' + plus.amount : '＋') : '＋')
            : null;
          return h('button', { class: cls.join(' '), onclick: () => openDayModal(ds, paint) },
            h('span', { class: 'cal-cell-n' + (dt.getDay() === 0 ? ' sun' : dt.getDay() === 6 ? ' sat' : '') }, dt.getDate()),
            hasEvent ? h('span', { class: 'cal-band' }) : null,
            plusMark,
            h('span', { class: 'cal-dots' }, dots));
        }));

      const ps = plusStats(year, month0);
      const plusCard = h('div', { class: 'card card-soft', style: 'padding:10px 12px' },
        h('div', { class: 'section-label', style: 'margin-bottom:4px' }, '➕ 今月のプラス'),
        h('div', { style: 'font-size:14px;font-weight:700' },
          `取れた ${ps.doneDays}日（合計 ＋${ps.doneTotal}）`,
          h('span', { style: 'color:var(--text-sub);font-weight:500' }, `　／　取る予定 ${ps.planDays}日`)));

      const parts = [head, dow, grid,
        h('div', { class: 'cal-legend' },
          legend('dot-plan', '企画'), legend('dot-bd', '誕生日'), legend('dot-todo', 'Todo'),
          h('span', { class: 'cal-legend-i' }, h('span', { class: 'cal-legend-band' }), 'イベント'),
          h('span', { class: 'cal-legend-i' }, h('span', { class: 'cal-plus done', style: 'position:static' }, '＋'), 'プラス')),
        plusCard];

      if (opts.showMonthList) {
        const monthItems = all()
          .filter(it => {
            if (it.type === 'birthday') return +it.date.slice(5, 7) === month0 + 1;
            if (it.type === 'plus') return false;
            return it.date.slice(0, 7) === `${year}-${String(month0 + 1).padStart(2, '0')}`;
          })
          .sort((a, b) => (a.date.slice(5) < b.date.slice(5) ? -1 : 1));
        parts.push(h('div', { class: 'card' },
          h('div', { class: 'section-label' }, '🗓 今月の予定'),
          monthItems.length
            ? h('div', {}, monthItems.map(it => h('button', { class: 'list-row', style: 'width:100%;text-align:left',
                onclick: () => openDayModal(it.date, paint) },
                h('span', { class: 'badge' }, typeLabel(it.type)),
                h('span', { class: 'row-main' }, itemText(it)),
                h('span', { class: 'row-sub' }, mmdd(it.date)))))
            : h('div', { class: 'empty' }, '今月の予定はまだありません。日付をタップして追加できます。')));
      }

      container.replaceChildren(...parts);
    }
    paint();
    return { refresh: paint };
  }

  function renderCalendar(view) {
    view.replaceChildren(h('h1', { class: 'screen-title' }, 'カレンダー'), h('div', { id: 'calBody' }));
    mountCalendar(document.getElementById('calBody'), { showMonthList: true });
  }
  function legend(dotCls, label) {
    return h('span', { class: 'cal-legend-i' }, h('i', { class: 'cal-dot ' + dotCls }), label);
  }
  function typeLabel(t) { return ({ event: 'イベント', plan: '企画', birthday: '誕生日', todo: 'Todo' })[t] || t; }
  function itemText(it) {
    if (it.type === 'birthday') return (it.who || '') + ' さんの誕生日';
    if (it.type === 'todo') return it.task || '';
    return it.title || '';
  }

  /* ---------- 今日の予約ツールページ ---------- */
  function renderPlanDay(view) {
    const plan = todayPlan();
    const kids = [h('h1', { class: 'screen-title' }, '今日の予約ツール')];
    if (plan) {
      kids.push(h('div', { class: 'next-card' },
        h('div', { class: 'badge' }, '今日の企画'),
        h('div', { style: 'font-size:17px;font-weight:900;margin-top:4px' }, plan.title)));
    }
    const toolIds = (plan && plan.tools) || [];
    if (toolIds.length) {
      kids.push(h('p', { class: 'note', style: 'margin:2px 0 10px' },
        'カレンダーの「企画」で予約したツールです。この一覧は今日だけ表示されます。'));
      kids.push(h('div', { class: 'planday-grid' },
        toolIds.map(id => {
          const t = getTool(id);
          if (!t) return null;
          return h('button', { class: 'btn btn-ghost planday-btn', onclick: () => { location.hash = 'tool/' + id; } },
            h('span', { style: 'font-size:22px' }, t.icon),
            h('span', {}, t.name));
        })));
    } else {
      kids.push(h('div', { class: 'empty' },
        plan
          ? 'この企画にはツールが予約されていません。カレンダーの「企画」からツールを選べます。'
          : '今日の予約ツールはありません。カレンダーの「企画」で企画名とツールを登録できます。'));
      kids.push(h('button', { class: 'btn btn-primary btn-full mt12', onclick: () => { location.hash = 'calendar'; } },
        'カレンダーを開く'));
    }
    view.replaceChildren(...kids);
  }

  Gerbera.Screens = Object.assign(Gerbera.Screens || {}, {
    calendar: renderCalendar,
    planday: renderPlanDay
  });
})();
