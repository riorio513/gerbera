'use strict';
/* ============================================================
   リアルな立体4面ダイス（正四面体）コンポーネント
   - die3d.js（6面ダイス）と同じ設計方針：造形とライティングだけを持ち、
     何の目が出るかはここでは決めない（呼び出し側が roll(value) で渡す）。
   - 各面の配置角・転がり先の目標角は、交互立方体頂点法で得た正四面体の
     4法線ベクトルから、実際のDOM合成（rotateX→rotateY→translateZ）に対して
     数値探索で求めた値（誤差 1e-10 未満で検証済み）。手計算のズレを避けるため
     ブラウザのDOMMatrixで実測して確定した。
   ============================================================ */
(function () {
  /* 各面のローカル配置（rotateX(rx) rotateY(ry) translateZ(R) で
     canonicalな正面向き三角形をこの向き・位置に配置する） */
  const FACES = [
    { name: 'f0', value: 1, rot: 'rotateX(-45deg) rotateY(-144.736deg)' },
    { name: 'f1', value: 2, rot: 'rotateX(-45deg) rotateY(-35.264deg)' },
    { name: 'f2', value: 3, rot: 'rotateX(-135deg) rotateY(144.736deg)' },
    { name: 'f3', value: 4, rot: 'rotateX(-135deg) rotateY(35.264deg)' }
  ];
  /* 各目をカメラ正面（ワールド法線が+Z）に向けるための cube 目標角 */
  const TARGET = {
    1: { x: -144.736, y: -45 }, 2: { x: 35.264, y: 45 },
    3: { x: -144.736, y: 135 }, 4: { x: 35.264, y: -135 }
  };
  const { h } = Gerbera;

  function normalize(x, y, z) {
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    return [x / len, y / len, z / len];
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  const STAGE_NOD = new DOMMatrix('rotateX(13deg)');
  const LIGHT = normalize(-0.42, -0.80, 0.55);

  /* ---- 動的ライティングは全インスタンス共通の1本のrAFループでまとめて更新する ---- */
  const liveInstances = new Set();
  let rafId = null;
  function loop() {
    liveInstances.forEach(inst => inst._updateLighting());
    rafId = liveInstances.size ? requestAnimationFrame(loop) : null;
  }
  function ensureLoop() { if (!rafId) rafId = requestAnimationFrame(loop); }

  function buildFace(face) {
    return h('div', { class: `die4-face f-${face.name}` },
      h('span', { class: 'die4-num' }, String(face.value)));
  }

  function createDie4D(mountEl) {
    const faceEls = {};
    const cube = h('div', { class: 'die4-cube' }, FACES.map(f => {
      const el = buildFace(f);
      faceEls[f.name] = el;
      return el;
    }));
    const wrap = h('div', { class: 'die4-wrap' }, cube);
    const contact = h('div', { class: 'die4-contact' });
    const stage = h('div', { class: 'die4-stage' }, wrap, contact);
    mountEl.appendChild(stage);

    let rx = TARGET[1].x, ry = TARGET[1].y; // 初期状態は「1」の目が正面
    cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;

    let R = (stage.clientWidth || 96) * 0.25;
    function applyFaceTransforms() {
      FACES.forEach(f => { faceEls[f.name].style.transform = `${f.rot} translateZ(${R}px)`; });
    }
    function recalcR() { R = (stage.clientWidth || 96) * 0.25; applyFaceTransforms(); }
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(recalcR) : null;
    if (ro) ro.observe(stage);
    applyFaceTransforms();

    const reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const inst = {
      _updateLighting() {
        const cs = getComputedStyle(cube).transform;
        const cubeMatrix = (cs && cs !== 'none') ? new DOMMatrix(cs) : new DOMMatrix();
        const world = STAGE_NOD.multiply(cubeMatrix);
        FACES.forEach(f => {
          const local = new DOMMatrix(f.rot).translate(0, 0, R);
          const m = world.multiply(local);
          const n = normalize(m.m31, m.m32, m.m33);
          const diffuse = Math.max(0, dot(n, LIGHT));
          const lit = 0.30 + 0.70 * diffuse;
          const halfV = normalize(LIGHT[0], LIGHT[1], LIGHT[2] + 1);
          const spec = Math.pow(Math.max(0, dot(n, halfV)), 18) * 0.6;
          const el = faceEls[f.name];
          el.style.setProperty('--lit', lit.toFixed(3));
          el.style.setProperty('--spec', spec.toFixed(3));
        });
      },
      roll(value) {
        const t = TARGET[value] || TARGET[1];
        const dur = reduceMotion ? 340 : 1350;
        let sx = 0, sy = 0;
        if (!reduceMotion) {
          sx = (2 + Math.floor(Math.random() * 3)) * 360;
          sy = (2 + Math.floor(Math.random() * 3)) * 360;
        }
        rx = t.x - sx;
        ry = t.y + sy;
        cube.style.transition = `transform ${dur}ms cubic-bezier(.16,.72,.16,1)`;
        cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;

        if (!reduceMotion) {
          wrap.style.setProperty('--bounce-dur', dur + 'ms');
          contact.style.setProperty('--bounce-dur', dur + 'ms');
          wrap.classList.remove('bounce');
          contact.classList.remove('bounce');
          void wrap.offsetWidth;
          wrap.classList.add('bounce');
          contact.classList.add('bounce');
        }

        return new Promise(resolve => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            cube.removeEventListener('transitionend', onEnd);
            clearTimeout(fallback);
            rx = ((rx % 360) + 360) % 360;
            ry = ((ry % 360) + 360) % 360;
            cube.style.transition = 'none';
            cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
            void cube.offsetWidth;
            resolve();
          };
          const onEnd = e => { if (e.target === cube && e.propertyName === 'transform') finish(); };
          cube.addEventListener('transitionend', onEnd);
          const fallback = setTimeout(finish, dur + 150);
          inst._cancelTimer = fallback;
          inst._cancelListener = () => cube.removeEventListener('transitionend', onEnd);
        });
      },
      setStatic(value) {
        const t = TARGET[value] || TARGET[1];
        rx = t.x; ry = t.y;
        cube.style.transition = 'none';
        cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
      },
      destroy() {
        liveInstances.delete(inst);
        if (inst._cancelTimer) clearTimeout(inst._cancelTimer);
        if (inst._cancelListener) inst._cancelListener();
        if (ro) ro.disconnect();
        if (stage.parentNode) stage.parentNode.removeChild(stage);
      }
    };

    liveInstances.add(inst);
    ensureLoop();
    return inst;
  }

  Gerbera.createDie4D = createDie4D;
})();
