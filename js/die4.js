'use strict';
/* ============================================================
   リアルな立体4面ダイス（正四面体）コンポーネント
   - die3d.js（6面ダイス）と同じ設計方針：造形とライティングだけを持ち、
     何の目が出るかはここでは決めない（呼び出し側が roll(value) で渡す）。
   - 各面の配置は「交互立方体頂点法」で得た正四面体の頂点座標から、
     各面の重心・法線・正しい三角形の向き（上向き/下向き）・外接半径に
     対するトランスレーション量の比率をすべて数値的に導出し検証したもの
     （手計算のズレで面が正しく閉じない事故があったため、ブラウザの
     ベクトル計算で実際に頂点位置が一致することを確認して確定した）。
   ============================================================ */
(function () {
  function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  /* 交互立方体頂点法による正四面体の頂点 */
  const V = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  /* 面ごとの構成頂点（除外する頂点の逆順） */
  const FACE_VERT_IDX = [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]];
  const UP = [0, 1, 0];

  /* 各面の法線・ローカル正規直交基底（xAxis, yAxis, N）を算出。
     この基底で local(x,y,0) -> world = R*N + x*xAxis + y*yAxis となる。
     同じ基底で実頂点を射影すると、三角形の向きが面ごとに
     up（▲）/down（▼）で交互になることが分かったため、それぞれ記録する。 */
  const FACE_GEOM = FACE_VERT_IDX.map(idxs => {
    const verts = idxs.map(i => V[i]);
    const centroid = [0, 0, 0];
    verts.forEach(v => { centroid[0] += v[0] / 3; centroid[1] += v[1] / 3; centroid[2] += v[2] / 3; });
    const N = normalize(centroid);
    const xAxis = normalize(cross(UP, N));
    const yAxis = cross(N, xAxis); // N, xAxisは単位ベクトルなので正規化不要
    // 実頂点をこの基底に投影し、「対になる2頂点から離れた1頂点」がy軸のどちら側に
    // あるかで三角形の向きを判定する（正三角形は必ず1頂点が孤立して上か下にある）。
    const lys = verts.map(v => {
      const rel = v.map((x, i) => x - centroid[i]);
      return rel[0] * yAxis[0] + rel[1] * yAxis[1] + rel[2] * yAxis[2];
    });
    const lonely = lys.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0);
    const orient = lonely > 0 ? 'down' : 'up';
    return { N, xAxis, yAxis, orient };
  });

  const FACES = [
    { name: 'f0', value: 1, geom: FACE_GEOM[0] },
    { name: 'f1', value: 2, geom: FACE_GEOM[1] },
    { name: 'f2', value: 3, geom: FACE_GEOM[2] },
    { name: 'f3', value: 4, geom: FACE_GEOM[3] }
  ];
  /* 各目をカメラ正面（ワールド法線が+Z）に向けるための cube 目標角。
     rotateX(rx) rotateY(ry) を Ẑ=(0,0,1) 起点ではなく各面の法線Nそのものに
     適用してẐへ揃える回転として、DOMMatrixで数値探索し検証済み。 */
  const TARGET = {
    1: { x: -144.736, y: -45 }, 2: { x: 35.264, y: 45 },
    3: { x: -144.736, y: 135 }, 4: { x: 35.264, y: -135 }
  };
  /* 外接半径(clip-pathで使う三角形の中心からの距離。box比率42%)に対する
     正四面体の重心距離Rの比率 = 1 / (2√2)（正四面体の幾何から導出・検証済み） */
  const R_RATIO = 1 / (2 * Math.SQRT2);

  const { h } = Gerbera;

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  const STAGE_NOD = { m: null }; // 遅延生成（DOMMatrixはこの関数内で使えるので即時生成でも可）
  STAGE_NOD.m = new DOMMatrix('rotateX(13deg)');
  const LIGHT = normalize([-0.42, -0.80, 0.55]);

  /* ---- 動的ライティングは全インスタンス共通の1本のrAFループでまとめて更新する ---- */
  const liveInstances = new Set();
  let rafId = null;
  function loop() {
    liveInstances.forEach(inst => inst._updateLighting());
    rafId = liveInstances.size ? requestAnimationFrame(loop) : null;
  }
  function ensureLoop() { if (!rafId) rafId = requestAnimationFrame(loop); }

  function buildFace(face) {
    return h('div', { class: `die4-face tri-${face.geom.orient} f-${face.name}` },
      h('span', { class: 'die4-num' }, String(face.value)));
  }

  /* 面のローカル配置行列（回転部分は固定・平行移動だけRに応じて変わる） */
  function faceMatrix(geom, R) {
    const { xAxis, yAxis, N } = geom;
    return new DOMMatrix([
      xAxis[0], xAxis[1], xAxis[2], 0,
      yAxis[0], yAxis[1], yAxis[2], 0,
      N[0], N[1], N[2], 0,
      R * N[0], R * N[1], R * N[2], 1
    ]);
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

    let R = (stage.clientWidth || 96) * 0.42 * R_RATIO;
    function applyFaceTransforms() {
      FACES.forEach(f => { faceEls[f.name].style.transform = faceMatrix(f.geom, R).toString(); });
    }
    function recalcR() { R = (stage.clientWidth || 96) * 0.42 * R_RATIO; applyFaceTransforms(); }
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(recalcR) : null;
    if (ro) ro.observe(stage);
    applyFaceTransforms();

    const reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const inst = {
      _updateLighting() {
        const cs = getComputedStyle(cube).transform;
        const cubeMatrix = (cs && cs !== 'none') ? new DOMMatrix(cs) : new DOMMatrix();
        const world = STAGE_NOD.m.multiply(cubeMatrix);
        FACES.forEach(f => {
          const m = world.multiply(faceMatrix(f.geom, R));
          const n = normalize([m.m31, m.m32, m.m33]);
          const diffuse = Math.max(0, dot(n, LIGHT));
          const lit = 0.30 + 0.70 * diffuse;
          const halfV = normalize([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
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

  Gerbera.createDie4D = createDie4D;
})();
