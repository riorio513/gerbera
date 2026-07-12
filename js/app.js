'use strict';
/* ============================================================
   ガーベラ アプリ本体
   - トップ画面（今日の企画プルダウン）
   - 企画別ツール表示
   - 共通ツール（画面下部固定ナビ + ボトムシート）
   ============================================================ */
(function () {
  const { h, getTool, fmtClock } = Gerbera;

  /* ---- 企画とツールの対応（仕様書「企画別表示」） ---- */
  const PLANS = [
    { id: 'zatsudan', name: '雑談',           icon: '☕', tools: ['theme', 'psych', 'omikuji', 'dice', 'roulette'] },
    { id: 'uta',      name: '歌枠',           icon: '🎤', tools: ['song', 'timer', 'stopwatch', 'dice', 'roulette'] },
    { id: 'gachawaku',name: 'ガチャ枠',       icon: '🎰', tools: ['gacha', 'counter', 'timer', 'dice'] },
    { id: 'daisu',    name: 'ダイス企画',     icon: '🎲', tools: ['dice', 'counter', 'timer'] },
    { id: 'bingokai', name: 'ビンゴ企画',     icon: '🎱', tools: ['bingo', 'counter', 'timer'] },
    { id: 'taikyu',   name: '耐久企画',       icon: '🔥', tools: ['counter', 'timer', 'stopwatch', 'dice', 'roulette'] },
    { id: 'panel',    name: 'パネル開け',     icon: '🧩', tools: ['counter', 'roulette', 'dice', 'timer'] },
    { id: 'present',  name: 'プレゼント企画', icon: '🎁', tools: ['box', 'roulette', 'timer'] },
    { id: 'sanka',    name: '参加型企画',     icon: '🙌', tools: ['box', 'counter', 'timer'] },
    { id: 'omikujik', name: 'おみくじ企画',   icon: '⛩️', tools: ['omikuji', 'counter', 'timer'] }
  ];

  /* ---- 共通ツール（画面下部固定） ---- */
  const COMMON = ['calc', 'ptconv', 'timer', 'stopwatch', 'memo', 'note'];

  const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSffQ3-wIxkj7f4A7BEISRkSX90_2Mlj4tSJvbObxFsErTJprg/viewform?usp=publish-editor';

  const view = document.getElementById('view');
  const backBtn = document.getElementById('backBtn');
  const announceBtn = document.getElementById('announceBtn');
  const nav = document.getElementById('bottomNav');
  const sheet = document.getElementById('sheet');
  const sheetBody = document.getElementById('sheetBody');
  const sheetBackdrop = document.getElementById('sheetBackdrop');

  let mainCleanup = null;          // 企画画面に表示中ツールの後片付け
  const lastToolOfPlan = {};       // 企画ごとに最後に開いたツールを覚える

  backBtn.setAttribute('aria-label', '企画を変える');
  backBtn.addEventListener('click', () => { location.hash = ''; });

  /* ============ トップ画面 ============ */
  function renderHome() {
    backBtn.hidden = true;
    const flower = h('div', { class: 'center' });
    flower.innerHTML =
      '<svg class="home-flower" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<g fill="#E8B4C8"><ellipse cx="16" cy="6" rx="4" ry="7"/><ellipse cx="16" cy="26" rx="4" ry="7"/>' +
      '<ellipse cx="6" cy="16" rx="7" ry="4"/><ellipse cx="26" cy="16" rx="7" ry="4"/>' +
      '<ellipse cx="9" cy="9" rx="4.5" ry="6" transform="rotate(-45 9 9)"/>' +
      '<ellipse cx="23" cy="9" rx="4.5" ry="6" transform="rotate(45 23 9)"/>' +
      '<ellipse cx="9" cy="23" rx="4.5" ry="6" transform="rotate(45 9 23)"/>' +
      '<ellipse cx="23" cy="23" rx="4.5" ry="6" transform="rotate(-45 23 23)"/></g>' +
      '<circle cx="16" cy="16" r="5.5" fill="#C06F8D"/></svg>';

    const select = h('select', { class: 'plan-select', 'aria-label': '今日の企画をえらぶ',
      onchange: e => { if (e.target.value) location.hash = 'plan/' + e.target.value; } },
      h('option', { value: '', selected: true, disabled: true }, '🌼 今日の企画をえらぶ'),
      PLANS.map(p => h('option', { value: p.id }, `${p.icon} ${p.name}`)));

    const toolSelect = h('select', { class: 'plan-select', 'aria-label': 'ツールを選ぶ', style: 'margin-top:12px',
      onchange: e => { if (e.target.value) location.hash = 'tool/' + e.target.value; } },
      h('option', { value: '', selected: true, disabled: true }, '🧰 ツールを選ぶ'),
      Array.from(Gerbera.tools.values()).filter(t => t.id !== 'announce').map(t => h('option', { value: t.id }, `${t.icon} ${t.name}`)));

    view.replaceChildren(
      h('div', { class: 'home-hero' },
        flower,
        h('h1', {}, '今日の配信、なにする？'),
        h('p', {}, '企画をえらぶと、ぴったりのツールが表示されます')),
      h('div', { class: 'plan-select-wrap' }, select, toolSelect),
      h('p', { class: 'plan-hint' }, 'よく使うツールは、下のバーからいつでも開けます'),
      h('a', { class: 'btn btn-ghost btn-full mt16', href: FEEDBACK_URL, target: '_blank', rel: 'noopener' },
        '💌 ガーベラの感想・指摘・リクエストなど'),
      h('p', { class: 'plan-hint', style: 'margin-top:6px' },
        'このツールは個人で作られたものであり、試運転のため、皆様の指摘や感想、リクエストにより改善されます。')
    );
  }

  /* ============ 企画画面 ============ */
  function renderPlan(planId, toolId) {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) { location.hash = ''; return; }
    backBtn.hidden = false;

    if (!toolId || !plan.tools.includes(toolId)) {
      toolId = lastToolOfPlan[planId] && plan.tools.includes(lastToolOfPlan[planId])
        ? lastToolOfPlan[planId]
        : plan.tools[0];
    }
    lastToolOfPlan[planId] = toolId;

    const tabs = h('div', { class: 'tool-tabs' },
      plan.tools.map(tid => {
        const t = getTool(tid);
        return h('button', { class: 'ttab' + (tid === toolId ? ' on' : ''),
          onclick: () => { location.hash = `plan/${planId}/${tid}`; } },
          h('span', {}, t.icon), t.name);
      }));

    const panel = h('div');
    view.replaceChildren(
      h('div', { class: 'plan-head' },
        h('div', { class: 'plan-head-icon' }, plan.icon),
        h('div', { class: 'plan-head-name' }, plan.name)),
      tabs, panel);

    const tool = getTool(toolId);
    if (tool) mainCleanup = tool.mount(panel) || null;
  }

  /* ============ ツール直接表示（「ツールを選ぶ」プルダウンから） ============ */
  function renderToolDirect(toolId) {
    const tool = getTool(toolId);
    if (!tool) { location.hash = ''; return; }
    backBtn.hidden = false;

    const panel = h('div');
    view.replaceChildren(
      h('div', { class: 'plan-head' },
        h('div', { class: 'plan-head-icon' }, tool.icon),
        h('div', { class: 'plan-head-name' }, tool.name)),
      panel);
    mainCleanup = tool.mount(panel) || null;
  }

  /* ============ ルーター ============ */
  function route() {
    if (mainCleanup) { try { mainCleanup(); } catch (e) {} mainCleanup = null; }
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'plan' && parts[1]) renderPlan(parts[1], parts[2] || null);
    else if (parts[0] === 'tool' && parts[1]) renderToolDirect(parts[1]);
    else renderHome();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ============ ボトムシート（共通ツール） ============ */
  let sheetTool = null, sheetCleanup = null;

  function openSheet(id) {
    const t = getTool(id);
    if (!t) return;
    if (sheetCleanup) { try { sheetCleanup(); } catch (e) {} sheetCleanup = null; }
    sheetTool = id;
    document.getElementById('sheetIcon').textContent = t.icon;
    document.getElementById('sheetTitle').textContent = t.name;
    sheetBody.replaceChildren();
    sheetCleanup = t.mount(sheetBody) || null;
    sheet.hidden = false;
    sheetBackdrop.hidden = false;
    requestAnimationFrame(() => {
      sheet.classList.add('open');
      sheetBackdrop.classList.add('open');
    });
    refreshNav();
  }

  function closeSheet() {
    if (sheetTool === null) return;
    if (sheetCleanup) { try { sheetCleanup(); } catch (e) {} sheetCleanup = null; }
    sheetTool = null;
    sheet.classList.remove('open');
    sheetBackdrop.classList.remove('open');
    setTimeout(() => {
      if (sheetTool === null) {
        sheet.hidden = true;
        sheetBackdrop.hidden = true;
        sheetBody.replaceChildren();
      }
    }, 320);
    refreshNav();
    route(); // 開いている画面を最新の保存内容で描き直す
  }

  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  sheetBackdrop.addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  announceBtn.addEventListener('click', () => openSheet('announce'));

  /* 他のツールから共通ツールのシートを開くための窓口（例: pt変換→電卓） */
  Gerbera.openCommonTool = id => openSheet(id);

  /* ============ 画面下部 固定ナビ ============ */
  function buildNav() {
    nav.replaceChildren(...COMMON.map(id => {
      const t = getTool(id);
      return h('button', { class: 'bn-item', 'data-tool': id,
        onclick: () => (sheetTool === id ? closeSheet() : openSheet(id)) },
        h('span', { class: 'bn-ico' }, t.icon),
        h('span', { class: 'bn-label' }, t.name));
    }));
  }
  function refreshNav() {
    nav.querySelectorAll('.bn-item').forEach(el =>
      el.classList.toggle('active', el.dataset.tool === sheetTool));
  }

  /* タイマー残り時間・ストップウォッチ動作中をナビに表示 */
  function paintTimerBadge() {
    const el = nav.querySelector('[data-tool="timer"]');
    if (!el) return;
    const label = el.querySelector('.bn-label');
    if (Gerbera.Timer.running) {
      label.textContent = fmtClock(Gerbera.Timer.remainMs, false);
      el.classList.add('live');
    } else {
      label.textContent = 'タイマー';
      el.classList.remove('live');
    }
  }
  function paintSwDot() {
    const el = nav.querySelector('[data-tool="stopwatch"]');
    if (!el) return;
    const dot = el.querySelector('.bn-dot');
    if (Gerbera.Stopwatch.running) {
      if (!dot) el.append(h('span', { class: 'bn-dot' }));
    } else if (dot) {
      dot.remove();
    }
  }

  /* ============ 起動 ============ */
  buildNav();
  Gerbera.Timer.ev.on(() => paintTimerBadge());
  Gerbera.Stopwatch.ev.on(type => { if (type === 'state') paintSwDot(); });
  paintTimerBadge();
  paintSwDot();
  route();
})();
