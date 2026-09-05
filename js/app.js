'use strict';
/* ============================================================
   ガーベラ アプリ本体
   - ホーム（ダッシュボード）
   - 画面下部ナビ（ホーム／ツール／企画／配信管理／メモ。AI相談は AI_VISIBLE で出し分け）
   - 画面右下スピードダイヤル（お気に入りツール・全画面で起動可）
   - ルーター（各画面は js/settings.js・js/calendar.js・js/iriam.js が登録）
   ============================================================ */
(function () {
  const { h, getTool, fmtClock, Store, toast } = Gerbera;

  /* ---- 企画とツールの対応 ---- */
  const PLANS = [
    { id: 'zatsudan', name: '雑談',           icon: '☕', tools: ['theme', 'psych', 'omikuji', 'dice', 'roulette'] },
    { id: 'uta',      name: '歌枠',           icon: '🎤', tools: ['song', 'timersw', 'dice', 'roulette'] },
    { id: 'gachawaku',name: 'ガチャ枠',       icon: '🎰', tools: ['gacha', 'counter', 'timersw', 'dice'] },
    { id: 'daisu',    name: 'ダイス企画',     icon: '🎲', tools: ['dice', 'counter', 'timersw'] },
    { id: 'bingokai', name: 'ビンゴ企画',     icon: '🎱', tools: ['bingo', 'counter', 'timersw'] },
    { id: 'taikyu',   name: '耐久企画',       icon: '🔥', tools: ['counter', 'timersw', 'dice', 'roulette'] },
    { id: 'panel',    name: 'パネル開け',     icon: '🧩', tools: ['counter', 'roulette', 'dice', 'timersw'] },
    { id: 'present',  name: 'プレゼント企画', icon: '🎁', tools: ['box', 'roulette', 'timersw'] },
    { id: 'sanka',    name: '参加型企画',     icon: '🙌', tools: ['box', 'counter', 'timersw'] },
    { id: 'omikujik', name: 'おみくじ企画',   icon: '⛩️', tools: ['omikuji', 'counter', 'timersw'] }
  ];

  /* ---- 「ツールをえらぶ」一覧 ----
         並びは「日常的によく使う・汎用性が高い」ものほど上。
         tool: 登録済みツールid ／ null: 未実装（名前だけ・選択不可） ---- */
  const TOOL_MENU = [
    { label: 'サイコロ',                 tool: 'dice' },
    { label: 'ルーレット',               tool: 'roulette' },
    { label: 'カウンター',               tool: 'counter' },
    { label: 'タイマー＆ストップウォッチ', tool: 'timersw' },
    { label: 'メモ',                     tool: 'memo' },
    { label: '電卓',                     tool: 'calc' },
    { label: 'ポイント変換',             tool: 'ptconv' },
    { label: 'ガチャ',                   tool: 'gacha' },
    { label: '抽選箱',                   tool: 'box' },
    { label: 'ビンゴ',                   tool: 'bingo' },
    { label: 'おみくじ',                 tool: 'omikuji' },
    { label: 'トークテーマガチャ',       tool: 'theme' },
    { label: '心理テスト',               tool: 'psych' },
    { label: '楽曲メモ',                 tool: 'song' },
    { label: '投票',                     tool: null }
  ];
  Gerbera.TOOL_MENU = TOOL_MENU;

  /* AI相談機能のフラグ。
     AI_VISIBLE … false のあいだは画面下部ナビから隠し、#ai も開けない（一時的に非公開）。
     AI_ENABLED … 公開後の文言切り替え用。true で「月額500円のサブスク入会が必要です」になる。 */
  const AI_VISIBLE = false;
  const AI_ENABLED = false;

  /* ---- 画面下部ナビ（左端＝ホーム）。「ツール」は画面遷移せず小窓で開く ---- */
  const NAV = [
    { label: 'ホーム',   icon: '🏠', hash: '',          match: (p, full) => full === '' },
    { label: 'ツール',   icon: '🧰', sheet: true,        match: () => sheetMode === 'list' || sheetMode === 'listTool' },
    { label: '企画',     icon: '🎬', hash: 'plans',     match: p => p === 'plans' || p === 'plan' },
    { label: '配信管理', icon: '📊', hash: 'kanri',     match: p => p === 'kanri' || p === 'calendar' || p === 'planday' },
    { label: 'メモ',     icon: '📝', memoSheet: true, match: () => sheetMode === 'memo' },
    { label: 'AI相談',   icon: '🤖', hash: 'ai',        match: p => p === 'ai', hidden: !AI_VISIBLE }
  ].filter(item => !item.hidden);

  const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSffQ3-wIxkj7f4A7BEISRkSX90_2Mlj4tSJvbObxFsErTJprg/viewform?usp=publish-editor';

  const view = document.getElementById('view');
  const backBtn = document.getElementById('backBtn');
  const nav = document.getElementById('bottomNav');
  const sheet = document.getElementById('sheet');
  const sheetBody = document.getElementById('sheetBody');
  const sheetBackdrop = document.getElementById('sheetBackdrop');

  let mainCleanup = null;
  const lastToolOfPlan = {};
  let remindShown = false;

  backBtn.setAttribute('aria-label', 'もどる');
  backBtn.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.hash = '';
  });

  /* ============ ホーム（ダッシュボード） ============ */
  function renderHome() {
    const S = Gerbera.Settings ? Gerbera.Settings.get() : {};
    const Cal = Gerbera.Calendar;

    /* 運営からの最新のおしらせ（×で消せる） */
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
              list.push(latestId); Store.set('home.notice.dismissed', list);
              noticePanel.remove();
            } }, '×'))
      : null;

    /* 今日のリマインド（設定でプッシュ通知ONのときだけ） */
    let remindCard = null;
    if (S.notify && Cal) {
      const rem = Cal.todayReminders();
      if (rem.length) {
        remindCard = h('div', { class: 'home-info home-info-remind' },
          h('span', { class: 'home-info-label' }, '🔔 今日のリマインド'),
          h('div', { class: 'vstack', style: 'gap:4px;margin-top:4px' },
            rem.map(it => h('span', { class: 'home-info-body', style: 'font-size:13px' },
              '・' + remindText(it)))));
      }
    }

    /* 今日の企画 */
    const plan = Cal ? Cal.todayPlan() : null;
    const tapWord = (window.matchMedia && matchMedia('(pointer: coarse)').matches) ? 'タップ' : 'クリック';
    const planCard = h('button', { class: 'dash-plan', onclick: () => { location.hash = 'planday'; } },
      h('span', { class: 'dash-plan-head' },
        h('span', { class: 'dash-cell-label' }, '今日の企画'),
        h('span', { class: 'dash-plan-hint' }, `${tapWord}することで、予約したツール一覧が表示されます`)),
      plan
        ? h('span', { class: 'dash-plan-name' }, plan.title,
            (plan.tools && plan.tools.length) ? h('span', { class: 'dash-plan-tools' }, '　予約ツール ' + plan.tools.length + '件 ›') : h('span', { class: 'dash-plan-tools' }, ' ›'))
        : h('span', { class: 'dash-plan-none' }, '今日は企画配信の予定はありません'));

    /* カレンダー（配信管理で登録した予定・プラス記録の閲覧のみ。入力は配信管理から） */
    const calBox = h('div', { class: 'home-cal' });

    view.replaceChildren(
      h('h1', { class: 'home-greet' },
        'おかえりなさい、', h('span', { class: 'home-greet-name' }, '〇〇'), 'さん'),
      h('div', { class: 'home-panel' }, noticePanel, remindCard, planCard),
      calBox
    );
    if (Cal && Cal.mount) Cal.mount(calBox, { showMonthList: false, showPlusSummary: false, readOnly: true });

    /* 初回表示時に一度だけリマインドのトースト */
    if (!remindShown && S.notify && Cal) {
      const rem = Cal.todayReminders();
      if (rem.length) toast('🔔 今日のリマインドが' + rem.length + '件あります');
    }
    remindShown = true;
  }
  function remindText(it) {
    if (it.type === 'event') return it.title + '（イベント開始）';
    if (it.type === 'birthday') return (it.who || '') + ' さんの誕生日';
    if (it.type === 'todo') return it.task + '（Todo）';
    if (it.type === 'plan') return it.title + '（企画）';
    return it.title || it.task || '';
  }

  /* ============ ツールをえらぶ ============ */
  /* onPick(id) … ツールを選んだときの動作（画面遷移 or 小窓表示） */
  function toolRow(m, onPick) {
    if (!m.tool) {
      return h('div', { class: 'tool-row tool-row-disabled' },
        h('span', { class: 'tool-row-name' }, m.label),
        h('span', { class: 'tool-row-soon' }, '準備中'));
    }
    const t = getTool(m.tool);
    const isFav = Store.get('favorites', []).includes(m.tool);
    const star = h('button', { class: 'tool-star' + (isFav ? ' on' : ''),
      'aria-label': isFav ? 'お気に入りから外す' : 'お気に入りに追加',
      onclick: e => {
        e.stopPropagation();
        const list = Store.get('favorites', []);
        const i = list.indexOf(m.tool);
        if (i >= 0) list.splice(i, 1); else list.push(m.tool);
        Store.set('favorites', list);
        star.classList.toggle('on');
        star.setAttribute('aria-label', star.classList.contains('on') ? 'お気に入りから外す' : 'お気に入りに追加');
        paintSpeedDial();
      } }, '★');
    return h('button', { class: 'tool-row', onclick: () => onPick(m.tool) },
      h('span', { class: 'tool-row-ico' }, (t && t.icon) || '🔧'),
      h('span', { class: 'tool-row-name' }, m.label),
      star);
  }
  function toolListEl(onPick) {
    return h('div', { class: 'tool-list' }, TOOL_MENU.map(m => toolRow(m, onPick)));
  }
  function renderToolList() {
    view.replaceChildren(
      h('h1', { class: 'screen-title' }, 'ツールをえらぶ'),
      h('p', { class: 'note', style: 'margin:-4px 2px 10px' }, '★をつけると、右下のスピードダイヤルからすぐ開けます。'),
      toolListEl(id => { location.hash = 'tool/' + id; })
    );
  }

  /* ============ 企画をえらぶ ============ */
  function renderPlanList() {
    view.replaceChildren(
      h('h1', { class: 'screen-title' }, '企画をえらぶ'),
      h('div', { class: 'plan-list' },
        PLANS.map(p => h('button', { class: 'plan-row', onclick: () => { location.hash = 'plan/' + p.id; } },
          h('span', { class: 'plan-row-ico' }, p.icon),
          h('span', { class: 'plan-row-name' }, p.name),
          h('span', { class: 'tool-row-chev' }, '›'))))
    );
  }

  /* ============ AIと相談 ============ */
  function renderAI() {
    const note = AI_ENABLED
      ? '※この機能は月額500円のサブスク入会が必要です'
      : '※この機能はまだ実装されていません';
    view.replaceChildren(
      h('h1', { class: 'screen-title' }, 'AIと相談する'),
      h('div', { class: 'card center' },
        h('div', { style: 'font-size:34px' }, '🤖'),
        h('p', { style: 'font-size:14px;line-height:1.9;margin-top:6px' },
          'トークテーマ出し、リスナーメモの要約、Xポスト文の下書きなどを、AIと相談しながら進められるようにする予定です。'),
        h('p', { class: 'warn', style: 'margin-top:10px' }, note),
        h('button', { class: 'btn btn-lav btn-full mt16', onclick: () => toast(AI_ENABLED
          ? 'AIと相談する機能を使うには、月額500円のサブスク入会が必要です'
          : 'AIと相談する機能はまだ実装されていません') }, 'AIと相談する'))
    );
  }

  /* ============ 企画画面 ============ */
  function renderPlan(planId, toolId) {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) { location.hash = 'plans'; return; }

    if (!toolId || !plan.tools.includes(toolId)) {
      toolId = lastToolOfPlan[planId] && plan.tools.includes(lastToolOfPlan[planId])
        ? lastToolOfPlan[planId] : plan.tools[0];
    }
    lastToolOfPlan[planId] = toolId;

    const tabs = h('div', { class: 'tool-tabs' },
      plan.tools.map(tid => {
        const t = getTool(tid);
        if (!t) return null;
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

  /* ============ ツール直接表示 ============ */
  function renderToolDirect(toolId) {
    const tool = getTool(toolId);
    if (!tool) { location.hash = 'tools'; return; }
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
    view.replaceChildren(
      h('div', { class: 'card', style: 'text-align:center' },
        h('h2', { style: 'font-size:17px;color:var(--main-deep);margin-bottom:10px' }, 'お問い合わせ'),
        h('p', { style: 'font-size:14px;line-height:1.8' }, 'Googleフォームに遷移します'),
        h('p', { class: 'section-label', style: 'justify-content:center;margin:16px 0 6px' },
          'お問い合わせにおける個人情報の取り扱いについて'),
        h('p', { class: 'note', style: 'text-align:left' },
          '当運営は、利用者からお預かりする個人情報をお問い合わせの回答・対応の目的にのみ利用いたします。進まれる前に、必ずプライバシーポリシーをご確認ください。'),
        h('button', { class: 'btn btn-ghost btn-full mt12', onclick: () => { location.hash = 'settings/privacy'; } },
          'プライバシーポリシーを読む'),
        h('p', { class: 'note', style: 'text-align:left;margin-top:12px' },
          '「同意して移動する」ボタンを押下することで取り扱いに同意したものとみなします。'),
        h('a', { class: 'btn btn-primary btn-big btn-full mt12',
          href: FEEDBACK_URL, target: '_blank', rel: 'noopener',
          onclick: () => { setTimeout(() => { location.hash = ''; }, 0); } }, '同意して移動する'),
        h('button', { class: 'btn btn-ghost btn-full mt12', onclick: () => { history.back(); } }, 'もどる'))
    );
  }

  /* ============ ルーター ============ */
  function dispatch(p0, parts, full, SC) {
    if (p0 === '' ) return renderHome();
    if (p0 === 'tools') return renderToolList();
    if (p0 === 'tool' && parts[1]) return renderToolDirect(parts[1]);
    if (p0 === 'plans') return renderPlanList();
    if (p0 === 'plan' && parts[1]) return renderPlan(parts[1], parts[2] || null);
    if (p0 === 'ai' && AI_VISIBLE) return renderAI();
    if (p0 === 'kanri' && parts[1] === 'iriam') return SC.iriamAll && SC.iriamAll(view);
    if (p0 === 'kanri') return SC.kanri && SC.kanri(view);
    if (p0 === 'calendar') return SC.calendar && SC.calendar(view);
    if (p0 === 'planday') return SC.planday && SC.planday(view);
    if (p0 === 'settings' && parts[1] === 'terms') return SC.terms && SC.terms(view);
    if (p0 === 'settings' && parts[1] === 'purchase') return SC.purchase && SC.purchase(view);
    if (p0 === 'settings' && parts[1] === 'privacy') return SC.privacy && SC.privacy(view);
    if (p0 === 'settings') return SC.settings && SC.settings(view);
    if (p0 === 'contact') return renderContactConfirm();
    return renderHome();
  }
  function route() {
    if (mainCleanup) { try { mainCleanup(); } catch (e) {} mainCleanup = null; }
    const full = location.hash.replace(/^#\/?/, '');
    const parts = full.split('/');
    const p0 = parts[0];
    const SC = Gerbera.Screens || {};

    backBtn.hidden = (full === '');

    try {
      dispatch(p0, parts, full, SC);
    } catch (err) {
      console.error('画面の表示でエラー:', err);
      view.replaceChildren(
        h('div', { class: 'card center' },
          h('h2', { style: 'font-size:16px;color:var(--main-deep);margin-bottom:8px' }, '表示できませんでした'),
          h('p', { class: 'note' }, 'この画面の読み込み中に問題が発生しました。時間をおいて開き直してください。'),
          h('button', { class: 'btn btn-primary btn-full mt16', onclick: () => { location.hash = ''; } }, 'ホームに戻る')));
    }

    paintNav(full);
    paintSpeedDial();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ============ ボトムシート（ツール小窓・他ツールからの呼び出し・お知らせ） ============ */
  let sheetCleanup = null;
  let sheetMode = null; // null | 'tool' | 'list' | 'listTool'
  const sheetBack = document.getElementById('sheetBack');
  const sheetIcon = document.getElementById('sheetIcon');
  const sheetTitle = document.getElementById('sheetTitle');

  function clearSheetTool() {
    if (sheetCleanup) { try { sheetCleanup(); } catch (e) {} sheetCleanup = null; }
  }
  function showSheet() {
    sheet.hidden = false; sheetBackdrop.hidden = false;
    requestAnimationFrame(() => { sheet.classList.add('open'); sheetBackdrop.classList.add('open'); });
  }
  /* タブを持つツール（楽曲メモ・メモ・タイマー等）は、表示直後に中身の高さを固定する。
     → 同じツールならタブを切り替えても小窓の大きさが変わらない。
        余った分は空白、足りない分はその中でスクロールする。
     タブの無いツールは自然な高さのまま（項目を足したぶんは素直に伸びる）。 */
  function lockSheetHeight() {
    sheetBody.style.height = '';
    requestAnimationFrame(() => {
      if (sheet.hidden) return;
      if (!sheetBody.querySelector('.seg, .cal-tabs')) return;
      const vh = window.innerHeight;
      const natural = sheetBody.scrollHeight;
      const target = Math.min(Math.round(vh * 0.82), Math.max(natural, Math.round(vh * 0.5)));
      sheetBody.style.height = target + 'px';
    });
  }
  function unlockSheetHeight() { sheetBody.style.height = ''; }

  /* 単体ツールを小窓で開く（スピードダイヤル・他ツールからの呼び出し） */
  function openSheet(id, mode) {
    const t = getTool(id);
    if (!t) return;
    clearSheetTool();
    sheetMode = mode || 'tool';
    sheetBack.hidden = true;
    sheetIcon.textContent = t.icon;
    sheetTitle.textContent = t.name;
    unlockSheetHeight();
    sheetBody.replaceChildren();
    sheetBody.scrollTop = 0;
    sheetCleanup = t.mount(sheetBody) || null;
    lockSheetHeight();
    showSheet();
    paintNav(currentFull());
  }

  /* ツール一覧を小窓で表示（ボトムナビの「ツール」） */
  function openToolSheet() {
    clearSheetTool();
    sheetMode = 'list';
    sheetBack.hidden = true;
    sheetIcon.textContent = '🧰';
    sheetTitle.textContent = 'ツールをえらぶ';
    unlockSheetHeight();
    sheetBody.replaceChildren(
      h('p', { class: 'note', style: 'margin:0 0 8px' }, '選ぶと、今の画面のまま小窓で開けます。★でお気に入り登録。'),
      toolListEl(id => openToolFromList(id)));
    sheetBody.scrollTop = 0;
    showSheet();
    paintNav(currentFull());
  }
  function openToolFromList(id) {
    const t = getTool(id);
    if (!t) return;
    clearSheetTool();
    sheetMode = 'listTool';
    sheetBack.hidden = false;
    sheetIcon.textContent = t.icon;
    sheetTitle.textContent = t.name;
    unlockSheetHeight();
    sheetBody.replaceChildren();
    sheetBody.scrollTop = 0;
    sheetCleanup = t.mount(sheetBody) || null;
    lockSheetHeight();
  }

  function closeSheet() {
    if (sheet.hidden) return;
    clearSheetTool();
    sheetMode = null;
    sheet.classList.remove('open'); sheetBackdrop.classList.remove('open');
    setTimeout(() => {
      if (!sheet.classList.contains('open')) {
        sheet.hidden = true; sheetBackdrop.hidden = true;
        sheetBody.replaceChildren(); unlockSheetHeight();
      }
    }, 320);
    route();
  }

  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  sheetBackdrop.addEventListener('click', closeSheet);
  sheetBack.addEventListener('click', () => openToolSheet());
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (sheetMode === 'listTool') openToolSheet();
    else closeSheet();
  });
  Gerbera.openCommonTool = id => openSheet(id);

  /* ============ ヘッダーのメニュー（☰） ============ */
  const menuBtn = document.getElementById('menuBtn');
  const headerMenu = document.getElementById('headerMenu');
  const menuBackdrop = document.getElementById('menuBackdrop');
  function openMenu() {
    headerMenu.hidden = false; menuBackdrop.hidden = false;
    requestAnimationFrame(() => { headerMenu.classList.add('open'); menuBackdrop.classList.add('open'); });
    menuBtn.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    headerMenu.classList.remove('open'); menuBackdrop.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { headerMenu.hidden = true; menuBackdrop.hidden = true; }, 200);
  }
  menuBtn.addEventListener('click', () => (headerMenu.hidden ? openMenu() : closeMenu()));
  menuBackdrop.addEventListener('click', closeMenu);

  const announceBtn = document.getElementById('announceBtn');
  const contactBtn = document.getElementById('contactBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const mypageBtn = document.getElementById('mypageBtn');
  announceBtn.addEventListener('click', () => { closeMenu(); openSheet('announce'); });
  contactBtn.addEventListener('click', () => { closeMenu(); location.hash = 'contact'; });
  settingsBtn.addEventListener('click', () => { closeMenu(); location.hash = 'settings'; });
  mypageBtn.addEventListener('click', () => { closeMenu(); toast('マイページはログイン制の導入とあわせて準備中です'); });

  /* ============ 画面下部ナビ ============ */
  function currentFull() { return location.hash.replace(/^#\/?/, ''); }
  function buildNav() {
    nav.replaceChildren(...NAV.map(item =>
      h('button', { class: 'bn-item',
        onclick: () => {
          if (item.sheet) {
            (sheetMode === 'list' || sheetMode === 'listTool') ? closeSheet() : openToolSheet();
            return;
          }
          if (item.memoSheet) {
            (sheetMode === 'memo') ? closeSheet() : openSheet('memo', 'memo');
            return;
          }
          if (!sheet.hidden) closeSheet();
          location.hash = item.hash;
        } },
        h('span', { class: 'bn-ico' }, item.icon),
        h('span', { class: 'bn-label' }, item.label))));
  }
  function paintNav(full) {
    const p0 = full.split('/')[0];
    const toolSheetOpen = sheetMode === 'list' || sheetMode === 'listTool';
    const memoSheetOpen = sheetMode === 'memo';
    nav.querySelectorAll('.bn-item').forEach((el, i) => {
      const item = NAV[i];
      let on;
      if (memoSheetOpen) on = !!item.memoSheet;
      else if (toolSheetOpen) on = !!item.sheet;
      else on = !!item.match(p0, full);
      el.classList.toggle('active', on);
    });
  }

  /* ============ スピードダイヤル（お気に入りツール・全画面で起動） ============ */
  const fabStack = h('div', { class: 'fab-stack' });
  const timerPill = h('button', { class: 'timer-pill', hidden: true,
    onclick: () => openSheet('timersw') });
  const sdItems = h('div', { class: 'sd-items' });
  const sdFab = h('button', { class: 'sd-fab', 'aria-label': 'お気に入りツール',
    onclick: () => fabStack.classList.toggle('open') }, '+');
  const speedDial = h('div', { class: 'speed-dial' }, sdItems, sdFab);
  fabStack.append(timerPill, speedDial);
  document.body.append(fabStack);
  document.addEventListener('click', e => {
    if (!fabStack.contains(e.target)) fabStack.classList.remove('open');
  });

  function paintSpeedDial() {
    fabStack.classList.remove('open');
    const favs = Store.get('favorites', []).filter(id => getTool(id));
    if (!favs.length) {
      sdItems.replaceChildren(
        h('button', { class: 'sd-item sd-item-hint', onclick: () => openToolSheet() },
          h('span', { class: 'sd-item-label' }, 'ツール一覧で★を追加'),
          h('span', { class: 'sd-item-ico' }, '★')));
      return;
    }
    sdItems.replaceChildren(...favs.map(id => {
      const t = getTool(id);
      return h('button', { class: 'sd-item', onclick: () => openSheet(id) },
        h('span', { class: 'sd-item-label' }, t.name),
        h('span', { class: 'sd-item-ico' }, t.icon));
    }));
  }

  /* 動作中タイマー／ストップウォッチの小さな表示 */
  function paintTimerPill() {
    const T = Gerbera.Timer, SW = Gerbera.Stopwatch;
    if (T && T.running) {
      timerPill.hidden = false;
      timerPill.textContent = '⏰ ' + fmtClock(T.remainMs, false);
      timerPill.classList.remove('sw');
    } else if (SW && SW.running) {
      timerPill.hidden = false;
      timerPill.textContent = '⏱️ 計測中';
      timerPill.classList.add('sw');
    } else {
      timerPill.hidden = true;
    }
  }

  /* ============ 起動 ============ */
  buildNav();
  if (Gerbera.Timer) Gerbera.Timer.ev.on(() => paintTimerPill());
  if (Gerbera.Stopwatch) Gerbera.Stopwatch.ev.on(type => { if (type === 'state') paintTimerPill(); });
  paintTimerPill();
  route();

  /* 起動時：通知ONなら当日ぶんのリマインドを同期（通知許可済みならOS通知も出す） */
  if (Gerbera.Settings && Gerbera.Settings.get().notify && Gerbera.Push) {
    Gerbera.Push.sync();
  }
})();
