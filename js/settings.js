'use strict';
/* ============================================================
   ガーベラ 設定
   - デビューした日（一度だけ設定・以後ロック）
   - トグル：アプリ内リマインド／ダークモード／IRIAM最新情報を表示／視差効果を減らす
   - 設定値の保存と適用（ダークモード・視差抑制は <html> に反映）
   - 画面：設定／利用規約／購入管理／プライバシーポリシー
   ============================================================ */
(function () {
  const { Store, h, toast, emitter, modal } = Gerbera;
  const KEY = 'settings';
  const DEFAULTS = {
    debutDate: null,     // 'YYYY-MM-DD'
    debutLocked: false,
    notify: false,       // アプリ内リマインド（OS通知ではない）
    dark: false,
    iriam: true,         // 配信管理画面に IRIAM 最新情報を出すか
    reduceMotion: false
  };

  const ev = emitter();
  let data = Object.assign({}, DEFAULTS, Store.get(KEY, {}));

  function persist() { Store.set(KEY, data); }
  function apply() {
    const root = document.documentElement;
    root.dataset.theme = data.dark ? 'dark' : 'light';
    root.classList.toggle('reduce-motion', !!data.reduceMotion);
    Gerbera._reduceMotion = !!data.reduceMotion;
  }

  const Settings = {
    get() { return Object.assign({}, data); },
    set(patch) {
      data = Object.assign({}, data, patch);
      persist(); apply(); ev.emit(Object.assign({}, data));
    },
    on(fn) { return ev.on(fn); },
    apply,
    /* デビューから今日で何日目か（デビュー日＝1日目）。未設定・未来日なら null */
    debutDays() {
      if (!data.debutDate) return null;
      const start = new Date(data.debutDate + 'T00:00:00');
      if (isNaN(start)) return null;
      const now = new Date();
      const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const d = Math.floor((t0 - start) / 86400000) + 1;
      return d >= 1 ? d : null;
    }
  };
  Gerbera.Settings = Settings;
  Gerbera.prefersReducedMotion = () =>
    !!Gerbera._reduceMotion ||
    (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  apply();

  /* ---------- 共通パーツ ---------- */
  function toggle(on, onChange) {
    const btn = h('button', {
      class: 'toggle' + (on ? ' on' : ''),
      role: 'switch', 'aria-checked': on ? 'true' : 'false',
      onclick: () => {
        const next = !btn.classList.contains('on');
        btn.classList.toggle('on', next);
        btn.setAttribute('aria-checked', next ? 'true' : 'false');
        onChange(next);
      }
    });
    return btn;
  }
  function toggleRow(title, key, sub) {
    return h('div', { class: 'set-row' },
      h('div', { class: 'set-row-main' },
        h('span', { class: 'set-row-title' }, title),
        sub ? h('span', { class: 'set-row-sub' }, sub) : null),
      toggle(!!data[key], v => Settings.set({ [key]: v })));
  }

  /* プッシュ通知だけは特別：ONにするとき通知の許可を取り、取れなければ戻す */
  function notifyRow() {
    const sw = toggle(!!data.notify, async v => {
      if (v) {
        const ok = Gerbera.Push ? await Gerbera.Push.enable() : false;
        if (!ok) {
          sw.classList.remove('on');
          sw.setAttribute('aria-checked', 'false');
          Settings.set({ notify: false });
          return;
        }
        Settings.set({ notify: true });
      } else {
        Settings.set({ notify: false });
      }
    });
    return h('div', { class: 'set-row' },
      h('div', { class: 'set-row-main' },
        h('span', { class: 'set-row-title' }, 'プッシュ通知をONにする'),
        h('span', { class: 'set-row-sub' },
          'カレンダーで「リマインドする」にした予定を、その日にお知らせします。対応ブラウザ（＋ホーム画面に追加）ではアプリを閉じていても通知が届きます。')),
      sw);
  }
  function linkRow(title, hash) {
    return h('button', { class: 'set-row set-row-link', onclick: () => { location.hash = hash; } },
      h('span', { class: 'set-row-title' }, title),
      h('span', { class: 'set-row-chev' }, '›'));
  }
  function jpDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  /* ---------- デビュー日の設定フロー ---------- */
  function openDebutFlow() {
    if (data.debutLocked) {
      toast('デビューした日は、あとから変更できません');
      return;
    }
    modal({
      title: 'デビューした日',
      render: (body, ctl) => {
        const picker = h('input', { class: 'input', type: 'date', max: todayISO() });
        body.append(
          h('p', { class: 'note', style: 'margin-bottom:10px' },
            '配信をはじめた日を選んでください。'),
          picker,
          h('p', { class: 'warn', style: 'margin:12px 0 0;line-height:1.7' },
            '※ この項目は一度設定すると、あとから変更できません。正確な日付を入力してください。'),
          h('button', { class: 'btn btn-primary btn-full mt16', onclick: () => {
            if (!picker.value) { toast('日付を選んでください'); return; }
            ctl.close();
            confirmDebut(picker.value);
          } }, 'OK'));
      }
    });
  }
  function confirmDebut(iso) {
    modal({
      title: '最終確認',
      dismissable: true,
      render: (body, ctl) => {
        body.append(
          h('p', { style: 'font-size:15px;font-weight:700;text-align:center;margin-bottom:6px' },
            jpDate(iso)),
          h('p', { style: 'text-align:center' }, 'この日にちでよろしいですか？'),
          h('p', { class: 'warn', style: 'margin:12px 0 0;line-height:1.7' },
            '※ OKを押すと、この設定項目は変更できなくなります。'),
          h('div', { class: 'hstack mt16', style: 'gap:10px' },
            h('button', { class: 'btn btn-ghost grow', onclick: ctl.close }, 'もどる'),
            h('button', { class: 'btn btn-primary grow', onclick: () => {
              Settings.set({ debutDate: iso, debutLocked: true });
              ctl.close();
              toast('デビューした日を設定しました');
              if (location.hash.replace(/^#\/?/, '').split('/')[0] === 'settings') renderSettings(document.getElementById('view'));
            } }, 'OK')));
      }
    });
  }
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /* ---------- 設定画面 ---------- */
  function renderSettings(view) {
    const debutRow = h('button', {
      class: 'set-row set-row-link' + (data.debutLocked ? ' set-row-locked' : ''),
      onclick: openDebutFlow
    },
      h('div', { class: 'set-row-main' },
        h('span', { class: 'set-row-title' }, 'デビューした日'),
        h('span', { class: 'set-row-sub' },
          data.debutDate ? jpDate(data.debutDate) : '未設定',
          '　（※この項目はあとから変更できません）')),
      data.debutLocked ? h('span', { class: 'set-row-lockmark' }, '🔒') : h('span', { class: 'set-row-chev' }, '›'));

    view.replaceChildren(
      h('h1', { class: 'screen-title' }, '設定'),
      h('div', { class: 'set-list' },
        debutRow,
        notifyRow(),
        toggleRow('ダークモード', 'dark'),
        toggleRow('IRIAM最新情報を表示', 'iriam',
          'オフにすると、配信管理画面のIRIAMイベント情報が表示されなくなります'),
        toggleRow('すべての視差効果を減らす', 'reduceMotion',
          '各ツールの設定より、この設定が優先されます')),
      h('div', { class: 'set-list mt16' },
        linkRow('利用規約', 'settings/terms'),
        linkRow('購入管理', 'settings/purchase')),
      h('p', { class: 'note', style: 'margin-top:16px' },
        '設定はこの端末・ブラウザに保存されます。')
    );
  }

  /* ---------- 利用規約 ---------- */
  function renderTerms(view) {
    view.replaceChildren(
      h('h1', { class: 'screen-title' }, '利用規約'),
      docBlock([
        ['はじめに',
          '「ガーベラ」（以下「本サービス」）は、IRIAMで活動するライバーの配信準備・配信中の進行をおたすけする個人運営の無料ツールです。本サービスをご利用いただく前に、本規約をお読みください。ご利用をもって本規約に同意したものとみなします。'],
        ['サービスの位置づけ',
          '本サービスはIRIAM運営・株式会社DUOGATEとは一切関係のない、非公式のファンメイドツールです。本サービス内に表示されるIRIAMのイベント情報等は、IRIAM公式サイトで公開されている情報をもとにした案内であり、正確性・最新性を保証するものではありません。必ずIRIAM公式の情報をご確認ください。'],
        ['データの取り扱い',
          '本サービスで入力・作成した内容（メモ、カウント、カレンダーの予定など）は、原則としてご利用の端末・ブラウザ内（ローカルストレージ）にのみ保存されます。サーバーへは送信されません。ブラウザのデータ消去や不具合により内容が失われることがあります。大切な内容はご自身で控えを取ってください。'],
        ['禁止事項',
          '法令または公序良俗に反する行為、本サービスの運営を妨げる行為、リバースエンジニアリング等による不正利用、その他運営が不適切と判断する行為を禁止します。'],
        ['免責',
          '運営は、本サービスの利用または利用できなかったことによって生じた損害について、一切の責任を負いません。本サービスは予告なく内容の変更・中断・終了を行うことがあります。'],
        ['有料機能について',
          '将来的にAI相談機能などの有料（サブスクリプション）機能を提供する場合があります。その際の課金条件・解約方法は、提供開始時にあらためて本規約または別途の定めで案内します。'],
        ['規約の変更',
          '運営は必要に応じて本規約を変更できます。変更後の規約は本サービス上に表示された時点で効力を生じます。'],
        ['お問い合わせ',
          '本サービスに関するお問い合わせは、アプリ内「お問い合わせ」よりお願いします。']
      ]),
      h('p', { class: 'note', style: 'margin-top:14px' }, '制定日：2026年9月4日')
    );
  }

  /* ---------- 購入管理 ---------- */
  function renderPurchase(view) {
    view.replaceChildren(
      h('h1', { class: 'screen-title' }, '購入管理'),
      h('div', { class: 'card center' },
        h('p', { style: 'font-size:14px;line-height:1.9' },
          '現在、購入・サブスクリプションのお申し込みはありません。'),
        h('p', { class: 'note', style: 'margin-top:8px' },
          'AI相談機能など有料メニューの提供を開始したら、ここに加入状況・次回請求日・解約の手続きが表示されます。')),
      h('div', { class: 'card' },
        h('div', { class: 'section-label' }, '加入状況'),
        h('div', { class: 'list-row' },
          h('span', { class: 'row-main' }, 'AIと相談する（月額500円）'),
          h('span', { class: 'row-sub' }, '未加入'))),
      h('p', { class: 'note', style: 'margin-top:12px' },
        '決済まわりは本サービスでは取り扱っていません。加入手続きが用意でき次第、この画面から案内します。')
    );
  }

  /* ---------- プライバシーポリシー ---------- */
  function renderPrivacy(view) {
    view.replaceChildren(
      h('h1', { class: 'screen-title' }, 'プライバシーポリシー'),
      docBlock([
        ['基本方針',
          '「ガーベラ」（以下「本サービス」）は個人が運営する無料ツールです。運営は、利用者のプライバシーを尊重し、個人情報を適切に取り扱います。'],
        ['アプリ内で入力する内容',
          '本サービスでメモ・カウント・カレンダーの予定・デビュー日などとして入力した内容は、ご利用の端末・ブラウザ内にのみ保存され、運営のサーバーや第三者に送信・共有されることはありません。運営がこれらの内容を閲覧することはできません。'],
        ['お問い合わせでお預かりする情報',
          'お問い合わせはGoogleフォームを利用しています。フォームで入力されたお名前・連絡先・お問い合わせ内容は、お問い合わせへの回答・対応の目的にのみ利用します。目的の範囲を超えて利用したり、ご本人の同意なく第三者へ提供したりすることはありません。フォームの送信データはGoogle社のサーバーで管理されます（Googleのプライバシーポリシーが適用されます）。'],
        ['アクセス情報',
          '本サービスはGitHub Pages上で公開されています。サーバーへのアクセスに伴い、IPアドレスやブラウザの種類等の情報がホスティング事業者側で記録されることがあります。運営はこれらを個人を特定する目的では利用しません。'],
        ['Cookie・解析ツール',
          '本サービスは、行動追跡目的のCookieや広告目的の第三者トラッキングを使用していません。'],
        ['保有期間',
          'お問い合わせに関する情報は、対応の完了後、必要がなくなった時点で速やかに削除または匿名化します。'],
        ['開示・訂正・削除の請求',
          'お預かりした個人情報の開示・訂正・削除をご希望の場合は、お問い合わせ窓口までご連絡ください。ご本人であることを確認のうえ、合理的な範囲で対応します。'],
        ['改定',
          '本ポリシーは必要に応じて改定されます。改定後の内容は本サービス上に表示された時点で効力を生じます。'],
        ['お問い合わせ窓口',
          'アプリ内「お問い合わせ」フォームよりご連絡ください。']
      ]),
      h('p', { class: 'note', style: 'margin-top:14px' }, '制定日：2026年9月4日')
    );
  }

  function docBlock(sections) {
    return h('div', { class: 'doc-page' },
      sections.map(([head, text]) =>
        h('section', { class: 'doc-sec' },
          h('h2', {}, head),
          h('p', {}, text))));
  }

  Gerbera.Screens = Object.assign(Gerbera.Screens || {}, {
    settings: renderSettings,
    terms: renderTerms,
    purchase: renderPurchase,
    privacy: renderPrivacy
  });
})();
