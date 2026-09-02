'use strict';
/* ============================================================
   ガーベラ アプリ本体
   - トップ画面（今日の企画プルダウン）
   - 企画別ツール表示
   - 共通ツール（画面下部固定ナビ + ボトムシート）
   ============================================================ */
(function () {
  const { h, getTool, fmtClock, Store } = Gerbera;

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

    /* ---- トップお知らせバー（従来どおり最上部に常時表示） ---- */
    const notice = Gerbera.TOP_NOTICE;
    const dismissed = notice && Store.get('notice.dismissed', []).includes(notice.id);
    const noticeBar = (notice && !dismissed)
      ? h('div', { class: 'top-notice' },
          h('span', { class: 'top-notice-icon', 'aria-hidden': 'true' }, '📣'),
          h('span', { class: 'top-notice-text' }, notice.text),
          h('button', { class: 'top-notice-x', 'aria-label': 'このお知らせを閉じる',
            onclick: () => {
              const list = Store.get('notice.dismissed', []);
              list.push(notice.id);
              Store.set('notice.dismissed', list);
              noticeBar.remove();
            } }, '×'))
      : null;

    /* ---- 情報パネル：運営からの最新のおしらせ（実データ。タップで一覧シート） ---- */
    const latest = (Gerbera.ANNOUNCEMENTS && Gerbera.ANNOUNCEMENTS[0]) || null;
    const latestLine = latest
      ? latest.text.split('\n')[0].replace(/^[・･]\s*/, '')
      : 'いまは新しいお知らせはありません';
    const noticePanel = h('button', { class: 'home-info home-info-notice',
      onclick: () => { if (Gerbera.openCommonTool) Gerbera.openCommonTool('announce'); } },
      h('span', { class: 'home-info-label' }, '📣 運営からの最新のおしらせ'),
      h('span', { class: 'home-info-body' }, latestLine),
      latest ? h('span', { class: 'home-info-date' }, latest.date + ' ／ タップで一覧') : null);

    /* ---- 情報パネル：未実装分（レイアウトのみ・機能は今後） ---- */
    const eventPanel = h('div', { class: 'home-info home-info-soon' },
      h('span', { class: 'home-info-label' }, '📅 参加中・参加予定のイベント'),
      h('span', { class: 'home-info-soon-note' }, 'この機能は準備中です'));
    const debutPanel = h('div', { class: 'home-info home-info-soon home-info-mini' },
      h('span', { class: 'home-info-label' }, 'デビューから'),
      h('span', { class: 'home-info-mini-val' }, '〇日目'));
    const birthdayPanel = h('div', { class: 'home-info home-info-soon home-info-mini' },
      h('span', { class: 'home-info-label' }, '今月の誕生日は'),
      h('span', { class: 'home-info-mini-val' }, '〇〇です'));

    const infoPanel = h('div', { class: 'home-panel' },
      noticePanel,
      eventPanel,
      h('div', { class: 'home-info-row' }, debutPanel, birthdayPanel));

    /* ---- 「今日の企画をえらぶ」大ボタン（当面は従来のプルダウンを重ねる。
           一覧の出し方は今後あらためて検討） ---- */
    const planSelect = h('select', { class: 'home-sel-native', 'aria-label': '今日の企画をえらぶ',
      onchange: e => { if (e.target.value) location.hash = 'plan/' + e.target.value; } },
      h('option', { value: '', selected: true, disabled: true }, '今日の企画をえらぶ'),
      PLANS.map(p => h('option', { value: p.id }, `${p.icon} ${p.name}`)));
    const planBtn = h('div', { class: 'home-cta home-sel-wrap' },
      h('span', { class: 'btn btn-primary btn-big btn-full home-cta-face' }, '今日の企画をえらぶ'),
      planSelect);

    /* ---- 「ツールをえらぶ」ボタン（同上・プルダウンを重ねる） ---- */
    const toolSelect = h('select', { class: 'home-sel-native', 'aria-label': 'ツールをえらぶ',
      onchange: e => { if (e.target.value) location.hash = 'tool/' + e.target.value; } },
      h('option', { value: '', selected: true, disabled: true }, 'ツールをえらぶ'),
      Array.from(Gerbera.tools.values()).filter(t => t.id !== 'announce').map(t => h('option', { value: t.id }, `${t.icon} ${t.name}`)));
    const toolBtn = h('div', { class: 'home-sel-wrap' },
      h('span', { class: 'btn btn-ghost btn-full home-sub-face' }, 'ツールをえらぶ'),
      toolSelect);

    /* ---- 「AIと相談する」ボタン（段階的に実装予定。サブスク前提の文言つき） ---- */
    const aiBtn = h('button', { class: 'btn btn-ghost btn-full home-sub-face home-ai-btn',
      onclick: () => Gerbera.toast('AIと相談する機能は準備中です（月額500円のサブスク入会が必要になる予定です）') },
      h('span', { class: 'home-ai-title' }, 'AIと相談する'),
      h('span', { class: 'home-ai-note' }, '※この機能は月額500円のサブスク入会が必要です'));

    const btnRow = h('div', { class: 'home-btn-row' }, toolBtn, aiBtn);

    view.replaceChildren(
      ...(noticeBar ? [noticeBar] : []),
      h('h1', { class: 'home-greet' },
        'おかえりなさい、', h('span', { class: 'home-greet-name' }, '〇〇'), 'さん'),
      infoPanel,
      planBtn,
      btnRow,
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

  /* 設定・マイページ（レイアウトのみ。中身はログイン制の導入とあわせて実装予定） */
  const settingsBtn = document.getElementById('settingsBtn');
  const mypageBtn = document.getElementById('mypageBtn');
  if (settingsBtn) settingsBtn.addEventListener('click', () => Gerbera.toast('設定はまだ準備中です'));
  if (mypageBtn) mypageBtn.addEventListener('click', () => Gerbera.toast('マイページはログイン制の導入とあわせて準備中です'));

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
