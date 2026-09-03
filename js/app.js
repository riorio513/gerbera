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

  /* ---- 「ツールをえらぶ」の一覧（この順・この名前で表示）。
         tool: 登録済みツールのid ／ null: 未実装（一覧に名前だけ出し、選択不可） ---- */
  const TOOL_MENU = [
    { label: 'サイコロ',               tool: 'dice' },
    { label: 'ルーレット',             tool: 'roulette' },
    { label: 'ガチャ',                 tool: 'gacha' },
    { label: 'ビンゴ',                 tool: 'bingo' },
    { label: 'トランプ',               tool: null },
    { label: 'HIGH＆LOW',              tool: null },
    { label: '抽選箱',                 tool: 'box' },
    { label: '投票',                   tool: null },
    { label: 'タイマー・ストップウォッチ', tool: 'timer', icon: '⏰' },
    { label: 'カウンター',             tool: 'counter' },
    { label: '楽曲メモ',               tool: 'song' },
    { label: 'クイズ',                 tool: null },
    { label: 'トークテーマガチャ',     tool: 'theme' },
    { label: '心理テスト',             tool: 'psych' },
    { label: 'リスナーメモ',           tool: 'memo' },
    { label: 'メモ',                   tool: 'note' }
  ];

  const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSffQ3-wIxkj7f4A7BEISRkSX90_2Mlj4tSJvbObxFsErTJprg/viewform?usp=publish-editor';

  /* AI相談機能のフラグ。導入したら true にすると、「AIと相談する」ボタンの
     補足文が「※この機能はまだ実装されていません」→
     「※この機能は月額500円のサブスク入会が必要です」に切り替わる。 */
  const AI_ENABLED = false;

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

  /* ============ IRIAMの最新イベント情報パネル ============
     data/iriam-feed.json（毎月末にGitHub Actionsが更新）を1回だけ読み込み、
     以降はキャッシュから描画する。取得できない・ファイルが無いときは準備中表示。 */
  const IRIAM_SRC_URL = 'https://info.iriam.com/イベントキャンペーン等お知らせ';
  let iriamFeed = null;
  let iriamFeedTried = false;

  function buildIriamPanel() {
    const body = h('div', { class: 'iriam-body' },
      h('span', { class: 'home-info-soon-note' }, '読み込み中…'));
    const panel = h('div', { class: 'home-info home-info-iriam' },
      h('span', { class: 'home-info-label' }, '📅 IRIAMの最新イベント情報'),
      body);

    const fill = () => {
      const evs = (iriamFeed && iriamFeed.events) || [];
      const news = (iriamFeed && iriamFeed.news) || [];
      if (!evs.length && !news.length) {
        body.replaceChildren(h('span', { class: 'home-info-soon-note' },
          iriamFeedTried ? '最新情報を取得できませんでした' : '準備中です'));
        return;
      }
      const rows = [];
      evs.slice(0, 5).forEach(ev => {
        const meta = [
          ev.eventDateText ? '開催 ' + ev.eventDateText : null,
          ev.postedDate ? '告知 ' + ev.postedDate : null
        ].filter(Boolean).join('　');
        rows.push(h('a', { class: 'iriam-item', href: ev.url, target: '_blank', rel: 'noopener' },
          h('span', { class: 'iriam-item-title' },
            ev.category ? h('span', { class: 'iriam-tag' }, ev.category.replace('情報', '')) : null,
            ev.title),
          meta ? h('span', { class: 'iriam-item-meta' }, meta) : null));
      });
      news.slice(0, 2).forEach(n => {
        rows.push(h('a', { class: 'iriam-item', href: n.url, target: '_blank', rel: 'noopener' },
          h('span', { class: 'iriam-item-title' },
            h('span', { class: 'iriam-tag iriam-tag-news' }, 'ニュース'), n.title),
          n.date ? h('span', { class: 'iriam-item-meta' }, n.date) : null));
      });
      rows.push(h('a', { class: 'iriam-src', href: IRIAM_SRC_URL, target: '_blank', rel: 'noopener' },
        '出典: IRIAM公式 ↗'));
      body.replaceChildren(...rows);
    };

    if (iriamFeed || iriamFeedTried) {
      fill();
    } else {
      fetch('data/iriam-feed.json', { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => { iriamFeed = j; iriamFeedTried = true; fill(); })
        .catch(() => { iriamFeedTried = true; fill(); });
    }
    return panel;
  }

  /* ============ トップ画面 ============ */
  function renderHome() {
    backBtn.hidden = true;

    /* ---- 情報パネル：運営からの最新のおしらせ（投稿日時＋内容要約のみ。
           右端の×で消せる＝既読IDをローカルに保存して再表示しない） ---- */
    const latest = (Gerbera.ANNOUNCEMENTS && Gerbera.ANNOUNCEMENTS[0]) || null;
    const latestId = latest ? latest.date + '|' + latest.text.slice(0, 40) : null;
    const noticeDismissed = latestId && Store.get('home.notice.dismissed', []).includes(latestId);
    const noticePanel = (latest && !noticeDismissed)
      ? h('div', { class: 'home-info home-info-notice' },
          h('span', { class: 'home-info-date' }, latest.date),
          h('span', { class: 'home-info-body' }, latest.text),
          h('button', { class: 'home-info-x', 'aria-label': 'このお知らせを消す',
            onclick: () => {
              const list = Store.get('home.notice.dismissed', []);
              list.push(latestId);
              Store.set('home.notice.dismissed', list);
              noticePanel.remove();
            } }, '×'))
      : null;

    /* ---- 情報パネル：IRIAMの最新イベント情報（毎月末に自動更新される
           data/iriam-feed.json を読み込んで表示。無い／取れないときは準備中表示） ---- */
    const eventPanel = buildIriamPanel();
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

    /* ---- 「ツールをえらぶ」ボタン（同上・プルダウンを重ねる。一覧は TOOL_MENU 準拠） ---- */
    const toolSelect = h('select', { class: 'home-sel-native', 'aria-label': 'ツールをえらぶ',
      onchange: e => { if (e.target.value) location.hash = 'tool/' + e.target.value; } },
      h('option', { value: '', selected: true, disabled: true }, 'ツールをえらぶ'),
      TOOL_MENU.map(m => {
        if (!m.tool) return h('option', { value: '', disabled: true }, `${m.label}（準備中）`);
        const t = getTool(m.tool);
        const icon = m.icon || (t && t.icon) || '';
        return h('option', { value: m.tool }, `${icon} ${m.label}`.trim());
      }));
    const toolBtn = h('div', { class: 'home-sel-wrap' },
      h('span', { class: 'btn btn-ghost btn-full home-sub-face' }, 'ツールをえらぶ'),
      toolSelect);

    /* ---- 「AIと相談する」ボタン（AI_ENABLED で文言・挙動が切り替わる） ---- */
    const aiNote = AI_ENABLED
      ? '※この機能は月額500円のサブスク入会が必要です'
      : '※この機能はまだ実装されていません';
    const aiBtn = h('button', { class: 'btn btn-ghost btn-full home-sub-face home-ai-btn',
      onclick: () => Gerbera.toast(AI_ENABLED
        ? 'AIと相談する機能を使うには、月額500円のサブスク入会が必要です'
        : 'AIと相談する機能はまだ実装されていません') },
      h('span', { class: 'home-ai-title' }, 'AIと相談する'),
      h('span', { class: 'home-ai-note' }, aiNote));

    const btnRow = h('div', { class: 'home-btn-row' }, toolBtn, aiBtn);

    view.replaceChildren(
      h('h1', { class: 'home-greet' },
        'おかえりなさい、', h('span', { class: 'home-greet-name' }, '〇〇'), 'さん'),
      infoPanel,
      planBtn,
      btnRow,
      h('p', { class: 'plan-hint', style: 'margin-top:18px' },
        'ガーベラは個人運営です。改善中のため、皆様の感想や指摘をお待ちしております')
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

  /* ============ お問い合わせ（外部フォームへ移動する前の確認画面） ============ */
  function renderContactConfirm() {
    backBtn.hidden = false;
    view.replaceChildren(
      h('div', { class: 'card', style: 'text-align:center' },
        h('h2', { style: 'font-size:17px;color:var(--main-deep);margin-bottom:10px' }, 'お問い合わせ'),
        h('p', { style: 'font-size:14px;line-height:1.8' }, 'Googleフォームに遷移します'),
        h('p', { class: 'note', style: 'margin-top:6px' },
          '別のページ（Googleフォーム）が開きます。ガーベラに入力したデータはこのまま残ります。'),
        h('a', { class: 'btn btn-primary btn-big btn-full mt16',
          href: FEEDBACK_URL, target: '_blank', rel: 'noopener',
          onclick: () => { setTimeout(() => { location.hash = ''; }, 0); } }, '移動する'),
        h('button', { class: 'btn btn-ghost btn-full mt12',
          onclick: () => { location.hash = ''; } }, 'もどる'))
    );
  }

  /* ============ ルーター ============ */
  function route() {
    if (mainCleanup) { try { mainCleanup(); } catch (e) {} mainCleanup = null; }
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'plan' && parts[1]) renderPlan(parts[1], parts[2] || null);
    else if (parts[0] === 'tool' && parts[1]) renderToolDirect(parts[1]);
    else if (parts[0] === 'contact') renderContactConfirm();
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

  /* お問い合わせ（Googleフォームへ移動する前に確認画面をはさむ） */
  const contactBtn = document.getElementById('contactBtn');
  if (contactBtn) contactBtn.addEventListener('click', () => { location.hash = 'contact'; });

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
