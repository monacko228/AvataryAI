// AvataryAI — 3D сцена: затишна кімната (GLB з Blender + деталі) і персонаж з окремих блоків.
// Персонаж має дві пози з Blender (сидить / думає) з плавним переходом.
// Поверх: дихання, моргання, брови, рот-прямокутник під гучність голосу.
// Камера нерухома: за курсором стежить тільки голова та очі персонажа.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RIG from './rig.json';

// ── Налаштування вигляду (міняй тут) ──────────────────────────────
const MODEL_URL = 'models/room.glb';
const PALETTE = {
  head:   0xf1dcc8,   // шкіра
  skin2:  0xe2bfa3,   // ніс
  hoodie: 0x7b61ff,   // худі (колір бренду)
  hoodie2: 0x5a44cc,  // комір
  jeans:  0x3d4478,   // штани
  face:   0x15121f,   // очі та рот
  hair:   0x2a2233,   // волосся та брови
  gear:   0x262238,   // навушники
  shoe:   0xf4f1ec,   // кросівки
  sole:   0x8a86a0,
  blush:  0xf08f93,
};
const ROOM_H = 36;                 // висота стін
const CX = -1.45;                  // вісь кімнати (по персонажу)
const Z_BACK = -4.7;               // внутрішня грань задньої стіни
const Z_CHAR = -15;                // де сидить персонаж
const FOV = 36;
const HALF_H = 14.6;               // скільки по вертикалі має влізти навколо персонажа
const HALF_W = 12.6;               // і по горизонталі

const PART_COLOR = {
  head: 'head', torso: 'hoodie', upperL: 'hoodie', upperR: 'hoodie', foreL: 'hoodie', foreR: 'hoodie',
  pelvis: 'jeans', thighL: 'jeans', thighR: 'jeans', shinL: 'jeans', shinR: 'jeans',
};

const V3 = THREE.Vector3, Q = THREE.Quaternion;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const ease = (t) => t * t * (3 - 2 * t);
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function canvasTex(w, h, draw, { repeat = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function drawPainting(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2a1f6e'); sky.addColorStop(0.45, '#7b61ff');
  sky.addColorStop(0.75, '#ff9ec4'); sky.addColorStop(1, '#ffd8a8');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  for (let i = 0; i < 40; i++) {
    const x = (Math.sin(i * 91.3) * 0.5 + 0.5) * w, y = (Math.sin(i * 37.7) * 0.5 + 0.5) * h * 0.4;
    ctx.fillRect(x, y, 2, 2);
  }
  const sun = ctx.createRadialGradient(w * 0.68, h * 0.62, 4, w * 0.68, h * 0.62, h * 0.32);
  sun.addColorStop(0, '#fff7d6'); sun.addColorStop(0.35, '#ffd27a'); sun.addColorStop(1, 'rgba(255,170,120,0)');
  ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(w * 0.68, h * 0.62, h * 0.32, 0, 7); ctx.fill();
  const ridge = (base, amp, color, s) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      ctx.lineTo(x, base + Math.sin(x * 0.011 + s) * amp + Math.sin(x * 0.037 + s * 2) * amp * 0.35);
    }
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  };
  ridge(h * 0.68, 26, '#5a3fb8', 1); ridge(h * 0.78, 22, '#3a2a86', 3); ridge(h * 0.88, 16, '#1d1550', 5);
}

function drawWall(hex) {
  return (ctx, w, h) => {
    ctx.fillStyle = hex; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { ctx.fillStyle = 'rgba(255,255,255,.055)'; ctx.fillRect(x, 0, 32, h); }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,40,.04)';
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  };
}

function drawFloor(hex) {
  return (ctx, w, h) => {
    ctx.fillStyle = hex; ctx.fillRect(0, 0, w, h);
    const n = 8, pw = w / n;
    for (let i = 0; i < n; i++) {
      const shade = (rnd() - 0.5) * 0.16;
      ctx.fillStyle = shade > 0 ? `rgba(255,240,210,${shade})` : `rgba(60,30,0,${-shade})`;
      ctx.fillRect(i * pw, 0, pw, h);
      for (let g = 0; g < 9; g++) {
        ctx.fillStyle = `rgba(80,45,10,${0.04 + rnd() * 0.06})`;
        ctx.fillRect(i * pw + rnd() * pw, 0, 1.5, h);
      }
      const jy = rnd() * h;
      ctx.fillStyle = 'rgba(70,40,10,.35)'; ctx.fillRect(i * pw, jy, pw, 2);
      ctx.fillStyle = 'rgba(55,30,5,.5)'; ctx.fillRect(i * pw, 0, 2.5, h);
    }
  };
}

