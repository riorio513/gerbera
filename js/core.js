'use strict';
/* ============================================================
   ガーベラ コア
   - Store: ローカルストレージの薄いラッパー。
     保存の入出力をここに集約し、将来ログイン・クラウド同期を
     追加するときはこのモジュールだけ差し替えれば済むようにする。
   - ツールレジストリ: 各ツールは register() で自己登録する独立コンポーネント。
   ============================================================ */
window.Gerbera = (function () {
  const PREFIX = 'gerbera:';

  const Store = {
    get(key, def) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? def : JSON.parse(raw);
      } catch (e) {
        return def;
      }
    },
    set(key, val) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); } catch (e) { /* 容量超過など */ }
    },
    remove(key) {
      try { localStorage.removeItem(PREFIX + key); } catch (e) {}
    }
  };

  /* ---- ツールレジストリ ----
     tool = { id, name, icon, mount(rootEl) => cleanup関数(任意) } */
  const tools = new Map();
  function register(tool) { tools.set(tool.id, tool); }
  function getTool(id) { return tools.get(id); }

  /* ---- DOMヘルパー ---- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(9)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function emitter() {
    const subs = new Set();
    return {
      on(fn) { subs.add(fn); return () => subs.delete(fn); },
      emit(...args) { subs.forEach(fn => { try { fn(...args); } catch (e) {} }); }
    };
  }

  /* ---- トースト通知 ---- */
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ---- 表示フォーマット ---- */
  function fmtNum(n) { return Number(n).toLocaleString('ja-JP'); }
  function pad2(n) { return String(n).padStart(2, '0'); }

  /* ミリ秒 → "m:ss" / "h:mm:ss"（withTenth で 1/10 秒付き） */
  function fmtClock(ms, withTenth) {
    ms = Math.max(0, ms);
    const tenth = Math.floor(ms / 100) % 10;
    const s = Math.floor(ms / 1000);
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    const base = (hh > 0 ? hh + ':' + pad2(mm) : String(mm)) + ':' + pad2(ss);
    return withTenth ? base + '.' + tenth : base;
  }

  /* ---- 通知音（タイマー終了など） ---- */
  let actx = null;
  function ensureAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { actx = new AC(); } catch (e) {} }
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function chime() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const notes = [659.25, 783.99, 1046.5]; // E5 G5 C6
    for (let rep = 0; rep < 3; rep++) {
      notes.forEach((f, i) => {
        const t0 = ctx.currentTime + rep * 0.55 + i * 0.12;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + 0.45);
      });
    }
  }

  /* ---- X（旧Twitter）投稿画面を開く ---- */
  function openX(text) {
    window.open('https://x.com/intent/post?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  return { Store, register, getTool, tools, h, uid, emitter, toast, fmtNum, pad2, fmtClock, ensureAudio, chime, openX };
})();
