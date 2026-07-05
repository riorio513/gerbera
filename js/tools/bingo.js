'use strict';
/* ツール: ビンゴ（1〜99抽選・重複なし・履歴表示） */
(function () {
  const { register, Store, h, toast } = Gerbera;
  const KEY = 'bingo.drawn';
  const MAX = 99;

  register({
    id: 'bingo', name: 'ビンゴ', icon: '🎱',
    mount(root) {
      let drawn = Store.get(KEY, []); // 抽選順
      const save = () => Store.set(KEY, drawn);
      let rolling = false;

      const numDisplay = h('div', { class: 'display-huge' }, drawn.length ? drawn[drawn.length - 1] : '--');
      const restNote = h('div', { class: 'note center mt8' });
      const board = h('div', { class: 'bingo-grid mt12' });
      const histRow = h('div', { class: 'chip-wrap' });

      function paint() {
        restNote.textContent = `のこり ${MAX - drawn.length} 個`;
        const last = drawn[drawn.length - 1];
        board.replaceChildren(...Array.from({ length: MAX }, (_, i) => {
          const n = i + 1;
          const hit = drawn.includes(n);
          return h('div', { class: 'bcell' + (hit ? (n === last ? ' last' : ' hit') : '') }, n);
        }));
        histRow.replaceChildren(...[...drawn].reverse().map((n, i) =>
          h('span', { class: 'chip' + (i === 0 ? ' on' : '') }, n)));
      }

      const drawBtn = h('button', {
        class: 'btn btn-primary btn-big btn-full mt12',
        onclick: () => {
          if (rolling) return;
          const rest = [];
          for (let n = 1; n <= MAX; n++) if (!drawn.includes(n)) rest.push(n);
          if (!rest.length) { toast('全部の数字が出ました🎉'); return; }
          rolling = true;
          drawBtn.disabled = true;
          const final = rest[Math.floor(Math.random() * rest.length)];
          let t = 0;
          const anim = setInterval(() => {
            numDisplay.textContent = rest[Math.floor(Math.random() * rest.length)];
            t += 60;
            if (t >= 780) {
              clearInterval(anim);
              numDisplay.textContent = final;
              numDisplay.classList.remove('pop');
              void numDisplay.offsetWidth; // アニメ再生し直し
              numDisplay.classList.add('pop');
              drawn.push(final);
              save();
              paint();
              rolling = false;
              drawBtn.disabled = false;
            }
          }, 60);
        }
      }, '🎱 数字を引く');

      root.append(
        h('div', { class: 'card center' },
          numDisplay, restNote, drawBtn),
        h('div', { class: 'card' },
          h('div', { class: 'section-label' }, '🗒 出た数字（ボード）'),
          board,
          h('div', { class: 'section-label mt16' }, '🕐 出た順（新しい順）'),
          histRow,
          h('button', { class: 'btn btn-danger btn-sm btn-full mt12',
            onclick: () => {
              if (!drawn.length) { toast('まだ数字を引いていません'); return; }
              if (!confirm('履歴を消して最初からにしますか？')) return;
              drawn = [];
              save();
              numDisplay.textContent = '--';
              paint();
            } }, 'リセット'))
      );
      paint();
    }
  });
})();
