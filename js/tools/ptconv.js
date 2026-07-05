'use strict';
/* ツール: pt変換（1ポイント＝いくつ、を1つだけ設定する変換式）
   グローバル単一エンジン: 電卓ツールから同じ設定を参照して、
   計算結果に対するpt換算を同時に表示できるようにする。
   数字・単位は自由に編集でき、Enterキー（または欄を離れたとき）に反映される。 */
(function () {
  const { register, Store, h, toast, emitter } = Gerbera;
  const KEY = 'ptconv';
  const UNITS = ['円', '秒', '分', '個'];

  const PT = {
    b: 1, unit: '円',
    ev: emitter(),
    persist() { Store.set(KEY, { b: this.b, unit: this.unit }); },
    set(b, unit) { this.b = b; this.unit = unit; this.persist(); this.ev.emit(); },
    restore() {
      const s = Store.get(KEY, null);
      if (!s) return;
      this.b = s.b != null ? s.b : 1;
      this.unit = UNITS.includes(s.unit) ? s.unit : '円';
    }
  };
  PT.restore();
  Gerbera.PtConv = PT;

  register({
    id: 'ptconv', name: 'pt変換', icon: '💱',
    mount(root) {
      const numIn = h('input', { class: 'input', type: 'number', step: 'any', inputmode: 'decimal',
        style: 'font-size:20px;font-weight:900;text-align:center;width:110px',
        value: PT.b, placeholder: '1' });
      const unitSel = h('select', { class: 'input', style: 'width:96px' },
        UNITS.map(u => h('option', { value: u, selected: u === PT.unit || null }, u)));

      const calcBtn = h('button', { class: 'btn btn-ghost btn-full mt8',
        onclick: () => Gerbera.openCommonTool('calc') }, '🧮 電卓を開く');

      const timerBtn = h('button', { class: 'btn btn-lav btn-full mt8',
        onclick: () => {
          const n = +numIn.value || 0;
          const sec = unitSel.value === '分' ? n * 60 : n;
          if (!(unitSel.value === '秒' || unitSel.value === '分') || sec <= 0) {
            toast('秒か分の変換式にしてから使ってね');
            return;
          }
          Gerbera.Timer.reset();
          Gerbera.Timer.setDuration(Math.round(sec));
          toast('⏰ タイマーに反映しました');
        } }, '⏰ 変換内容をタイマーに反映');

      function paintTimerBtn() {
        timerBtn.hidden = !(unitSel.value === '秒' || unitSel.value === '分');
      }

      function apply() {
        const b = +numIn.value || 0;
        PT.set(b, unitSel.value);
        paintTimerBtn();
      }
      function applyWithFeedback() {
        apply();
        toast('✓ 変換式を反映しました');
      }
      numIn.addEventListener('keydown', e => { if (e.key === 'Enter') { applyWithFeedback(); numIn.blur(); } });
      numIn.addEventListener('blur', apply);
      unitSel.addEventListener('change', applyWithFeedback);

      paintTimerBtn();

      root.append(
        h('div', { class: 'card' },
          h('div', { class: 'section-label' }, '🔁 変換式'),
          h('div', { class: 'hstack', style: 'justify-content:center;flex-wrap:wrap;gap:10px;margin-top:4px' },
            h('span', { style: 'font-size:17px;font-weight:900' }, '1 ポイント'),
            h('span', { style: 'font-size:17px;font-weight:900;color:var(--text-sub)' }, '＝'),
            numIn, unitSel),
          h('p', { class: 'note center mt12' }, '数字や単位を変えたら、Enterキーで反映されます'),
          h('p', { class: 'note center' }, '変換内容は電卓機能に反映されます'),
          calcBtn,
          timerBtn)
      );
    }
  });
})();
