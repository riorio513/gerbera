'use strict';
/* ツール: カウンター（上限設定・残り表示・加算単位変更・最大20個・名前変更） */
(function () {
  const { register, Store, h, uid, toast, fmtNum } = Gerbera;
  const KEY = 'counters';
  const DEFAULT_LIMIT = 99999;
  const MAX_COUNTERS = 20;
  const STEPS = [1, 10, 100, 1000];

  register({
    id: 'counter', name: 'カウンター', icon: '🔢',
    mount(root) {
      let counters = Store.get(KEY, null);
      if (!counters) {
        counters = [{ id: uid(), name: 'カウンター1', value: 0, limit: null, step: 1 }];
        Store.set(KEY, counters);
      }
      const save = () => Store.set(KEY, counters);

      const listEl = h('div');
      const addBtn = h('button', {
        class: 'btn btn-ghost btn-full',
        onclick: () => {
          if (counters.length >= MAX_COUNTERS) { toast(`カウンターは最大${MAX_COUNTERS}個までです`); return; }
          counters.push({ id: uid(), name: `カウンター${counters.length + 1}`, value: 0, limit: null, step: 1 });
          save();
          render();
        }
      }, '＋ カウンターを追加');

      function counterCard(c) {
        const limit = () => (c.limit === null || c.limit === '' ? DEFAULT_LIMIT : c.limit);

        const valueEl = h('div', { class: 'cnt-value' });
        const remainEl = h('div', { class: 'cnt-remain' });
        function paint() {
          valueEl.textContent = fmtNum(c.value);
          valueEl.classList.toggle('done', c.value >= limit());
          remainEl.textContent = c.value >= limit() ? '🎉 達成！' : `残り ${fmtNum(limit() - c.value)}`;
        }

        function bump(sign) {
          const next = c.value + sign * c.step;
          c.value = Math.min(limit(), Math.max(0, next));
          save();
          paint();
        }

        const stepChips = STEPS.map(s =>
          h('button', {
            class: 'chip' + (c.step === s ? ' on' : ''),
            onclick: e => {
              c.step = s; save();
              e.target.parentElement.querySelectorAll('.chip').forEach(el => el.classList.remove('on'));
              e.target.classList.add('on');
            }
          }, '×' + s));

        const card = h('div', { class: 'card' },
          h('div', { class: 'hstack' },
            h('input', { class: 'cnt-name grow', value: c.name, placeholder: '名前',
              oninput: e => { c.name = e.target.value; save(); } }),
            h('button', { class: 'icon-btn danger', 'aria-label': 'このカウンターを削除',
              onclick: () => {
                if (!confirm(`「${c.name || 'カウンター'}」を削除しますか？`)) return;
                counters = counters.filter(x => x.id !== c.id);
                save();
                render();
              } }, '🗑')),
          h('div', { class: 'cnt-grid' },
            h('button', { class: 'cnt-btn minus', onclick: () => bump(-1), 'aria-label': '減らす' }, '−'),
            h('div', {}, valueEl, remainEl),
            h('button', { class: 'cnt-btn plus', onclick: () => bump(1), 'aria-label': '増やす' }, '＋')),
          h('div', { class: 'hstack', style: 'flex-wrap:wrap;justify-content:center;gap:6px' },
            stepChips,
            h('div', { class: 'hstack', style: 'margin-left:auto' },
              h('span', { class: 'note' }, '上限'),
              h('input', { class: 'input w-num', type: 'number', min: 1, inputmode: 'numeric',
                value: c.limit === null ? '' : c.limit, placeholder: String(DEFAULT_LIMIT),
                oninput: e => {
                  const v = e.target.value;
                  c.limit = v === '' ? null : Math.max(1, +v);
                  save();
                  paint();
                } }))));
        paint();
        return card;
      }

      function render() {
        listEl.replaceChildren(...counters.map(counterCard));
      }
      render();

      root.append(listEl, addBtn);
    }
  });
})();
