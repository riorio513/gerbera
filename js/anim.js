'use strict';
/* ============================================================
   演出アニメーション共通基盤
   - 「乱数で何を出すか（抽選ロジック）」と「どう見せるか（演出）」を
     完全に分離する。ここには抽選ロジックは一切書かない。
   - 各ツール側は「今どの演出状態か」だけを管理し、状態が変わるたびに
     このモジュールが提供する関数でCSSアニメーションを駆動する。
   - 時間設定は AnimTiming に集約し、あとから調整しやすくする。
   - 実際の動き（加減速・回転・上下運動など）はCSS Animationで表現し、
     JS側はクラス切り替えとイベント待ち受けだけを行う（高頻度JS処理を避ける）。
   ============================================================ */
(function () {
  const AnimTiming = {
    diceRoll: 2000,       // サイコロ本体が転がっている時間
    diceSettle: 260,      // 停止直後のわずかな揺れ
    boxShake: 1000,       // 抽選箱が揺れる時間
    boxShakeSettle: 160,  // 箱の揺れが収まったあとの余韻
    boxEjectOut: 700,     // くじが排出口から画面外へ消えるまで
    boxPause: 500,        // くじが消えてから結果紙が出るまでの待機
    boxResultIn: 550      // 結果紙が出現し、中央へ拡大移動するまでの時間
  };

  /* ---------------------------------------------------------
     サイコロ ロールアニメーション
     dieEl は「サイコロ本体」1個分の要素（絶対配置・will-change:transform前提）。
     何面ダイスか・最終的に何の目が出るかはここでは一切扱わない。
     呼び出し側が dx（揺れ幅の基準。dieEl自身のサイズから算出するのが望ましい）・
     turns（回転数）・duration（省略時はAnimTiming.diceRoll）を渡し、
     停止した瞬間に呼ばれる onSettleVisual で最終的な見た目（出目の表示など）を
     反映してもらう。戻り値の promise が解決した時点で「結果表示」へ進んでよい。
     --------------------------------------------------------- */
  function reduced() {
    return typeof Gerbera.prefersReducedMotion === 'function' && Gerbera.prefersReducedMotion();
  }

  function rollDie(dieEl, opts) {
    opts = opts || {};

    /* 視差効果を減らす設定：演出を飛ばして即結果 */
    if (reduced()) {
      dieEl.classList.remove('rolling', 'settled');
      dieEl.classList.add('rolled');
      if (typeof opts.onSettleVisual === 'function') opts.onSettleVisual();
      return { promise: Promise.resolve(), cancel() {} };
    }

    const dur = opts.duration || AnimTiming.diceRoll;
    const dx = opts.dx != null ? opts.dx : 20;
    const turns = opts.turns != null ? opts.turns : 5;
    let cancelled = false;
    const timers = [];

    dieEl.classList.remove('rolled', 'settled');
    dieEl.style.setProperty('--dx', dx + 'px');
    dieEl.style.setProperty('--turns', turns);
    dieEl.style.setProperty('--roll-dur', dur + 'ms');
    void dieEl.offsetWidth; // 同じアニメーションの再実行を保証する強制リフロー
    dieEl.classList.add('rolling');

    /* cancel() で中断したときも必ず解決させる。解決しないままだと
       呼び出し側の Promise.all が永久に待ち続け、ボタンが押せなくなる。 */
    let resolveNow = null;
    const promise = new Promise(resolve => {
      let settled = false;
      resolveNow = () => { if (!settled) { settled = true; resolve(); } };
      const finishSettle = () => {
        if (settled || cancelled) return;
        settled = true;
        resolve();
      };
      const onRollEnd = e => {
        if (e && (e.target !== dieEl || e.animationName !== 'dice-roll-move')) return;
        dieEl.removeEventListener('animationend', onRollEnd);
        if (cancelled) return;
        dieEl.classList.remove('rolling');
        dieEl.classList.add('rolled');
        if (typeof opts.onSettleVisual === 'function') opts.onSettleVisual();
        void dieEl.offsetWidth;
        dieEl.classList.add('settled');
        const onSettleEnd = e2 => {
          if (e2 && (e2.target !== dieEl || e2.animationName !== 'dice-settle-wobble')) return;
          dieEl.removeEventListener('animationend', onSettleEnd);
          finishSettle();
        };
        dieEl.addEventListener('animationend', onSettleEnd);
        timers.push(setTimeout(finishSettle, AnimTiming.diceSettle + 200));
      };
      dieEl.addEventListener('animationend', onRollEnd);
      timers.push(setTimeout(() => onRollEnd(null), dur + 200));
    });

    return {
      promise,
      cancel() {
        cancelled = true;
        timers.forEach(clearTimeout);
        dieEl.classList.remove('rolling', 'settled');
        if (resolveNow) resolveNow();
      }
    };
  }

  /* ---------------------------------------------------------
     抽選箱アニメーション（状態機械）
     状態: idle → shaking → shakeSettled → ejecting → ejectedOut
           → pausing → resultAppearing → resultMoving → resultShown
     els.boxEl   ... 揺れる箱本体
     els.slotEl  ... くじが排出される基準位置（排出口）
     els.stageEl ... くじ紙・結果紙を配置する舞台（position:relativeの基準）
     run(resultLabel) は「表示する結果」を受け取って演出するだけで、
     何を当てるかは一切決めない（抽選ロジックは呼び出し側の責務）。
     --------------------------------------------------------- */
  function createBoxDraw(els, timingOverride) {
    const { boxEl, slotEl, stageEl } = els;
    const T = Object.assign({}, AnimTiming, timingOverride || {});
    /* 視差効果を減らす設定：各段階の待ち時間をほぼ0にして、結果紙だけ静かに出す */
    if (reduced()) {
      T.boxShake = 1; T.boxShakeSettle = 1; T.boxEjectOut = 1; T.boxPause = 1; T.boxResultIn = 1;
    }
    let state = 'idle';
    let cancelled = false;
    let timers = [];
    let ticketEl = null;
    let paperEl = null;
    const listeners = new Set();

    function setState(s) {
      state = s;
      listeners.forEach(fn => { try { fn(s); } catch (e) {} });
    }
    function removeEl(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }
    function schedule(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }
    function waitAnimEnd(el, name, fallbackMs, cb) {
      const handler = e => {
        if (e && (e.target !== el || e.animationName !== name)) return;
        el.removeEventListener('animationend', handler);
        cb();
      };
      el.addEventListener('animationend', handler);
      schedule(() => { el.removeEventListener('animationend', handler); cb(); }, fallbackMs);
    }

    function run(resultLabel) {
      if (state !== 'idle' && state !== 'resultShown') return Promise.resolve(false);
      cancelled = false;
      removeEl(ticketEl); ticketEl = null;
      removeEl(paperEl); paperEl = null;
      boxEl.classList.remove('drawn');

      return new Promise(resolve => {
        const finish = ok => { if (!cancelled) resolve(ok); };

        /* 2) 箱が揺れる */
        setState('shaking');
        boxEl.classList.remove('shake-settle');
        void boxEl.offsetWidth;
        boxEl.style.setProperty('--shake-dur', T.boxShake + 'ms');
        boxEl.classList.add('shaking');

        waitAnimEnd(boxEl, 'box-shake', T.boxShake + 150, () => {
          if (cancelled) return;
          boxEl.classList.remove('shaking');

          /* 3) 揺れ停止（ごく短い余韻） */
          setState('shakeSettled');
          void boxEl.offsetWidth;
          boxEl.classList.add('shake-settle');

          waitAnimEnd(boxEl, 'box-shake-settle', T.boxShakeSettle + 150, () => {
            if (cancelled) return;

            /* 4) くじ排出口から紙を1枚排出 */
            setState('ejecting');
            const slotRect = slotEl.getBoundingClientRect();
            const stageRect = stageEl.getBoundingClientRect();
            const ticket = document.createElement('div');
            ticket.className = 'box-ticket';
            ticket.style.left = (slotRect.left - stageRect.left + slotRect.width / 2) + 'px';
            ticket.style.top = (slotRect.top - stageRect.top) + 'px';
            ticket.style.setProperty('--eject-dur', T.boxEjectOut + 'ms');
            stageEl.appendChild(ticket);
            ticketEl = ticket;
            void ticket.offsetWidth;
            ticket.classList.add('eject');

            waitAnimEnd(ticket, 'box-ticket-eject', T.boxEjectOut + 150, () => {
              if (cancelled) return;
              removeEl(ticketEl); ticketEl = null;

              /* 5) 排出された紙が画面外へ移動しきった */
              setState('ejectedOut');

              /* 6) 0.5秒待機 */
              setState('pausing');
              schedule(() => {
                if (cancelled) return;

                /* 7) 結果表示用の紙が画面上部から出現 */
                setState('resultAppearing');
                const paper = document.createElement('div');
                paper.className = 'box-result-paper';
                paper.textContent = resultLabel;
                paper.style.setProperty('--result-dur', T.boxResultIn + 'ms');
                stageEl.appendChild(paper);
                paperEl = paper;
                void paper.offsetWidth;

                /* 8) 下方向へ移動しながら拡大し、中央付近で停止 */
                setState('resultMoving');
                paper.classList.add('appear');

                waitAnimEnd(paper, 'box-result-in', T.boxResultIn + 150, () => {
                  if (cancelled) return;
                  /* 9) 抽選結果表示（紙は中央に静止した状態を維持） */
                  setState('resultShown');
                  boxEl.classList.add('drawn');
                  finish(true);
                  /* 10) 以降、次回抽選可能な待機状態（stateがidle以外のresultShownで許可） */
                });
              }, T.boxPause);
            });
          });
        });
      });
    }

    return {
      run,
      onState(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      get state() { return state; },
      cancel() {
        cancelled = true;
        timers.forEach(clearTimeout);
        timers = [];
        boxEl.classList.remove('shaking', 'shake-settle', 'drawn');
        removeEl(ticketEl); ticketEl = null;
        removeEl(paperEl); paperEl = null;
        state = 'idle';
      }
    };
  }

  Gerbera.AnimTiming = AnimTiming;
  Gerbera.rollDie = rollDie;
  Gerbera.createBoxDraw = createBoxDraw;
})();
