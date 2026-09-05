'use strict';
/* ツール: pt変換（1ポイント＝いくつ、を1つだけ設定する変換式）
   グローバル単一エンジン: 電卓ツールから同じ設定を参照して、
   計算結果に対するpt換算を同時に表示できるようにする。
   数字・単位は自由に編集でき、Enterキー（または欄を離れたとき）に反映される。
   配信中は「もらったptが何円／何分か」をその場で知りたいので、
   変換式の下に換算欄を置き、入力しただけで答えが出るようにしている。 */
(function () {
  const { register, Store, h, toast, emitter, fmtNum, confirmDialog } = Gerbera;
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

  /* 秒数を「◯時間◯分◯秒」に開く（換算結果の補足表示用） */
  function spellSeconds(sec) {
    sec = Math.round(sec);
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    let s = '';
    if (hh) s += hh + '時間';
    if (mm) s += mm + '分';
    if (ss || !s) s += ss + '秒';
    return s;
  }
  function trimNum(n) {
    return fmtNum(Math.round(n * 100) / 100);
  }

  register({
    id: 'ptconv', name: 'pt変換', icon: '💱',
    mount(root) {
      const numIn = h('input', { class: 'input', type: 'number', step: 'any', inputmode: 'decimal',
        style: 'font-size:20px;font-weight:900;text-align:center;width:110px',
        value: PT.b, placeholder: '1' });
      const unitSel = h('select', { class: 'input', style: 'width:96px' },
        UNITS.map(u => h('option', { value: u, selected: u === PT.unit || null }, u)));

      /* ---- 換算欄（ptを入れるとその場で答えが出る） ---- */
      const ptIn = h('input', { class: 'input', type: 'number', step: 'any', inputmode: 'decimal',
        style: 'font-size:22px;font-weight:900;text-align:center;width:130px',
        placeholder: '0', 'aria-label': '換算したいポイント数' });
      const answerMain = h('div', { class: 'result-main', style: 'font-size:28px' });
      const answerNote = h('div', { class: 'result-note' });
      const answerCard = h('div', { class: 'result-card', style: 'margin-top:10px' },
        h('div', { class: 'result-sub' }, '換算結果'), answerMain, answerNote);

      function paintAnswer() {
        const pt = +ptIn.value;
        if (!ptIn.value.trim() || !isFinite(pt)) {
          answerMain.textContent = '—';
          answerNote.textContent = 'ポイント数を入れると、ここに答えが出ます';
          return;
        }
        const v = pt * PT.b;
        answerMain.textContent = trimNum(v) + PT.unit;
        if (PT.unit === '秒') answerNote.textContent = spellSeconds(v);
        else if (PT.unit === '分') answerNote.textContent = spellSeconds(v * 60);
        else answerNote.textContent = `${fmtNum(pt)}ポイント × ${trimNum(PT.b)}${PT.unit}`;
      }
      ptIn.addEventListener('input', paintAnswer);

      const calcBtn = h('button', { class: 'btn btn-ghost btn-full mt8',
        onclick: () => Gerbera.openCommonTool('calc') }, '🧮 電卓を開く');

      /* 換算欄にptが入っていればその秒数を、空なら変換式そのものをタイマーへ送る */
      function timerSeconds() {
        const pt = +ptIn.value;
        const base = (ptIn.value.trim() && isFinite(pt) && pt > 0) ? pt * PT.b : (+numIn.value || 0);
        return unitSel.value === '分' ? base * 60 : base;
      }
      const timerBtn = h('button', { class: 'btn btn-lav btn-full mt8',
        onclick: () => {
          const sec = timerSeconds();
          if (!(unitSel.value === '秒' || unitSel.value === '分') || sec <= 0) {
            toast('秒か分の変換式にしてから使ってね');
            return;
          }
          const apply = () => {
            Gerbera.Timer.reset();
            Gerbera.Timer.setDuration(Math.round(sec));
            toast('⏰ タイマーに反映しました');
          };
          /* 耐久配信の計測中に押してしまうと戻せないので、動いている・
             途中で止めてあるときだけ確認する */
          const T = Gerbera.Timer;
          const midway = T.remainMs > 0 && T.remainMs !== T.duration * 1000;
          if (T.running || midway) {
            confirmDialog(
              `計測中のタイマーを止めて、${spellSeconds(sec)}に置きかえます。よろしいですか？`,
              apply, { title: 'タイマーを上書きします', okLabel: '置きかえる' });
            return;
          }
          apply();
        } }, '⏰ 変換内容をタイマーに反映');

      function paintTimerBtn() {
        timerBtn.hidden = !(unitSel.value === '秒' || unitSel.value === '分');
      }

      function apply() {
        const b = +numIn.value || 0;
        PT.set(b, unitSel.value);
        paintTimerBtn();
        paintAnswer();
      }
      function applyWithFeedback() {
        apply();
        toast('✓ 変換式を反映しました');
      }
      numIn.addEventListener('keydown', e => { if (e.key === 'Enter') { applyWithFeedback(); numIn.blur(); } });
      numIn.addEventListener('blur', apply);
      unitSel.addEventListener('change', applyWithFeedback);

      paintTimerBtn();
      paintAnswer();

      root.append(
        h('div', { class: 'card' },
          h('div', { class: 'section-label' }, '🔁 変換式'),
          h('div', { class: 'hstack', style: 'justify-content:center;flex-wrap:wrap;gap:10px;margin-top:4px' },
            h('span', { style: 'font-size:17px;font-weight:900' }, '1 ポイント'),
            h('span', { style: 'font-size:17px;font-weight:900;color:var(--text-sub)' }, '＝'),
            numIn, unitSel),
          h('p', { class: 'note center mt8' }, '数字や単位を変えたら、Enterキーで反映されます（電卓にも反映）')),
        h('div', { class: 'card' },
          h('div', { class: 'section-label' }, '💱 換算する'),
          h('div', { class: 'hstack', style: 'justify-content:center;flex-wrap:wrap;gap:10px;margin-top:4px' },
            ptIn,
            h('span', { style: 'font-size:17px;font-weight:900' }, 'ポイント')),
          answerCard,
          calcBtn,
          timerBtn)
      );
    }
  });
})();
