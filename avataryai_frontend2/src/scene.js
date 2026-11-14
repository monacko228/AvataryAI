// AvataryAI — 3D сцена: кімната з GLB + персонаж з окремих блоків.
// Персонаж має дві пози з Blender (сидить / думає). Між ними плавний перехід,
// поверх нього — дихання, моргання, рот-прямокутник і погляд за курсором.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RIG from './rig.json';

// ── Налаштування вигляду (міняй тут) ──────────────────────────────
const MODEL_URL = 'models/room.glb';
const PALETTE = {
  head:   0xf1dcc8,   // шкіра
  hoodie: 0x7b61ff,   // худі (колір бренду)
  jeans:  0x3d4478,   // штани
  face:   0x15121f,   // очі та рот
};
// Перший колір — "білий з Blender", якщо хочеш повернути оригінал:
// const PALETTE = { head: 0xffffff, hoodie: 0xffffff, jeans: 0xffffff, face: 0x15121f };

const PART_COLOR = {
  head: 'head', torso: 'hoodie', upperL: 'hoodie', upperR: 'hoodie', foreL: 'hoodie', foreR: 'hoodie',
  pelvis: 'jeans', thighL: 'jeans', thighR: 'jeans', shinL: 'jeans', shinR: 'jeans',
};

const V3 = THREE.Vector3, Q = THREE.Quaternion;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const ease = (t) => t * t * (3 - 2 * t);

function drawPainting(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2a1f6e'); sky.addColorStop(0.45, '#7b61ff');
  sky.addColorStop(0.75, '#ff9ec4'); sky.addColorStop(1, '#ffd8a8');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  // зірки
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  for (let i = 0; i < 40; i++) {
    const x = (Math.sin(i * 91.3) * 0.5 + 0.5) * w, y = (Math.sin(i * 37.7) * 0.5 + 0.5) * h * 0.4;
    ctx.fillRect(x, y, 2, 2);
  }
  // сонце
  const sun = ctx.createRadialGradient(w * 0.68, h * 0.62, 4, w * 0.68, h * 0.62, h * 0.32);
  sun.addColorStop(0, '#fff7d6'); sun.addColorStop(0.35, '#ffd27a'); sun.addColorStop(1, 'rgba(255,170,120,0)');
  ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(w * 0.68, h * 0.62, h * 0.32, 0, 7); ctx.fill();
  // гори
  const ridge = (base, amp, color, seed) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      ctx.lineTo(x, base + Math.sin(x * 0.011 + seed) * amp + Math.sin(x * 0.037 + seed * 2) * amp * 0.35);
    }
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  };
  ridge(h * 0.68, 26, '#5a3fb8', 1); ridge(h * 0.78, 22, '#3a2a86', 3); ridge(h * 0.88, 16, '#1d1550', 5);
}

