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
    { label: '効果音',                   tool: 'se' },
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
    { label: '投票',                     tool: 'vote' }
  ];
  Gerbera.TOOL_MENU = TOOL_MENU;

  /* AI相談機能のフラグ。
     AI_VISIBLE … false のあいだは画面下部ナビから隠し、#ai も開けない（一時的に非公開）。
     AI_ENABLED … 公開後の文言切り替え用。true で「月額500円のサブスク入会が必要です」になる。 */
  const AI_VISIBLE = false;
  const AI_ENABLED = false;

  /* ---- 画面下部ナビ（左端＝ホーム）。「ツール」は画面遷移せず小窓で開く ---- */
  const NAV = [
    { label: 'ホーム',      icon: '🏠', hash: '',           match: (p, full) => full === '' },
    { label: 'ツール',      icon: '🧰', sheet: true,         match: () => sheetMode === 'list' || sheetMode === 'listTool' },
    { label: '企画',        icon: '🎬', hash: 'plans',      match: p => p === 'plans' || p === 'plan' },
    { label: '配信管理',    icon: '📊', hash: 'kanri',      match: p => p === 'kanri' || p === 'calendar' || p === 'planday' },
    { label: 'バナイベ管理', icon: '🎯', hash: 'banner',    match: p => p === 'banner', hidden: () => { const d = Gerbera.Debut.get(); return !(d.stage === 'debut' && d.bannerEventParticipant); } },
    { label: 'メモ',        icon: '📝', memoSheet: true,  match: () => sheetMode === 'memo' },
    { label: 'AI相談',      icon: '🤖', hash: 'ai',        match: p => p === 'ai', hidden: !AI_VISIBLE }
  ];

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

  /* ============ 初回起動時：ユーザー段階選択 ============ */
  function renderDebutFirstChoice() {
    const Debut = Gerbera.Debut;

    const cards = [
      { stage: 'pre', icon: '🌱', label: '初配信前', desc: 'デビュー準備中です' },
      { stage: 'debut', icon: '🎉', label: 'デビューから1か月以内', desc: 'デビュー後の応援期間中です' },
      { stage: 'normal', icon: '💫', label: 'それ以降', desc: '通常配信を続けています' }
    ];

    let selected = null;
    const cardsEl = h('div', { class: 'debut-choice-cards', style: 'display:grid;grid-template-columns:1fr;gap:12px;margin-top:20px' },
      cards.map(c => {
        const card = h('button', {
          class: 'debut-choice-card',
          'aria-pressed': 'false',
          onclick: () => {
            selected = c.stage;
            cards.forEach((_, i) => {
              const on = cards[i].stage === selected;
              cardsEl.children[i].classList.toggle('selected', on);
              cardsEl.children[i].setAttribute('aria-pressed', on ? 'true' : 'false');
            });
          }
        },
          h('div', { style: 'font-size:32px;margin-bottom:8px' }, c.icon),
          h('div', { style: 'font-weight:bold;margin-bottom:4px' }, c.label),
          h('div', { style: 'font-size:13px;color:var(--text-sub)' }, c.desc)
        );
        return card;
      })
    );

    const submit = () => {
      if (!selected) { toast('選択してください'); return; }
      Debut.set({ stage: selected });
      location.hash = 'debut/register';
    };

    view.replaceChildren(
      h('div', { style: 'padding:20px;text-align:center' },
        h('h1', { style: 'margin:0 0 8px;font-size:20px' }, 'あなたの現状を教えてください'),
        h('p', { style: 'color:var(--text-sub);margin:0 0 20px;font-size:14px' }, 'デビューサポート機能をあなたの状況に合わせて設定します'),
        cardsEl,
        h('button', { class: 'btn btn-primary btn-full', style: 'margin-top:20px', onclick: submit }, '次へ')
      )
    );
  }

  /* ============ 初回登録：段階ごとの情報入力 ============ */
  function renderDebutRegister() {
    const Debut = Gerbera.Debut;
    const Settings = Gerbera.Settings;
    const d = Debut.get();

    if (!d.stage) { location.hash = ''; return; }

    const nameIn = h('input', { class: 'input', maxlength: 30,
      placeholder: '例：ライバー太郎', value: d.liverName || '' });

    let targetDateInput = null, targetTimeInput = null;
    const dateInputRow = () => {
      targetDateInput = h('input', { type: 'date',
        value: d.plannedDebutDate || (d.actualDebutDate || '') });
      targetTimeInput = h('input', { type: 'time',
        value: d.plannedDebutTime || (d.actualDebutTime || '') });
      return h('div', {},
        h('div', { class: 'input-label', style: 'margin-top:12px' },
          d.stage === 'pre' ? '予定初配信日' : '実際の初配信日'),
        d.stage === 'pre'
          ? h('p', { class: 'note', style: 'margin-top:4px;font-size:12px' },
              'これは予定日です。実際の初配信日時とは別に管理されます。')
          : h('p', { class: 'note', style: 'margin-top:4px;font-size:12px' },
              '※IRIAMでは、短時間でも配信を開始した場合は初配信として扱われることがあります。登録する日時にご注意ください。'),
        h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px' },
          targetDateInput,
          targetTimeInput
        ),
        h('p', { class: 'note', style: 'margin-top:6px;font-size:12px' },
          '日付のみ設定する場合は、時間は空いたままで大丈夫です'));
    };

    const submit = () => {
      const n = nameIn.value.trim().slice(0, 30);
      const dateVal = targetDateInput.value;
      const timeVal = targetTimeInput.value;

      if (d.stage === 'pre') {
        Debut.set({
          liverName: n,
          plannedDebutDate: dateVal || null,
          plannedDebutTime: timeVal || null
        });
      } else {
        Debut.set({
          liverName: n,
          actualDebutDate: dateVal || null,
          actualDebutTime: timeVal || null
        });
      }

      if (Settings && Settings.set) {
        Settings.set({ liverName: n });
      }

      toast('設定を保存しました');
      location.hash = '';
    };

    view.replaceChildren(
      h('div', { style: 'padding:20px' },
        h('h1', { class: 'screen-title' }, 'デビュー情報を入力'),

        h('div', { class: 'input-label' }, 'ライバーネーム'),
        h('p', { class: 'note', style: 'margin-top:4px;margin-bottom:8px;font-size:12px' },
          '未定でも先に進めます。登録後いつでも変更できます。'),
        nameIn,

        dateInputRow(),

        h('button', { class: 'btn btn-primary btn-full', style: 'margin-top:20px', onclick: submit },
          'デビューサポートを開始'),
        h('p', { class: 'note center', style: 'margin-top:12px' },
          '後から編集できますのでご安心ください。')
      )
    );
  }

  /* ============ 初配信前ホーム ============ */
  function renderDebutPreHome() {
    const Debut = Gerbera.Debut;
    const d = Debut.get();

    /* カウントダウン表示用の対象日時を取得 */
    const target = Debut.getCountdownTarget();
    const countdownCard = target ? renderCountdownCard(target) : null;

    /* タスクリスト（プリセット） */
    const presetTasks = [
      { id: 'avatar', title: '立ち絵' },
      { id: 'materials', title: '配信素材' },
      { id: 'icon', title: 'アイコン関連素材' },
      { id: 'others', title: 'その他初配信前に用意するもの' }
    ];
    const taskList = h('div', { class: 'debut-task-list' });
    function paintTasks() {
      const saved = d.taskList || [];
      taskList.replaceChildren(...presetTasks.map(task => {
        const rec = saved.find(t => t.id === task.id);
        const isDone = rec && rec.done;
        const isSkipped = rec && rec.skipped;
        return h('div', { class: 'debut-task-row', style: 'display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--bg-soft)' },
          h('button', {
            class: 'debut-task-check',
            style: 'flex-shrink:0;width:24px;height:24px;border:2px solid var(--main-strong);border-radius:4px;background:' + (isDone ? 'var(--main-strong)' : 'transparent') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold',
            onclick: () => {
              const list = d.taskList || [];
              const i = list.findIndex(t => t.id === task.id);
              if (i >= 0) {
                list[i].done = !list[i].done;
                if (list[i].done) list[i].skipped = false;
              } else {
                list.push({ id: task.id, done: true, skipped: false });
              }
              Debut.set({ taskList: list });
              paintTasks();
            }
          }, isDone ? '✓' : ''),
          h('span', { style: 'flex:1;' + (isSkipped ? 'text-decoration:line-through;color:var(--text-sub)' : '') }, task.title),
          h('button', {
            class: 'debut-task-skip',
            style: 'flex-shrink:0;padding:4px 8px;border:1px solid var(--text-sub);border-radius:4px;background:transparent;color:var(--text-sub);font-size:12px;cursor:pointer',
            onclick: () => {
              const list = d.taskList || [];
              const i = list.findIndex(t => t.id === task.id);
              if (i >= 0) {
                list[i].skipped = !list[i].skipped;
                if (list[i].skipped) list[i].done = false;
              } else {
                list.push({ id: task.id, done: false, skipped: true });
              }
              Debut.set({ taskList: list });
              paintTasks();
            }
          }, isSkipped ? 'スキップ解除' : 'スキップ')
        );
      }));
    }
    paintTasks();

    const topicStockUI = renderTopicStockUI();

    view.replaceChildren(
      h('div', { style: 'padding:16px;overflow-y:auto' },
        countdownCard || null,

        h('h2', { style: 'margin-top:20px;margin-bottom:12px;font-size:18px;font-weight:bold' }, '📋 タスクリスト'),
        h('p', { class: 'note', style: 'margin-bottom:8px;font-size:12px' }, '初配信までに準備しておくと良いもの'),
        taskList,

        h('h2', { style: 'margin-top:24px;margin-bottom:12px;font-size:18px;font-weight:bold' }, '💬 話題ストック'),
        topicStockUI,

        h('p', { class: 'note center', style: 'margin-top:20px;margin-bottom:40px' }, '他の画面は画面下部のナビからアクセスできます')
      )
    );
  }

  function renderTopicStockUI() {
    const Debut = Gerbera.Debut;
    let activeTab = 'chatter'; // chatter | qa

    const qaPresets = [
      '最近ハマっていること',
      '好きな作品',
      '自分のプチ自慢',
      '誰かに話したいやらかしエピソード',
      '好きなこととその理由',
      '苦手なこととその理由',
      '配信を始めようと思った理由',
      '配信で挑戦したいこと',
      '今後の意気込み'
    ];

    const container = h('div', {});

    function renderTab() {
      const chatterBtn = h('button', {
        class: activeTab === 'chatter' ? 'on' : '',
        style: 'padding:8px 12px;border:none;background:var(--bg-soft);border-radius:4px;margin-right:8px;cursor:pointer;' + (activeTab === 'chatter' ? 'background:var(--main-strong);color:white' : ''),
        onclick: () => { activeTab = 'chatter'; renderTab(); }
      }, '🗣️ 雑談');

      const qaBtn = h('button', {
        class: activeTab === 'qa' ? 'on' : '',
        style: 'padding:8px 12px;border:none;background:var(--bg-soft);border-radius:4px;cursor:pointer;' + (activeTab === 'qa' ? 'background:var(--main-strong);color:white' : ''),
        onclick: () => { activeTab = 'qa'; renderTab(); }
      }, '❓ 質疑応答');

      const tabContent = h('div', { style: 'margin-top:12px' });

      if (activeTab === 'chatter') {
        const titleIn = h('input', { class: 'input', maxlength: 50, placeholder: 'タイトル' });
        const contentIn = h('textarea', { class: 'input', placeholder: '詳細内容', style: 'margin-top:8px;min-height:80px' });
        const addBtn = h('button', {
          class: 'btn btn-primary btn-full',
          style: 'margin-top:8px',
          onclick: () => {
            const title = titleIn.value.trim();
            const content = contentIn.value.trim();
            if (!title) { toast('タイトルを入力してください'); return; }
            Debut.addTopicStock('chatter', title, content);
            titleIn.value = '';
            contentIn.value = '';
            renderTab();
            toast('話題を追加しました');
          }
        }, '追加');

        const list = h('div', { style: 'margin-top:12px' });
        const chatterItems = Debut.getTopicStocks('chatter');
        list.replaceChildren(...chatterItems.map(item =>
          h('div', { style: 'padding:8px;border:1px solid var(--bg-soft);border-radius:4px;margin-bottom:8px' },
            h('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start' },
              h('button', {
                style: 'flex:1;text-align:left;background:transparent;border:none;cursor:pointer;padding:0;font-weight:bold',
                onclick: () => {
                  const det = h('div', { style: 'margin-top:8px;font-weight:normal;color:var(--text-sub);white-space:pre-wrap' }, item.content || '（詳細なし）');
                  if (!item._expanded) {
                    det.style.display = 'none';
                    item._expanded = false;
                  } else {
                    item._expanded = true;
                  }
                  const btn = h('button', {
                    style: 'background:none;border:none;color:var(--text-sub);cursor:pointer;padding:0;font-size:12px',
                    onclick: (e) => {
                      e.stopPropagation();
                      item._expanded = !item._expanded;
                      det.style.display = item._expanded ? 'block' : 'none';
                    }
                  }, item._expanded ? '▼ 隠す' : '▶ 展開');
                  const parent = this.parentElement.parentElement;
                  if (parent.children.length > 2) parent.removeChild(parent.children[2]);
                  if (parent.children.length > 1) parent.removeChild(parent.children[1]);
                  parent.append(btn, det);
                }
              }, item.title),
              h('button', {
                style: 'background:none;border:none;color:var(--danger);cursor:pointer;padding:0;font-size:12px;margin-left:8px;flex-shrink:0',
                onclick: () => { Debut.removeTopicStock('chatter', item.id); renderTab(); }
              }, '削除')
            )
          )
        ));

        tabContent.replaceChildren(
          h('div', {}, h('div', { class: 'input-label' }, 'タイトル'), titleIn),
          h('div', {}, h('div', { class: 'input-label', style: 'margin-top:12px' }, '詳細内容'), contentIn),
          addBtn,
          h('h3', { style: 'margin-top:16px;font-size:14px;font-weight:bold' }, '登録済みの話題'),
          list
        );
      } else {
        // QA モード
        const qaList = h('div', {});
        const qaItems = Debut.getTopicStocks('qa');

        function renderQA() {
          qaList.replaceChildren(...qaPresets.map((q, i) => {
            const item = qaItems.find(it => it.title === q);
            return h('div', { style: 'padding:8px;border:1px solid var(--bg-soft);border-radius:4px;margin-bottom:8px' },
              h('div', { style: 'font-weight:bold;font-size:13px' }, q),
              h('textarea', {
                class: 'input',
                style: 'margin-top:6px;min-height:60px;font-size:13px',
                value: item ? item.content : '',
                placeholder: '回答を入力してください',
                onchange: (e) => {
                  const text = e.target.value.trim();
                  if (text) {
                    if (item) {
                      Debut.updateTopicStock('qa', item.id, { content: text });
                    } else {
                      Debut.addTopicStock('qa', q, text);
                    }
                  } else if (item) {
                    Debut.removeTopicStock('qa', item.id);
                  }
                }
              })
            );
          }));
        }
        renderQA();

        h('p', { class: 'note', style: 'margin-bottom:8px;font-size:12px' },
          'エピソードを交えながら詳細に書くと、会話の時間が長くなり、リスナーがあなたのことをより理解してくれるようになります。');

        tabContent.replaceChildren(
          h('p', { class: 'note', style: 'margin-bottom:8px;font-size:12px' },
            'エピソードを交えながら詳細に書くと、会話の時間が長くなり、リスナーがあなたのことをより理解してくれるようになります。'),
          qaList
        );
      }

      container.replaceChildren(
        h('div', { style: 'display:flex;gap:8px;margin-bottom:12px' }, chatterBtn, qaBtn),
        tabContent
      );
    }

    renderTab();
    return container;
  }

  /* ============ 初配信当日：最終確認リスト ============ */
  function renderDebutDebutDay() {
    const Debut = Gerbera.Debut;
    const d = Debut.get();

    const target = Debut.getCountdownTarget();
    const countdownCard = target ? renderCountdownCard(target) : null;

    const checklist = [
      { id: 'title', label: '配信タイトルを決める' },
      { id: 'charge', label: '端末の充電を終える' },
      { id: 'mic', label: 'マイク・機材の音出し確認をする' },
      { id: 'topic', label: '話題ストックを確認する' },
      { id: 'goal', label: '入室者の目標を設定する', action: true },
      { id: 'notify', label: 'SNSの通知をOFFにする' },
      { id: 'drink', label: '飲み物を準備する' },
      { id: 'breath', label: '緊張を和らげる呼吸法をする', breath: true }
    ];

    const checklistEl = h('div', {});
    let breathingExpanded = false;

    function paintChecklist() {
      const saved = Store.get('debut.debutDayChecklist', {}) || {};
      checklistEl.replaceChildren(...checklist.map(item => {
        const isDone = saved[item.id];
        const row = h('div', {
          style: 'display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--bg-soft)',
          class: isDone ? 'completed' : ''
        },
          h('button', {
            style: 'flex-shrink:0;width:24px;height:24px;border:2px solid var(--main-strong);border-radius:4px;background:' + (isDone ? 'var(--main-strong)' : 'transparent') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;margin-top:2px',
            onclick: () => {
              saved[item.id] = !saved[item.id];
              Store.set('debut.debutDayChecklist', saved);
              paintChecklist();
            }
          }, isDone ? '✓' : ''),
          h('div', { style: 'flex:1' },
            h('div', { style: isDone ? 'text-decoration:line-through;color:var(--text-sub)' : '' }, item.label),
            item.action && !isDone ? h('button', {
              style: 'margin-top:6px;padding:4px 8px;border:1px solid var(--main-strong);border-radius:4px;background:transparent;color:var(--main-strong);font-size:12px;cursor:pointer',
              onclick: () => {
                modal({
                  title: '入室者の目標を設定',
                  render: (body, { close }) => {
                    const goalIn = h('input', { type: 'number', class: 'input', min: '0', value: d.initialDebutGoal || '' });
                    body.append(
                      h('p', { class: 'note' }, 'カウンター上限として設定されます'),
                      goalIn,
                      h('button', { class: 'btn btn-primary btn-full mt12', onclick: () => {
                        const v = parseInt(goalIn.value) || 0;
                        Debut.set({ initialDebutGoal: v });
                        close();
                        paintChecklist();
                      } }, '設定'));
                  }
                });
              }
            }, '設定する') : null,
            item.breath && !isDone ? h('button', {
              style: 'margin-top:6px;padding:4px 8px;border:1px solid var(--main-strong);border-radius:4px;background:transparent;color:var(--main-strong);font-size:12px;cursor:pointer',
              onclick: () => {
                breathingExpanded = !breathingExpanded;
                const exp = row.querySelector('.breathing-guide');
                if (exp) exp.style.display = breathingExpanded ? 'block' : 'none';
              }
            }, breathingExpanded ? '▼ 隠す' : '▶ やり方') : null
          )
        );

        if (item.breath) {
          const guide = h('div', { class: 'breathing-guide', style: 'display:' + (breathingExpanded ? 'block' : 'none') + ';margin-top:8px;padding:8px;background:var(--bg-soft);border-radius:4px;font-size:13px;line-height:1.6' },
            h('p', { style: 'margin:0 0 8px' }, '兵士や軍人などが強い緊張状態で用いることがある実践的な呼吸法です。'),
            h('div', { style: 'font-weight:bold;margin-bottom:8px' }, '手順：'),
            h('ol', { style: 'margin:0;padding-left:20px' },
              h('li', {}, '4秒で息を吐ききる'),
              h('li', {}, '4秒息を止める'),
              h('li', {}, '4秒息を吸う'),
              h('li', {}, '4秒息を止める'),
              h('li', {}, '1〜4を満足いくまで、または好きなだけ繰り返す')
            )
          );
          row.append(guide);
        }

        return row;
      }));
    }
    paintChecklist();

    view.replaceChildren(
      h('div', { style: 'padding:16px;overflow-y:auto' },
        countdownCard || null,

        h('h2', { style: 'margin-top:20px;margin-bottom:12px;font-size:18px;font-weight:bold' }, '🎯 最終確認リスト'),
        checklistEl,

        h('button', {
          class: 'btn btn-primary btn-full',
          style: 'margin-top:20px;padding:16px;font-size:16px;font-weight:bold',
          onclick: () => {
            Debut.set({ initialDebutStartedAt: Date.now() });
            renderHome();
          }
        }, '🎬 初配信を開始する'),

        h('p', { class: 'note center', style: 'margin-top:12px;margin-bottom:40px' })
      )
    );
  }

  /* ============ 初配信中：配信 UI ============ */
  function renderDebutBroadcasting() {
    const Debut = Gerbera.Debut;
    const d = Debut.get();
    const elapsedMs = Date.now() - d.initialDebutStartedAt;

    const timerBox = h('div', {
      style: 'background:var(--main-strong);color:white;padding:16px;border-radius:8px;text-align:center;margin-bottom:16px;font-size:24px;font-weight:bold'
    });

    function updateTimer() {
      const now = Date.now();
      const elapsed = Math.max(0, now - d.initialDebutStartedAt);
      const hours = Math.floor(elapsed / (1000 * 60 * 60));
      const mins = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((elapsed % (1000 * 60)) / 1000);
      timerBox.textContent = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);

    /* カウンター */
    let goal = d.initialDebutGoal || 0;
    let currentCount = 0;
    const counterBox = h('div', {
      style: 'background:var(--bg-soft);padding:12px;border-radius:8px;text-align:center;margin-bottom:16px'
    });
    const counterDisplay = h('div', { style: 'font-size:20px;font-weight:bold' }, `${currentCount} / ${goal || '目標未設定'}`);
    const counterBtns = h('div', { style: 'display:flex;gap:4px;margin-top:8px;justify-content:center' },
      h('button', { class: 'btn btn-sm', style: 'padding:6px 8px;font-size:12px', onclick: () => { currentCount = Math.max(0, currentCount - 5); updateCounter(); } }, '-5'),
      h('button', { class: 'btn btn-sm', style: 'padding:6px 8px;font-size:12px', onclick: () => { currentCount = Math.max(0, currentCount - 1); updateCounter(); } }, '-1'),
      h('button', { class: 'btn btn-sm', style: 'padding:6px 8px;font-size:12px', onclick: () => { currentCount++; updateCounter(); } }, '+1'),
      h('button', { class: 'btn btn-sm', style: 'padding:6px 8px;font-size:12px', onclick: () => { currentCount += 5; updateCounter(); } }, '+5')
    );
    function updateCounter() {
      const rem = goal ? (goal - currentCount) : '-';
      counterDisplay.textContent = `${currentCount} / ${goal || '目標未設定'}`;
      if (goal) counterDisplay.textContent += `  \u{1f3a9} あと ${rem}人`;
    }
    const makeCustomRow = (defaultValue, label) => {
      const input = h('input', { class: 'input', type: 'number', min: '1', inputmode: 'numeric', value: defaultValue,
        'aria-label': label, style: 'width:48px;padding:6px 2px;text-align:center' });
      const amount = () => Math.max(1, parseInt(input.value, 10) || 1);
      return h('div', { style: 'display:flex;gap:4px;justify-content:center;align-items:center' },
        h('button', { class: 'btn btn-sm', style: 'padding:6px 7px;font-size:12px',
          onclick: () => { currentCount = Math.max(0, currentCount - amount()); updateCounter(); } }, '−'),
        input,
        h('span', { class: 'note' }, '人'),
        h('button', { class: 'btn btn-sm', style: 'padding:6px 7px;font-size:12px',
          onclick: () => { currentCount += amount(); updateCounter(); } }, '＋'));
    };
    const customRow1 = makeCustomRow(10, '増減する人数（自由入力・1つ目）');
    const customRow2 = makeCustomRow(50, '増減する人数（自由入力・2つ目）');
    const goalBtn = h('button', {
      class: 'btn btn-ghost btn-sm',
      style: 'margin-top:8px;font-size:12px',
      onclick: () => {
        Gerbera.modal({
          title: '上限を変更',
          render: (body, { close }) => {
            const goalIn = h('input', { type: 'number', class: 'input', min: '0', inputmode: 'numeric', value: goal || '' });
            body.append(
              h('p', { class: 'note' }, '0にすると上限なし（目標未設定）になります'),
              goalIn,
              h('button', { class: 'btn btn-primary btn-full mt12', onclick: () => {
                goal = Math.max(0, parseInt(goalIn.value, 10) || 0);
                Debut.set({ initialDebutGoal: goal });
                updateCounter();
                close();
              } }, '変更する'));
          }
        });
      }
    }, '✎ 上限を変更');
    counterBox.append(
      h('div', {}, '入室カウンター'),
      counterDisplay,
      counterBtns,
      h('div', { style: 'display:flex;gap:10px;margin-top:8px;justify-content:center;flex-wrap:wrap' }, customRow1, customRow2),
      goalBtn
    );
    updateCounter();

    /* 話題ストック表示 */
    const topicBox = h('div', { style: 'background:var(--bg-soft);padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px' });
    const topicTabs = h('div', { style: 'display:flex;gap:8px;margin-bottom:8px' });
    let topicTab = 'chatter';
    const topicContent = h('div', {});

    function renderTopicTab() {
      const chatterBtn = h('button', {
        style: 'padding:4px 8px;border:1px solid var(--main-strong);border-radius:4px;background:' + (topicTab === 'chatter' ? 'var(--main-strong);color:white' : 'transparent'),
        onclick: () => { topicTab = 'chatter'; renderTopicTab(); }
      }, '🗣️ 雑談');
      const qaBtn = h('button', {
        style: 'padding:4px 8px;border:1px solid var(--main-strong);border-radius:4px;background:' + (topicTab === 'qa' ? 'var(--main-strong);color:white' : 'transparent'),
        onclick: () => { topicTab = 'qa'; renderTopicTab(); }
      }, '❓ Q&A');
      topicTabs.replaceChildren(chatterBtn, qaBtn);

      const items = Debut.getTopicStocks(topicTab);
      topicContent.replaceChildren(
        items.length
          ? h('div', {}, ...items.map((it, i) =>
              h('div', { style: 'margin-bottom:6px;padding:6px;background:var(--bg);border-radius:4px' },
                h('div', { style: 'font-weight:bold' }, (i + 1) + '. ' + it.title),
                it.content && it.content.length > 30
                  ? h('div', { style: 'margin-top:4px;font-size:12px;color:var(--text-sub)' }, it.content.slice(0, 50) + '...')
                  : null
              )
            ))
          : h('p', { class: 'note', style: 'font-size:12px' }, '話題が登録されていません')
      );
    }
    renderTopicTab();
    topicBox.append(
      h('div', { style: 'font-weight:bold;margin-bottom:8px' }, '💬 話題ストック'),
      topicTabs,
      topicContent
    );

    /* メモ入力 */
    const memoBox = h('div', { style: 'background:var(--bg-soft);padding:12px;border-radius:8px;margin-bottom:16px' });
    const memoIn = h('textarea', {
      class: 'input',
      placeholder: '配信中のメモ・アイデア',
      style: 'min-height:80px;font-size:13px',
      value: Store.get('debut.broadcastingMemo', '')
    });
    memoIn.addEventListener('input', () => {
      Store.set('debut.broadcastingMemo', memoIn.value);
    });
    memoBox.append(
      h('div', { style: 'font-weight:bold;margin-bottom:8px' }, '📝 メモ'),
      memoIn
    );

    /* SEパネル（効果音） */
    const SE = Gerbera.SE;
    const seBody = h('div', { class: 'editor-body' });
    if (SE) {
      seBody.append(h('div', { class: 'hstack', style: 'justify-content:flex-end' },
        h('button', { class: 'btn btn-ghost btn-sm', 'aria-label': '鳴っている効果音をすべて止める',
          onclick: () => SE.stopAll() }, '■ 停止')));
      seBody.append(...SE.categories.map(cat =>
        h('div', { class: 'mt12' },
          h('div', { style: 'font-weight:bold;font-size:12.5px;margin-bottom:6px' }, cat.label),
          h('div', { class: 'chip-wrap' },
            ...SE.list.filter(se => se.category === cat.id).map(se =>
              h('button', { class: 'chip', onclick: () => SE.play(se.file) }, se.label)))
        )
      ));
    }
    const seDetails = h('details', { class: 'editor' },
      h('summary', {}, '🔊 SE（効果音）'),
      seBody
    );

    view.replaceChildren(
      h('div', { style: 'padding:16px;overflow-y:auto' },
        h('h1', { style: 'margin:0 0 16px;font-size:20px;font-weight:bold' }, '🎬 初配信中'),
        timerBox,
        counterBox,
        topicBox,
        memoBox,
        h('div', { style: 'margin-bottom:16px' }, seDetails),

        h('button', {
          class: 'btn btn-ghost btn-full',
          style: 'margin-bottom:20px',
          onclick: () => {
            clearInterval(timerInterval);
            Debut.set({ initialDebutEndedAt: Date.now() });
            location.hash = 'debut/kpi-form';
          }
        }, '🛑 配信を終了する')
      )
    );
  }

  function renderCountdownCard(target) {
    const now = Date.now();
    const targetTime = new Date(target.date + 'T' + (target.time || '00:00:00')).getTime();
    const diff = Math.max(0, targetTime - now);

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    let countdownText;
    if (target.time) {
      countdownText = `あと ${days}日 ${hours}時間 ${mins}分 ${secs}秒`;
    } else {
      countdownText = `あと ${days}日`;
    }

    return h('div', { class: 'debut-countdown', style: 'background:var(--main-strong);color:white;padding:20px;border-radius:8px;text-align:center;margin-bottom:20px' },
      h('div', { style: 'font-size:14px;margin-bottom:8px' }, '初配信まで'),
      h('div', { style: 'font-size:28px;font-weight:bold' }, countdownText));
  }

  /* ============ ホーム（ダッシュボード） ============ */
  function renderHome() {
    const Debut = Gerbera.Debut;
    if (Debut.isFirstTime()) {
      renderDebutFirstChoice();
      return;
    }

    const d = Debut.get();

    /* 初配信が開始されている → 配信中 UI */
    if (d.initialDebutStartedAt) {
      renderDebutBroadcasting();
      return;
    }

    if (d.stage === 'pre') {
      /* 当日判定 */
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const target = d.actualDebutDate || d.plannedDebutDate;

      if (target === today) {
        /* 当日 → 最終確認リスト */
        renderDebutDebutDay();
        return;
      }

      /* 当日でない → 準備画面 */
      renderDebutPreHome();
      return;
    }

    const S = Gerbera.Settings ? Gerbera.Settings.get() : {};
    const Cal = Gerbera.Calendar;

    /* 運営からの最新のおしらせ（×で消せる） */
    const latest = (Gerbera.ANNOUNCEMENTS && Gerbera.ANNOUNCEMENTS[0]) || null;
    const latestId = latest ? latest.date + '|' + latest.text.slice(0, 40) : null;
    const noticeDismissed = latestId && Store.get('home.notice.dismissed', []).includes(latestId);
    const noticePanel = (latest && !noticeDismissed)
      ? h('div', { class: 'home-info home-info-notice' },
          h('span', { class: 'home-info-date' }, latest.date),
          h('span', { class: 'home-info-body' }, latest.text,
            latest.detail ? h('button', { class: 'news-link',
              onclick: () => { location.hash = 'news/' + latest.detail; } }, '詳しく見る ›') : null),
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
    let calHandle = null;

    /* 今日のプラス（毎日つける記録なので、配信管理まで潜らずここで完結させる） */
    const plusRow = Cal ? h('div', { class: 'home-plus' }) : null;
    function paintPlus() {
      const t = Cal.todayISO();
      const rec = Cal.plusOn(t);
      const cur = rec && rec.done ? (+rec.amount || 0) : null;
      plusRow.replaceChildren(
        h('span', { class: 'home-plus-label' }, '今日のプラス'),
        ...[2, 4, 6].map(a => h('button', {
          class: 'home-plus-btn' + (cur === a ? ' on' : ''),
          'aria-pressed': cur === a ? 'true' : 'false',
          onclick: () => {
            const r = Cal.plusOn(t);
            if (cur === a) {
              if (r && r.plan) Cal.update(r.id, { done: false, amount: 0 });
              else if (r) Cal.remove(r.id);
              toast('今日のプラス記録を取り消しました');
            } else {
              const rr = r || Cal.add({ type: 'plus', date: t, plan: false, done: false, amount: 0 });
              Cal.update(rr.id, { done: true, amount: a });
              toast(`今日のプラスを＋${a}で記録しました`);
            }
            paintPlus();
            if (calHandle) calHandle.refresh();
          }
        }, '＋' + a)));
    }
    if (plusRow) paintPlus();

    view.replaceChildren(
      h('h1', { class: 'home-greet' },
        'おかえりなさい、', h('span', { class: 'home-greet-name' }, S.liverName || '〇〇'), 'さん'),
      h('div', { class: 'home-panel' }, noticePanel, remindCard, planCard, plusRow),
      calBox
    );
    if (Cal && Cal.mount) {
      calHandle = Cal.mount(calBox, { showMonthList: false, showPlusSummary: false, readOnly: true });
    }

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

  /* ============ バナイベ管理 ============ */
  function renderBannerEventManagement() {
    const Debut = Gerbera.Debut;
    const d = Debut.get();

    if (d.stage !== 'debut' || !d.bannerEventParticipant) {
      location.hash = ''; return;
    }

    /* バナイベ期間計算（初配信日から7日間） */
    const targetDate = d.actualDebutDate || d.plannedDebutDate;
    if (!targetDate) {
      view.replaceChildren(h('div', { class: 'card center' },
        h('p', { class: 'note' }, 'デビュー日が設定されていません')));
      return;
    }

    const startD = new Date(targetDate + 'T00:00:00');
    const week = [];
    const dayLabels = ['月', '火', '水', '木', '金', '土', '日'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startD);
      d.setDate(startD.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dow = d.getDay();
      week.push({
        date: dateStr,
        dayLabel: dayLabels[dow === 0 ? 6 : dow - 1],
        displayDate: `${d.getMonth() + 1}/${d.getDate()}`
      });
    }

    const bannerPlan = d.bannerEventPlan || {};
    const events = bannerPlan.events || [];

    const dayCards = week.map(day => {
      const dayEvents = events.filter(e => e.date === day.date);
      const eventList = h('div', { style: 'margin-top:8px' });

      function paintEvents() {
        eventList.replaceChildren(...dayEvents.map(ev =>
          h('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:6px;background:var(--bg-soft);border-radius:4px;margin-bottom:4px;font-size:13px' },
            h('span', {}, ev.title),
            h('button', { style: 'background:none;border:none;color:var(--text-sub);cursor:pointer;font-size:16px',
              onclick: () => {
                Debut.set({
                  bannerEventPlan: Object.assign({}, bannerPlan, {
                    events: events.filter(e => e.id !== ev.id)
                  })
                });
                renderBannerEventManagement();
              }
            }, '×')
          )
        ));
      }
      paintEvents();

      return h('div', { style: 'background:var(--bg-soft);padding:12px;border-radius:8px;margin-bottom:12px' },
        h('div', { style: 'font-weight:bold;margin-bottom:8px' }, `${day.displayDate}(${day.dayLabel})`),
        eventList,
        dayEvents.length < 3 ? h('button', {
          class: 'btn btn-ghost btn-small btn-full',
          style: 'margin-top:8px;font-size:12px',
          onclick: () => {
            const title = prompt('企画名を入力');
            if (title) {
              const newEvent = {
                id: Date.now().toString(36),
                date: day.date,
                title: title,
                count: 0,
                tools: []
              };
              Debut.set({
                bannerEventPlan: Object.assign({}, bannerPlan, {
                  events: [...events, newEvent]
                })
              });
              renderBannerEventManagement();
            }
          }
        }, '+ 企画を追加') : null
      );
    });

    const strategyForm = h('div', { style: 'background:var(--bg-soft);padding:12px;border-radius:8px;margin-top:20px' },
      h('h3', { style: 'margin-top:0;margin-bottom:12px;font-weight:bold' }, '全体的な作戦'),
      h('textarea', {
        class: 'input',
        placeholder: '例：毎日同じ時間に配信する\n企画は夜間に集中',
        style: 'min-height:120px',
        value: bannerPlan.strategy || '',
        onchange: (e) => {
          Debut.set({
            bannerEventPlan: Object.assign({}, bannerPlan, { strategy: e.target.value })
          });
        }
      })
    );

    view.replaceChildren(
      h('div', { style: 'padding:16px;overflow-y:auto' },
        h('h1', { class: 'screen-title' }, 'バナイベ管理'),
        h('p', { class: 'note', style: 'margin-bottom:16px' },
          `${targetDate} から7日間のバナイベ企画を登録します`),

        h('h2', { style: 'margin-bottom:12px;font-size:16px;font-weight:bold' }, '📅 曜日別企画'),
        ...dayCards,

        strategyForm,

        h('p', { class: 'note center', style: 'margin-top:20px;margin-bottom:40px' },
          '企画は日ごとに最大3件まで登録できます')
      )
    );
  }

  /* ============ KPI記録フォーム ============ */
  function renderKPIForm() {
    const Debut = Gerbera.Debut;
    const d = Debut.get();

    if (!d.initialDebutEndedAt) {
      location.hash = ''; return;
    }

    const inputs = {
      pointStart: h('input', { type: 'number', class: 'input', placeholder: '例：0', value: '0' }),
      pointEnd: h('input', { type: 'number', class: 'input', placeholder: '例：100', value: '0' }),
      badgeStart: h('input', { type: 'number', class: 'input', placeholder: '例：0', value: '0' }),
      badgeEnd: h('input', { type: 'number', class: 'input', placeholder: '例：5', value: '0' }),
      viewerCount: h('input', { type: 'number', class: 'input', placeholder: '例：50', value: '0' }),
      duration: h('input', { type: 'number', class: 'input', placeholder: '例：120', value: '0' }),
      memo: h('textarea', { class: 'input', placeholder: '配信の感想など', style: 'min-height:100px' })
    };

    const submit = () => {
      const kpi = {
        id: Date.now().toString(36),
        date: new Date().toISOString().split('T')[0],
        pointStart: +inputs.pointStart.value || 0,
        pointEnd: +inputs.pointEnd.value || 0,
        badgeStart: +inputs.badgeStart.value || 0,
        badgeEnd: +inputs.badgeEnd.value || 0,
        viewerCount: +inputs.viewerCount.value || 0,
        duration: +inputs.duration.value || 0,
        memo: inputs.memo.value
      };

      const kpiData = d.kpiRecords || {};
      const records = kpiData.records || [];
      records.push(kpi);
      Debut.set({
        kpiRecords: { records, lastRecordDate: kpi.date }
      });

      toast('KPIを記録しました');
      location.hash = 'debut/kpi-review';
    };

    view.replaceChildren(
      h('div', { style: 'padding:16px;overflow-y:auto' },
        h('h1', { class: 'screen-title' }, '配信結果を記録'),
        h('p', { class: 'note', style: 'margin-bottom:16px' }, '今回の配信データを入力してください'),

        h('div', { class: 'input-label' }, '📊 応援ポイント'),
        h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px' },
          h('div', {},
            h('small', { class: 'note' }, '開始時'),
            inputs.pointStart),
          h('div', {},
            h('small', { class: 'note' }, '終了時'),
            inputs.pointEnd)
        ),

        h('div', { class: 'input-label' }, '🏅 バッジ'),
        h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px' },
          h('div', {},
            h('small', { class: 'note' }, '開始時'),
            inputs.badgeStart),
          h('div', {},
            h('small', { class: 'note' }, '終了時'),
            inputs.badgeEnd)
        ),

        h('div', { class: 'input-label' }, '👥 入室人数'),
        inputs.viewerCount,

        h('div', { class: 'input-label', style: 'margin-top:16px' }, '⏱️ 配信時間（分）'),
        inputs.duration,

        h('div', { class: 'input-label', style: 'margin-top:16px' }, '📝 メモ'),
        inputs.memo,

        h('button', { class: 'btn btn-primary btn-full', style: 'margin-top:20px', onclick: submit },
          '記録して確認画面へ'),
        h('p', { class: 'note center', style: 'margin-top:12px;margin-bottom:40px' },
          '後から編集できます')
      )
    );
  }

  /* ============ KPI確認画面 ============ */
  function renderKPIReview() {
    const Debut = Gerbera.Debut;
    const d = Debut.get();

    if (!d.kpiRecords || !d.kpiRecords.records || !d.kpiRecords.records.length) {
      location.hash = ''; return;
    }

    const records = d.kpiRecords.records;
    const latest = records[records.length - 1];

    const pointDiff = latest.pointEnd - latest.pointStart;
    const badgeDiff = latest.badgeEnd - latest.badgeStart;

    const cards = h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px' },
      h('div', { style: 'background:var(--bg-soft);padding:12px;border-radius:8px;text-align:center' },
        h('div', { style: 'font-size:28px;font-weight:bold;color:var(--main-strong)' }, pointDiff),
        h('div', { class: 'note' }, '応援ポイント増')),
      h('div', { style: 'background:var(--bg-soft);padding:12px;border-radius:8px;text-align:center' },
        h('div', { style: 'font-size:28px;font-weight:bold;color:var(--main-strong)' }, badgeDiff),
        h('div', { class: 'note' }, 'バッジ増'))
    );

    const details = h('div', { style: 'background:var(--bg-soft);padding:12px;border-radius:8px;margin-bottom:20px' },
      h('div', { style: 'display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--bg)' },
        h('span', { class: 'note' }, '入室人数'),
        h('span', { style: 'font-weight:bold' }, latest.viewerCount)),
      h('div', { style: 'display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--bg)' },
        h('span', { class: 'note' }, '配信時間'),
        h('span', { style: 'font-weight:bold' }, latest.duration + '分')),
      h('div', { style: 'display:flex;justify-content:space-between;padding:6px 0' },
        h('span', { class: 'note' }, 'メモ'),
        h('span', { style: 'text-align:right;max-width:50%' }, latest.memo || 'なし'))
    );

    view.replaceChildren(
      h('div', { style: 'padding:16px;overflow-y:auto' },
        h('h1', { class: 'screen-title' }, '配信結果'),
        h('p', { class: 'note', style: 'margin-bottom:16px' }, `${latest.date} の配信`),

        cards,
        details,

        h('button', { class: 'btn btn-ghost btn-full', onclick: () => { location.hash = ''; } },
          'ホームに戻る'),
        h('p', { class: 'note center', style: 'margin-top:12px;margin-bottom:40px' },
          'KPI数値は自動計算されています')
      )
    );
  }

  /* ============ 管理者ページ（デバッグ用・URLを直接開いてアクセスする隠し画面） ============
     デビューサポート機能の各画面は日付や状態の組み合わせでしか到達できないため、
     不具合確認のたびにlocalStorageを手で書き換えるのは非効率。
     ここから状態を直接切り替えて全画面にワンタップで飛べるようにする。
     通常のボトムナビには出さず、URLで #admin を開いたときだけ表示する。
     ■ 本番での方針
       ・一般ユーザーには存在を悟らせない（権限がなければ通常のホームと同じ表示にする）
       ・管理者としてログインしているユーザーだけが使える
     ■ 現状
       サーバー（api/auth.js）が「管理者のメールアドレスか」を判定した結果が
       Gerbera.Auth.isAdmin() に入る。管理者の情報はこのコードに一切持たない（公開リポジトリのため）。
       開発中の確認用に、localhost / 127.0.0.1 で開いたときも入れる。 */
  function isAdminAuthed() {
    if (Gerbera.Auth && Gerbera.Auth.isAdmin()) return true;
    return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  }

  function renderAdminPage() {
    const Debut = Gerbera.Debut;

    function todayISO() {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    function futureISO(days) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function goto(patch, hash) {
      Debut.set(patch);
      if (location.hash.replace(/^#\/?/, '') === (hash || '')) {
        route();
      } else {
        location.hash = hash || '';
      }
    }

    const stateBox = h('pre', {
      style: 'background:var(--bg-soft);padding:12px;border-radius:8px;font-size:11.5px;' +
        'white-space:pre-wrap;word-break:break-all;max-height:220px;overflow:auto;margin-bottom:16px'
    }, JSON.stringify(Debut.get(), null, 2));

    function screenBtn(label, onclick) {
      return h('button', { class: 'btn btn-ghost btn-full mt8', onclick }, label);
    }

    const jumpButtons = h('div', {},
      screenBtn('🆕 初回選択画面', () => goto({ stage: null }, '')),
      screenBtn('📋 登録フォーム', () => goto({ stage: Debut.get().stage || 'pre' }, 'debut/register')),
      screenBtn('⏳ 配信準備中ホーム（当日でない）', () => goto({
        stage: 'pre', actualDebutDate: null,
        plannedDebutDate: futureISO(5), plannedDebutTime: '20:00',
        initialDebutStartedAt: null, initialDebutEndedAt: null
      }, '')),
      screenBtn('📅 初配信当日（最終確認リスト）', () => goto({
        stage: 'pre', actualDebutDate: todayISO(), plannedDebutDate: todayISO(),
        plannedDebutTime: '20:00', initialDebutStartedAt: null, initialDebutEndedAt: null
      }, '')),
      screenBtn('🎬 初配信中（配信中UI）', () => goto({
        stage: 'debut', actualDebutDate: todayISO(), plannedDebutTime: '20:00',
        initialDebutStartedAt: Date.now(), initialDebutEndedAt: null,
        initialDebutGoal: 50, bannerEventParticipant: true
      }, '')),
      screenBtn('🎯 バナイベ管理', () => goto({
        stage: 'debut', actualDebutDate: todayISO(),
        initialDebutStartedAt: null, initialDebutEndedAt: Date.now(),
        bannerEventParticipant: true
      }, 'banner')),
      screenBtn('📝 KPI入力フォーム', () => goto({
        stage: 'debut', actualDebutDate: todayISO(),
        initialDebutStartedAt: null, initialDebutEndedAt: Date.now()
      }, 'debut/kpi-form')),
      screenBtn('📈 KPI確認画面（ダミー記録つき）', () => {
        const d = Debut.get();
        const records = (d.kpiRecords && d.kpiRecords.records) ? d.kpiRecords.records.slice() : [];
        records.push({
          id: 'admin-dummy-' + Date.now(), date: todayISO(),
          pointStart: 100, pointEnd: 350, badgeStart: 3, badgeEnd: 8,
          viewerCount: 45, duration: 90, memo: '管理者ページからのダミー記録'
        });
        goto({ kpiRecords: { records, lastRecordDate: todayISO() } }, 'debut/kpi-review');
      }),
      screenBtn('🏠 通常ホーム（バナイベ期間中）', () => goto({
        stage: 'debut', actualDebutDate: todayISO(),
        initialDebutStartedAt: null, initialDebutEndedAt: Date.now(),
        bannerEventParticipant: true
      }, '')),
      screenBtn('🏠 通常ホーム（バナイベ終了後）', () => goto({
        stage: 'normal', bannerEventParticipant: false,
        initialDebutStartedAt: null
      }, ''))
    );

    const jsonInput = h('textarea', { class: 'input', style: 'min-height:180px;font-size:11.5px;font-family:monospace',
      value: JSON.stringify(Debut.get(), null, 2) });

    const rawEditor = h('div', { class: 'mt16' },
      h('div', { style: 'font-weight:bold;margin-bottom:6px' }, '🔧 生データを直接編集'),
      jsonInput,
      h('button', { class: 'btn btn-primary btn-full mt8', onclick: () => {
        try {
          const parsed = JSON.parse(jsonInput.value);
          Debut.set(parsed);
          toast('反映しました');
          route();
        } catch (e) {
          toast('JSONの形式が正しくありません');
        }
      } }, 'この内容を反映する')
    );

    const dangerZone = h('div', { class: 'mt16' },
      h('div', { style: 'font-weight:bold;margin-bottom:6px;color:var(--danger)' }, '⚠️ 個別リセット'),
      h('button', { class: 'btn btn-danger btn-full mt8', onclick: () => {
        goto({ kpiRecords: { records: [], lastRecordDate: null } }, '');
        toast('KPI記録を削除しました');
      } }, 'KPI記録をクリア'),
      h('button', { class: 'btn btn-danger btn-full mt8', onclick: () => {
        goto({ bannerEventPlan: { strategy: null, events: [] } }, '');
        toast('バナイベ企画データを削除しました');
      } }, 'バナイベ企画データをクリア'),
      h('button', { class: 'btn btn-danger btn-full mt8', onclick: () => {
        if (!confirm('デビューサポートの全データを消去して初回起動状態に戻します。よろしいですか？')) return;
        Store.set('debut', {});
        location.hash = '';
        location.reload();
      } }, 'デビューサポート全データを完全リセット')
    );

    view.replaceChildren(
      h('div', { style: 'padding:16px;overflow-y:auto' },
        h('h1', { class: 'screen-title' }, '🛠 管理者ページ'),
        h('p', { class: 'note', style: 'margin-bottom:16px' },
          'デビューサポート機能の各画面を状態を切り替えて確認するための開発者向けページです。通常のナビからは表示されません。'),

        h('div', { style: 'font-weight:bold;margin-bottom:6px' }, '📄 現在の状態'),
        stateBox,

        h('div', { style: 'font-weight:bold;margin-bottom:6px' }, '🚪 画面ジャンプ'),
        jumpButtons,

        rawEditor,
        dangerZone,

        h('button', { class: 'btn btn-ghost btn-full mt16', onclick: () => { location.hash = ''; } }, 'ホームに戻る')
      )
    );
  }

  /* ============ お知らせ詳細ページ（#news/<キー>） ============ */
  function renderNews(key) {
    const n = Gerbera.NEWS && Gerbera.NEWS[key];
    if (!n) { renderHome(); return; }
    view.replaceChildren(
      h('div', { class: 'news-page' },
        h('h1', { class: 'screen-title' }, n.title),
        h('p', { class: 'note' }, n.date),
        h('p', { class: 'news-lead' }, n.lead),
        n.groups.map(g =>
          h('section', { class: 'news-group' },
            h('h2', { class: 'news-group-title' }, g.title),
            h('div', { class: 'doc-page' },
              g.items.map(([head, text]) =>
                h('section', { class: 'doc-sec' }, h('h2', {}, head), h('p', {}, text)))))),
        h('button', { class: 'btn btn-ghost btn-full mt16', onclick: () => { location.hash = ''; } }, 'ホームに戻る')
      )
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
    if (p0 === 'debut' && parts[1] === 'register') return renderDebutRegister();
    if (p0 === 'debut' && parts[1] === 'kpi-form') return renderKPIForm();
    if (p0 === 'debut' && parts[1] === 'kpi-review') return renderKPIReview();
    if (p0 === 'news' && parts[1]) return renderNews(parts[1]);
    if (p0 === 'mypage') return SC.mypage && SC.mypage(view);
    if (p0 === 'banner') return renderBannerEventManagement();
    if (p0 === 'admin') return isAdminAuthed() ? renderAdminPage() : renderHome();
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

    /* ログインしていないあいだは、ログイン画面以外を開けない。
       ただし登録前に読めるよう、利用規約とプライバシーポリシーだけは開ける */
    const locked = !Gerbera.Auth.isLoggedIn();
    document.body.classList.toggle('auth-locked', locked);
    const readablePage = p0 === 'settings' && (parts[1] === 'terms' || parts[1] === 'privacy');
    if (locked && !readablePage) {
      if (sheet.classList.contains('open')) { closeSheet(); return; }
      backBtn.hidden = true;
      Gerbera.AuthUI.renderLogin(view, () => { location.hash = ''; route(); });
      window.scrollTo(0, 0);
      return;
    }

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

  Gerbera.closeSheet = closeSheet;
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
  mypageBtn.addEventListener('click', () => { closeMenu(); location.hash = 'mypage'; });

  /* ============ 画面下部ナビ ============ */
  function currentFull() { return location.hash.replace(/^#\/?/, ''); }
  function buildNav() {
    nav.replaceChildren(...NAV
      .filter(item => {
        if (!item.hidden) return true;
        if (typeof item.hidden === 'function') return !item.hidden();
        return !item.hidden;
      })
      .map(item =>
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
  /* 保存済みのログインがまだ有効かを確かめる。無効と言われたらログイン画面へ戻す */
  Gerbera.Auth.verify().then(ok => { if (!ok) route(); });

  /* 起動時：通知ONなら当日ぶんのリマインドを同期（通知許可済みならOS通知も出す） */
  if (Gerbera.Settings && Gerbera.Settings.get().notify && Gerbera.Push) {
    Gerbera.Push.sync();
  }
})();
