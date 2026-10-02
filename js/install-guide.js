'use strict';
/* ============================================================
   ホーム画面への追加の案内
   紹介リンクから初めて開いた人向け。スマホのブラウザで開いていて、まだホーム画面に
   追加していないときだけ、その端末に合った手順を1枚だけ表示する。
   閉じたら二度と出さない（Store の installGuide.dismissed）。
   ============================================================ */
(function () {
  const { Store, h } = Gerbera;
  const KEY = 'installGuide.dismissed';

  function isStandalone() {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }
  function platform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return null;
  }

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (cardEl) renderInstallButton();
  });

  let cardEl = null;
  let installSlot = null;

  function renderInstallButton() {
    if (!installSlot || !deferredPrompt) return;
    installSlot.replaceChildren(
      h('button', { class: 'btn btn-primary btn-full mt8', onclick: () => {
        const p = deferredPrompt;
        deferredPrompt = null;
        installSlot.replaceChildren();
        p.prompt();
      } }, 'このままインストールする'));
  }

  function close(remember) {
    if (remember) Store.set(KEY, true);
    if (cardEl) { cardEl.remove(); cardEl = null; installSlot = null; }
  }

  function show(plat) {
    if (cardEl) return;
    const steps = plat === 'ios'
      ? ['Safariでこのページを開く', '画面下の共有ボタン（□に↑）を押す', '「ホーム画面に追加」を選ぶ']
      : ['Chromeでこのページを開く', '右上のメニュー（⋮）を押す', '「アプリをインストール」（または「ホーム画面に追加」）を選ぶ'];
    const inApp = plat === 'ios'
      ? 'XやLINEなどのアプリの中で開いているときは、メニューから「Safariで開く」を選んでから試してください。'
      : 'XやLINEなどのアプリの中で開いているときは、メニューから「Chromeで開く」を選んでから試してください。';
    installSlot = h('div');
    cardEl = h('div', { class: 'install-guide', role: 'dialog', 'aria-label': 'ホーム画面への追加のご案内' },
      h('button', { class: 'install-guide-x', 'aria-label': '閉じる（今後表示しない）',
        onclick: () => close(true) }, '×'),
      h('div', { class: 'install-guide-title' }, '📲 ホーム画面に追加すると、アプリのように使えます'),
      h('ol', { class: 'install-guide-steps' }, steps.map(t => h('li', {}, t))),
      h('p', { class: 'install-guide-note' }, inApp),
      installSlot,
      h('button', { class: 'btn btn-ghost btn-full mt8', onclick: () => close(true) }, '今は追加しない'));
    document.body.appendChild(cardEl);
    renderInstallButton();
  }

  function maybeShow() {
    let dismissed = false;
    try { dismissed = !!Store.get(KEY, false); } catch (e) {}
    const plat = platform();
    if (dismissed || !plat || isStandalone()) return;
    setTimeout(() => show(plat), 2500);
  }

  Gerbera.InstallGuide = { show, close, maybeShow };
  maybeShow();
})();