function drawRug(ctx, w, h) {
  const m = 18, r = 26;
  ctx.fillStyle = '#efe4d2';
  for (let y = 10; y < h - 10; y += 9) { ctx.fillRect(2, y, m, 3); ctx.fillRect(w - m - 2, y, m, 3); }
  const rr = (x, y, ww, hh, rad) => {
    ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + ww, y, x + ww, y + hh, rad); ctx.arcTo(x + ww, y + hh, x, y + hh, rad);
    ctx.arcTo(x, y + hh, x, y, rad); ctx.arcTo(x, y, x + ww, y, rad); ctx.closePath();
  };
  rr(m, 0, w - 2 * m, h, r); ctx.fillStyle = '#efe4d2'; ctx.fill();
  rr(m + 14, 14, w - 2 * m - 28, h - 28, r - 8); ctx.fillStyle = '#4b3aa6'; ctx.fill();
  rr(m + 28, 28, w - 2 * m - 56, h - 56, r - 14); ctx.fillStyle = '#6a52e0'; ctx.fill();
  ctx.save(); rr(m + 28, 28, w - 2 * m - 56, h - 56, r - 14); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 3;
  for (let i = -h; i < w + h; i += 46) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke();
  }
  ctx.restore();
}

function drawClockFace(ctx, w, h) {
  const c = w / 2;
  ctx.fillStyle = '#2a1f14'; ctx.beginPath(); ctx.arc(c, c, c, 0, 7); ctx.fill();
  ctx.fillStyle = '#f6f2ea'; ctx.beginPath(); ctx.arc(c, c, c - 14, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a1f14';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r1 = c - 24, r2 = c - (i % 3 === 0 ? 44 : 34);
    ctx.lineWidth = i % 3 === 0 ? 6 : 3; ctx.strokeStyle = '#2a1f14';
    ctx.beginPath(); ctx.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); ctx.lineTo(c + Math.sin(a) * r2, c - Math.cos(a) * r2); ctx.stroke();
  }
}

