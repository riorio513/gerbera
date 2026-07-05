'use strict';
/* ツール: 電卓（四則演算ができる、一般的な電卓）
   「＝」を押すと、計算結果とあわせて pt変換ツール（Gerbera.PtConv）の
   設定を使った変換結果も同時に表示する。 */
(function () {
  const { register, h, fmtNum } = Gerbera;

  function formatNum(n) {
    if (!isFinite(n)) return 'エラー';
    return String(Math.round(n * 1e8) / 1e8);
  }

  register({
    id: 'calc', name: '電卓', icon: '🧮',
    mount(root) {
      let display = '0';
      let stored = null;
      let operator = null;
      let waiting = false;
      let justEvaluated = false;

      const exprEl = h('div', { style: 'min-height:16px;text-align:right;font-size:13px;color:var(--text-sub);font-variant-numeric:tabular-nums' });
      const displayEl = h('div', { class: 'display-huge', style: 'font-size:clamp(28px,8vw,40px);text-align:right;word-break:break-all;line-height:1.2' }, '0');
      const ptBox = h('div', { class: 'result-card mt8', style: 'padding:12px 16px' },
        h('div', { class: 'note' }, '「＝」を押すと、pt変換の結果もここに表示されます'));

      function compute(a, b, op) {
        switch (op) {
          case '+': return a + b;
          case '−': return a - b;
          case '×': return a * b;
          case '÷': return b === 0 ? NaN : a / b;
        }
      }

      function paint() {
        displayEl.textContent = display;
        exprEl.textContent = (operator && stored !== null) ? `${formatNum(stored)} ${operator}` : '';
      }

      function inputDigit(d) {
        if (waiting || justEvaluated) { display = d; waiting = false; justEvaluated = false; }
        else display = display === '0' ? d : display + d;
        paint();
      }
      function inputDot() {
        if (waiting || justEvaluated) { display = '0.'; waiting = false; justEvaluated = false; }
        else if (!display.includes('.')) display += '.';
        paint();
      }
      function backspace() {
        if (waiting || justEvaluated) return;
        display = display.length > 1 ? display.slice(0, -1) : '0';
        paint();
      }
      function clearAll() {
        display = '0'; stored = null; operator = null; waiting = false; justEvaluated = false;
        ptBox.replaceChildren(h('div', { class: 'note' }, '「＝」を押すと、pt変換の結果もここに表示されます'));
        paint();
      }
      function pressOperator(op) {
        const cur = parseFloat(display) || 0;
        if (operator && !waiting) {
          stored = compute(stored, cur, operator);
          display = formatNum(stored);
        } else {
          stored = cur;
        }
        operator = op;
        waiting = true;
        justEvaluated = false;
        paint();
      }
      function showPtResult(v) {
        const rate = +Gerbera.PtConv.b || 0;
        const unit = Gerbera.PtConv.unit || '';
        const out = v * rate;
        ptBox.replaceChildren(
          h('div', { class: 'result-sub' }, `pt変換（1ポイント＝${fmtNum(rate)}${unit}）`),
          h('div', { class: 'result-main mono' }, fmtNum(Math.round(out * 100) / 100) + ' ' + unit),
          h('div', { class: 'result-note' }, `${fmtNum(v)} ポイントとして計算しました`));
      }
      function pressEquals() {
        const cur = parseFloat(display) || 0;
        let result = cur;
        if (operator !== null) {
          result = compute(stored, cur, operator);
          display = formatNum(result);
        }
        stored = null; operator = null; waiting = false; justEvaluated = true;
        paint();
        showPtResult(result);
      }

      function key(label, cls, onclick, extraStyle) {
        return h('button', { class: 'btn btn-full ' + cls,
          style: 'height:40px;font-size:16px' + (extraStyle ? ';' + extraStyle : ''), onclick }, label);
      }

      const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px' },
        key('C', 'btn-danger', clearAll), key('⌫', 'btn-ghost', backspace), h('span', {}), key('÷', 'btn-lav', () => pressOperator('÷')),
        key('7', 'btn-ghost', () => inputDigit('7')), key('8', 'btn-ghost', () => inputDigit('8')), key('9', 'btn-ghost', () => inputDigit('9')), key('×', 'btn-lav', () => pressOperator('×')),
        key('4', 'btn-ghost', () => inputDigit('4')), key('5', 'btn-ghost', () => inputDigit('5')), key('6', 'btn-ghost', () => inputDigit('6')), key('−', 'btn-lav', () => pressOperator('−')),
        key('1', 'btn-ghost', () => inputDigit('1')), key('2', 'btn-ghost', () => inputDigit('2')), key('3', 'btn-ghost', () => inputDigit('3')), key('+', 'btn-lav', () => pressOperator('+')),
        key('0', 'btn-ghost', () => inputDigit('0'), 'grid-column:span 2'), key('.', 'btn-ghost', inputDot), key('＝', 'btn-primary', pressEquals));

      root.append(
        h('div', { class: 'card', style: 'padding:14px' },
          exprEl, displayEl, grid),
        ptBox
      );
    }
  });
})();
