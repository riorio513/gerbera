'use strict';
/* ツール: カウンター（上限設定・残り表示・加算単位変更・最大20個・名前変更）
   パネル開けなど複数個同時に使う場面が多いため、1個あたりの高さを
   小さいコンパクトな行にまとめ、スクロールなしで並べられるようにする。
   加算単位・上限などの細かい設定は行の下に折りたたんで表示する。 */
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

      function counterRow(c) {
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
          c.value = Math.min(limit(), next);
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

        const settings = h('div', { class: 'cnt-settings', hidden: true },
          h('div', { class: 'note', style: 'margin-bottom:6px;font-weight:700' }, '⚙ このカウンターの詳細設定'),
          h('span', { class: 'note' }, '1回で増減する数'),
          h('div', { class: 'hstack', style: 'flex-wrap:wrap;gap:6px;margin-top:4px' }, stepChips),
          h('div', { class: 'hstack mt12' },
            h('span', { class: 'note' }, '上限（達成の目安）'),
            h('input', { class: 'input w-num', type: 'number', min: 1, inputmode: 'numeric',
              value: c.limit === null ? '' : c.limit, placeholder: String(DEFAULT_LIMIT),
              oninput: e => {
                const v = e.target.value;
                c.limit = v === '' ? null : Math.max(1, +v);
                save();
                paint();
              } })));

        const moreBtn = h('button', { class: 'cnt-more', 'aria-label': '増減数・上限の設定を開く',
          onclick: () => {
            settings.hidden = !settings.hidden;
            moreBtn.classList.toggle('open', !settings.hidden);
          } }, h('span', {}, '⚙'), h('span', { class: 'cnt-more-label' }, '設定'));

        const row = h('div', { class: 'cnt-row' },
          h('button', { class: 'cnt-btn minus', onclick: () => bump(-1), 'aria-label': '減らす' }, '−'),
          h('div', { class: 'cnt-mid' },
            h('input', { class: 'cnt-name', value: c.name, placeholder: '名前',
              oninput: e => { c.name = e.target.value; save(); } }),
            h('div', { class: 'cnt-mid-row' }, valueEl, remainEl)),
          h('button', { class: 'cnt-btn plus', onclick: () => bump(1), 'aria-label': '増やす' }, '＋'),
          moreBtn,
          h('button', { class: 'icon-btn danger', 'aria-label': 'このカウンターを削除',
            onclick: () => {
              if (!confirm(`「${c.name || 'カウンター'}」を削除しますか？`)) return;
              counters = counters.filter(x => x.id !== c.id);
              save();
              render();
            } }, '🗑'));

        paint();
        return h('div', {}, row, settings);
      }

      function render() {
        listEl.replaceChildren(...counters.map(counterRow));
      }
      render();

      root.append(listEl, addBtn);
    }
  });
})();
