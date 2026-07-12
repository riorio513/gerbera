'use strict';
/* ツール: タイマー（自由な時間指定・カウントダウン・終了通知音・プリセット保存）
   グローバル単一エンジン: 画面を移動しても動き続け、再読込しても復元される */
(function () {
  const { register, Store, h, uid, toast, fmtClock, emitter, ensureAudio, chime, openX } = Gerbera;
  const KEY = 'timer.state';
  const KEY_P = 'timer.presets';

  const T = {
    duration: 300,      // 設定時間（秒）
    remainMs: 300000,   // 残り（ミリ秒）
    running: false,
    endAt: 0,
    finished: false,
    ev: emitter(), _timer: null,

    persist() {
      Store.set(KEY, {
        duration: this.duration, remainMs: this.remainMs,
        running: this.running, endAt: this.endAt
      });
    },
    _tickStart() {
      clearInterval(this._timer);
      this._timer = setInterval(() => {
        this.remainMs = this.endAt - Date.now();
        if (this.remainMs <= 0) {
          this.remainMs = 0;
          this.running = false;
          this.finished = true;
          clearInterval(this._timer);
          this.persist();
          chime();
          toast('⏰ タイマーが終了しました！');
          this.ev.emit('state');
        } else {
          this.ev.emit('tick');
        }
      }, 200);
    },
    setDuration(sec) {
      this.duration = Math.max(0, Math.floor(sec));
      this.remainMs = this.duration * 1000;
      this.finished = false;
      this.persist();
      this.ev.emit('state');
    },
    start() {
      if (this.running) return;
      if (this.remainMs <= 0) this.remainMs = this.duration * 1000;
      if (this.remainMs <= 0) { toast('時間を設定してね'); return; }
      ensureAudio(); // ユーザー操作のタイミングで音声を有効化しておく
      this.running = true;
      this.finished = false;
      this.endAt = Date.now() + this.remainMs;
      this._tickStart();
      this.persist();
      this.ev.emit('state');
    },
    pause() {
      if (!this.running) return;
      this.remainMs = Math.max(0, this.endAt - Date.now());
      this.running = false;
      clearInterval(this._timer);
      this.persist();
      this.ev.emit('state');
    },
    reset() {
      this.running = false;
      this.finished = false;
      this.remainMs = this.duration * 1000;
      clearInterval(this._timer);
      this.persist();
      this.ev.emit('state');
    },
    restore() {
      const s = Store.get(KEY, null);
      if (!s) return;
      this.duration = s.duration || 300;
      this.remainMs = s.remainMs != null ? s.remainMs : this.duration * 1000;
      if (s.running) {
        if (s.endAt > Date.now()) {
          this.running = true;
          this.endAt = s.endAt;
          this._tickStart();
        } else {
          this.remainMs = 0;
          this.finished = true;
        }
      }
    }
  };
  T.restore();
  Gerbera.Timer = T;

  function fmtDur(sec) {
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    let s = '';
    if (hh) s += hh + '時間';
    if (mm) s += mm + '分';
    if (ss) s += ss + '秒';
    return s || '0秒';
  }

  register({
    id: 'timer', name: 'タイマー', icon: '⏰',
    mount(root) {
      let presets = Store.get(KEY_P, [
        { id: uid(), sec: 60 }, { id: uid(), sec: 180 }, { id: uid(), sec: 300 }, { id: uid(), sec: 600 }
      ]);
      const savePresets = () => Store.set(KEY_P, presets);

      const display = h('div', { class: 'display-huge' });
      const startBtn = h('button', { class: 'btn btn-primary btn-big', style: 'min-width:132px',
        onclick: () => T.running ? T.pause() : T.start() });
      const resetBtn = h('button', { class: 'btn btn-ghost', onclick: () => T.reset() }, 'リセット');
      const postBtn = h('button', { class: 'btn btn-lav btn-full mt12',
        onclick: () => openX(`【タイマー】\nただいまの記録は${fmtClock(T.remainMs, false)}でした！`) }, '🐦 記録をXへポスト');

      const numIn = (max, label) => h('input', {
        class: 'input w-num', type: 'number', min: 0, max, inputmode: 'numeric', placeholder: '0',
        'aria-label': label,
        oninput: applyInputs
      });
      const hIn = numIn(23, '時間'), mIn = numIn(59, '分'), sIn = numIn(59, '秒');

      function applyInputs() {
        const sec = (+hIn.value || 0) * 3600 + (+mIn.value || 0) * 60 + (+sIn.value || 0);
        T.setDuration(sec);
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
            h('button', { class: 'chip lav', onclick: () => { T.reset && T.pause(); T.setDuration(p.sec); fillInputs(); } },
              fmtDur(p.sec),
              h('span', { class: 'chip-x', 'aria-label': 'このプリセットを削除',
                onclick: e => {
                  e.stopPropagation();
                  presets = presets.filter(x => x.id !== p.id);
                  savePresets();
                  paintPresets();
                } }, '×'))),
          h('button', { class: 'chip', onclick: () => {
            if (T.duration <= 0) { toast('先に時間を設定してね'); return; }
            if (presets.some(p => p.sec === T.duration)) { toast('同じプリセットがあります'); return; }
            presets.push({ id: uid(), sec: T.duration });
            presets.sort((a, b) => a.sec - b.sec);
            savePresets();
            paintPresets();
            toast('プリセットに保存しました');
          } }, '＋ いまの時間を保存'));
      }
      paintPresets();

      function paintTime() {
        display.textContent = fmtClock(T.remainMs, false);
        display.classList.toggle('alarm', T.finished);
      }
      function paintState() {
        paintTime();
        startBtn.textContent = T.running ? '⏸ 一時停止' : '▶ スタート';
        setRow.style.opacity = T.running ? '.45' : '1';
        setRow.style.pointerEvents = T.running ? 'none' : 'auto';
      }
      paintState();

      const off = T.ev.on(type => { if (type === 'tick') paintTime(); else { paintState(); if (!T.running) fillInputs(); } });

      root.append(
        h('div', { class: 'card center' },
          display,
          h('div', { class: 'hstack mt12', style: 'justify-content:center' }, startBtn, resetBtn),
          h('div', { class: 'mt16' }, setRow),
          postBtn),
        h('div', { class: 'card' },
          h('div', { class: 'section-label' }, '💾 プリセット'),
          presetRow)
      );
      return () => off();
    }
  });
})();
