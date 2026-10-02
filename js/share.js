'use strict';
/* ============================================================
   ガーベラ 共有（アカウント連携）

   自動では投稿しない。ガーベラは文面を組み立てて投稿画面まで連れて行き、
   最後の「投稿する」はかならず本人が押す。
     X      … 投稿画面を開く（文面は入った状態）
     Discord… 文面をコピーして、連携したチャンネルを開く
     IRIAM  … 公開APIが無いため投稿はできない。プロフィールURLを
              保存しておき、共有する文面の末尾に添える用途だけに使う。

   どこも連携していないときは、これまで通りXの投稿画面がそのまま開く。
   ============================================================ */
(function () {
  const { h, modal, toast, Store } = Gerbera;

  const TARGETS = [
    { key: 'x',       label: 'X',       icon: '🐦', hint: '投稿画面が開きます' },
    { key: 'discord', label: 'Discord', icon: '💬', hint: '文面をコピーして、チャンネルを開きます' }
  ];

  function settings() { return Gerbera.Settings ? Gerbera.Settings.get() : {}; }
  const Accounts = {
    get() {
      const s = settings();
      return { x: s.accX || '', discord: s.accDiscord || '', iriam: s.accIriam || '' };
    },
    /* 投稿先として選べるもの（IRIAMは投稿できないので入らない） */
    linkedTargets() {
      const a = this.get();
      return TARGETS.filter(t => a[t.key]);
    }
  };
  Gerbera.Accounts = Accounts;

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }
  function openTab(url) { window.open(url, '_blank', 'noopener'); }

  /* IRIAMのプロフィールURLを設定していれば、共有する文面の最後に添える */
  function withIriam(text) {
    const iriam = Accounts.get().iriam;
    return iriam ? `${text}\n${iriam}` : text;
  }
  function fullText(text, url) {
    return withIriam(url ? `${text}\n${url}` : text);
  }

  function toX(text, url) {
    const q = new URLSearchParams({ text: withIriam(text) });
    if (url) q.set('url', url);
    openTab('https://x.com/intent/post?' + q.toString());
  }
  function toDiscord(text, url) {
    const channel = Accounts.get().discord;
    copyText(fullText(text, url)).then(() => {
      toast('📋 文面をコピーしました。Discordで貼り付けて送信してください');
      if (channel) openTab(channel);
    });
  }

  /* 投稿先を選ぶ小窓。連携が1つも無ければ出さず、そのままXへ。 */
  function sharePost(text, opts) {
    opts = opts || {};
    const url = opts.url || '';
    const linked = Accounts.linkedTargets();
    if (!linked.length) { toX(text, url); return; }

    modal({
      title: opts.title || 'どこに投稿しますか？',
      render(body, { close }) {
        const rows = linked.map(t => h('button', {
          class: 'share-row',
          onclick: () => {
            close();
            if (t.key === 'x') toX(text, url); else toDiscord(text, url);
          }
        },
          h('span', { class: 'share-row-ico' }, t.icon),
          h('span', { class: 'share-row-main' },
            h('span', { class: 'share-row-name' }, t.label + 'に投稿'),
            h('span', { class: 'share-row-hint' }, t.hint)),
          h('span', { class: 'tool-row-chev' }, '›')));

        body.append(
          h('div', { class: 'share-preview' }, fullText(text, url)),
          h('div', { class: 'share-list' }, rows),
          h('button', { class: 'btn btn-ghost btn-full mt12', onclick: () => {
            close();
            copyText(fullText(text, url)).then(() => toast('📋 コピーしました'));
          } }, '📋 文面をコピーするだけ'),
          h('p', { class: 'note center', style: 'margin-top:10px' },
            '投稿ボタンは、開いた画面でご自身で押してください。'));
      }
    });
  }

  Gerbera.sharePost = sharePost;
  Gerbera.copyShareText = copyText;
})();
