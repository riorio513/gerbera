'use strict';
/* ============================================================
   リアルな立体6面ダイス コンポーネント
   - 「造形（マテリアル・動的ライティング）」と「ボタン押下で転がして
     指定の目を上に向ける」挙動だけを持つ。何の目が出るかという
     抽選ロジックはここでは一切決めない（呼び出し側が roll(value) で渡す）。
   - ガーベラの配色トークン（--main 系）に合わせたアクリル風の赤みピンク素材。
   - d6専用（realistic cube pipsはサイコロの構造上6面固定）。
     6面以外のダイスは呼び出し側で従来のフラットな演出にフォールバックする。
   ============================================================ */
(function () {
  const PIP_LAYOUT = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[26, 26], [50, 50], [74, 74]],
    4: [[30, 30], [70, 30], [30, 70], [70, 70]],
    5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
    6: [[30, 24], [70, 24], [30, 50], [70, 50], [30, 76], [70, 76]]
  };
  const FACES = [
    { name: 'front', value: 1, rot: 'rotateY(0deg)' },
    { name: 'back', value: 6, rot: 'rotateY(180deg)' },
    { name: 'right', value: 3, rot: 'rotateY(90deg)' },
    { name: 'left', value: 4, rot: 'rotateY(-90deg)' },
    { name: 'top', value: 2, rot: 'rotateX(90deg)' },
    { name: 'bottom', value: 5, rot: 'rotateX(-90deg)' }
  ];
  /* 各目をカメラ正面（ワールド法線が+Z）に向けるための cube 目標角。対面の和は必ず7。
     ※実際のDOM構造（各faceのrotateX/Y + translateZ合成）に対してDOMMatrixで
     ワールド法線を計算し、どの目が正面を向くかを検証した上で決定した値。 */
  const TARGET = {
    1: { x: 0, y: 0 }, 2: { x: -90, y: 0 }, 3: { x: 0, y: -90 },
    4: { x: 0, y: 90 }, 5: { x: 90, y: 0 }, 6: { x: 0, y: 180 }
  };

  const { h } = Gerbera;

  function normalize(x, y, z) {
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    return [x / len, y / len, z / len];
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  const STAGE_NOD = new DOMMatrix('rotateX(13deg)');
  const LIGHT = normalize(-0.42, -0.80, 0.55); // 画面の左上前方から（CSSは+Yが下なのでyは負）

  /* ---- 動的ライティングは全インスタンス共通の1本のrAFループでまとめて更新する ---- */
  const liveInstances = new Set();
  let rafId = null;
  function loop() {
    liveInstances.forEach(inst => inst._updateLighting());
    rafId = liveInstances.size ? requestAnimationFrame(loop) : null;
  }
  function ensureLoop() { if (!rafId) rafId = requestAnimationFrame(loop); }

  function buildFace(face) {
    const pips = (PIP_LAYOUT[face.value] || []).map(([x, y]) =>
      h('span', { class: 'die3d-pip', style: `left:${x}%;top:${y}%` }));
    return h('div', { class: `die3d-face f-${face.name}` }, pips);
  }

  function createDie3D(mountEl) {
    const faceEls = {};
    const cube = h('div', { class: 'die3d-cube' }, FACES.map(f => {
      const el = buildFace(f);
      faceEls[f.name] = el;
      return el;
    }));
    const wrap = h('div', { class: 'die3d-wrap' }, cube);
    const contact = h('div', { class: 'die3d-contact' });
    const stage = h('div', { class: 'die3d-stage' }, wrap, contact);
    mountEl.appendChild(stage);

    let rx = 0, ry = 0; // 初期状態は「1」の目が正面（TARGET[1]と一致）
    cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;

    let H = (stage.clientWidth || 96) / 2;
    function recalcH() { H = (stage.clientWidth || 96) / 2; }
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(recalcH) : null;
    if (ro) ro.observe(stage);
    recalcH();

    const reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const inst = {
      _updateLighting() {
        const cs = getComputedStyle(cube).transform;
        const cubeMatrix = (cs && cs !== 'none') ? new DOMMatrix(cs) : new DOMMatrix();
        const world = STAGE_NOD.multiply(cubeMatrix);
        FACES.forEach(f => {
          const local = new DOMMatrix(f.rot).translate(0, 0, H);
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
          // 見た目の勢いをつける「余分な回転」は、正規化(mod 360)後に必ず
          // 打ち消えるよう整数回転（360の整数倍）でなければならない。
          // 小数倍だと最終停止角がTARGETからずれ、出目と表示が食い違う。
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
          // transitionendを主とし、稀に発火しない環境（タブ非アクティブ化等）に
          // 備えてタイマーを保険として併用する。どちらが先に来ても必ず同じ
          // 最終角（TARGET）へ正規化して着地するため、途中で止まることはない。
          const onEnd = e => { if (e.target === cube && e.propertyName === 'transform') finish(); };
          cube.addEventListener('transitionend', onEnd);
          const fallback = setTimeout(finish, dur + 150);
          inst._cancelTimer = fallback;
          // destroy()で中断したときも必ず解決させる（待ち続けると呼び出し側が固まる）
          inst._cancelListener = () => {
            cube.removeEventListener('transitionend', onEnd);
            if (!done) { done = true; resolve(); }
          };
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

  Gerbera.createDie3D = createDie3D;
})();
