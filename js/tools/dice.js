'use strict';
/* ツール: ダイス（面数変更・個数変更・複数同時・転がるロールアニメーション）
   4面／6面ダイスのときはリアルな立体（die4.js／die3d.js）で転がす。
   それ以外の面数（8/10/12/20/100）は立体の構造上表現できないため、
   従来のフラットな回転アニメーション（anim.js の rollDie）にフォールバックする。
   どちらも「演出」だけを担当し、何の目が出るかはこのファイル内の乱数決定が行う。 */
(function () {
  const { register, Store, h, openX, shareResultImage, rollDie, AnimTiming, createDie3D, createDie4D } = Gerbera;
  const KEY = 'dice';
  const FACE_OPTIONS = [4, 6, 8, 10, 12, 20, 100];

  register({
    id: 'dice', name: 'サイコロ', icon: '🎲',
    mount(root) {
      const st = Object.assign({ faces: 6, count: 1 }, Store.get(KEY, {}));
      if (!FACE_OPTIONS.includes(st.faces)) st.faces = 6;
      const save = () => Store.set(KEY, { faces: st.faces, count: st.count });

      /* ---- UI状態: 'idle' | 'rolling' | 'result' ---- */
      let uiState = 'idle';
      let activeFlatRolls = [];  // 進行中の rollDie() コントローラ（多重実行防止・クリーンアップ用）
      let solidInstances = [];   // 生成中の createDie3D/createDie4D インスタンス（同上）
      let lastFinals = null;

      /* ---- 結果表示領域（画面上部・ロール中の見た目とは独立） ---- */
      const resultArea = h('div', { class: 'empty' }, 'ボタンを押してサイコロを振ってね');

      function postText() { return `【サイコロ】\nサイコロの結果は${lastFinals.join('・')}でした！`; }
      const postBtn = h('button', { class: 'btn btn-lav grow', hidden: true,
        onclick: () => { if (lastFinals) openX(postText()); } }, '🐦 文章でポスト');
      const postImgBtn = h('button', { class: 'btn btn-ghost grow', hidden: true,
        onclick: () => {
          if (!lastFinals) return;
          shareResultImage({
            badge: '【サイコロ】',
            main: lastFinals.join('・'),
            note: lastFinals.length > 1 ? '合計 ' + lastFinals.reduce((a, b) => a + b, 0) : '',
            postText: postText()
          });
        } }, '🖼️ 画像でポスト');
      const postRow = h('div', { class: 'hstack mt8' }, postBtn, postImgBtn);

      function paintResult() {
        if (uiState !== 'result' || !lastFinals) {
          resultArea.className = 'empty';
          resultArea.textContent = 'ボタンを押してサイコロを振ってね';
          return;
        }
        resultArea.className = 'result-card pop';
        const sum = lastFinals.reduce((a, b) => a + b, 0);
        const kids = [
          h('div', { class: 'result-sub' }, '結果'),
          h('div', { class: 'result-main' }, lastFinals.join('・'))
        ];
        if (lastFinals.length > 1) kids.push(h('div', { class: 'result-note' }, `合計 ${sum}`));
        resultArea.replaceChildren(...kids);
      }

      const facesSel = h('select', { class: 'input', style: 'width:110px',
        onchange: e => { st.faces = +e.target.value; save(); buildStage(); } },
        FACE_OPTIONS.map(f =>
          h('option', { value: f, selected: f === st.faces || null }, f + '面')));

      const countVal = h('span', { class: 'stepper-val' }, st.count);
      const setCount = d => {
        if (uiState === 'rolling') return;
        st.count = Math.min(10, Math.max(1, st.count + d));
        countVal.textContent = st.count;
        save();
        buildStage();
      };
      const minusBtn = h('button', { onclick: () => setCount(-1), 'aria-label': '個数を減らす' }, '−');
      const plusBtn = h('button', { onclick: () => setCount(1), 'aria-label': '個数を増やす' }, '＋');

      /* ---- ロールアニメーションの舞台（サイコロ本体はここにだけ存在する） ---- */
      const rollStage = h('div', { class: 'dice-roll-stage' });
      const stageWrap = h('div', { class: 'dice-stage-wrap' }, rollStage);

      function clearActiveAnimations() {
        activeFlatRolls.forEach(ctrl => ctrl.cancel());
        activeFlatRolls = [];
        solidInstances.forEach(inst => inst.destroy());
        solidInstances = [];
      }

      /* 面数・個数が変わったら舞台を作り直す（ロール中は変更UI自体を無効化しているため
         多重実行の心配はない）。
         前の面数・個数で出した目をそのまま残すと、6面の「5」を100面の結果として
         ポストできてしまうため、作り直しのタイミングで結果も消す。 */
      function reducedMotion() {
        return typeof Gerbera.prefersReducedMotion === 'function' && Gerbera.prefersReducedMotion();
      }

      function buildStage() {
        clearActiveAnimations();
        uiState = 'idle';
        lastFinals = null;
        paintResult();
        postBtn.hidden = true;
        postImgBtn.hidden = true;
        rollStage.replaceChildren();
        if (!reducedMotion() && (st.faces === 6 || st.faces === 4)) {
          const slotClass = st.faces === 6 ? 'die3d-slot' : 'die4-slot';
          const factory = st.faces === 6 ? createDie3D : createDie4D;
          for (let i = 0; i < st.count; i++) {
            const slot = h('div', { class: slotClass });
            rollStage.appendChild(slot);
            solidInstances.push(factory(slot));
          }
        } else {
          const dice = [];
          for (let i = 0; i < st.count; i++) {
            const die = h('div', { class: 'dice-roll-die' }, h('span', { class: 'num' }, ''));
            rollStage.appendChild(h('div', { class: 'dice-slot' }, die));
            dice.push(die);
          }
          rollStage._flatDice = dice;
        }
      }

      /* ロール中は面数・個数の変更をまとめて止める。個数だけ生きていると
         転がっている最中に舞台が作り直され、ロールが終わらなくなる。 */
      function lockControls(on) {
        rollBtn.disabled = on;
        facesSel.disabled = on;
        minusBtn.disabled = on;
        plusBtn.disabled = on;
      }

      function roll() {
        if (uiState === 'rolling') return; // 多重実行防止
        uiState = 'rolling';
        lockControls(true);
        postBtn.hidden = true;
        postImgBtn.hidden = true;

        const finals = Array.from({ length: st.count }, () => 1 + Math.floor(Math.random() * st.faces));
        let promises;

        if (reducedMotion()) {
          (rollStage._flatDice || []).forEach((el, i) => {
            el.classList.add('rolled');
            el.querySelector('.num').textContent = finals[i];
          });
          lastFinals = finals;
          uiState = 'result';
          paintResult();
          postBtn.hidden = false;
          postImgBtn.hidden = false;
          lockControls(false);
          return;
        }

        if (st.faces === 6 || st.faces === 4) {
          promises = solidInstances.map((inst, i) => inst.roll(finals[i]));
        } else {
          const dieEls = rollStage._flatDice || [];
          activeFlatRolls = [];
          promises = dieEls.map((el, i) => {
            const width = el.getBoundingClientRect().width || 54;
            const dx = width * (0.32 + (i % 3) * 0.05);     // 相対サイズから算出（固定値にしない）
            const turns = 4 + (i % 3) + Math.random() * 1.5; // 個体差をつけて自然に見せる
            const ctrl = rollDie(el, {
              dx, turns, duration: AnimTiming.diceRoll,
              onSettleVisual: () => { el.querySelector('.num').textContent = finals[i]; }
            });
            activeFlatRolls.push(ctrl);
            return ctrl.promise;
          });
        }

        Promise.all(promises).then(() => {
          if (uiState !== 'rolling') return; // アンマウント等で取り消し済み
          activeFlatRolls = [];
          lastFinals = finals;
          uiState = 'result';
          paintResult();
          postBtn.hidden = false;
          postImgBtn.hidden = false;
          lockControls(false);
        });
      }

      const rollBtn = h('button', { class: 'btn btn-primary btn-big btn-full', onclick: roll }, '🎲 サイコロを振る');

      root.append(
        h('div', { class: 'card' },
          h('div', { class: 'mt8' }, resultArea),
          postRow,
          h('div', { class: 'hstack mt16', style: 'justify-content:center;flex-wrap:wrap;gap:14px' },
            h('div', { class: 'hstack' },
              h('span', { class: 'input-label', style: 'margin:0' }, '面数'), facesSel),
            h('div', { class: 'hstack' },
              h('span', { class: 'input-label', style: 'margin:0' }, '個数'),
              h('div', { class: 'stepper' }, minusBtn, countVal, plusBtn))),
          stageWrap,
          rollBtn)
      );
      buildStage();

      /* ---- アンマウント時のクリーンアップ：残っているアニメーション/タイマー/
             立体ダイスのrAFループが次回の操作に影響しないようにする ---- */
      return () => { clearActiveAnimations(); };
    }
  });
})();
