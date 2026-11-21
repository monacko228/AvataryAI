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

function drawWall(hex, kind = 'stripes') {
  return (ctx, w, h) => {
    if (kind === 'bricks') {
      ctx.fillStyle = '#d9cbbb'; ctx.fillRect(0, 0, w, h);
      const bh = 32, bw = 64;
      for (let r = 0; r < h / bh; r++) {
        for (let x = -bw; x < w + bw; x += bw) {
          const ox = (r % 2) * (bw / 2);
          ctx.fillStyle = hex; ctx.fillRect(x + ox + 2, r * bh + 2, bw - 4, bh - 4);
          const sh = (rnd() - 0.5) * 0.22;
          ctx.fillStyle = sh > 0 ? `rgba(255,235,220,${sh})` : `rgba(40,10,0,${-sh})`;
          ctx.fillRect(x + ox + 2, r * bh + 2, bw - 4, bh - 4);
        }
      }
    } else {
      ctx.fillStyle = hex; ctx.fillRect(0, 0, w, h);
    }
    if (kind === 'stripes') {
      for (let x = 0; x < w; x += 64) { ctx.fillStyle = 'rgba(255,255,255,.055)'; ctx.fillRect(x, 0, 32, h); }
    } else if (kind === 'dots') {
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) {
        ctx.beginPath(); ctx.arc(x + ((y / 64) % 2) * 32 + 16, y + 16, 7, 0, 7); ctx.fill();
      }
    } else if (kind === 'stars') {
      for (let i = 0; i < 46; i++) {
        const x = rnd() * w, y = rnd() * h, big = rnd() > 0.82;
        ctx.fillStyle = `rgba(255,248,220,${0.35 + rnd() * 0.55})`;
        ctx.fillRect(x, y, big ? 4 : 2, big ? 4 : 2);
        if (big) { ctx.fillRect(x - 2, y + 1, 8, 2); ctx.fillRect(x + 1, y - 2, 2, 8); }
      }
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,40,.04)';
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  };
}

function drawFloor(hex, kind = 'planks') {
  return (ctx, w, h) => {
    ctx.fillStyle = hex; ctx.fillRect(0, 0, w, h);
    if (kind === 'tiles') {
      const n = 4, tw = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,.1)' : 'rgba(0,0,30,.07)';
        ctx.fillRect(i * tw, j * tw, tw, tw);
        const g = ctx.createLinearGradient(i * tw, j * tw, i * tw + tw, j * tw + tw);
        g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(i * tw, j * tw, tw, tw);
      }
      ctx.fillStyle = 'rgba(30,30,50,.4)';
      for (let i = 0; i < n; i++) { ctx.fillRect(i * tw, 0, 3, h); ctx.fillRect(0, i * tw, w, 3); }
      return;
    }
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

function drawRug(cols) {
  const [edge, mid, inner] = cols;
  return (ctx, w, h) => {
    const m = 18, r = 26;
    ctx.fillStyle = edge;
    for (let y = 10; y < h - 10; y += 9) { ctx.fillRect(2, y, m, 3); ctx.fillRect(w - m - 2, y, m, 3); }
    const rr = (x, y, ww, hh, rad) => {
      ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + ww, y, x + ww, y + hh, rad); ctx.arcTo(x + ww, y + hh, x, y + hh, rad);
      ctx.arcTo(x, y + hh, x, y, rad); ctx.arcTo(x, y, x + ww, y, rad); ctx.closePath();
    };
    rr(m, 0, w - 2 * m, h, r); ctx.fillStyle = edge; ctx.fill();
    rr(m + 14, 14, w - 2 * m - 28, h - 28, r - 8); ctx.fillStyle = mid; ctx.fill();
    rr(m + 28, 28, w - 2 * m - 56, h - 56, r - 14); ctx.fillStyle = inner; ctx.fill();
    ctx.save(); rr(m + 28, 28, w - 2 * m - 56, h - 56, r - 14); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 3;
    for (let i = -h; i < w + h; i += 46) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke();
    }
    ctx.restore();
  };
}

