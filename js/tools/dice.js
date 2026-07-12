'use strict';
/* ツール: ダイス（面数変更・個数変更・複数同時） */
(function () {
  const { register, Store, h, openX } = Gerbera;
  const KEY = 'dice';

  register({
    id: 'dice', name: 'ダイス', icon: '🎲',
    mount(root) {
      const st = Object.assign({ faces: 6, count: 1 }, Store.get(KEY, {}));
      const save = () => Store.set(KEY, { faces: st.faces, count: st.count });

      const resultBox = h('div', { class: 'dice-box' },
        h('div', { class: 'note', style: 'align-self:center' }, 'ボタンを押してダイスを振ってね'));
      const totalBox = h('div', { class: 'dice-total' });

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

      let rolling = false;
      let lastFinals = null;
      const ROLL_MS = 620;
      const postBtn = h('button', { class: 'btn btn-lav btn-full mt8', hidden: true,
        onclick: () => {
          if (!lastFinals) return;
          openX(`【ダイス】\nダイスの結果は${lastFinals.join('・')}でした！`);
        } }, '🐦 結果をXへポスト');

      function roll() {
        if (rolling) return;
        rolling = true;
        rollBtn.disabled = true;
        const finals = Array.from({ length: st.count }, () => 1 + Math.floor(Math.random() * st.faces));
        totalBox.textContent = '';
        const dieEls = finals.map(() => h('div', { class: 'die rolling' }, '?'));
        resultBox.replaceChildren(...dieEls);

        dieEls.forEach((el, i) => {
          const delay = i * 90;
          setTimeout(() => {
            const spin = setInterval(() => {
              el.textContent = 1 + Math.floor(Math.random() * st.faces);
            }, 55);
            setTimeout(() => {
              clearInterval(spin);
              el.textContent = finals[i];
              el.classList.remove('rolling');
              el.classList.add('pop');
            }, ROLL_MS);
          }, delay);
        });

        const totalDelay = ROLL_MS + (dieEls.length - 1) * 90 + 40;
        setTimeout(() => {
          totalBox.textContent = st.count > 1 ? '合計 ' + finals.reduce((a, b) => a + b, 0) : '';
          rolling = false;
          rollBtn.disabled = false;
          lastFinals = finals;
          postBtn.hidden = false;
        }, totalDelay);
      }

      const rollBtn = h('button', { class: 'btn btn-primary btn-big btn-full', onclick: roll }, '🎲 ダイスを振る');

      root.append(
        h('div', { class: 'card' },
          h('div', { class: 'hstack', style: 'justify-content:center;flex-wrap:wrap;gap:14px' },
            h('div', { class: 'hstack' },
              h('span', { class: 'input-label', style: 'margin:0' }, '面数'), facesSel),
            h('div', { class: 'hstack' },
              h('span', { class: 'input-label', style: 'margin:0' }, '個数'),
              h('div', { class: 'stepper' },
                h('button', { onclick: () => setCount(-1), 'aria-label': '個数を減らす' }, '−'),
                countVal,
                h('button', { onclick: () => setCount(1), 'aria-label': '個数を増やす' }, '＋')))),
          h('div', { class: 'mt16' }, resultBox),
          h('div', { class: 'mt8' }, totalBox),
          rollBtn,
          postBtn)
      );
    }
  });
})();
