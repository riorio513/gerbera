'use strict';
/* ツール: タイマー＆ストップウォッチ（1つの画面にまとめたもの）
   計測エンジンは timer.js / stopwatch.js のグローバル単一エンジンを共有する。
   画面を移動しても計測は続き、再読込しても復元される。 */
(function () {
  const { register, Store, h, uid, toast, fmtClock, openX } = Gerbera;
  const KEY_MODE = 'timersw.mode';
  const KEY_P = 'timer.presets';

  function fmtDur(sec) {
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    let s = '';
    if (hh) s += hh + '時間';
    if (mm) s += mm + '分';
    if (ss) s += ss + '秒';
    return s || '0秒';
  }

  register({
    id: 'timersw', name: 'タイマー＆ストップウォッチ', icon: '⏱️',
    mount(root) {
      const T = Gerbera.Timer, SW = Gerbera.Stopwatch;
      let mode = Store.get(KEY_MODE, 'timer');

      const seg = h('div', { class: 'seg' },
        h('button', { onclick: () => setMode('timer') }, '⏰ タイマー'),
        h('button', { onclick: () => setMode('stopwatch') }, '⏱️ ストップウォッチ'));
      const pane = h('div', { class: 'mt12' });
      root.append(seg, pane);

      let cleanup = null;
      function setMode(m) {
        mode = m; Store.set(KEY_MODE, m);
        seg.children[0].classList.toggle('on', m === 'timer');
        seg.children[1].classList.toggle('on', m === 'stopwatch');
        if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
        pane.replaceChildren();
        cleanup = (m === 'timer' ? mountTimer : mountStopwatch)(pane);
      }
      setMode(mode);
      return () => { if (cleanup) cleanup(); };

      /* ---- タイマー ---- */
      function mountTimer(box) {
        let presets = Store.get(KEY_P, [
          { id: uid(), sec: 60 }, { id: uid(), sec: 180 }, { id: uid(), sec: 300 }, { id: uid(), sec: 600 }
        ]);
        const savePresets = () => Store.set(KEY_P, presets);

        const display = h('div', { class: 'display-huge' });
        const startBtn = h('button', { class: 'btn btn-primary btn-big', style: 'min-width:132px',
          onclick: () => (T.running ? T.pause() : T.start()) });
        const resetBtn = h('button', { class: 'btn btn-ghost', onclick: () => T.reset() }, 'リセット');
        const postBtn = h('button', { class: 'btn btn-lav btn-full mt12',
          onclick: () => openX(`【タイマー】\nただいまの記録は${fmtClock(T.remainMs, false)}でした！`) }, '🐦 記録をXへポスト');

        const numIn = (max, label) => h('input', {
          class: 'input w-num', type: 'number', min: 0, max, inputmode: 'numeric', placeholder: '0',
          'aria-label': label, oninput: applyInputs
        });
        const hIn = numIn(23, '時間'), mIn = numIn(59, '分'), sIn = numIn(59, '秒');
        function applyInputs() {
          T.setDuration((+hIn.value || 0) * 3600 + (+mIn.value || 0) * 60 + (+sIn.value || 0));
        }
        function fillInputs() {
          hIn.value = Math.floor(T.duration / 3600) || '';
          mIn.value = Math.floor((T.duration % 3600) / 60) || '';
          sIn.value = T.duration % 60 || '';
        }
        fillInputs();
        const setRow = h('div', { class: 'hstack', style: 'justify-content:center' },
          hIn, h('b', {}, '時'), mIn, h('b', {}, '分'), sIn, h('b', {}, '秒'));

        const presetRow = h('div', { class: 'chip-wrap', style: 'justify-content:center' });
        function paintPresets() {
          presetRow.replaceChildren(
            ...presets.map(p =>
              h('button', { class: 'chip lav', onclick: () => { T.pause(); T.setDuration(p.sec); fillInputs(); } },
                fmtDur(p.sec),
                h('span', { class: 'chip-x', 'aria-label': 'このプリセットを削除',
                  onclick: e => { e.stopPropagation(); presets = presets.filter(x => x.id !== p.id); savePresets(); paintPresets(); } }, '×'))),
            h('button', { class: 'chip', onclick: () => {
              if (T.duration <= 0) { toast('先に時間を設定してね'); return; }
              if (presets.some(p => p.sec === T.duration)) { toast('同じプリセットがあります'); return; }
              presets.push({ id: uid(), sec: T.duration });
              presets.sort((a, b) => a.sec - b.sec);
              savePresets(); paintPresets(); toast('プリセットに保存しました');
            } }, '＋ いまの時間を保存'));
        }
        paintPresets();

        function paintTime() { display.textContent = fmtClock(T.remainMs, false); display.classList.toggle('alarm', T.finished); }
        function paintState() {
          paintTime();
          startBtn.textContent = T.running ? '⏸ 一時停止' : '▶ スタート';
          setRow.style.opacity = T.running ? '.45' : '1';
          setRow.style.pointerEvents = T.running ? 'none' : 'auto';
        }
        paintState();
        const off = T.ev.on(type => { if (type === 'tick') paintTime(); else { paintState(); if (!T.running) fillInputs(); } });

        box.append(
          h('div', { class: 'card center' },
            display,
            h('div', { class: 'hstack mt12', style: 'justify-content:center' }, startBtn, resetBtn),
            h('div', { class: 'mt12' }, setRow),
            postBtn,
            h('details', { class: 'editor', style: 'margin-top:10px;text-align:left' },
              h('summary', {}, '💾 プリセット'),
              h('div', { class: 'editor-body' }, presetRow))));
        return () => off();
      }

      /* ---- ストップウォッチ ---- */
      function mountStopwatch(box) {
        const display = h('div', { class: 'display-huge' });
        const startBtn = h('button', { class: 'btn btn-primary btn-big', style: 'min-width:132px',
          onclick: () => (SW.running ? SW.stop() : SW.start()) });
        const lapBtn = h('button', { class: 'btn btn-ghost', onclick: () => SW.lap() }, '🚩 ラップ');
        const resetBtn = h('button', { class: 'btn btn-ghost', onclick: () => SW.reset() }, 'リセット');
        const postBtn = h('button', { class: 'btn btn-lav btn-full mt12',
          onclick: () => openX(`【ストップウォッチ】\nただいまの記録は${fmtClock(SW.now(), true)}でした！`) }, '🐦 記録をXへポスト');
        const lapList = h('div');

        function paintTime() { display.textContent = fmtClock(SW.now(), true); }
        function paintState() {
          paintTime();
          startBtn.textContent = SW.running ? '⏸ ストップ' : '▶ スタート';
          lapList.replaceChildren(...SW.laps.map((ms, i) => {
            const prev = SW.laps[i + 1] || 0;
            return h('div', { class: 'list-row' },
              h('span', { class: 'badge' }, 'LAP ' + (SW.laps.length - i)),
              h('span', { class: 'row-main mono' }, fmtClock(ms, true)),
              h('span', { class: 'row-sub mono' }, '+' + fmtClock(ms - prev, true)));
          }));
        }
        paintState();
        const off = SW.ev.on(type => { if (type === 'tick') paintTime(); else paintState(); });

        box.append(
          h('div', { class: 'card center' },
            display,
            h('div', { class: 'hstack mt12', style: 'justify-content:center;flex-wrap:wrap' }, startBtn, lapBtn, resetBtn),
            postBtn,
            h('div', { class: 'section-label', style: 'margin:12px 2px 4px;text-align:left' }, '🚩 ラップタイム'),
            h('div', { style: 'max-height:200px;overflow-y:auto' }, lapList)));
        return () => off();
      }
    }
  });
})();