export async function createAvatarScene(container, opts = {}) {
  const bubbleEl = opts.bubble || null;
  const avoidEl = opts.avoid || null;   // панель чату: сцену центруємо у вільній зоні
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Рендерер ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x14111f, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 500);

  // ── Світло ──
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x8a7560, 1.3));
  const key = new THREE.DirectionalLight(0xffe6c8, 2.1);
  key.position.set(-10, 52, -52); key.target.position.set(CX, 3, -14);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 220 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.04; key.shadow.radius = 4;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9d8cff, 0.55);
  rim.position.set(34, 22, 12); scene.add(rim);

  // ── Кімната з GLB: беремо меблі, а оболонку (стіни/підлогу) будуємо самі ──
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  gltf.scene.updateMatrixWorld(true);
  const room = new THREE.Group();
  const colorOf = {};
  const SHELL = new Set(['Cube001', 'Cube002', 'Cube003', 'Cube008', 'Cube009', 'Cube017', 'Cube018', 'Cube005']);
  for (const child of [...gltf.scene.children]) {
    const box = new THREE.Box3().setFromObject(child);
    const cx = (box.min.x + box.max.x) / 2;
    const id = child.name.replace(/\W/g, '');
    if (cx < -60) continue;                    // друга копія кімнати (поза «думає») — не потрібна
    if (child.material && child.material.color) colorOf[id] = '#' + child.material.color.getHexString();
    if (SHELL.has(id)) continue;
    room.add(child);
  }
  room.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((m) => { m.metalness = 0; m.roughness = 0.88; });
  });
  scene.add(room);

  // Оболонка кімнати: замкнена «коробка», камера всередині — чорних проміжків бути не може.
  const wallHex = colorOf.Cube008 || '#83b5c9';
  const sideHex = colorOf.Cube018 || wallHex;
  const floorHex = colorOf.Cube009 || '#d1a55e';
  const mk = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...extra });
  const wallTexBase = canvasTex(256, 256, drawWall(wallHex), { repeat: true });
  const sideTexBase = canvasTex(256, 256, drawWall(sideHex), { repeat: true });
  const floorTex = canvasTex(512, 512, drawFloor(floorHex), { repeat: true });
  const backTex = wallTexBase, leftTex = sideTexBase.clone(), rightTex = sideTexBase.clone();
  leftTex.needsUpdate = rightTex.needsUpdate = true;
  const plane = (mat, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.rotation.set(rot[0], rot[1], rot[2]); m.receiveShadow = true; scene.add(m); return m;
  };
  const floor = plane(mk(floorTex, { roughness: 0.78 }), [-Math.PI / 2, 0, 0]);
  const back = plane(mk(backTex), [0, Math.PI, 0]);
  const left = plane(mk(leftTex), [0, Math.PI / 2, 0]);
  const right = plane(mk(rightTex), [0, -Math.PI / 2, 0]);
  const ceil = plane(new THREE.MeshStandardMaterial({ color: 0xe9e4f2, roughness: 1 }), [Math.PI / 2, 0, 0]);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: 0.7 });
  const bbBack = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), baseMat);
  const bbL = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), baseMat);
  const bbR = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), baseMat);
  [bbBack, bbL, bbR].forEach((m) => { m.receiveShadow = true; scene.add(m); });

  function layoutShell(halfW, zFront) {
    const depth = Z_BACK - zFront, cz = (Z_BACK + zFront) / 2, W2 = halfW * 2;
    floor.position.set(CX, 0, cz); floor.scale.set(W2, depth, 1); floorTex.repeat.set(W2 / 10, depth / 10);
    back.position.set(CX, ROOM_H / 2, Z_BACK); back.scale.set(W2, ROOM_H, 1); backTex.repeat.set(W2 / 8, ROOM_H / 8);
    left.position.set(CX - halfW, ROOM_H / 2, cz); left.scale.set(depth, ROOM_H, 1); leftTex.repeat.set(depth / 8, ROOM_H / 8);
    right.position.set(CX + halfW, ROOM_H / 2, cz); right.scale.set(depth, ROOM_H, 1); rightTex.repeat.set(depth / 8, ROOM_H / 8);
    ceil.position.set(CX, ROOM_H, cz); ceil.scale.set(W2, depth, 1);
    bbBack.position.set(CX, 0.5, Z_BACK - 0.17); bbBack.scale.set(W2, 1, 0.34);
    bbL.position.set(CX - halfW + 0.17, 0.5, cz); bbL.scale.set(0.34, 1, depth);
    bbR.position.set(CX + halfW - 0.17, 0.5, cz); bbR.scale.set(0.34, 1, depth);
  }

  // Килим під столом
  const rugTex = canvasTex(512, 384, drawRug);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(23, 17.2), new THREE.MeshStandardMaterial({
    map: rugTex, roughness: 1, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(CX, 0.04, -14.2); rug.receiveShadow = true; scene.add(rug);

  // Картина на задній стіні
  const pc = document.createElement('canvas'); pc.width = 840; pc.height = 540;
  drawPainting(pc.getContext('2d'), pc.width, pc.height);
  const paintTex = new THREE.CanvasTexture(pc); paintTex.colorSpace = THREE.SRGBColorSpace; paintTex.anisotropy = 8;
  const painting = new THREE.Group();
  const frameBox = new THREE.Mesh(new THREE.BoxGeometry(15.4, 10.4, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.6 }));
  const matBox = new THREE.Mesh(new THREE.BoxGeometry(14.6, 9.6, 0.62), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.9 }));
  const canvasPlane = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 8.6), new THREE.MeshStandardMaterial({ map: paintTex, roughness: 0.8 }));
  canvasPlane.position.z = -0.33; canvasPlane.rotation.y = Math.PI;
  painting.add(frameBox, matBox, canvasPlane);
  painting.position.set(-3, 17.2, Z_BACK - 0.32);
  painting.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(painting);

  // Хелпер: коробка з матеріалом
  const box = (w, h, d, color, x, y, z, parent = scene, extra = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };

  // Полиця з книжками (ліворуч від картини для глядача = +x)
  const shelfY = 13.6, shelfZ = Z_BACK - 0.85, shelfX = 11.8;
  box(9.4, 0.4, 1.7, 0x8a5a33, shelfX, shelfY, shelfZ);
  box(0.35, 1.0, 1.2, 0x5b3a1f, shelfX - 3.6, shelfY - 0.7, Z_BACK - 0.6);
  box(0.35, 1.0, 1.2, 0x5b3a1f, shelfX + 3.6, shelfY - 0.7, Z_BACK - 0.6);
  const bookCols = [0x7b61ff, 0xff9ec4, 0xf1e7d6, 0x3fb6a8, 0xffb454, 0x5a44cc, 0xe86a6a];
  let bx = shelfX - 4.1;
  for (let i = 0; i < 9; i++) {
    const w = 0.5 + rnd() * 0.45, h = 2.1 + rnd() * 1.3;
    const b = box(w, h, 1.25, bookCols[i % bookCols.length], bx + w / 2, shelfY + 0.2 + h / 2, shelfZ);
    if (i === 8) { b.rotation.z = -0.28; b.position.x += 0.35; }
    bx += w + 0.04;
    if (bx > shelfX + 0.6) break;
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.48, 0.8, 16), new THREE.MeshStandardMaterial({ color: 0xc8714a, roughness: 0.9 }));
  pot.position.set(shelfX + 3.2, shelfY + 0.6, shelfZ); pot.castShadow = true; scene.add(pot);
  const succ = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), new THREE.MeshStandardMaterial({ color: 0x3f9b58, roughness: 0.8 }));
  succ.position.set(shelfX + 3.2, shelfY + 1.35, shelfZ); succ.scale.y = 0.85; succ.castShadow = true; scene.add(succ);

  // Годинник, який показує справжній час (праворуч від картини для глядача = −x)
  const clock = new THREE.Group();
  const rim2 = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.45, 40), new THREE.MeshStandardMaterial({ color: 0x2a1f14, roughness: 0.6 }));
  rim2.rotation.x = Math.PI / 2; rim2.castShadow = true;
  const face2 = new THREE.Mesh(new THREE.CircleGeometry(2.0, 40), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, drawClockFace), roughness: 0.7 }));
  face2.rotation.y = Math.PI; face2.position.z = -0.24;
  const hourHand = new THREE.Group(), minHand = new THREE.Group(), secHand = new THREE.Group();
  const hand = (g, len, wd, color, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wd, len, 0.05), new THREE.MeshBasicMaterial({ color }));
    m.position.y = len / 2 - 0.15; g.add(m); g.position.z = z; clock.add(g);
  };
  hand(hourHand, 1.15, 0.14, 0x2a1f14, -0.28); hand(minHand, 1.65, 0.1, 0x2a1f14, -0.3); hand(secHand, 1.7, 0.04, 0x7b61ff, -0.32);
  clock.add(rim2, face2);
  clock.position.set(-14.6, 18.6, Z_BACK - 0.3);
  scene.add(clock);

  // Підлогова рослина (ліворуч для глядача)
  const floorPlant = new THREE.Group();
  const bigPot = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.3, 2.6, 20), new THREE.MeshStandardMaterial({ color: 0xc8714a, roughness: 0.9 }));
  bigPot.position.y = 1.3; bigPot.castShadow = true; bigPot.receiveShadow = true; floorPlant.add(bigPot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.1, 20), new THREE.MeshStandardMaterial({ color: 0x3a2a1c }));
  soil.position.y = 2.6; floorPlant.add(soil);
  const leafCols = [0x2f7d46, 0x3d9b57, 0x2a6c3e];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rnd() * 0.4, tilt = 0.25 + rnd() * 0.55, len = 3.4 + rnd() * 3.2;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: leafCols[i % 3], roughness: 0.75 }));
    leaf.scale.set(0.5, len / 2, 0.14);
    const pivot = new THREE.Group();
    pivot.position.y = 2.6; pivot.rotation.set(0, a, tilt, 'YXZ');
    leaf.position.y = len / 2 - 0.2; pivot.add(leaf); leaf.castShadow = true; floorPlant.add(pivot);
  }
  floorPlant.position.set(CX + 12.5, 0, -9);
  scene.add(floorPlant);

  // Настільна лампа та кружка
  const lamp = new THREE.Group();
  lamp.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.22, 20), new THREE.MeshStandardMaterial({ color: 0x262238, roughness: 0.5 })), { castShadow: true }));
  // шарнірна лампа: стійка → гілка над столом → абажур (нахилена до персонажа, тобто в бік +x)
  const J = new V3(0.34, 3.4, 0), dir = new V3(Math.cos(0.36), Math.sin(0.36), 0), L2 = 2.5;
  const arm1 = box(0.16, 3.4, 0.16, 0x262238, 0.17, 1.7, 0, lamp); arm1.rotation.z = -0.2;
  const arm2 = box(0.16, L2, 0.16, 0x262238, J.x + dir.x * L2 / 2, J.y + dir.y * L2 / 2, 0, lamp); arm2.rotation.z = -(Math.PI / 2 - 0.36);
  const E = J.clone().addScaledVector(dir, L2);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0x262238 })); joint.position.copy(J); lamp.add(joint);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.25, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x7b61ff, roughness: 0.55, side: THREE.DoubleSide }));
  shade.position.set(E.x + 0.2, E.y - 0.25, 0); shade.rotation.z = -0.22; shade.castShadow = true; lamp.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe3b0 }));
  bulb.position.set(E.x + 0.26, E.y - 0.7, 0); lamp.add(bulb);
  lamp.position.set(CX - 5.2, 5.1, -21.4);
  scene.add(lamp);
  const lampLight = new THREE.PointLight(0xffc98a, 90, 26, 2);
  lampLight.position.set(CX - 5.2 + 2.9, 5.1 + 3.4, -21.4 - 1.2); scene.add(lampLight);

  const mug = new THREE.Group();
  mug.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 1.15, 20), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.5 })), { castShadow: true }));
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.52, 20), new THREE.MeshStandardMaterial({ color: 0x3b2418, roughness: 0.4 }));
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.5; mug.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 14, Math.PI), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.5 }));
  handle.rotation.z = -Math.PI / 2; handle.position.x = 0.62; mug.add(handle);
  mug.position.set(CX - 1.6, 5.1 + 0.58, -21.4); scene.add(mug);

  // Пилинки в променях світла
  const MOTES = 56;
  const motePos = new Float32Array(MOTES * 3), moteSeed = [];
  for (let i = 0; i < MOTES; i++) {
    motePos.set([CX + (rnd() - 0.5) * 24, 1 + rnd() * 19, -30 + rnd() * 24], i * 3); moteSeed.push(rnd() * 6.28);
  }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    size: 0.16, color: 0xfff1d0, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(motes);

  // ── Персонаж ──
  const mats = {};
  for (const k of ['head', 'skin2', 'hoodie', 'hoodie2', 'jeans', 'hair', 'gear', 'shoe', 'sole']) mats[k] = new THREE.MeshStandardMaterial({ color: PALETTE[k], roughness: 0.75 });
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

  const rel = {};
  for (const s of ['L', 'R']) {
    const up = P['upper' + s], fo = P['fore' + s];
    const mk2 = (pu, qu, pf, qf) => ({
      pos: pf.clone().sub(pu).applyQuaternion(qu.clone().invert()),
      q: qu.clone().invert().multiply(qf),
    });
    rel[s] = { A: mk2(up.pA, up.qA, fo.pA, fo.qA), B: mk2(up.pB, up.qB, fo.pB, fo.qB) };
  }

  // Кисті рук (шкіра) на кінцях передпліч
  for (const s of ['L', 'R']) {
    const f = P['fore' + s], u = P['upper' + s], half = f.dims[2] / 2;
    const plus = new V3(0, 0, half).applyQuaternion(f.qA).add(f.pA);
    const minus = new V3(0, 0, -half).applyQuaternion(f.qA).add(f.pA);
    const sign = plus.distanceTo(u.pA) > minus.distanceTo(u.pA) ? 1 : -1;
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.98, 0.85), mats.head);
    h.position.set(0, 0, sign * (half + 0.3)); h.castShadow = true; f.mesh.add(h);
  }
  // Кросівки: ноги йдуть під підлогу, тож взуття ставимо на рівні підлоги
  for (const s of ['L', 'R']) {
    const sh = P['shin' + s];
    const shoe = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.66, 2.55), mats.shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.18, 2.6), mats.sole); sole.position.y = -0.3;
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.8), mats.sole); lace.position.set(0, 0.34, -0.1);
    body.castShadow = sole.castShadow = true;
    shoe.add(body, sole, lace);
    shoe.position.set(0, 0.34 - sh.pA.y, -0.6);
    sh.mesh.add(shoe);
  }
  // Худі: шнурки й комір
  const torso = P.torso, tTop = torso.dims[1] / 2, tFront = -torso.dims[2] / 2;
  box(2.35, 0.5, 2.3, PALETTE.hoodie2, 0, tTop - 0.05, 0, torso.mesh);
  box(0.11, 1.15, 0.07, 0xf4f1ec, 0.42, tTop - 0.95, tFront - 0.03, torso.mesh);
  box(0.11, 1.15, 0.07, 0xf4f1ec, -0.42, tTop - 0.95, tFront - 0.03, torso.mesh);

  // Голова: обличчя, волосся, навушники
  const head = P.head, hx = head.dims[0] / 2, hy = head.dims[1] / 2, hz = head.dims[2] / 2;
  const faceMat = new THREE.MeshBasicMaterial({ color: PALETTE.face });
  const eyeGeo = new THREE.BoxGeometry(0.3, 0.52, 0.06);
  const eyeL = new THREE.Mesh(eyeGeo, faceMat), eyeR = new THREE.Mesh(eyeGeo, faceMat);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.06), faceMat);
  const faceZ = -hz - 0.025;
  eyeL.position.set(0.66, 0.32, faceZ); eyeR.position.set(-0.66, 0.32, faceZ);
  mouth.position.set(0, -0.56, faceZ);
  const browMat = new THREE.MeshBasicMaterial({ color: PALETTE.hair });
  const browGeo = new THREE.BoxGeometry(0.66, 0.13, 0.06);
  const browL = new THREE.Mesh(browGeo, browMat), browR = new THREE.Mesh(browGeo, browMat);
  browL.position.set(0.66, 0.9, faceZ); browR.position.set(-0.66, 0.9, faceZ);
  const blushMat = new THREE.MeshBasicMaterial({ color: PALETTE.blush, transparent: true, opacity: 0.5, depthWrite: false });
  const blushL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.04), blushMat), blushR = blushL.clone();
  blushL.position.set(1.0, -0.12, faceZ + 0.005); blushR.position.set(-1.0, -0.12, faceZ + 0.005);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.44, 0.28), mats.skin2);
  nose.position.set(0, -0.14, -hz - 0.1);
  head.mesh.add(eyeL, eyeR, mouth, browL, browR, blushL, blushR, nose);

  const hairParts = [
    [2.76, 0.64, 2.76, 0, hy + 0.12, 0],               // верх
    [2.76, 2.35, 0.55, 0, 0.12, hz + 0.1],             // потилиця
    [0.3, 1.55, 2.6, hx + 0.1, 0.55, 0.05],            // скроні
    [0.3, 1.55, 2.6, -hx - 0.1, 0.55, 0.05],
    [2.76, 0.56, 0.34, 0, hy - 0.2, -hz - 0.06],       // чубок
    [0.5, 0.5, 0.34, 0, hy - 0.55, -hz - 0.07],        // кучерик посередині
  ];
  for (const [w, h, d, x, y, z] of hairParts) box(w, h, d, PALETTE.hair, x, y, z, head.mesh);
  // Навушники з мікрофоном
  const gearM = new THREE.MeshStandardMaterial({ color: PALETTE.gear, roughness: 0.5 });
  const ringM = new THREE.MeshStandardMaterial({ color: 0x7b61ff, emissive: 0x7b61ff, emissiveIntensity: 0.7, roughness: 0.4 });
  const add = (geo, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; head.mesh.add(o); return o; };
  add(new THREE.BoxGeometry(3.5, 0.24, 0.5), gearM, 0, hy + 0.5, 0.05);
  for (const sx of [1, -1]) {
    add(new THREE.BoxGeometry(0.24, 1.55, 0.5), gearM, sx * (hx + 0.3), hy + 0.5 - 0.72, 0.05);
    add(new THREE.CylinderGeometry(0.66, 0.66, 0.46, 24), gearM, sx * (hx + 0.52), 0.12, 0.05, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 20), ringM, sx * (hx + 0.52), 0.12, 0.05, 0, Math.PI / 2);
  }
  add(new THREE.BoxGeometry(0.1, 0.1, 1.5), gearM, hx + 0.6, -0.3, -hz - 0.6 + 0.2);
  add(new THREE.BoxGeometry(0.85, 0.1, 0.1), gearM, hx + 0.2, -0.45, -hz - 0.6 - 0.15);
  add(new THREE.SphereGeometry(0.17, 12, 10), gearM, hx - 0.25, -0.45, -hz - 0.75);

  // ── Стан ──
  const S = {
    state: 'idle', think: 0, mouth: 0, mouthTarget: 0, mouthSetAt: -1e9,
    mx: 0, my: 0, lx: 0, ly: 0, blinkAt: 2.5, blinkT: -1, t: 0,
  };
  window.addEventListener('pointermove', (e) => {
    const W = window.innerWidth || 1, H = window.innerHeight || 1;
    S.mx = clamp((e.clientX / W) * 2 - 1, -1.4, 1.4);
    S.my = clamp(-((e.clientY / H) * 2 - 1), -1.4, 1.4);
  }, { passive: true });

  const tmpP = new V3(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
  const lookQ = new Q(), neck = new V3(), off = new V3(), headWorld = new V3();

  function pose(k, breath) {
    const base = {};
    for (const n in P) {
      const p = P[n];
      base[n] = { pos: p.pA.clone().lerp(p.pB, k), q: p.qA.clone().slerp(p.qB, k) };
    }
    for (const s of ['L', 'R']) {
      const u = base['upper' + s];
      const rp = rel[s].A.pos.clone().lerp(rel[s].B.pos, k).applyQuaternion(u.q);
      base['fore' + s] = { pos: u.pos.clone().add(rp), q: u.q.clone().multiply(rel[s].A.q.clone().slerp(rel[s].B.q, k)) };
    }
    const lift = new V3(0, breath, 0);
    for (const n of ['torso', 'upperL', 'upperR', 'foreL', 'foreR']) base[n].pos.add(lift);

    // Голова обертається навколо шиї: погляд за курсором, кивки, нахили
    const hb = base.head;
    const think = S.think;
    const speak = S.state === 'speaking' ? S.mouth : 0;
    const yaw = S.lx * 0.45 * (1 - 0.7 * think) + Math.sin(S.t * 0.45) * 0.05;
    const pitch = S.ly * 0.3 * (1 - 0.7 * think) + Math.sin(S.t * 7.3) * 0.028 * speak + Math.sin(S.t * 0.9) * 0.015;
    const roll = Math.sin(S.t * 0.7) * 0.02 + (think * Math.sin(S.t * 0.6) * 0.03) - S.lx * 0.05 * (1 - think);
    tmpE.set(pitch, yaw, roll); lookQ.setFromEuler(tmpE);
    neck.copy(hb.pos).add(tmpP.set(0, -hy, 0).applyQuaternion(hb.q));
    off.copy(hb.pos).add(lift).sub(neck).applyQuaternion(lookQ);
    hb.pos.copy(neck).add(off);
    hb.q.premultiply(lookQ);

    for (const n in P) { P[n].mesh.position.copy(base[n].pos); P[n].mesh.quaternion.copy(base[n].q); }
    headWorld.copy(hb.pos);
  }

  function face(dt) {
    const talking = S.state === 'speaking';
    const fresh = S.t - S.mouthSetAt < 0.25;
    let target = 0;
    if (talking) target = fresh ? S.mouthTarget : (0.35 + 0.35 * Math.sin(S.t * 13) * Math.sin(S.t * 5.3));
    S.mouth = damp(S.mouth, clamp(target, 0, 1), target > S.mouth ? 38 : 22, dt);
    const think = S.think;
    const h = 0.10 + S.mouth * 0.95;
    const w = 1.0 - 0.45 * think - S.mouth * 0.12;
    mouth.scale.set(w, h, 1);
    mouth.position.set(0.28 * think, -0.56 - S.mouth * 0.06, faceZ);
    mouth.rotation.z = -0.12 * think;
    S.blinkAt -= dt;
    if (S.blinkAt <= 0 && S.blinkT < 0) { S.blinkT = 0; }
    let blink = 0;
    if (S.blinkT >= 0) {
      S.blinkT += dt; const u = S.blinkT / 0.16;
      blink = u < 1 ? Math.sin(u * Math.PI) : 0;
      if (u >= 1) { S.blinkT = -1; S.blinkAt = 2.2 + Math.random() * 3.8; }
    }
    // Очі ковзають за курсором (голова повертається ще й сама)
    const gx = -clamp(S.lx, -1, 1) * 0.13 * (1 - think), gy = clamp(S.ly, -1, 1) * 0.07 * (1 - think);
    const sy = 1 - 0.92 * blink;
    for (const e of [eyeL, eyeR]) { e.scale.y = sy; e.position.y = 0.32 + 0.16 * think + gy; }
    eyeL.position.x = 0.66 + 0.12 * think + gx; eyeR.position.x = -0.66 + 0.12 * think + gx;
    // Брови: підіймаються, коли аватар думає чи говорить
    const bl = 0.9 + 0.13 * think + 0.06 * S.mouth, br = 0.9 + 0.24 * think + 0.06 * S.mouth;
    browL.position.set(0.66 + gx * 0.5, bl + gy * 0.5 - (blink * 0.08), faceZ);
    browR.position.set(-0.66 + gx * 0.5, br + gy * 0.5 - (blink * 0.08), faceZ);
    browR.rotation.z = 0.16 * think; browL.rotation.z = -0.05 * think;
  }

  // ── Камера: нерухома, кімната заповнює весь екран; персонаж по центру вільної зони ──
  const target = new V3(CX, 10.2, Z_CHAR + 3);
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  function resize() {
    const W = container.clientWidth || 1, H = container.clientHeight || 1;
    renderer.setSize(W, H, false);
    renderer.domElement.style.width = W + 'px'; renderer.domElement.style.height = H + 'px';
    // вільна зона = екран мінус панель чату
    let freeW = W, freeH = H;
    if (avoidEl) {
      const r = avoidEl.getBoundingClientRect(), c = container.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        if (r.top - c.top > H * 0.3 && r.width > W * 0.7) freeH = Math.max(H * 0.3, r.top - c.top - 8);
        else if (r.left - c.left > W * 0.4) freeW = Math.max(W * 0.4, r.left - c.left - 16);
      }
    }
    const dist = Math.max(HALF_H / (tanV * (freeH / H)), HALF_W / (tanV * (freeW / H)));
    camera.aspect = W / H;
    camera.position.set(CX, 12.8, Z_CHAR - dist);
    camera.lookAt(target);
    camera.setViewOffset(W, H, (W - freeW) / 2, (H - freeH) / 2, W, H);
    // ширина оболонки: бічні стіни трохи заходять у кадр, а за ними коробка продовжується
    const worldPerPx = (2 * (dist + (Z_CHAR - Z_BACK) * -1) * tanV) / H;
    const halfW = Math.max(12, (freeW / 2) * worldPerPx * 0.92);
    layoutShell(halfW, camera.position.z - 3);
  }
  new ResizeObserver(resize).observe(container);
  if (avoidEl) new ResizeObserver(resize).observe(avoidEl);
  resize();

  // ── Цикл ──
  const clockT = new THREE.Clock();
  const ndc = new V3();
  function frame() {
    const dt = Math.min(clockT.getDelta(), 0.05);
    S.t += dt;
    S.lx = damp(S.lx, S.mx, 4, dt); S.ly = damp(S.ly, S.my, 4, dt);
    S.think = damp(S.think, S.state === 'thinking' ? 1 : 0, 5.5, dt);
    const k = ease(clamp(S.think, 0, 1));
    pose(k, Math.sin(S.t * (S.state === 'thinking' ? 1.1 : 1.7)) * 0.05);
    face(dt);

    const d = new Date(), sec = d.getSeconds() + d.getMilliseconds() / 1000, min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
    secHand.rotation.z = (sec / 60) * Math.PI * 2; minHand.rotation.z = (min / 60) * Math.PI * 2; hourHand.rotation.z = (hr / 12) * Math.PI * 2;
    lampLight.intensity = 90 + Math.sin(S.t * 1.3) * 3;
    if (!reduceMotion) {
      const a = moteGeo.attributes.position;
      for (let i = 0; i < MOTES; i++) {
        let y = a.getY(i) + dt * 0.18; if (y > 20) y = 1;
        a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(S.t * 0.4 + moteSeed[i]) * dt * 0.25);
      }
      a.needsUpdate = true;
    }

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
  createAvatarScene(stage, { bubble: document.getElementById('think-bubble'), avoid: document.getElementById('chat') })
    .then(() => {
      document.documentElement.classList.add('scene-ready');
      document.dispatchEvent(new CustomEvent('avatar-ready'));
    })
    .catch((e) => { console.error('Scene failed', e); document.documentElement.classList.add('scene-failed'); });
}
