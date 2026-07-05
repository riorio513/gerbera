'use strict';
/* ツール: ストップウォッチ（開始・停止・リセット・ラップ）
   グローバル単一エンジン: 画面を移動しても計測が続き、再読込しても復元される */
(function () {
  const { register, Store, h, fmtClock, emitter } = Gerbera;
  const KEY = 'stopwatch.state';

  const SW = {
    running: false, startedAt: 0, acc: 0, laps: [],
    ev: emitter(), _timer: null,

    now() { return this.acc + (this.running ? Date.now() - this.startedAt : 0); },
    persist() {
      Store.set(KEY, { running: this.running, startedAt: this.startedAt, acc: this.acc, laps: this.laps });
    },
    _tickStart() {
      clearInterval(this._timer);
      this._timer = setInterval(() => this.ev.emit('tick'), 100);
    },
    start() {
      if (this.running) return;
      this.running = true;
      this.startedAt = Date.now();
      this._tickStart();
      this.persist();
      this.ev.emit('state');
    },
    stop() {
      if (!this.running) return;
      this.acc = this.now();
      this.running = false;
      clearInterval(this._timer);
      this.persist();
      this.ev.emit('state');
    },
    reset() {
      this.running = false;
      this.acc = 0;
      this.laps = [];
      clearInterval(this._timer);
      this.persist();
      this.ev.emit('state');
    },
    lap() {
      if (this.now() === 0) return;
      this.laps.unshift(this.now());
      this.persist();
      this.ev.emit('state');
    },
    restore() {
      const s = Store.get(KEY, null);
      if (!s) return;
      this.running = !!s.running;
      this.startedAt = s.startedAt || 0;
      this.acc = s.acc || 0;
      this.laps = s.laps || [];
      if (this.running) this._tickStart();
    }
  };
  SW.restore();
  Gerbera.Stopwatch = SW;

  register({
    id: 'stopwatch', name: 'ストップウォッチ', icon: '⏱️',
    mount(root) {
      const display = h('div', { class: 'display-huge' });
      const startBtn = h('button', { class: 'btn btn-primary btn-big', style: 'min-width:132px',
        onclick: () => SW.running ? SW.stop() : SW.start() });
      const lapBtn = h('button', { class: 'btn btn-ghost', onclick: () => SW.lap() }, '🚩 ラップ');
      const resetBtn = h('button', { class: 'btn btn-ghost', onclick: () => SW.reset() }, 'リセット');
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

      const off1 = SW.ev.on(type => { if (type === 'tick') paintTime(); else paintState(); });

      root.append(
        h('div', { class: 'card center' },
          display,
          h('div', { class: 'hstack mt12', style: 'justify-content:center;flex-wrap:wrap' },
            startBtn, lapBtn, resetBtn)),
        h('div', { class: 'card', hidden: false }, h('div', { class: 'section-label' }, '🚩 ラップタイム'), lapList)
      );
      return () => off1();
    }
  });
})();
