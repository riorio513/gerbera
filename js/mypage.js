'use strict';
/* ============================================================
   ガーベラ マイページ
   役割の分担：設定＝この端末・アプリの動作の切り替え／配信管理＝配信の活動の記録／
   マイページ＝「あなたというアカウント自身」のこと。
   ・プロフィール（最上部）
   ・データの引き継ぎ（バックアップの書き出し・読み込み）
   ・プランと購入
   ・アカウント連携（X・Discord・IRIAM）
   ・ガーベラを紹介する（リンク／ホーム画面への追加手順）
   ログイン制の導入時に、この画面へ追加する予定のもの：
   ・アカウント情報（メールアドレス／ログアウト／パスワード変更）
   ・端末間のデータ同期
   ・退会・転生
       「退会・転生」ボタン → 退会／転生／やめる の三択。
       退会 … 確認のうえ、アカウントとデータをすべて削除。
       転生 … 残したいデータの群（リスナーメモ・メモ・楽曲メモ等）を選び、
              それ以外を初期化して初回の「現状選択」から始め直す。
              事前にバックアップの書き出しを案内する。
   ============================================================ */
(function () {
  const { Store, h, toast, confirmDialog } = Gerbera;
  const SITE_URL = 'https://riorio513.github.io/gerbera/';
  const PREFIX = 'gerbera:';

  const STAGE_LABEL = {
    pre: '初配信前',
    debut: 'デビューから1か月以内',
    after_banner: 'デビューから1か月以内',
    normal: 'デビュー1か月以降'
  };

  /* ---------- プロフィール ---------- */
  function profileCard() {
    const S = Gerbera.Settings ? Gerbera.Settings.get() : {};
    const D = Gerbera.Debut ? Gerbera.Debut.get() : {};
    const days = Gerbera.Settings && Gerbera.Settings.debutDays ? Gerbera.Settings.debutDays() : null;
    const name = S.liverName || D.liverName;
    const lines = [];
    if (D.stage && STAGE_LABEL[D.stage]) lines.push(STAGE_LABEL[D.stage]);
    if (days) lines.push(`デビューから今日で ${days} 日目`);
    else if (S.debutDate) lines.push('デビュー日：' + S.debutDate);
    return h('div', { class: 'card mp-profile' },
      h('div', { class: 'mp-avatar', 'aria-hidden': 'true' }, '🌸'),
      h('div', { class: 'mp-profile-main' },
        h('div', { class: 'mp-name' }, name ? name + ' さん' : '名前が未設定です'),
        lines.length
          ? h('div', { class: 'mp-sub' }, lines.join('　／　'))
          : h('div', { class: 'mp-sub' }, '段階・デビュー日は設定から登録できます')),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { location.hash = 'settings'; } }, '設定 ›'));
  }

  /* ---------- アカウント情報 ---------- */
  function accountInfo() {
    const A = Gerbera.Auth;
    if (!A || !A.isLoggedIn()) return [];
    return [
      h('div', { class: 'section-label', style: 'margin:18px 2px 6px' }, '🔑 アカウント'),
      h('div', { class: 'card' },
        h('div', { class: 'set-row-sub', style: 'margin-bottom:2px' }, 'ログイン中のメールアドレス'),
        h('div', { style: 'font-weight:700;overflow-wrap:anywhere;margin-bottom:12px' }, A.email()),
        h('button', { class: 'btn btn-ghost btn-full', onclick: () => {
          confirmDialog('ログアウトしますか？ この端末のデータは消えません。', () => {
            A.logout();
            location.hash = '';
            toast('ログアウトしました');
          }, { title: 'ログアウト', okLabel: 'ログアウト', danger: false });
        } }, 'ログアウト'))
    ];
  }

  /* ---------- データの引き継ぎ（バックアップ） ---------- */
  function collectBackup() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) data[k] = localStorage.getItem(k);
    }
    return { app: 'gerbera', version: 1, exportedAt: new Date().toISOString(), data };
  }

  function exportBackup() {
    try {
      const json = JSON.stringify(collectBackup());
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `gerbera-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('バックアップを書き出しました');
    } catch (e) {
      toast('書き出せませんでした');
    }
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onerror = () => toast('ファイルを読み込めませんでした');
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) { parsed = null; }
      const ok = parsed && parsed.app === 'gerbera' && parsed.data && typeof parsed.data === 'object';
      const keys = ok ? Object.keys(parsed.data) : [];
      const valid = ok && keys.length > 0 &&
        keys.every(k => k.startsWith(PREFIX) && typeof parsed.data[k] === 'string');
      if (!valid) { toast('ガーベラのバックアップファイルではありません'); return; }
      confirmDialog('この端末のデータは、バックアップの内容で置き換えられます。よろしいですか？', () => {
        try {
          const old = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(PREFIX)) old.push(k);
          }
          old.forEach(k => localStorage.removeItem(k));
          keys.forEach(k => localStorage.setItem(k, parsed.data[k]));
          toast('読み込みました。画面を更新します');
          setTimeout(() => location.reload(), 900);
        } catch (e) {
          toast('読み込み中に問題が起きました');
        }
      }, { title: 'バックアップを読み込む', okLabel: '読み込む', danger: false });
    };
    reader.readAsText(file);
  }

  function backupSection() {
    const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true,
      onchange: e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (f) importBackup(f);
      } });
    return [
      h('div', { class: 'section-label', style: 'margin:18px 2px 6px' }, '💾 データの引き継ぎ'),
      h('div', { class: 'card' },
        h('p', { class: 'note', style: 'line-height:1.8;margin-bottom:10px' },
          'ガーベラのデータはこの端末のブラウザにだけ保存されています。機種変更やブラウザのデータ消去に備えて、ときどき書き出しておくと安心です。'),
        h('div', { class: 'hstack' },
          h('button', { class: 'btn btn-primary grow', onclick: exportBackup }, '書き出す'),
          h('button', { class: 'btn btn-ghost grow', onclick: () => fileIn.click() }, '読み込む')),
        fileIn)
    ];
  }

  /* ---------- プランと購入 ---------- */
  function planSection() {
    const parts = Gerbera.SettingsParts;
    return [
      h('div', { class: 'section-label', style: 'margin:18px 2px 6px' }, '🧾 プランと購入'),
      h('div', { class: 'set-list' }, parts ? parts.linkRow('購入管理', 'settings/purchase') : null)
    ];
  }

  /* ---------- ガーベラを紹介する ---------- */
  function copyText(text) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove();
      return ok;
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallback());
    }
    return Promise.resolve(fallback());
  }

  function referSection() {
    const shareText = 'IRIAMライバーの配信をおたすけするツール「ガーベラ」を使っています！';
    const steps = [
      ['📱 iPhone（Safari）', 'Safariでリンクを開く → 画面下の共有ボタン → 「ホーム画面に追加」'],
      ['🤖 Android（Chrome）', 'Chromeでリンクを開く → 右上のメニュー（⋮）→ 「アプリをインストール」（または「ホーム画面に追加」）']
    ];
    const buttons = [
      h('button', { class: 'btn btn-primary grow', onclick: () => {
        copyText(SITE_URL).then(ok => toast(ok ? 'リンクをコピーしました' : 'コピーできませんでした'));
      } }, 'リンクをコピー'),
      h('button', { class: 'btn btn-lav grow', onclick: () => {
        if (Gerbera.sharePost) Gerbera.sharePost(shareText, { url: SITE_URL });
      } }, '🐦 Xで紹介')
    ];
    if (navigator.share) {
      buttons.push(h('button', { class: 'btn btn-ghost grow', onclick: () => {
        navigator.share({ title: 'ガーベラ', text: shareText, url: SITE_URL }).catch(() => {});
      } }, '共有'));
    }
    return [
      h('div', { class: 'section-label', style: 'margin:18px 2px 6px' }, '💌 ガーベラを紹介する'),
      h('div', { class: 'card' },
        h('div', { class: 'mp-link' }, SITE_URL),
        h('div', { class: 'hstack mt8', style: 'flex-wrap:wrap' }, buttons),
        h('div', { class: 'section-label', style: 'margin:16px 0 4px' }, 'ホーム画面への追加のしかた'),
        h('div', { class: 'mp-steps' },
          steps.map(([head, text]) =>
            h('section', { class: 'doc-sec' }, h('h2', {}, head), h('p', {}, text)))),
        h('p', { class: 'note', style: 'line-height:1.8' },
          '追加すると、アプリのようにアイコンから開けます。'))
    ];
  }

  function renderMyPage(view) {
    const parts = Gerbera.SettingsParts;
    const kids = [
      h('h1', { class: 'screen-title' }, 'マイページ'),
      profileCard(),
      accountInfo(),
      backupSection(),
      planSection(),
      parts ? parts.accountSection() : [],
      referSection(),
      h('p', { class: 'note', style: 'margin:16px 2px 0' }, 'データはこの端末・ブラウザに保存されます。')
    ].flat().filter(Boolean);
    view.replaceChildren(...kids);
  }

  Gerbera.Screens = Object.assign(Gerbera.Screens || {}, { mypage: renderMyPage });
})();