// Картини: без rnd(), щоб не зсувати послідовність випадкових чисел сцени
const hash = (i) => (Math.sin(i * 91.3) * 0.5 + 0.5);
function drawPaintingSpace(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, w, h);
  sky.addColorStop(0, '#07061f'); sky.addColorStop(0.55, '#1c1352'); sky.addColorStop(1, '#4a2a86');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  const neb = ctx.createRadialGradient(w * 0.25, h * 0.3, 4, w * 0.25, h * 0.3, h * 0.5);
  neb.addColorStop(0, 'rgba(255,120,200,.35)'); neb.addColorStop(1, 'rgba(255,120,200,0)');
  ctx.fillStyle = neb; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 130; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.35 + hash(i * 3) * 0.6})`;
    ctx.fillRect(hash(i) * w, hash(i + 77) * h, hash(i * 5) > 0.85 ? 3 : 2, hash(i * 5) > 0.85 ? 3 : 2);
  }
  const px = w * 0.66, py = h * 0.56, pr = h * 0.27;
  const pl = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
  pl.addColorStop(0, '#ffd9a0'); pl.addColorStop(0.55, '#ff8f5a'); pl.addColorStop(1, '#8a2f6a');
  ctx.fillStyle = pl; ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,200,.8)'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.ellipse(px, py, pr * 1.75, pr * 0.32, -0.35, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,200,.55)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(px, py, pr * 1.95, pr * 0.38, -0.35, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
  ctx.fillStyle = '#d8d2ee'; ctx.beginPath(); ctx.arc(w * 0.18, h * 0.72, h * 0.07, 0, 7); ctx.fill();
}
function drawPaintingWaves(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#9fdcea'); sky.addColorStop(0.6, '#fff0cf'); sky.addColorStop(1, '#ffd9b0');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(w * 0.3, h * 0.38, h * 0.12, 0, 7); ctx.fill();
  const wave = (base, amp, color, s) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) ctx.lineTo(x, base + Math.sin(x * 0.02 + s) * amp + Math.sin(x * 0.055 + s * 2) * amp * 0.4);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  };
  wave(h * 0.62, 12, '#58b6c4', 0.5); wave(h * 0.72, 16, '#2f93aa', 2); wave(h * 0.82, 20, '#1d6f8c', 4); wave(h * 0.92, 14, '#124f6b', 6);
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

// ── Кастомізація: каталог варіантів ───────────────────────────────
const L = (uk, en) => ({ uk, en });
const NAMES = {
  purple: ['Фіолетовий', 'Purple'], red: ['Червоний', 'Red'], blue: ['Синій', 'Blue'], green: ['Зелений', 'Green'],
  yellow: ['Жовтий', 'Yellow'], pink: ['Рожевий', 'Pink'], black: ['Чорний', 'Black'], white: ['Білий', 'White'],
  gray: ['Сірий', 'Gray'], navy: ['Темно-синій', 'Navy'], khaki: ['Хакі', 'Khaki'], denim: ['Джинсовий', 'Denim'],
  wood: ['Дерево', 'Wood'], dark: ['Темний', 'Dark'], brown: ['Коричневий', 'Brown'], blonde: ['Блонд', 'Blonde'],
  fair: ['Світла', 'Fair'], light: ['Дуже світла', 'Light'], tan: ['Засмагла', 'Tan'],
  sky: ['Небо', 'Sky'], mint: ["М'ята", 'Mint'], peach: ['Персик', 'Peach'], lavender: ['Лаванда', 'Lavender'],
  night: ['Ніч', 'Night'], brick: ['Цегла', 'Brick'], cream: ['Крем', 'Cream'],
  oak: ['Дуб', 'Oak'], birch: ['Береза', 'Birch'], tile: ['Плитка', 'Tile'],
  violet: ['Фіолетовий', 'Violet'], coral: ['Корал', 'Coral'], sand: ['Пісок', 'Sand'],
};
const nm = (id) => L(...NAMES[id]);

const WALLS = {
  sky: { hex: null, kind: 'stripes', prev: '#83b5c9' }, mint: { hex: '#8fcfb6', kind: 'stripes' },
  peach: { hex: '#f0b8a4', kind: 'dots' }, lavender: { hex: '#b9a9ec', kind: 'plain' },
  night: { hex: '#2d2b52', kind: 'stars' }, brick: { hex: '#b4624a', kind: 'bricks' }, cream: { hex: '#efe3cc', kind: 'plain' },
};
const FLOORS = {
  oak: { hex: null, kind: 'planks', prev: '#d1a55e' }, dark: { hex: '#7a4b2a', kind: 'planks' },
  birch: { hex: '#e8d6ad', kind: 'planks' }, tile: { hex: '#aab2c4', kind: 'tiles' },
};
const RUGS = {
  violet: ['#efe4d2', '#4b3aa6', '#6a52e0'], mint: ['#f1ead8', '#1f7f6a', '#35b394'],
  coral: ['#f1ead8', '#b8433f', '#e8645f'], sand: ['#f6efe2', '#a8895a', '#d9b98a'],
};
const DESKS = { wood: '#844d16', dark: '#3b2a22', white: '#e9e6e0', black: '#23222b', blue: '#3c6fb5' };
const CHAIRS = { wood: '#844d16', purple: '#7b61ff', black: '#2a2933', red: '#d9534f', green: '#3fa37a' };
const TOPS = { purple: '#7b61ff', red: '#e04f5f', blue: '#3d7bf0', green: '#2fa36b', yellow: '#f2b84b', pink: '#ff8fb8', black: '#2b2b35', white: '#eeeaf5' };
const PANTS = { navy: '#3d4478', black: '#25252d', gray: '#6b6f80', khaki: '#a79a73', denim: '#3f6db0' };
const SKINS = { fair: '#f1dcc8', light: '#f8e6d6', tan: '#d9a982', brown: '#a8714b', dark: '#6e4630' };
const HAIRS = { dark: '#2a2233', black: '#121016', brown: '#5a3a26', blonde: '#d9b45c', red: '#b9482a', pink: '#ff7eb6', blue: '#4a6df0', white: '#e9e6f0' };
const SHOES = { white: '#f4f1ec', black: '#26252e', red: '#d9534f', purple: '#7b61ff' };
const ACCENTS = { purple: '#7b61ff', red: '#e04f5f', blue: '#3d7bf0', green: '#2fa36b', yellow: '#f2b84b', pink: '#ff8fb8' };

const swatches = (map, prev = (v) => v) => Object.entries(map).map(([id, v]) => ({ id, label: nm(id), color: v.prev || prev(v) }));
const chips = (list) => list.map(([id, uk, en]) => ({ id, label: L(uk, en) }));
const toggle = (key, uk, en) => ({ key, type: 'toggle', label: L(uk, en) });
const choice = (key, uk, en, options) => ({ key, type: 'choice', label: L(uk, en), options });

export const CATALOG = [
  { id: 'room', title: L('Кімната', 'Room'), items: [
    choice('wall', 'Шпалери', 'Wallpaper', swatches(WALLS, (w) => w.hex)),
    choice('floor', 'Підлога', 'Floor', swatches(FLOORS, (f) => f.hex)),
    choice('rug', 'Килим', 'Rug', [...swatches(RUGS, (r) => r[2]), { id: 'none', label: L('Без килима', 'No rug'), color: null }]),
    choice('painting', 'Картина', 'Painting', chips([['sunset', 'Захід', 'Sunset'], ['space', 'Космос', 'Space'], ['waves', 'Хвилі', 'Waves'], ['none', 'Немає', 'None']])),
    toggle('clock', 'Годинник', 'Clock'), toggle('shelf', 'Полиця з книжками', 'Bookshelf'),
    toggle('plant', 'Рослина на підлозі', 'Floor plant'), toggle('garland', 'Гірлянда', 'String lights'),
  ] },
  { id: 'furniture', title: L('Меблі', 'Furniture'), items: [
    choice('desk', 'Стіл', 'Desk', swatches(DESKS)),
    choice('chair', 'Стілець', 'Chair', swatches(CHAIRS)),
    toggle('lamp', 'Лампа', 'Lamp'), toggle('mug', 'Кружка', 'Mug'), toggle('cactus', 'Кактус', 'Cactus'),
    toggle('books', 'Стопка книжок', 'Book stack'), toggle('duck', 'Гумова качка', 'Rubber duck'), toggle('photo', 'Фоторамка', 'Photo frame'),
  ] },
  { id: 'character', title: L('Персонаж', 'Character'), items: [
    choice('outfit', 'Одяг', 'Outfit', chips([['hoodie', 'Худі', 'Hoodie'], ['tee', 'Футболка', 'T-shirt']])),
    choice('top', 'Колір верху', 'Top color', swatches(TOPS)),
    choice('pants', 'Штани', 'Pants', swatches(PANTS)),
    choice('shoes', 'Кросівки', 'Sneakers', swatches(SHOES)),
    choice('skin', 'Колір шкіри', 'Skin', swatches(SKINS)),
    choice('hairStyle', 'Зачіска', 'Hairstyle', chips([['fringe', 'Чубчик', 'Fringe'], ['short', 'Коротка', 'Short'], ['long', 'Довга', 'Long'], ['bun', 'Пучок', 'Bun'], ['bald', 'Без волосся', 'Bald']])),
    choice('hairColor', 'Колір волосся', 'Hair color', swatches(HAIRS)),
  ] },
  { id: 'accessories', title: L('Аксесуари', 'Accessories'), items: [
    choice('headwear', 'Головний убір', 'Headwear', chips([['none', 'Без', 'None'], ['cap', 'Кепка', 'Cap'], ['beanie', 'Шапка', 'Beanie']])),
    choice('glasses', 'Окуляри', 'Glasses', chips([['none', 'Без', 'None'], ['round', 'Круглі', 'Round'], ['sun', 'Сонцезахисні', 'Sunglasses']])),
    toggle('headphones', 'Навушники з мікрофоном', 'Headphones with mic'), toggle('scarf', 'Шарф', 'Scarf'),
    choice('accent', 'Колір аксесуарів', 'Accessory color', swatches(ACCENTS)),
  ] },
];

export const DEFAULT_LOOK = {
  wall: 'sky', floor: 'oak', rug: 'violet', painting: 'sunset', clock: true, shelf: true, plant: true, garland: false,
  desk: 'wood', chair: 'wood', lamp: true, mug: true, cactus: true, books: false, duck: false, photo: false,
  outfit: 'hoodie', top: 'purple', pants: 'navy', shoes: 'white', skin: 'fair', hairStyle: 'fringe', hairColor: 'dark',
  headwear: 'none', glasses: 'none', headphones: true, scarf: false, accent: 'purple',
};
const ITEMS = Object.fromEntries(CATALOG.flatMap((g) => g.items).map((it) => [it.key, it]));
function validValue(key, v) {
  const it = ITEMS[key];
  if (!it) return false;
  return it.type === 'toggle' ? typeof v === 'boolean' : it.options.some((o) => o.id === v);
}
function sanitizeLook(raw) {
  const out = { ...DEFAULT_LOOK };
  if (raw && typeof raw === 'object') for (const k of Object.keys(DEFAULT_LOOK)) if (validValue(k, raw[k])) out[k] = raw[k];
  return out;
}
const LOOK_KEY = 'avataryai_look';
function loadLook() { try { return sanitizeLook(JSON.parse(localStorage.getItem(LOOK_KEY) || 'null')); } catch (e) { return { ...DEFAULT_LOOK }; } }
function saveLook(look) { try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (e) { /* приватний режим */ } }

export async function createAvatarScene(container, opts = {}) {
  const bubbleEl = opts.bubble || null;
  const avoidEls = [].concat(opts.avoid || []).filter(Boolean);   // панелі (чат, кастомізація): сцену центруємо у вільній зоні
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
  const colorOf = {}, byId = {};
  const SHELL = new Set(['Cube001', 'Cube002', 'Cube003', 'Cube008', 'Cube009', 'Cube017', 'Cube018', 'Cube005']);
  for (const child of [...gltf.scene.children]) {
    const box = new THREE.Box3().setFromObject(child);
    const cx = (box.min.x + box.max.x) / 2;
    const id = child.name.replace(/\W/g, '');
    if (cx < -60) continue;                    // друга копія кімнати (поза «думає») — не потрібна
    byId[id] = child;
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
  const rugTex = canvasTex(512, 384, drawRug(RUGS.violet));
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(23, 17.2), new THREE.MeshStandardMaterial({
    map: rugTex, roughness: 1, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(CX, 0.04, -14.2); rug.receiveShadow = true; scene.add(rug);

  // Картина на задній стіні
  const pc = document.createElement('canvas'); pc.width = 840; pc.height = 540;
  const PAINTINGS = { sunset: drawPainting, space: drawPaintingSpace, waves: drawPaintingWaves };
  PAINTINGS.sunset(pc.getContext('2d'), pc.width, pc.height);
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
  const shelfG = new THREE.Group(); scene.add(shelfG);
  box(9.4, 0.4, 1.7, 0x8a5a33, shelfX, shelfY, shelfZ, shelfG);
  box(0.35, 1.0, 1.2, 0x5b3a1f, shelfX - 3.6, shelfY - 0.7, Z_BACK - 0.6, shelfG);
  box(0.35, 1.0, 1.2, 0x5b3a1f, shelfX + 3.6, shelfY - 0.7, Z_BACK - 0.6, shelfG);
  const bookCols = [0x7b61ff, 0xff9ec4, 0xf1e7d6, 0x3fb6a8, 0xffb454, 0x5a44cc, 0xe86a6a];
  let bx = shelfX - 4.1;
  for (let i = 0; i < 9; i++) {
    const w = 0.5 + rnd() * 0.45, h = 2.1 + rnd() * 1.3;
    const b = box(w, h, 1.25, bookCols[i % bookCols.length], bx + w / 2, shelfY + 0.2 + h / 2, shelfZ, shelfG);
    if (i === 8) { b.rotation.z = -0.28; b.position.x += 0.35; }
    bx += w + 0.04;
    if (bx > shelfX + 0.6) break;
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.48, 0.8, 16), new THREE.MeshStandardMaterial({ color: 0xc8714a, roughness: 0.9 }));
  pot.position.set(shelfX + 3.2, shelfY + 0.6, shelfZ); pot.castShadow = true; shelfG.add(pot);
  const succ = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), new THREE.MeshStandardMaterial({ color: 0x3f9b58, roughness: 0.8 }));
  succ.position.set(shelfX + 3.2, shelfY + 1.35, shelfZ); succ.scale.y = 0.85; succ.castShadow = true; shelfG.add(succ);

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
  // Спільна функція: коробка з готовим матеріалом (щоб колір можна було міняти на льоту)
  const bm = (w, h, d, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const stringM = new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: 0.8 });

  // Одяг: худі (комір + шнурки) або футболка
  const torso = P.torso, tTop = torso.dims[1] / 2, tFront = -torso.dims[2] / 2;
  const hoodG = new THREE.Group(); torso.mesh.add(hoodG);
  bm(2.35, 0.5, 2.3, mats.hoodie2, 0, tTop - 0.05, 0, hoodG);
  bm(0.11, 1.15, 0.07, stringM, 0.42, tTop - 0.95, tFront - 0.03, hoodG);
  bm(0.11, 1.15, 0.07, stringM, -0.42, tTop - 0.95, tFront - 0.03, hoodG);
  const teeCollar = bm(2.3, 0.2, 2.25, mats.hoodie2, 0, tTop - 0.02, 0, torso.mesh);

  // Колір аксесуарів (шапка, кепка, шарф, кільця навушників)
  const accentM = new THREE.MeshStandardMaterial({ color: ACCENTS.purple, roughness: 0.7 });
  const accentD = new THREE.MeshStandardMaterial({ color: ACCENTS.purple, roughness: 0.7 });
  const accentL = new THREE.MeshStandardMaterial({ color: ACCENTS.purple, roughness: 0.8 });

  // Шарф
  const scarfG = new THREE.Group(); torso.mesh.add(scarfG);
  bm(3.25, 0.7, 2.6, accentM, 0, tTop - 0.12, 0, scarfG);
  const tail = bm(0.75, 2.3, 0.26, accentM, 0.75, tTop - 1.45, tFront - 0.2, scarfG);
  bm(0.75, 0.3, 0.28, accentL, 0.75, tTop - 2.45, tFront - 0.2, scarfG);
  tail.rotation.z = 0.05;

  // Голова: обличчя
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

  // Волосся: кожна частина має тег, зачіска = набір видимих тегів
  const hairMeshes = [];
  const hairBox = (w, h, d, x, y, z, tag) => { const m = bm(w, h, d, mats.hair, x, y, z, head.mesh); m.userData.tag = tag; hairMeshes.push(m); return m; };
  hairBox(2.76, 0.64, 2.76, 0, hy + 0.12, 0, 'top');
  hairBox(2.76, 2.35, 0.55, 0, 0.12, hz + 0.1, 'back');
  hairBox(0.3, 1.55, 2.6, hx + 0.1, 0.55, 0.05, 'side');
  hairBox(0.3, 1.55, 2.6, -hx - 0.1, 0.55, 0.05, 'side');
  hairBox(2.76, 0.56, 0.34, 0, hy - 0.2, -hz - 0.06, 'fringe');
  hairBox(0.5, 0.5, 0.34, 0, hy - 0.55, -hz - 0.07, 'curl');
  hairBox(2.76, 3.3, 0.55, 0, -1.35, hz + 0.1, 'long');                 // довге: ззаду
  hairBox(0.3, 2.9, 1.6, hx + 0.1, -0.85, 0.55, 'long');                // і з боків
  hairBox(0.3, 2.9, 1.6, -hx - 0.1, -0.85, 0.55, 'long');
  const bun = hairBox(1.2, 1.2, 1.2, 0, hy + 0.95, 0.25, 'bun'); bun.rotation.set(0.2, 0.5, 0.2);

  // Окуляри
  const frameM = new THREE.MeshStandardMaterial({ color: 0x1a1824, roughness: 0.4 });
  const lensM = new THREE.MeshStandardMaterial({ color: 0xbfd8ff, roughness: 0.1, transparent: true, opacity: 0.16, depthWrite: false });
  const sunM = new THREE.MeshStandardMaterial({ color: 0x0f0d16, roughness: 0.25, transparent: true, opacity: 0.9 });
  const glassesFor = (sun) => {
    const g = new THREE.Group(); const gz = faceZ - 0.07;
    for (const sx of [1, -1]) {
      const cx = sx * 0.66, cy = 0.32, gw = 1.05, gh = 0.86, t = 0.1;
      if (sun) { bm(gw, gh, 0.08, sunM, cx, cy, gz, g); }
      else {
        bm(gw, gh, 0.03, lensM, cx, cy, gz, g);
        bm(gw, t, 0.1, frameM, cx, cy + gh / 2, gz, g); bm(gw, t, 0.1, frameM, cx, cy - gh / 2, gz, g);
        bm(t, gh, 0.1, frameM, cx - gw / 2, cy, gz, g); bm(t, gh, 0.1, frameM, cx + gw / 2, cy, gz, g);
      }
      bm(0.08, 0.08, 1.5, frameM, sx * (hx + 0.03), cy + 0.08, -hz + 0.78, g);   // дужка до вуха
    }
    bm(0.3, 0.1, 0.1, frameM, 0, 0.45, gz, g);
    if (sun) { bm(2.4, 0.1, 0.1, frameM, 0, 0.72, gz, g); }
    head.mesh.add(g); return g;
  };
  const glassesRound = glassesFor(false), glassesSun = glassesFor(true);

  // Головні убори
  const capG = new THREE.Group(), beanieG = new THREE.Group();
  bm(2.96, 1.15, 2.96, accentM, 0, hy + 0.43, 0, capG);
  const brim = bm(2.7, 0.2, 1.9, accentD, 0, hy - 0.2, -hz - 0.85, capG); brim.rotation.x = 0.16;
  bm(0.34, 0.2, 0.34, accentD, 0, hy + 1.07, 0, capG);
  bm(3.0, 1.35, 3.0, accentM, 0, hy + 0.38, 0, beanieG);
  bm(3.1, 0.5, 3.1, accentL, 0, hy - 0.05, 0, beanieG);
  bm(0.9, 0.9, 0.9, accentL, 0, hy + 1.35, 0, beanieG);
  head.mesh.add(capG, beanieG);

  // Навушники з мікрофоном
  const gearM = new THREE.MeshStandardMaterial({ color: PALETTE.gear, roughness: 0.5 });
  const ringM = new THREE.MeshStandardMaterial({ color: ACCENTS.purple, emissive: ACCENTS.purple, emissiveIntensity: 0.7, roughness: 0.4 });
  const hpAll = [];
  const add = (geo, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; head.mesh.add(o); hpAll.push(o); return o; };
  const hpBand = add(new THREE.BoxGeometry(3.5, 0.24, 0.5), gearM, 0, hy + 0.5, 0.05);
  for (const sx of [1, -1]) {
    add(new THREE.BoxGeometry(0.24, 1.55, 0.5), gearM, sx * (hx + 0.3), hy + 0.5 - 0.72, 0.05);
    add(new THREE.CylinderGeometry(0.66, 0.66, 0.46, 24), gearM, sx * (hx + 0.52), 0.12, 0.05, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 20), ringM, sx * (hx + 0.52), 0.12, 0.05, 0, Math.PI / 2);
  }
  add(new THREE.BoxGeometry(0.1, 0.1, 1.5), gearM, hx + 0.6, -0.3, -hz - 0.6 + 0.2);
  add(new THREE.BoxGeometry(0.85, 0.1, 0.1), gearM, hx + 0.2, -0.45, -hz - 0.6 - 0.15);
  add(new THREE.SphereGeometry(0.17, 12, 10), gearM, hx - 0.25, -0.45, -hz - 0.75);

  // ── Предмети на столі (стіл: x −7.6…5.5, поверхня y = 5.1; лампа, кружка й кактус вже стоять) ──
  const deskTop = 5.1;
  const booksG = new THREE.Group();
  const stackDefs = [[1.9, 0.28, 1.4, 0x5a44cc, 0.14, 0], [1.7, 0.26, 1.25, 0xff9ec4, 0.41, 0.12], [1.5, 0.24, 1.1, 0xffb454, 0.66, -0.1]];
  for (const [w, h, d, c, y, ry] of stackDefs) { const b = box(w, h, d, c, 0, y, 0, booksG); b.rotation.y = ry; }
  booksG.position.set(-0.6, deskTop, -21.2); scene.add(booksG);

  const duckG = new THREE.Group();
  const yel = new THREE.MeshStandardMaterial({ color: 0xffd84d, roughness: 0.55 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff9a2e, roughness: 0.6 });
  const duckBody = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), yel); duckBody.scale.set(1, 0.82, 1.15); duckBody.position.y = 0.48; duckBody.castShadow = true;
  const duckHead = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), yel); duckHead.position.set(0, 1.05, -0.3); duckHead.castShadow = true;
  const duckTail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 8), yel); duckTail.rotation.x = -Math.PI / 2 - 0.5; duckTail.position.set(0, 0.7, 0.62);
  duckG.add(duckBody, duckHead, duckTail);
  bm(0.3, 0.1, 0.3, orange, 0, 1.0, -0.62, duckG);
  bm(0.07, 0.1, 0.05, faceMat, 0.15, 1.12, -0.55, duckG); bm(0.07, 0.1, 0.05, faceMat, -0.15, 1.12, -0.55, duckG);
  duckG.position.set(1.4, deskTop, -21.3); duckG.rotation.y = 0.35; scene.add(duckG);

  const photoG = new THREE.Group();
  const photoTex = canvasTex(240, 192, (ctx, w, h) => drawPainting(ctx, w, h));
  const frameWood = new THREE.MeshStandardMaterial({ color: 0x5b3a1f, roughness: 0.6 });
  bm(1.6, 1.3, 0.12, frameWood, 0, 0.65, 0, photoG);
  const photoPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.0), new THREE.MeshStandardMaterial({ map: photoTex, roughness: 0.7 }));
  photoPlane.position.set(0, 0.65, -0.07); photoPlane.rotation.y = Math.PI; photoG.add(photoPlane);
  bm(0.12, 1.0, 0.1, frameWood, 0, 0.5, 0.35, photoG).rotation.x = 0.45;
  photoG.rotation.x = -0.1;
  photoG.position.set(-4.7, deskTop, -21.0); scene.add(photoG);

  // Гірлянда на задній стіні
  const garlandG = new THREE.Group();
  const gPts = [], N_G = 12;
  for (let i = 0; i <= N_G; i++) { const t = (i / N_G) * 2 - 1; gPts.push(new V3(CX + t * 11, 27.2 - 2.5 * (1 - t * t), Z_BACK - 0.5)); }
  garlandG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gPts), 48, 0.04, 5), new THREE.MeshStandardMaterial({ color: 0x1b1824, roughness: 0.8 })));
  const bulbCols = [0xffd27a, 0xff9ec4, 0x9d8cff, 0x7be0c3];
  gPts.forEach((pt, i) => {
    if (i === 0 || i === N_G) return;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: bulbCols[i % 4] }));
    b.position.set(pt.x, pt.y - 0.3, pt.z); garlandG.add(b);
  });
  scene.add(garlandG);

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
    // вільна зона = екран мінус панелі (чат праворуч, кастомізація ліворуч або внизу на телефоні)
    let x0 = 0, x1 = W, freeH = H;
    const c = container.getBoundingClientRect();
    for (const el of avoidEls) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.top - c.top > H * 0.3 && r.width > W * 0.7) freeH = Math.min(freeH, Math.max(H * 0.3, r.top - c.top - 8));
      else if (r.right - c.left < W * 0.55) x0 = Math.max(x0, r.right - c.left + 16);
      else if (r.left - c.left > W * 0.4) x1 = Math.min(x1, r.left - c.left - 16);
    }
    const freeW = Math.max(W * 0.3, x1 - x0), freeCx = x0 + (x1 - x0) / 2;
    const dist = Math.max(HALF_H / (tanV * (freeH / H)), HALF_W / (tanV * (freeW / H)));
    camera.aspect = W / H;
    camera.position.set(CX, 12.8, Z_CHAR - dist);
    camera.lookAt(target);
    camera.setViewOffset(W, H, W / 2 - freeCx, (H - freeH) / 2, W, H);
    // ширина оболонки: бічні стіни трохи заходять у кадр, а за ними коробка продовжується
    const worldPerPx = (2 * (dist + (Z_CHAR - Z_BACK) * -1) * tanV) / H;
    const halfW = Math.max(12, (freeW / 2) * worldPerPx * 0.92);
    layoutShell(halfW, camera.position.z - 3);
  }
  new ResizeObserver(resize).observe(container);
  avoidEls.forEach((el) => new ResizeObserver(resize).observe(el));
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

  // ── Вигляд (кастомізація) ──
  let look = loadLook();
  const colorOfHex = (hex) => new THREE.Color(hex);
  const tint = (hex, k) => '#' + colorOfHex(hex).multiplyScalar(k).getHexString();
  const _n = colorOfHex(PALETTE.skin2), _h = colorOfHex(PALETTE.head), noseTint = [_n.r / _h.r, _n.g / _h.g, _n.b / _h.b];   // ніс трохи темніший за шкіру
  const redraw = (tex, draw, clear = false) => {
    const cv = tex.image, ctx = cv.getContext('2d');
    if (clear) ctx.clearRect(0, 0, cv.width, cv.height);
    draw(ctx, cv.width, cv.height); tex.needsUpdate = true;
  };
  const collectMats = (obj) => { const out = []; if (obj) obj.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => out.push(m)); }); return out; };
  const deskMats = collectMats(byId.Cube004), chairMats = collectMats(byId.Cube019);
  const HAIR_TAGS = { fringe: ['top', 'back', 'side', 'fringe', 'curl'], short: ['top', 'back', 'side'], long: ['top', 'back', 'side', 'fringe', 'long'], bun: ['top', 'back', 'side', 'fringe', 'bun'], bald: [] };
  const updateHair = () => {
    const tags = HAIR_TAGS[look.hairStyle], hat = look.headwear !== 'none';
    hairMeshes.forEach((m) => { const t = m.userData.tag; m.visible = tags.includes(t) && !(hat && (t === 'fringe' || t === 'curl' || t === 'bun')); });
  };
  const updateHeadphones = () => {
    hpAll.forEach((o) => { o.visible = look.headphones; });
    hpBand.visible = look.headphones && look.headwear === 'none';   // дуга не лізе крізь шапку
  };
  const A = {
    wall(id) { const d = WALLS[id], base = d.hex || wallHex, side = d.hex ? tint(d.hex, 0.94) : sideHex; seed = 11; redraw(wallTexBase, drawWall(base, d.kind)); redraw(sideTexBase, drawWall(side, d.kind)); leftTex.needsUpdate = rightTex.needsUpdate = true; },
    floor(id) { const d = FLOORS[id]; seed = 13; redraw(floorTex, drawFloor(d.hex || floorHex, d.kind)); },
    rug(id) { rug.visible = id !== 'none'; if (id !== 'none') redraw(rugTex, drawRug(RUGS[id]), true); },
    painting(id) { painting.visible = id !== 'none'; if (id !== 'none') redraw(paintTex, PAINTINGS[id]); },
    clock(v) { clock.visible = v; }, shelf(v) { shelfG.visible = v; }, plant(v) { floorPlant.visible = v; }, garland(v) { garlandG.visible = v; },
    desk(id) { deskMats.forEach((m) => m.color.set(DESKS[id])); },
    chair(id) { chairMats.forEach((m) => m.color.set(CHAIRS[id])); },
    lamp(v) { lamp.visible = v; lampLight.visible = v; }, mug(v) { mug.visible = v; },
    cactus(v) { if (byId.Quadsphere002) byId.Quadsphere002.visible = v; },
    books(v) { booksG.visible = v; }, duck(v) { duckG.visible = v; }, photo(v) { photoG.visible = v; },
    outfit(id) {
      const tee = id === 'tee';
      hoodG.visible = !tee; teeCollar.visible = tee;
      for (const n of ['foreL', 'foreR']) P[n].mesh.material = tee ? mats.head : mats.hoodie;   // у футболки передпліччя голі
    },
    top(id) { mats.hoodie.color.set(TOPS[id]); mats.hoodie2.color.set(id === 'purple' ? PALETTE.hoodie2 : tint(TOPS[id], 0.72)); },
    pants(id) { mats.jeans.color.set(PANTS[id]); },
    shoes(id) { mats.shoe.color.set(SHOES[id]); },
    skin(id) { const c = colorOfHex(SKINS[id]); mats.head.color.copy(c); mats.skin2.color.setRGB(c.r * noseTint[0], c.g * noseTint[1], c.b * noseTint[2]); },
    hairStyle() { updateHair(); },
    hairColor(id) { mats.hair.color.set(HAIRS[id]); browMat.color.set(HAIRS[id]); },
    headwear(id) { capG.visible = id === 'cap'; beanieG.visible = id === 'beanie'; updateHair(); updateHeadphones(); },
    glasses(id) { glassesRound.visible = id === 'round'; glassesSun.visible = id === 'sun'; },
    headphones() { updateHeadphones(); },
    scarf(v) { scarfG.visible = v; },
    accent(id) {
      const c = ACCENTS[id]; accentM.color.set(c); accentD.color.set(tint(c, 0.78)); accentL.color.copy(colorOfHex(c).lerp(new THREE.Color(0xffffff), 0.35));
      ringM.color.set(c); ringM.emissive.set(c);
    },
  };
  const TEXTURE_KEYS = new Set(['wall', 'floor', 'rug', 'painting']);
  const applyKeys = (keys) => { for (const k of keys) A[k](look[k]); };
  // старт: текстури не перемальовуємо, якщо вибрано стандартні, щоб початковий вигляд лишався як був
  applyKeys(Object.keys(DEFAULT_LOOK).filter((k) => !TEXTURE_KEYS.has(k) || look[k] !== DEFAULT_LOOK[k]));

  const api = {
    /** 'idle' | 'thinking' | 'speaking' */
    setState(s) { S.state = s; },
    /** гучність 0..1 з аудіо — керує відкриттям рота */
    setMouth(v) { S.mouthTarget = clamp(v, 0, 1); S.mouthSetAt = S.t; },
    get state() { return S.state; },
    /** каталог варіантів для інтерфейсу кастомізації */
    catalog: CATALOG,
    defaults: { ...DEFAULT_LOOK },
    getLook() { return { ...look }; },
    /** змінює вигляд: setLook({ wall: 'mint', glasses: 'sun' }) */
    setLook(patch) {
      const changed = [];
      for (const k of Object.keys(patch || {})) if (validValue(k, patch[k]) && look[k] !== patch[k]) { look[k] = patch[k]; changed.push(k); }
      applyKeys(changed); if (changed.length) saveLook(look);
      return { ...look };
    },
    resetLook() { return api.setLook(DEFAULT_LOOK); },
    randomLook() {
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      const common = ['clock', 'shelf', 'plant', 'lamp', 'mug', 'cactus', 'headphones'];
      const next = {};
      for (const it of Object.values(ITEMS)) next[it.key] = it.type === 'toggle' ? (common.includes(it.key) ? Math.random() < 0.8 : Math.random() < 0.35) : pick(it.options).id;
      return api.setLook(next);
    },
  };
  window.AvatarScene = api;
  return api;
}

// Автозапуск, якщо на сторінці є #stage
const stage = document.getElementById('stage');
if (stage) {
  createAvatarScene(stage, { bubble: document.getElementById('think-bubble'), avoid: [document.getElementById('chat'), document.getElementById('custom')] })
    .then(() => {
      document.documentElement.classList.add('scene-ready');
      document.dispatchEvent(new CustomEvent('avatar-ready'));
    })
    .catch((e) => { console.error('Scene failed', e); document.documentElement.classList.add('scene-failed'); });
}
