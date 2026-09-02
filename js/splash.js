'use strict';
/* ============================================================
   タイトル画面（起動時スプラッシュ）
   - アイコンは固定表示。「配信おたすけツール」→「ガーベラ」の順に
     タイプライター演出（1文字 60〜100ms）で文字を出し、
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
  const CHAR_MS_MIN = 60, CHAR_MS_MAX = 100;
  const START_DELAY = 250; // 開いた瞬間に文字が飛ぶのを防ぐ助走
  const BETWEEN_DELAY = 600; // 「配信おたすけツール」と「ガーベラ」の間の間（0.5秒以上）

  function charDelay() {
    return CHAR_MS_MIN + Math.random() * (CHAR_MS_MAX - CHAR_MS_MIN);
  }

  // 1文字ずつ出す演出そのものは常に行う（movement効果ではなく文字表示のため）。
  // 「揺れ・拡大縮小」ではないのでprefers-reduced-motionでは点滅カーソルだけ止める。
  function typeInto(el, text, done) {
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

  function start() {
    setTimeout(() => {
      taglineWrap.classList.add('typing');
      typeInto(taglineEl, TAGLINE, () => {
        taglineWrap.classList.remove('typing');
        setTimeout(() => {
          titleWrap.classList.add('typing');
          typeInto(titleEl, TITLE, () => {
            titleWrap.classList.remove('typing');
            setTimeout(removeSplash, 900);
          });
        }, BETWEEN_DELAY);
      });
    }, START_DELAY);
  }

  // Webフォント（Zen Maru Gothic）の読み込みが演出の途中で完了すると、
  // 代替フォントから切り替わった瞬間に文字幅が変わってテキストや
  // アイコンの位置がズレて見える。読み込み完了を待ってから始める。
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(start, start);
  } else {
    start();
  }
})();