export async function createAvatarScene(container, opts = {}) {
  const bubbleEl = opts.bubble || null;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Рендерер ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 400);

  // ── Світло ──
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x8a7560, 1.35));
  const key = new THREE.DirectionalLight(0xffe6c8, 2.1);
  key.position.set(-10, 52, -52); key.target.position.set(-1.5, 3, -15);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 220 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.04; key.shadow.radius = 4;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9d8cff, 0.55);
  rim.position.set(34, 22, 12); scene.add(rim);

  // ── Кімната з GLB ──
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  gltf.scene.updateMatrixWorld(true);
  const room = new THREE.Group();
  for (const child of [...gltf.scene.children]) {
    const box = new THREE.Box3().setFromObject(child);
    const cx = (box.min.x + box.max.x) / 2;
    const id = child.name.replace(/\W/g, '');
    if (cx < -60) continue;          // друга копія кімнати (поза «думає») — не потрібна
    if (id === 'Cube005') continue;  // оригінальний персонаж замінюємо власним ригом
    room.add(child);
  }
  // Кімнату з Blender зроблено ширшою й вищою, ніж потрібно (підлога й стіна вилазять за бічні стіни).
  // Підрізаємо її до компактного «діорама»-вигляду, не чіпаючи сам файл.
  const fitBox = (id, r) => {
    const obj = room.children.find((c) => c.name.replace(/\W/g, '') === id);
    if (!obj) return;
    const holder = new THREE.Group();
    room.remove(obj); holder.add(obj); room.add(holder);
    holder.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj), size = b.getSize(new V3());
    for (const ax of ['x', 'y', 'z']) if (r[ax] && size[ax] > 1e-6) holder.scale[ax] = (r[ax][1] - r[ax][0]) / size[ax];
    holder.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(obj), c2 = b2.getCenter(new V3());
    const want = c2.clone();
    for (const ax of ['x', 'y', 'z']) if (r[ax]) want[ax] = (r[ax][0] + r[ax][1]) / 2;
    holder.position.add(want.sub(c2));
  };
  const X0 = -17, X1 = 17, WT = 3, ZF = -30, ZB = 0.2, YB = -5.1, YT = 25;
  fitBox('Cube009', { x: [X0, X1], z: [ZF, ZB] });               // підлога
  fitBox('Cube008', { x: [X0, X1], y: [YB, YT] });               // задня стіна
  fitBox('Cube018', { x: [X0, X0 + WT], y: [YB, YT], z: [ZF, ZB] }); // ліва стіна
  fitBox('Cube017', { x: [X1 - WT, X1], y: [YB, YT], z: [ZF, ZB] }); // права стіна
  fitBox('Cube003', { x: [X0 + WT, X1 - WT] });                  // плінтус ззаду
  fitBox('Cube001', { x: [X0 + WT - 0.6, X0 + WT + 0.5], z: [ZF, -4.7] }); // плінтус зліва
  fitBox('Cube002', { x: [X1 - WT - 0.5, X1 - WT + 0.6], z: [ZF, -4.7] }); // плінтус справа
  const big = new Set(['Cube009', 'Cube008', 'Cube018', 'Cube017']);
  room.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = !big.has(o.name.replace(/\W/g, ''));   // великі стіни тінь не кидають
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => { m.metalness = 0; m.roughness = 0.88; });
  });
  scene.add(room);

  // Картина на задній стіні (внутрішня грань стіни z = -4.8)
  const pc = document.createElement('canvas'); pc.width = 840; pc.height = 540;
  drawPainting(pc.getContext('2d'), pc.width, pc.height);
  const paintTex = new THREE.CanvasTexture(pc); paintTex.colorSpace = THREE.SRGBColorSpace; paintTex.anisotropy = 8;
  const painting = new THREE.Group();
  const frameBox = new THREE.Mesh(new THREE.BoxGeometry(15.4, 10.4, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.6 }));
  const mat = new THREE.Mesh(new THREE.BoxGeometry(14.6, 9.6, 0.62), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.9 }));
  const canvasPlane = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 8.6), new THREE.MeshStandardMaterial({ map: paintTex, roughness: 0.8 }));
  canvasPlane.position.z = -0.33;
  canvasPlane.rotation.y = Math.PI;       // дивиться в бік камери (−z)
  painting.add(frameBox, mat, canvasPlane);
  painting.position.set(-3, 17.5, -5.2);
  painting.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(painting);

  // ── Персонаж ──
  const mats = {};
  for (const [k, c] of Object.entries(PALETTE)) mats[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
  const character = new THREE.Group();
  const P = {};
  for (const [name, d] of Object.entries(RIG)) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(d.dims[0], d.dims[1], d.dims[2]), mats[PART_COLOR[name]]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    character.add(mesh);
    P[name] = {
      mesh, dims: d.dims,
      pA: new V3(...d.posA), qA: new Q(...d.quatA).normalize(),
      pB: new V3(...d.posB), qB: new Q(...d.quatB).normalize(),
    };
  }
  scene.add(character);

  // Передпідрахунок: передпліччя відносно плеча — щоб рука не розвалювалась під час переходу
  const rel = {};
  for (const s of ['L', 'R']) {
    const up = P['upper' + s], fo = P['fore' + s];
    const mk = (pu, qu, pf, qf) => ({
      pos: pf.clone().sub(pu).applyQuaternion(qu.clone().invert()),
      q: qu.clone().invert().multiply(qf),
    });
    rel[s] = { A: mk(up.pA, up.qA, fo.pA, fo.qA), B: mk(up.pB, up.qB, fo.pB, fo.qB) };
  }

  // Обличчя: очі + рот (чорний прямокутник, який розтягується по вертикалі)
  const head = P.head, hx = head.dims[0] / 2, hy = head.dims[1] / 2, hz = head.dims[2] / 2;
  const faceMat = new THREE.MeshBasicMaterial({ color: PALETTE.face });
  const eyeGeo = new THREE.BoxGeometry(0.3, 0.52, 0.06);
  const eyeL = new THREE.Mesh(eyeGeo, faceMat), eyeR = new THREE.Mesh(eyeGeo, faceMat);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.06), faceMat);
  const faceZ = -hz - 0.025;            // перед голови = −z у локальних координатах
  eyeL.position.set(0.66, 0.32, faceZ); eyeR.position.set(-0.66, 0.32, faceZ);
  mouth.position.set(0, -0.56, faceZ);
  head.mesh.add(eyeL, eyeR, mouth);

  // ── Стан ──
  const S = {
    state: 'idle', think: 0, mouth: 0, mouthTarget: 0, mouthSetAt: -1e9,
    mx: 0, my: 0, lx: 0, ly: 0, blinkAt: 2.5, blinkT: -1, t: 0,
  };
  window.addEventListener('pointermove', (e) => {
    const r = container.getBoundingClientRect();
    S.mx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.5, 1.5);
    S.my = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1.5, 1.5);
  }, { passive: true });

  const tmpP = new V3(), tmpQ = new Q(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
  const lookQ = new Q(), neck = new V3(), off = new V3(), headWorld = new V3();

  function pose(k, breath, dt) {
    // Базові пози (lerp/slerp між A і B)
    const base = {};
    for (const n in P) {
      const p = P[n];
      base[n] = { pos: p.pA.clone().lerp(p.pB, k), q: p.qA.clone().slerp(p.qB, k) };
    }
    // Передпліччя — відносно плеча
    for (const s of ['L', 'R']) {
      const u = base['upper' + s];
      const rp = rel[s].A.pos.clone().lerp(rel[s].B.pos, k).applyQuaternion(u.q);
      base['fore' + s] = { pos: u.pos.clone().add(rp), q: u.q.clone().multiply(rel[s].A.q.clone().slerp(rel[s].B.q, k)) };
    }
    // Дихання: легке підняття верху тулуба
    const lift = new V3(0, breath, 0);
    for (const n of ['torso', 'upperL', 'upperR', 'foreL', 'foreR']) base[n].pos.add(lift);

    // Голова: обертання навколо шиї (погляд за курсором, кивки, нахили)
    const hb = base.head;
    const think = S.think;
    const speak = S.state === 'speaking' ? S.mouth : 0;
    const yaw = S.lx * 0.38 * (1 - 0.7 * think) + Math.sin(S.t * 0.45) * 0.05;
    const pitch = S.ly * 0.22 * (1 - 0.7 * think) + Math.sin(S.t * 7.3) * 0.028 * speak + Math.sin(S.t * 0.9) * 0.015;
    const roll = Math.sin(S.t * 0.7) * 0.02 + (think * Math.sin(S.t * 0.6) * 0.03);
    tmpE.set(pitch, yaw, roll); lookQ.setFromEuler(tmpE);
    neck.copy(hb.pos).add(tmpP.set(0, -hy, 0).applyQuaternion(hb.q));
    off.copy(hb.pos).add(lift).sub(neck).applyQuaternion(lookQ);
    hb.pos.copy(neck).add(off);
    hb.q.premultiply(lookQ);

    for (const n in P) { P[n].mesh.position.copy(base[n].pos); P[n].mesh.quaternion.copy(base[n].q); }
    headWorld.copy(hb.pos);
  }

  function face(dt) {
    // Рот: прямокутник. Закритий = тонка риска, відкритий = росте вертикально.
    const talking = S.state === 'speaking';
    const fresh = S.t - S.mouthSetAt < 0.25;     // чи приходять реальні дані з аудіо
    let target = 0;
    if (talking) target = fresh ? S.mouthTarget : (0.35 + 0.35 * Math.sin(S.t * 13) * Math.sin(S.t * 5.3));
    S.mouth = damp(S.mouth, clamp(target, 0, 1), target > S.mouth ? 38 : 22, dt);
    const think = S.think;
    const h = 0.10 + S.mouth * 0.95;
    const w = 1.0 - 0.45 * think - S.mouth * 0.12;
    mouth.scale.set(w, h, 1);
    mouth.position.set(0.28 * think, -0.56 - S.mouth * 0.06, faceZ);
    mouth.rotation.z = -0.12 * think;
    // Очі: моргання + погляд угору/вбік у стані «думає»
    S.blinkAt -= dt;
    if (S.blinkAt <= 0 && S.blinkT < 0) { S.blinkT = 0; }
    let blink = 0;
    if (S.blinkT >= 0) {
      S.blinkT += dt; const u = S.blinkT / 0.16;
      blink = u < 1 ? Math.sin(u * Math.PI) : 0;
      if (u >= 1) { S.blinkT = -1; S.blinkAt = 2.2 + Math.random() * 3.8; }
    }
    const sy = 1 - 0.92 * blink;
    for (const e of [eyeL, eyeR]) { e.scale.y = sy; e.position.y = 0.32 + 0.16 * think; }
    eyeL.position.x = 0.66 + 0.12 * think; eyeR.position.x = -0.66 + 0.12 * think;
  }

  // ── Камера: вписуємо кімнату в будь-яке співвідношення сторін ──
  const target = new V3(0, 9.6, -15);
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function placeCamera() {
    const aspect = camera.aspect, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfH = 19.5, halfW = 21.5;
    const dist = Math.max(halfH / tanH, halfW / (tanH * aspect));
    const sway = reduceMotion ? 0 : 1;
    const yaw = -S.lx * 0.16 * sway + Math.sin(S.t * 0.21) * 0.025 * sway;
    const pit = 0.1 + S.ly * 0.045 * sway;
    camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pit) * dist,
      target.y + Math.sin(pit) * dist,
      target.z - Math.cos(yaw) * Math.cos(pit) * dist,
    );
    camera.lookAt(target);
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // ── Цикл ──
  const clock = new THREE.Clock();
  const ndc = new V3();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    S.t += dt;
    S.lx = damp(S.lx, S.mx, 4, dt); S.ly = damp(S.ly, S.my, 4, dt);
    S.think = damp(S.think, S.state === 'thinking' ? 1 : 0, 5.5, dt);
    const k = ease(clamp(S.think, 0, 1));
    pose(k, Math.sin(S.t * (S.state === 'thinking' ? 1.1 : 1.7)) * 0.05, dt);
    face(dt);
    placeCamera();
    renderer.render(scene, camera);
    if (bubbleEl) {
      ndc.copy(headWorld).add(tmpP.set(0.5, 3.4, 0)).project(camera);
      const w = container.clientWidth, h = container.clientHeight;
      bubbleEl.style.transform = `translate(${(ndc.x * 0.5 + 0.5) * w}px, ${(-ndc.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
      bubbleEl.classList.toggle('show', S.state === 'thinking' && S.think > 0.35);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const api = {
    /** 'idle' | 'thinking' | 'speaking' */
    setState(s) { S.state = s; },
    /** гучність 0..1 з аудіо — керує відкриттям рота */
    setMouth(v) { S.mouthTarget = clamp(v, 0, 1); S.mouthSetAt = S.t; },
    get state() { return S.state; },
  };
  window.AvatarScene = api;
  return api;
}

// Автозапуск, якщо на сторінці є #stage
const stage = document.getElementById('stage');
if (stage) {
  createAvatarScene(stage, { bubble: document.getElementById('think-bubble') })
    .then(() => {
      document.documentElement.classList.add('scene-ready');
      document.dispatchEvent(new CustomEvent('avatar-ready'));
    })
    .catch((e) => { console.error('Scene failed', e); document.documentElement.classList.add('scene-failed'); });
}
