'use strict';
/* ============================================================
   タイトル画面（起動時スプラッシュ）
   - アイコンは固定表示。「配信おたすけツール」→「ガーベラ」の順に
     タイプライター演出（1文字 30〜50ms）で文字を出し、
     終わったらフェードアウトしてトップ画面へ。
   ============================================================ */
(function () {
  const splash = document.getElementById('splash');
  if (!splash) return;

  const taglineWrap = document.getElementById('splashTagline');
  const titleWrap = document.getElementById('splashTitle');
  const taglineEl = document.getElementById('splashTaglineText');
  const titleEl = document.getElementById('splashTitleText');

  const TAGLINE = '配信おたすけツール';
  const TITLE = 'ガーベラ';
  const CHAR_MS_MIN = 30, CHAR_MS_MAX = 50;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function charDelay() {
    return CHAR_MS_MIN + Math.random() * (CHAR_MS_MAX - CHAR_MS_MIN);
  }

  function typeInto(el, text, done) {
    if (reduced) { el.textContent = text; if (done) done(); return; }
    let i = 0;
    (function step() {
      if (i < text.length) {
        el.textContent += text[i];
        i++;
        setTimeout(step, charDelay());
      } else if (done) {
        done();
      }
    })();
  }

  function removeSplash() {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 550);
  }

  taglineWrap.classList.add('typing');
  typeInto(taglineEl, TAGLINE, () => {
    taglineWrap.classList.remove('typing');
    titleWrap.classList.add('typing');
    typeInto(titleEl, TITLE, () => {
      titleWrap.classList.remove('typing');
      setTimeout(removeSplash, reduced ? 300 : 600);
    });
  });
})();
