'use strict';
/* ツール: ダイス（面数変更・個数変更・複数同時・転がるロールアニメーション）
   演出（rollDie）と抽選ロジック（このファイル内の乱数決定）は分離している。
   rollDie はダイスの種類・出目を一切知らず、「転がって停止する」動きだけを担当する。 */
(function () {
  const { register, Store, h, openX, shareResultImage, rollDie, AnimTiming } = Gerbera;
  const KEY = 'dice';

  register({
    id: 'dice', name: 'ダイス', icon: '🎲',
    mount(root) {
      const st = Object.assign({ faces: 6, count: 1 }, Store.get(KEY, {}));
      const save = () => Store.set(KEY, { faces: st.faces, count: st.count });

      /* ---- UI状態: 'idle' | 'rolling' | 'result' ---- */
      let uiState = 'idle';
      let activeRolls = [];   // 進行中の rollDie() コントローラ（多重実行防止・クリーンアップ用）
      let lastFinals = null;

      /* ---- 結果表示領域（画面上部・ロール中の見た目とは独立） ---- */
      const resultArea = h('div', { class: 'empty' }, 'ボタンを押してダイスを振ってね');

      function postText() { return `【ダイス】\nダイスの結果は${lastFinals.join('・')}でした！`; }
      const postBtn = h('button', { class: 'btn btn-lav grow', hidden: true,
        onclick: () => { if (lastFinals) openX(postText()); } }, '🐦 文章でポスト');
      const postImgBtn = h('button', { class: 'btn btn-ghost grow', hidden: true,
        onclick: () => {
          if (!lastFinals) return;
          shareResultImage({
            badge: '【ダイス】',
            main: lastFinals.join('・'),
            note: lastFinals.length > 1 ? '合計 ' + lastFinals.reduce((a, b) => a + b, 0) : '',
            postText: postText()
          });
        } }, '🖼️ 画像でポスト');
      const postRow = h('div', { class: 'hstack mt8' }, postBtn, postImgBtn);

      function paintResult() {
        if (uiState !== 'result' || !lastFinals) {
          resultArea.replaceChildren(); // 空にしてから empty を差し戻す
          resultArea.className = 'empty';
          resultArea.textContent = 'ボタンを押してダイスを振ってね';
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
        onchange: e => { st.faces = +e.target.value; save(); } },
        [2, 4, 6, 8, 10, 12, 20, 100].map(f =>
          h('option', { value: f, selected: f === st.faces || null }, f + '面')));

      const countVal = h('span', { class: 'stepper-val' }, st.count);
      const setCount = d => {
        st.count = Math.min(10, Math.max(1, st.count + d));
        countVal.textContent = st.count;
        save();
      };

      /* ---- ロールアニメーションの舞台（サイコロ本体はここにだけ存在する） ---- */
      const rollStage = h('div', { class: 'dice-roll-stage' });

      function buildSlots(n) {
        const slots = [];
        const dice = [];
        for (let i = 0; i < n; i++) {
          const die = h('div', { class: 'dice-roll-die' }, h('span', { class: 'num' }, ''));
          const slot = h('div', { class: 'dice-slot' }, die);
          slots.push(slot);
          dice.push(die);
        }
        rollStage.replaceChildren(...slots);
        return dice;
      }

      function roll() {
        if (uiState === 'rolling') return; // 多重実行防止
        uiState = 'rolling';
        rollBtn.disabled = true;
        postBtn.hidden = true;
        postImgBtn.hidden = true;

        const finals = Array.from({ length: st.count }, () => 1 + Math.floor(Math.random() * st.faces));
        const dieEls = buildSlots(st.count);
        activeRolls = [];

        const promises = dieEls.map((el, i) => {
          const width = el.getBoundingClientRect().width || 54;
          const dx = width * (0.32 + (i % 3) * 0.05);     // 相対サイズから算出（固定値にしない）
          const turns = 4 + (i % 3) + Math.random() * 1.5; // 個体差をつけて自然に見せる
          const ctrl = rollDie(el, {
            dx,
            turns,
            duration: AnimTiming.diceRoll,
            onSettleVisual: () => { el.querySelector('.num').textContent = finals[i]; }
          });
          activeRolls.push(ctrl);
          return ctrl.promise;
        });

        Promise.all(promises).then(() => {
          if (uiState !== 'rolling') return; // アンマウント等で取り消し済み
          activeRolls = [];
          lastFinals = finals;
          uiState = 'result';
          paintResult();
          postBtn.hidden = false;
          postImgBtn.hidden = false;
          rollBtn.disabled = false;
        });
      }

      const rollBtn = h('button', { class: 'btn btn-primary btn-big btn-full', onclick: roll }, '🎲 ダイスを振る');

      root.append(
        h('div', { class: 'card' },
          h('div', { class: 'mt8' }, resultArea),
          postRow,
          h('div', { class: 'hstack mt16', style: 'justify-content:center;flex-wrap:wrap;gap:14px' },
            h('div', { class: 'hstack' },
              h('span', { class: 'input-label', style: 'margin:0' }, '面数'), facesSel),
            h('div', { class: 'hstack' },
              h('span', { class: 'input-label', style: 'margin:0' }, '個数'),
              h('div', { class: 'stepper' },
                h('button', { onclick: () => setCount(-1), 'aria-label': '個数を減らす' }, '−'),
                countVal,
                h('button', { onclick: () => setCount(1), 'aria-label': '個数を増やす' }, '＋')))),
          h('div', { class: 'mt16' }, rollStage),
          h('div', { class: 'mt12' }, rollBtn))
      );
      buildSlots(st.count);

      /* ---- アンマウント時のクリーンアップ：残っているアニメーション/タイマーが
             次回の操作に影響しないようにする ---- */
      return () => {
        activeRolls.forEach(ctrl => ctrl.cancel());
        activeRolls = [];
      };
    }
  });
})();
