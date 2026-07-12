'use strict';
/* ツール: ルーレット（項目自由追加・編集・保存・ランダム抽選） */
(function () {
  const { register, Store, h, uid, toast, openX } = Gerbera;
  const KEY = 'roulette.items';
  const COLORS = ['#F2C4D6', '#D9CDF0', '#F9DFEA', '#C8B9E8', '#F3D0DF', '#E3DBF5'];
  const SVGNS = 'http://www.w3.org/2000/svg';

  register({
    id: 'roulette', name: 'ルーレット', icon: '🎡',
    mount(root) {
      let items = Store.get(KEY, []);
      const save = () => Store.set(KEY, items);
      let rot = 0;          // 累積回転角
      let spinning = false;

      /* --- ホイール描画 --- */
      const rotor = document.createElementNS(SVGNS, 'g');
      rotor.setAttribute('class', 'wheel-rotor');
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', '0 0 220 220');
      svg.setAttribute('class', 'wheel-svg');
      svg.append(rotor);

      function arcPath(a0, a1) {
        const rad = a => (a - 90) * Math.PI / 180;
        const r = 104, cx = 110, cy = 110;
        const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
        const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
        const large = a1 - a0 > 180 ? 1 : 0;
        return `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`;
      }

      function buildWheel() {
        rotor.replaceChildren();
        const n = items.length;
        if (n === 0) return;
        const seg = 360 / n;
        items.forEach((it, i) => {
          const color = COLORS[i % COLORS.length];
          if (n === 1) {
            const c = document.createElementNS(SVGNS, 'circle');
            c.setAttribute('cx', 110); c.setAttribute('cy', 110); c.setAttribute('r', 104);
            c.setAttribute('fill', color);
            rotor.append(c);
          } else {
            const p = document.createElementNS(SVGNS, 'path');
            p.setAttribute('d', arcPath(i * seg, (i + 1) * seg));
            p.setAttribute('fill', color);
            p.setAttribute('stroke', '#fff');
            p.setAttribute('stroke-width', '1.5');
            rotor.append(p);
          }
          const mid = i * seg + seg / 2;
          const rad = (mid - 90) * Math.PI / 180;
          const tx = 110 + 66 * Math.cos(rad), ty = 110 + 66 * Math.sin(rad);
          const label = it.label.length > 6 ? it.label.slice(0, 6) + '…' : it.label;
          const t = document.createElementNS(SVGNS, 'text');
          t.setAttribute('x', tx); t.setAttribute('y', ty);
          t.setAttribute('text-anchor', 'middle');
          t.setAttribute('dominant-baseline', 'middle');
          t.setAttribute('font-size', n > 8 ? '9' : '11');
          t.setAttribute('font-weight', '700');
          t.setAttribute('fill', '#43324E');
          t.setAttribute('transform', `rotate(${mid} ${tx} ${ty})`);
          t.textContent = label;
          rotor.append(t);
        });
        const hub = document.createElementNS(SVGNS, 'circle');
        hub.setAttribute('cx', 110); hub.setAttribute('cy', 110); hub.setAttribute('r', 17);
        hub.setAttribute('fill', '#fff');
        hub.setAttribute('stroke', '#F0DFE8');
        rotor.append(hub);
      }
      buildWheel();

      let lastWinnerLabel = null;
      const resultArea = h('div');
      const postBtn = h('button', { class: 'btn btn-lav btn-full mt8', hidden: true,
        onclick: () => {
          if (!lastWinnerLabel) return;
          openX(`【ルーレット】\nただいまのルーレット結果は${lastWinnerLabel}でした！`);
        } }, '🐦 結果をXへポスト');
      const emptyMsg = h('div', { class: 'empty', hidden: items.length > 0 },
        '項目がまだありません。', h('br'), '下の「項目を編集する」から追加してね');

      const spinBtn = h('button', {
        class: 'btn btn-primary btn-big btn-full mt12',
        onclick: () => {
          if (spinning) return;
          if (items.length < 2) { toast('項目を2つ以上追加してね'); return; }
          spinning = true;
          spinBtn.disabled = true;
          resultArea.replaceChildren();
          const n = items.length, seg = 360 / n;
          const winner = Math.floor(Math.random() * n);
          const center = winner * seg + seg / 2;
          const jitter = (Math.random() - 0.5) * seg * 0.6;
          const target = ((360 - center - jitter) % 360 + 360) % 360;
          rot = rot - (rot % 360) + 360 * 6 + target;
          rotor.style.transform = `rotate(${rot}deg)`;
          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            rotor.removeEventListener('transitionend', onEnd);
            clearTimeout(fallback);
            spinning = false;
            spinBtn.disabled = false;
            lastWinnerLabel = items[winner].label;
            postBtn.hidden = false;
            resultArea.replaceChildren(
              h('div', { class: 'result-card pop' },
                h('div', { class: 'result-sub' }, '結果は…'),
                h('div', { class: 'result-main' }, items[winner].label)));
          };
          const onEnd = () => finish();
          rotor.addEventListener('transitionend', onEnd);
          // タブが非アクティブな間などtransitionendが発火しない環境向けの保険
          const fallback = setTimeout(finish, 3600);
        }
      }, '🎡 回す！');

      /* --- 項目編集 --- */
      const editList = h('div');
      const addInput = h('input', { class: 'input grow', placeholder: '項目を入力',
        onkeydown: e => { if (e.key === 'Enter') addItem(); } });
      function addItem() {
        const v = addInput.value.trim();
        if (!v) return;
        items.push({ id: uid(), label: v });
        addInput.value = '';
        save();
        renderEditor();
        buildWheel();
        emptyMsg.hidden = items.length > 0;
      }
      function renderEditor() {
        editList.replaceChildren(...items.map(it =>
          h('div', { class: 'list-row' },
            h('input', { class: 'input grow', value: it.label,
              oninput: e => { it.label = e.target.value; save(); buildWheel(); } }),
            h('button', { class: 'icon-btn danger', 'aria-label': 'この項目を削除',
              onclick: () => {
                items = items.filter(x => x.id !== it.id);
                save();
                renderEditor();
                buildWheel();
                emptyMsg.hidden = items.length > 0;
              } }, '🗑'))));
      }
      renderEditor();

      root.append(
        h('div', { class: 'card' },
          resultArea,
          postBtn,
          h('div', { class: 'wheel-wrap mt12' }, svg),
          emptyMsg,
          spinBtn,
          h('details', { class: 'editor' },
            h('summary', {}, '⚙️ 項目を編集する'),
            h('div', { class: 'editor-body' },
              h('div', { class: 'hstack' }, addInput,
                h('button', { class: 'btn btn-ghost btn-sm', onclick: addItem }, '追加')),
              h('div', { class: 'mt8' }, editList))))
      );
    }
  });
})();
