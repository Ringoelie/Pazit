// Pixel art dibujado con código. Lo que no se mueve se pinta una sola vez en
// lienzos pequeños con contorno automático y se reutiliza en cada fotograma;
// encima solo se dibujan los detalles animados. La luz viene de arriba a la
// izquierda: bordes claros arriba e izquierda, sombra abajo y a la derecha.
import { PAL } from './data.js';

export function R(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x | 0, y | 0, w, h);
}

const colors = new Map();
function memo(key, fn) {
  let v = colors.get(key);
  if (v === undefined) {
    v = fn();
    colors.set(key, v);
  }
  return v;
}
const rgb = (c) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

// Aclara (amt > 0) u oscurece (amt < 0) un color #rrggbb.
export function shade(c, amt) {
  return memo(c + '|' + amt, () => {
    const f = (v) => v + amt * (amt < 0 ? v : 255 - v);
    const [r, g, b] = rgb(c);
    return hex(f(r), f(g), f(b));
  });
}

// Mezcla dos colores #rrggbb (t = 0 → a, t = 1 → b).
export function mix(a, b, t) {
  return memo(a + b + t, () => {
    const A = rgb(a);
    const B = rgb(b);
    return hex(...A.map((v, i) => v + (B[i] - v) * t));
  });
}

// Ruido determinista en [0, 1) para texturas que no parpadean.
export function hash(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function px(g, x, y, c) {
  g.fillStyle = c;
  g.fillRect(x | 0, y | 0, 1, 1);
}

// Elipse rellena de píxeles centrada en (cx, cy).
export function blob(g, cx, cy, rx, ry, c) {
  g.fillStyle = c;
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
    g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

export function line(g, x0, y0, x1, y1, c) {
  g.fillStyle = c;
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// Caja con volumen: borde de luz arriba e izquierda y sombra abajo y derecha.
function box(g, x, y, w, h, c, lit = 0.22, dark = -0.25) {
  R(g, x, y, w, h, c);
  R(g, x, y, w, 1, shade(c, lit));
  R(g, x, y + 1, 1, h - 1, shade(c, lit / 2));
  R(g, x + w - 1, y + 1, 1, h - 1, shade(c, dark));
  R(g, x + 1, y + h - 1, w - 1, 1, shade(c, dark));
}

// ---------------------------------------------------------------- caché de sprites

const sprites = new Map();
const N4 = [[0, 1], [-1, 0], [1, 0], [0, -1]];

// Contorno selectivo: cada píxel vacío pegado al dibujo toma el color vecino
// muy oscurecido, como haría un artista a mano.
function addOutline(g, w, h, k) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  const ink = rgb(PAL.ink);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3]) continue;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = (yy * w + xx) * 4;
        if (src[j + 3] < 200) continue;
        for (let c = 0; c < 3; c++) d[i + c] = src[j + c] * (1 - k) + ink[c] * k;
        d[i + 3] = 255;
        break;
      }
    }
  }
  g.putImageData(img, 0, 0);
}

// Devuelve un lienzo de (w+2)x(h+2) con el dibujo desplazado 1 px para el contorno.
export function sprite(key, w, h, draw, outline = 0.72) {
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = w + 2;
  c.height = h + 2;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.translate(1, 1);
  draw(g);
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (outline) addOutline(g, c.width, c.height, outline);
  sprites.set(key, c);
  return c;
}

export function blit(ctx, spr, x, y) {
  ctx.drawImage(spr, Math.round(x) - 1, Math.round(y) - 1);
}

// ---------------------------------------------------------------- fuente 3x5

const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', $: '011110010011110', '+': '000010111010000', '-': '000000111000000', '.': '000000000000010',
  '!': '010010010000010', '?': '110001010000010', '<': '001010100010001', '>': '100010001010100', '/': '001001010100100',
  '%': '101001010100101', ':': '000010000010000', '*': '000101010101000', "'": '010010000000000', '&': '010101010101011',
  '#': '101111101111101', '(': '010100100100010', ')': '010001001001010', '♥': '000101111111010', '~': '000011110000000',
  ',': '000000000010100', ' ': '000000000000000',
};
const ACCENTS = { Á: 'A', À: 'A', É: 'E', È: 'E', Í: 'I', Ó: 'O', Ò: 'O', Ú: 'U', Ü: 'U', Ñ: 'N', Ç: 'C' };

export function textWidth(str, scale = 1) {
  return Math.max(0, String(str).length * 4 - 1) * scale;
}

export function drawText(ctx, str, x, y, color, scale = 1) {
  ctx.fillStyle = color;
  let cx = x | 0;
  for (const raw of String(str).toUpperCase()) {
    const ch = ACCENTS[raw] || raw;
    const g = GLYPHS[ch] || GLYPHS['?'];
    for (let i = 0; i < 15; i++) {
      if (g[i] === '1') ctx.fillRect(cx + (i % 3) * scale, (y | 0) + Math.floor(i / 3) * scale, scale, scale);
    }
    cx += 4 * scale;
  }
}

// Texto con sombra de 1 px debajo, para rótulos.
export function drawTextShadow(ctx, str, x, y, color, shadow) {
  drawText(ctx, str, x, y + 1, shadow);
  drawText(ctx, str, x, y, color);
}

// ---------------------------------------------------------------- personas

const BLUSH = '#ff6b8b';
const SHOE = '#2a2233';
const WHITE = PAL.white;
const moodKey = (m) => (m > 70 ? 2 : m < 30 ? 0 : 1);
const blinking = (L, t) => (t + L.style * 0.7) % 4 < 0.14;

// Cabeza de 10x9 con la parte de arriba en y = 2 (deja sitio a moños y gorras).
const HEAD = [[3, 8], [2, 9], [1, 10], [1, 10], [1, 10], [1, 10], [1, 10], [2, 9], [3, 8]];
const HY = 2;

function hairArt(g, L) {
  const h = L.hair;
  const hl = shade(h, h === PAL.ink ? 0.28 : 0.3);
  const hd = shade(h, -0.3);
  const row = (r, a, b, c = h) => R(g, a, HY + r, b - a + 1, 1, c);
  switch (L.style) {
    case 0: // corto con flequillo de lado
      row(-1, 3, 8);
      row(0, 2, 9);
      row(1, 1, 10);
      row(2, 1, 10);
      row(3, 1, 5);
      row(3, 10, 10);
      row(4, 1, 1);
      row(4, 10, 10, hd);
      row(-1, 4, 5, hl);
      row(0, 3, 3, hl);
      row(1, 2, 2, hl);
      row(2, 9, 10, hd);
      row(3, 5, 5, hd);
      break;
    case 1: // melena
      row(-1, 3, 8);
      row(0, 2, 9);
      row(1, 1, 10);
      row(2, 0, 11);
      row(3, 0, 3);
      row(3, 8, 11);
      for (let r = 4; r <= 10; r++) {
        row(r, 0, 1, r > 8 ? hd : h);
        row(r, 10, 11, hd);
      }
      row(-1, 4, 5, hl);
      row(0, 3, 4, hl);
      row(1, 2, 2, hl);
      row(1, 6, 6, hd);
      row(4, 0, 0, hl);
      row(5, 0, 0, hl);
      break;
    case 2: // moño alto
      row(-3, 5, 6);
      row(-2, 4, 7);
      row(-1, 3, 8, hd);
      row(-2, 5, 5, hl);
      row(-1, 3, 8);
      row(0, 2, 9);
      row(1, 1, 10);
      row(2, 1, 2);
      row(2, 9, 10);
      row(3, 1, 1);
      row(3, 10, 10, hd);
      row(0, 3, 4, hl);
      row(1, 2, 2, hl);
      row(1, 9, 10, hd);
      break;
    case 3: // rizos
      row(-2, 3, 8);
      row(-1, 1, 10);
      row(0, 0, 11);
      row(1, 0, 11);
      row(2, 0, 11);
      row(3, 0, 2);
      row(3, 9, 11);
      row(4, 0, 1);
      row(4, 10, 11);
      row(5, 0, 0);
      row(5, 11, 11);
      for (const [x, r] of [[3, -1], [6, -2], [2, 1], [5, 0], [8, 1], [1, 3], [4, 2], [7, -1]]) px(g, x, HY + r, hl);
      for (const [x, r] of [[10, 1], [11, 3], [9, 2], [6, 2], [11, 5]]) px(g, x, HY + r, hd);
      break;
    case 4: // rapado
      row(0, 3, 8, mix(h, L.skin, 0.35));
      row(1, 2, 9, mix(h, L.skin, 0.45));
      row(2, 1, 1, mix(h, L.skin, 0.5));
      row(2, 10, 10, mix(h, L.skin, 0.5));
      px(g, 4, HY + 1, mix(h, L.skin, 0.2));
      break;
    default: // flequillo recto y coleta
      row(-1, 3, 8);
      row(0, 2, 9);
      row(1, 1, 10);
      row(2, 1, 10);
      row(3, 1, 10);
      row(4, 1, 1);
      row(4, 10, 10, hd);
      for (let r = 2; r <= 8; r++) row(r, 11, 11, r === 3 ? PAL.red : hd);
      row(-1, 4, 5, hl);
      row(0, 3, 3, hl);
      row(3, 2, 9, shade(h, -0.12));
      row(1, 2, 3, hl);
  }
}

function personArt(g, L, shirt, role, pose, mood, blink) {
  const skin = L.skin;
  const skinD = shade(skin, -0.2);
  const standing = pose !== 's';
  // Piernas y zapatos
  if (standing) {
    const p = L.pants;
    const pD = shade(p, -0.3);
    const lh = pose === 'w0' ? 1 : 2;
    const rh = pose === 'w1' ? 1 : 2;
    R(g, 3, 18, 6, 1, p);
    R(g, 3, 19, 2, lh, p);
    R(g, 7, 19, 2, rh, pD);
    R(g, 2, 19 + lh, 3, 1, SHOE);
    R(g, 7, 19 + rh, 3, 1, SHOE);
    px(g, 2, 19 + lh, shade(SHOE, 0.3));
  }
  // Torso
  const coat = role === 'research' ? WHITE : role === 'legal' ? PAL.navy : shirt;
  const cL = shade(coat, 0.22);
  const cD = shade(coat, -0.25);
  R(g, 3, 11, 6, 1, coat);
  R(g, 2, 12, 8, 6, coat);
  R(g, 3, 11, 5, 1, cL);
  R(g, 2, 12, 1, 5, cL);
  R(g, 9, 12, 1, 6, cD);
  R(g, 2, 17, 8, 1, cD);
  // Brazos
  if (standing) {
    const la = pose === 'w0' ? 5 : pose === 'w1' ? 3 : 4;
    const ra = pose === 'w1' ? 5 : pose === 'w0' ? 3 : 4;
    R(g, 1, 12, 1, la, coat);
    R(g, 10, 12, 1, ra, cD);
    px(g, 1, 12 + la, skin);
    px(g, 10, 12 + ra, skinD);
  } else {
    R(g, 1, 12, 1, 4, coat);
    R(g, 10, 12, 1, 4, cD);
  }
  // Cuello, cuello de la camisa y detalles de cada rol
  R(g, 4, 11, 4, 1, skinD);
  switch (role) {
    case 'founder': // sudadera con capucha
      R(g, 2, 11, 8, 1, shade(coat, -0.15));
      R(g, 4, 11, 4, 1, skinD);
      px(g, 4, 12, WHITE);
      px(g, 4, 13, WHITE);
      px(g, 7, 12, WHITE);
      px(g, 7, 13, WHITE);
      if (standing) R(g, 4, 15, 4, 2, shade(coat, -0.12));
      break;
    case 'research': // bata sobre camiseta
      R(g, 5, 11, 2, 3, shirt);
      px(g, 4, 12, PAL.silver);
      px(g, 7, 12, PAL.silver);
      px(g, 8, 13, PAL.blue);
      break;
    case 'legal': // traje, camisa y corbata
      R(g, 4, 11, 4, 2, WHITE);
      R(g, 5, 12, 2, 4, PAL.red);
      px(g, 6, 13, shade(PAL.red, -0.3));
      break;
    case 'sales': // cuello blanco y corbata
      px(g, 4, 11, WHITE);
      px(g, 7, 11, WHITE);
      R(g, 5, 11, 2, 1, skinD);
      R(g, 5, 12, 2, 4, PAL.yellow);
      px(g, 6, 13, shade(PAL.yellow, -0.25));
      break;
    case 'hr': // chaqueta de punto con broche de corazón
      R(g, 5, 12, 1, 5, shade(coat, 0.3));
      px(g, 3, 13, BLUSH);
      break;
    case 'marketer':
      R(g, 4, 11, 4, 1, WHITE);
      px(g, 8, 13, PAL.yellow);
      break;
    default:
      break;
  }
  // Cabeza
  HEAD.forEach(([a, b], r) => R(g, a, HY + r, b - a + 1, 1, skin));
  R(g, 0, HY + 4, 1, 2, skin);
  R(g, 11, HY + 4, 1, 2, skinD);
  R(g, 10, HY + 2, 1, 5, skinD);
  px(g, 9, HY + 7, skinD);
  R(g, 3, HY + 8, 6, 1, skinD);
  // Ojos
  if (blink) {
    px(g, 3, HY + 5, shade(skin, -0.45));
    px(g, 8, HY + 5, shade(skin, -0.45));
  } else {
    R(g, 3, HY + 4, 1, 2, PAL.ink);
    R(g, 8, HY + 4, 1, 2, PAL.ink);
  }
  // Mofletes y boca según el ánimo
  const mouth = mix(skin, '#5a1f33', 0.65);
  if (mood > 0) {
    px(g, 2, HY + 6, mix(skin, BLUSH, 0.45));
    px(g, 9, HY + 6, mix(skin, BLUSH, 0.35));
  }
  if (L.beard) {
    const b = L.hair;
    R(g, 1, HY + 5, 1, 2, b);
    R(g, 10, HY + 5, 1, 2, shade(b, -0.2));
    R(g, 2, HY + 7, 8, 1, b);
    R(g, 3, HY + 8, 6, 1, shade(b, -0.2));
    R(g, 4, HY + 6, 4, 1, b);
  }
  if (mood === 2) {
    px(g, 4, HY + 6, mouth);
    px(g, 7, HY + 6, mouth);
    R(g, 5, HY + 7, 2, 1, mouth);
  } else if (mood === 0) {
    R(g, 5, HY + 6, 2, 1, mouth);
    px(g, 4, HY + 7, mouth);
    px(g, 7, HY + 7, mouth);
    px(g, 3, HY + 3, shade(L.hair, -0.1));
    px(g, 8, HY + 3, shade(L.hair, -0.1));
  } else {
    R(g, 5, HY + 7, 2, 1, mix(skin, '#5a1f33', 0.45));
  }
  hairArt(g, L);
  // Gafas
  if (L.glasses && role !== 'ai') {
    const f = PAL.dark;
    R(g, 2, HY + 3, 3, 1, f);
    R(g, 7, HY + 3, 3, 1, f);
    R(g, 5, HY + 4, 2, 1, f);
    px(g, 2, HY + 4, f);
    px(g, 9, HY + 4, f);
    px(g, 4, HY + 4, mix(skin, WHITE, 0.55));
    px(g, 7, HY + 4, mix(skin, WHITE, 0.55));
  }
  // Accesorios de la cabeza
  switch (role) {
    case 'dev': { // cascos
      const c = PAL.dark;
      R(g, 2, HY - 2, 8, 1, c);
      px(g, 1, HY - 1, c);
      px(g, 10, HY - 1, c);
      R(g, 3, HY - 2, 3, 1, PAL.slate);
      R(g, 0, HY + 3, 2, 4, c);
      R(g, 10, HY + 3, 2, 4, c);
      px(g, 0, HY + 4, PAL.red);
      px(g, 11, HY + 4, shade(PAL.red, -0.3));
      break;
    }
    case 'design': { // boina
      const c = PAL.plum;
      R(g, 3, HY - 3, 7, 1, c);
      R(g, 2, HY - 2, 9, 2, c);
      R(g, 3, HY, 7, 1, shade(c, -0.25));
      R(g, 4, HY - 3, 2, 1, shade(c, 0.35));
      px(g, 3, HY - 2, shade(c, 0.25));
      px(g, 7, HY - 4, c);
      break;
    }
    case 'devops': { // gorra
      const c = shade(PAL.green, -0.15);
      R(g, 3, HY - 2, 6, 1, c);
      R(g, 2, HY - 1, 8, 2, c);
      R(g, 4, HY - 2, 2, 1, shade(c, 0.35));
      R(g, 1, HY + 1, 7, 1, shade(c, -0.35));
      px(g, 6, HY - 1, WHITE);
      break;
    }
    case 'pm': { // auriculares con micro
      const c = PAL.dark;
      R(g, 2, HY - 2, 8, 1, c);
      px(g, 1, HY - 1, c);
      R(g, 0, HY + 3, 1, 3, c);
      px(g, 1, HY + 6, c);
      R(g, 2, HY + 7, 2, 1, c);
      px(g, 4, HY + 7, PAL.red);
      break;
    }
    case 'ai': { // visor inteligente
      R(g, 1, HY + 3, 10, 3, PAL.teal);
      R(g, 1, HY + 3, 10, 1, shade(PAL.teal, -0.3));
      R(g, 2, HY + 4, 3, 1, PAL.cyan);
      R(g, 7, HY + 4, 3, 1, PAL.cyan);
      px(g, 2, HY + 4, WHITE);
      break;
    }
    case 'marketer': { // gafas de sol sobre el pelo
      R(g, 2, HY, 3, 1, PAL.ink);
      R(g, 7, HY, 3, 1, PAL.ink);
      R(g, 5, HY, 2, 1, PAL.dark);
      px(g, 3, HY, PAL.sky);
      px(g, 8, HY, PAL.sky);
      break;
    }
    default:
      break;
  }
}

function personSprite(L, shirt, role, pose, mood, blink) {
  const key = `p|${pose}|${L.skin}|${L.hair}|${L.style}|${L.glasses ? 1 : 0}|${L.beard ? 1 : 0}|${L.pants}|${shirt}|${role}|${mood}|${blink ? 1 : 0}`;
  return sprite(key, 12, 22, (g) => personArt(g, L, shirt, role, pose, mood, blink));
}

// Persona sentada (12x16 visibles). Su cabeza empieza 2 px por debajo de y.
export function drawSeated(ctx, x, y, L, shirt, t, mood, role = '') {
  blit(ctx, personSprite(L, shirt, role, 's', moodKey(mood), blinking(L, t)), x, y);
}

// Persona de pie (12x22). frame: 0 y 1 al caminar, otro valor = quieta.
export function drawStanding(ctx, x, y, L, shirt, frame, t, mood, role = '') {
  const pose = frame === 0 ? 'w0' : frame === 1 ? 'w1' : 'i';
  blit(ctx, personSprite(L, shirt, role, pose, moodKey(mood), blinking(L, t)), x, y);
}

// Retrato para las fichas del equipo (16x16).
export function drawPortrait(ctx, L, shirt, role) {
  R(ctx, 0, 0, 16, 16, PAL.navy);
  blob(ctx, 8, 8, 7, 7, shade(PAL.navy, 0.12));
  R(ctx, 0, 15, 16, 1, shade(PAL.navy, -0.3));
  blit(ctx, personSprite(L, shirt, role, 's', 2, false), 2, 1);
}

// ---------------------------------------------------------------- bocadillos

const ICONS = {
  zz: ['11110', '00100', '01000', '11110', '00000'],
  bang: ['00100', '00100', '00100', '00000', '00100'],
  heart: ['01010', '11111', '11111', '01110', '00100'],
  q: ['01110', '00010', '00100', '00000', '00100'],
  bulb: ['01110', '11111', '01110', '01110', '00100'],
  palm: ['11011', '01110', '00100', '00100', '01110'],
};
const ICON_COLOR = { zz: PAL.blue, bang: PAL.red, heart: BLUSH, q: PAL.slate, bulb: '#f2a531', palm: PAL.green };

export function drawBubble(ctx, x, y, icon) {
  const spr = sprite('bubble|' + icon, 9, 9, (g) => {
    R(g, 1, 0, 7, 1, WHITE);
    R(g, 0, 1, 9, 5, WHITE);
    R(g, 1, 6, 7, 1, WHITE);
    R(g, 1, 7, 2, 1, WHITE);
    px(g, 1, 8, WHITE);
    R(g, 1, 6, 7, 1, '#d6e0ea');
    const rows = ICONS[icon];
    g.fillStyle = ICON_COLOR[icon];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (rows[r][c] === '1') g.fillRect(2 + c, 1 + r, 1, 1);
  }, 0.85);
  blit(ctx, spr, x, y);
}

// ---------------------------------------------------------------- sombras y luces

export function floorShadow(ctx, x, y, w, alpha = 0.26) {
  ctx.fillStyle = `rgba(14,10,30,${alpha})`;
  ctx.fillRect(x + 2, y - 1, w - 4, 1);
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x + 2, y + 2, w - 4, 1);
}

const glows = new Map();
// Halo de luz circular (degradado) para lámparas, pantallas y racks.
export function glowSprite(color, r) {
  const key = color + r;
  let c = glows.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = r * 2;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, r * 2, r * 2);
    glows.set(key, c);
  }
  return c;
}

// ---------------------------------------------------------------- mesas de trabajo

export function drawDesk(ctx, x, y, top, front) {
  blit(ctx, sprite(`desk|${top}|${front}`, 24, 14, (g) => {
    const fD = shade(front, -0.28);
    // Patas y faldón
    R(g, 1, 5, 2, 9, fD);
    R(g, 21, 5, 2, 9, fD);
    px(g, 1, 5, front);
    R(g, 3, 5, 12, 4, shade(front, -0.4));
    // Cajonera
    box(g, 14, 5, 8, 9, front, 0.12, -0.25);
    R(g, 14, 9, 8, 1, fD);
    R(g, 16, 7, 4, 1, shade(front, 0.35));
    R(g, 16, 11, 4, 1, shade(front, 0.35));
    // Tablero con canto
    R(g, 0, 0, 24, 4, top);
    R(g, 0, 0, 24, 1, shade(top, 0.3));
    R(g, 0, 4, 24, 1, shade(top, -0.22));
    R(g, 23, 1, 1, 3, shade(top, -0.1));
  }), x, y);
}

export function drawChair(ctx, x, y, c) {
  blit(ctx, sprite('chair|' + c, 14, 11, (g) => {
    const cD = shade(c, -0.3);
    R(g, 2, 0, 10, 1, c);
    R(g, 1, 1, 12, 9, c);
    R(g, 2, 10, 10, 1, cD);
    R(g, 2, 1, 8, 1, shade(c, 0.3));
    R(g, 1, 2, 1, 7, shade(c, 0.18));
    R(g, 12, 2, 1, 8, cD);
    R(g, 3, 5, 8, 1, shade(c, -0.12));
  }), x, y);
}

// Monitor de 8x9. Con la pantalla encendida se ven líneas de código que
// avanzan mientras la persona trabaja.
export function drawMonitor(ctx, x, y, glow, on, t = 0, seed = 0, working = false) {
  blit(ctx, sprite('monitor', 8, 9, (g) => {
    R(g, 0, 0, 8, 6, '#2b3047');
    R(g, 0, 0, 8, 1, '#4a5374');
    R(g, 1, 1, 6, 4, '#10131f');
    R(g, 3, 6, 2, 2, '#3a4160');
    R(g, 1, 8, 6, 1, '#2b3047');
    R(g, 1, 8, 2, 1, '#4a5374');
  }), x, y);
  if (!on) {
    px(ctx, x + 2, y + 2, '#2a3048');
    return;
  }
  R(ctx, x + 1, y + 1, 6, 4, shade(glow, -0.7));
  R(ctx, x + 1, y + 1, 6, 1, shade(glow, -0.4));
  const scroll = working ? Math.floor(t * 3) : 0;
  for (let r = 0; r < 2; r++) {
    const k = r + scroll;
    const ind = hash(seed, k, 3) < 0.35 ? 1 : 0;
    const len = 1 + Math.floor(hash(seed, k, 7) * (5 - ind));
    R(ctx, x + 1 + ind, y + 2 + r * 2, len, 1, r ? shade(glow, 0.1) : shade(glow, 0.45));
  }
  if (working && (t * 2) % 2 < 1) px(ctx, x + 6, y + 4, WHITE);
}

// Objeto decorativo sobre cada mesa, distinto según su posición.
export function drawDeskProp(ctx, x, y, kind, t, steaming) {
  switch (kind) {
    case 0: // taza
      R(ctx, x, y + 1, 3, 3, WHITE);
      R(ctx, x, y + 1, 3, 1, '#6b4024');
      px(ctx, x + 3, y + 2, '#c9d3dc');
      if (steaming) px(ctx, x + 1, y - 1 - (Math.floor(t * 3) % 2), 'rgba(244,244,244,.55)');
      break;
    case 1: // cactus
      R(ctx, x + 1, y - 1, 2, 3, PAL.green);
      px(ctx, x, y, PAL.green);
      px(ctx, x + 1, y - 1, PAL.lime);
      R(ctx, x, y + 2, 4, 2, '#c46a45');
      break;
    case 2: // papeles
      R(ctx, x, y + 2, 4, 2, WHITE);
      R(ctx, x + 1, y + 1, 3, 1, '#dde5ee');
      px(ctx, x + 1, y + 3, PAL.silver);
      break;
    case 3: // figura de unicornio
      R(ctx, x, y + 1, 3, 2, '#f7d6ff');
      px(ctx, x + 2, y, '#f7d6ff');
      px(ctx, x + 3, y - 1, PAL.yellow);
      R(ctx, x, y + 3, 1, 1, '#c9a2d6');
      px(ctx, x + 2, y + 3, '#c9a2d6');
      break;
    case 4: // lata de refresco
      R(ctx, x + 1, y + 1, 2, 3, PAL.red);
      px(ctx, x + 1, y + 1, PAL.silver);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------- mobiliario

const WOOD = '#a0643c';
const WOOD_D = '#6b4024';
const WOOD_L = '#c98a60';
const LEAF_D = '#1f6f4a';
const LEAF = PAL.green;
const LEAF_L = PAL.lime;
const TERRA = '#c46a45';

export function drawPlant(ctx, x, y, t) {
  const sway = Math.sin(t * 1.3 + x) > 0.6 ? 1 : 0;
  blit(ctx, sprite('plant|' + sway, 10, 14, (g) => {
    // Hojas
    blob(g, 5, 5, 4, 3, LEAF_D);
    blob(g, 3 + sway, 3, 2, 2, LEAF);
    blob(g, 7, 3, 2, 2, LEAF);
    blob(g, 5 + sway, 1, 1, 1, LEAF);
    blob(g, 2, 6, 2, 1, LEAF);
    blob(g, 8, 6, 1, 1, LEAF);
    px(g, 2 + sway, 2, LEAF_L);
    px(g, 6, 2, LEAF_L);
    px(g, 5 + sway, 0, LEAF_L);
    px(g, 1, 5, LEAF_L);
    px(g, 0, 7, LEAF);
    px(g, 9, 4, LEAF);
    R(g, 4, 7, 2, 2, LEAF_D);
    // Maceta
    R(g, 1, 8, 8, 2, shade(TERRA, 0.15));
    R(g, 1, 8, 8, 1, shade(TERRA, 0.35));
    R(g, 2, 10, 6, 4, TERRA);
    R(g, 2, 10, 1, 4, shade(TERRA, 0.12));
    R(g, 7, 10, 1, 4, shade(TERRA, -0.25));
    R(g, 2, 10, 6, 1, shade(TERRA, -0.3));
    R(g, 2, 8, 6, 1, '#4a2f1f');
  }), x, y);
}

export function drawRug(ctx, x, y) {
  blit(ctx, sprite('rug', 32, 20, (g) => {
    const red = '#9e3348';
    R(g, 1, 0, 30, 20, '#6b2233');
    R(g, 2, 1, 28, 18, red);
    R(g, 4, 3, 24, 14, '#6b2233');
    R(g, 5, 4, 22, 12, '#c24d62');
    // Medallón central
    for (let i = 0; i < 5; i++) R(g, 16 - i * 2, 6 + i, 1 + i * 4, 1, PAL.yellow);
    for (let i = 0; i < 4; i++) R(g, 10 + i * 2, 11 + i, 13 - i * 4, 1, PAL.yellow);
    blob(g, 16, 10, 2, 1, '#6b2233');
    px(g, 16, 10, PAL.orange);
    for (const [cx, cy] of [[7, 6], [25, 6], [7, 14], [25, 14]]) {
      px(g, cx, cy, PAL.yellow);
      px(g, cx - 1, cy, PAL.orange);
      px(g, cx + 1, cy, PAL.orange);
    }
    for (let i = 3; i < 29; i += 2) {
      px(g, i, 2, '#c24d62');
      px(g, i, 17, '#c24d62');
    }
    // Flecos
    for (let yy = 1; yy < 19; yy += 2) {
      px(g, 0, yy, '#e8d0a0');
      px(g, 31, yy, '#e8d0a0');
    }
  }, 0), x, y);
}

export function drawLamp(ctx, x, y, t) {
  const on = (t + x) % 9 > 0.15;
  blit(ctx, sprite('lamp|' + on, 8, 22, (g) => {
    const s = on ? '#ffe3a3' : '#c9a86a';
    R(g, 2, 0, 4, 1, s);
    R(g, 1, 1, 6, 2, s);
    R(g, 0, 3, 8, 3, s);
    R(g, 2, 0, 2, 1, WHITE);
    R(g, 1, 1, 1, 4, on ? WHITE : shade(s, 0.2));
    R(g, 7, 3, 1, 3, shade(s, -0.25));
    R(g, 0, 6, 8, 1, shade(s, -0.35));
    R(g, 3, 7, 2, 13, PAL.slate);
    px(g, 3, 7, PAL.silver);
    R(g, 3, 8, 1, 12, PAL.silver);
    R(g, 1, 20, 6, 2, PAL.dark);
    R(g, 1, 20, 6, 1, PAL.slate);
  }), x, y);
}

export function drawCoffee(ctx, x, y, t) {
  blit(ctx, sprite('coffee', 12, 20, (g) => {
    // Mueble
    box(g, 0, 11, 12, 9, WOOD);
    R(g, 5, 13, 1, 6, WOOD_D);
    px(g, 3, 15, WOOD_L);
    px(g, 8, 15, WOOD_L);
    // Máquina de espresso
    box(g, 1, 1, 10, 10, '#c9d3dc', 0.35, -0.3);
    R(g, 1, 1, 10, 1, WHITE);
    R(g, 7, 2, 3, 2, PAL.ink);
    R(g, 3, 4, 4, 1, PAL.slate);
    R(g, 4, 5, 2, 1, PAL.dark);
    R(g, 0, 5, 4, 1, PAL.ink);
    R(g, 4, 7, 3, 3, WHITE);
    R(g, 4, 7, 3, 1, '#6b4024');
    px(g, 7, 8, '#dde5ee');
    R(g, 2, 10, 8, 1, PAL.slate);
    // Taza encima
    R(g, 2, -1, 3, 2, WHITE);
    px(g, 2, -1, '#dde5ee');
  }), x, y);
  px(ctx, x + 8, y + 3, (t * 2) % 2 < 1 ? PAL.red : PAL.lime);
  const k = Math.floor(t * 3) % 3;
  ctx.fillStyle = 'rgba(244,244,244,.55)';
  ctx.fillRect(x + 5 + (k === 1 ? 1 : 0), y + 5 - k, 1, 2);
}

export function drawCooler(ctx, x, y, t) {
  blit(ctx, sprite('cooler', 10, 20, (g) => {
    // Garrafa
    R(g, 3, 0, 4, 1, '#5fb8e8');
    R(g, 2, 1, 6, 7, '#8fdcf2');
    R(g, 2, 1, 6, 2, '#b8ecf7');
    R(g, 3, 2, 1, 5, WHITE);
    R(g, 7, 2, 1, 6, '#5fb8e8');
    // Dispensador
    box(g, 1, 8, 8, 12, '#e8eef4', 0.4, -0.25);
    R(g, 1, 8, 8, 1, PAL.silver);
    R(g, 2, 10, 6, 4, '#c9d3dc');
    px(g, 3, 11, PAL.red);
    px(g, 6, 11, PAL.blue);
    R(g, 2, 13, 6, 1, PAL.dark);
    R(g, 2, 18, 6, 2, PAL.silver);
  }), x, y);
  const b = Math.floor(t * 2) % 6;
  px(ctx, x + 5, y + 6 - b, WHITE);
}

export function drawVending(ctx, x, y, t) {
  blit(ctx, sprite('vending', 14, 22, (g) => {
    box(g, 0, 0, 14, 22, PAL.red, 0.25, -0.3);
    R(g, 1, 1, 12, 1, shade(PAL.red, 0.35));
    // Escaparate
    R(g, 2, 3, 8, 13, '#1b2140');
    const snacks = [PAL.yellow, PAL.lime, PAL.orange, PAL.cyan, BLUSH, WHITE];
    for (let r = 0; r < 4; r++) {
      R(g, 2, 6 + r * 3, 8, 1, '#3a4160');
      for (let c = 0; c < 3; c++) R(g, 3 + c * 2 + (c > 1 ? 1 : 0), 4 + r * 3, 2, 2, snacks[(r * 2 + c) % snacks.length]);
    }
    line(g, 3, 15, 9, 9, 'rgba(255,255,255,.18)');
    line(g, 4, 15, 9, 10, 'rgba(255,255,255,.08)');
    // Panel y bandeja
    R(g, 11, 4, 2, 3, PAL.ink);
    R(g, 11, 8, 2, 4, PAL.silver);
    px(g, 11, 9, PAL.dark);
    px(g, 12, 10, PAL.dark);
    R(g, 2, 17, 8, 3, PAL.ink);
    R(g, 2, 17, 8, 1, shade(PAL.red, -0.45));
  }), x, y);
  px(ctx, x + 11, y + 13, (t % 1.5) < 0.75 ? PAL.lime : PAL.green);
  R(ctx, x + 11, y + 4, 2, 1, (t % 2) < 1 ? PAL.cyan : PAL.teal);
}

export function drawSofa(ctx, x, y, c = '#5d6bd6') {
  blit(ctx, sprite('sofa|' + c, 30, 14, (g) => {
    const cD = shade(c, -0.25);
    const cL = shade(c, 0.25);
    // Respaldo
    R(g, 3, 0, 24, 7, cD);
    R(g, 3, 0, 24, 1, shade(c, 0.05));
    R(g, 15, 1, 1, 5, shade(c, -0.4));
    // Asiento con dos cojines
    R(g, 3, 7, 24, 4, c);
    R(g, 3, 7, 24, 1, cL);
    R(g, 15, 7, 1, 4, cD);
    R(g, 3, 11, 24, 2, shade(c, -0.35));
    // Brazos
    for (const ax of [0, 26]) {
      R(g, ax, 4, 4, 9, c);
      R(g, ax, 4, 4, 1, cL);
      R(g, ax + 3, 5, 1, 8, cD);
    }
    // Cojín decorativo
    R(g, 5, 2, 5, 5, PAL.yellow);
    R(g, 5, 2, 5, 1, shade(PAL.yellow, 0.3));
    R(g, 9, 3, 1, 4, shade(PAL.yellow, -0.25));
    // Patas
    R(g, 2, 13, 2, 1, WOOD_D);
    R(g, 26, 13, 2, 1, WOOD_D);
  }), x, y);
}

export function drawFoosball(ctx, x, y, t) {
  blit(ctx, sprite('foosball', 28, 17, (g) => {
    // Patas
    R(g, 3, 12, 2, 5, WOOD_D);
    R(g, 23, 12, 2, 5, WOOD_D);
    // Mesa y campo
    box(g, 1, 2, 26, 11, WOOD, 0.25, -0.3);
    R(g, 3, 3, 22, 8, '#2f9a55');
    for (let i = 0; i < 22; i += 4) R(g, 3 + i, 3, 2, 8, PAL.green);
    R(g, 13, 3, 2, 8, '#6fd08a');
    R(g, 3, 6, 1, 3, '#6fd08a');
    R(g, 24, 6, 1, 3, '#6fd08a');
    R(g, 1, 6, 2, 3, PAL.ink);
    R(g, 25, 6, 2, 3, PAL.ink);
    // Barras con jugadores
    const rods = [6, 11, 16, 21];
    rods.forEach((rx, i) => {
      R(g, rx, 0, 1, 15, '#c9d3dc');
      R(g, rx, 0, 1, 2, PAL.ink);
      R(g, rx, 14, 1, 2, PAL.ink);
      for (const py of [4, 7, 9]) {
        if (i % 2 && py === 7) continue;
        R(g, rx - 1 + (i % 2), py, 1, 2, i % 2 ? PAL.red : PAL.blue);
      }
    });
  }), x, y);
  const bx = x + 4 + Math.round(((Math.sin(t * 2.2) + 1) / 2) * 19);
  px(ctx, bx, y + 8, WHITE);
}

export function drawAC(ctx, x, y, t) {
  blit(ctx, sprite('ac', 22, 7, (g) => {
    R(g, 1, 0, 20, 7, '#eef3f7');
    R(g, 0, 1, 22, 5, '#eef3f7');
    R(g, 1, 0, 20, 1, WHITE);
    R(g, 1, 5, 20, 1, '#c9d3dc');
    R(g, 2, 6, 18, 1, PAL.slate);
    R(g, 3, 2, 4, 1, '#c9d3dc');
    R(g, 21, 1, 1, 5, '#c9d3dc');
  }), x, y);
  px(ctx, x + 18, y + 2, PAL.lime);
  const k = Math.floor(t * 4) % 3;
  ctx.fillStyle = 'rgba(115,239,247,.5)';
  ctx.fillRect(x + 4 + k * 5, y + 8 + k, 3, 1);
  ctx.fillRect(x + 12 - k * 3, y + 9 + ((k + 1) % 3), 2, 1);
}

export function drawAquarium(ctx, x, y, t) {
  blit(ctx, sprite('aquarium', 24, 18, (g) => {
    // Mueble
    box(g, 2, 12, 20, 6, WOOD, 0.25, -0.3);
    R(g, 11, 13, 1, 4, WOOD_D);
    px(g, 9, 15, WOOD_L);
    px(g, 13, 15, WOOD_L);
    // Tanque
    R(g, 0, 0, 24, 12, '#2b3047');
    R(g, 0, 0, 24, 1, PAL.slate);
    R(g, 1, 1, 22, 2, '#6cc4f7');
    R(g, 1, 3, 22, 4, PAL.sky);
    R(g, 1, 7, 22, 2, '#3182d8');
    R(g, 1, 9, 22, 2, '#e8c98a');
    for (let i = 0; i < 8; i++) px(g, 2 + Math.floor(hash(i, 1, 4) * 20), 9 + (i % 2), '#c9a064');
    R(g, 13, 8, 4, 2, PAL.slate);
    R(g, 13, 8, 2, 1, PAL.silver);
    for (const [sx, h] of [[3, 5], [4, 3], [19, 6], [20, 4]]) {
      R(g, sx, 9 - h, 1, h, sx % 2 ? LEAF : LEAF_D);
      px(g, sx, 9 - h, LEAF_L);
    }
    line(g, 2, 2, 5, 5, 'rgba(255,255,255,.35)');
    R(g, 1, 1, 22, 1, 'rgba(255,255,255,.4)');
  }), x, y);
  const fx = x + 3 + Math.floor(((Math.sin(t * 0.9) + 1) / 2) * 15);
  const dir = Math.cos(t * 0.9) > 0 ? 1 : -1;
  R(ctx, fx, y + 4, 3, 2, PAL.orange);
  px(ctx, fx + (dir > 0 ? -1 : 3), y + 4, PAL.yellow);
  px(ctx, fx + (dir > 0 ? -1 : 3), y + 5, PAL.yellow);
  px(ctx, fx + (dir > 0 ? 2 : 0), y + 4, PAL.ink);
  const gx = x + 17 - Math.floor(((Math.sin(t * 0.6 + 2) + 1) / 2) * 13);
  R(ctx, gx, y + 7, 2, 1, PAL.yellow);
  px(ctx, gx + 2, y + 7, PAL.orange);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillRect(x + 12, y + 2 + Math.floor((t * 3) % 6), 1, 1);
  ctx.fillRect(x + 6, y + 2 + Math.floor((t * 2 + 3) % 6), 1, 1);
}

export function drawArcade(ctx, x, y, t) {
  blit(ctx, sprite('arcade', 14, 24, (g) => {
    const body = PAL.plum;
    box(g, 0, 3, 14, 21, body, 0.2, -0.3);
    // Marquesina
    R(g, 0, 0, 14, 4, PAL.orange);
    R(g, 0, 0, 14, 1, PAL.yellow);
    R(g, 2, 1, 10, 2, PAL.yellow);
    for (let i = 0; i < 5; i++) px(g, 3 + i * 2, 2, i % 2 ? PAL.red : PAL.plum);
    // Pantalla
    R(g, 1, 4, 12, 9, PAL.ink);
    R(g, 2, 5, 10, 7, '#0d0f1c');
    // Panel de mandos
    R(g, 0, 13, 14, 3, shade(body, 0.2));
    R(g, 0, 13, 14, 1, shade(body, 0.4));
    R(g, 3, 12, 1, 2, PAL.dark);
    R(g, 2, 11, 3, 2, PAL.red);
    px(g, 2, 11, BLUSH);
    px(g, 8, 14, PAL.cyan);
    px(g, 10, 14, PAL.lime);
    // Arte lateral y monedero
    line(g, 1, 22, 4, 17, shade(body, 0.3));
    R(g, 5, 18, 4, 4, PAL.ink);
    R(g, 6, 19, 2, 1, PAL.orange);
  }), x, y);
  // Juego en marcha
  const f = Math.floor(t * 4) % 4;
  R(ctx, x + 3 + f * 2, y + 7, 2, 2, PAL.yellow);
  px(ctx, x + 10 - f, y + 10, PAL.cyan);
  px(ctx, x + 3 + ((f + 2) % 4) * 2, y + 10, BLUSH);
  R(ctx, x + 2, y + 5, 10, 1, 'rgba(115,239,247,.25)');
}

export function drawBookshelf(ctx, x, y) {
  blit(ctx, sprite('library', 22, 24, (g) => {
    box(g, 0, 0, 22, 24, WOOD, 0.25, -0.3);
    const colors = [PAL.red, PAL.blue, PAL.yellow, PAL.green, PAL.orange, PAL.teal, PAL.plum, PAL.sky];
    for (let r = 0; r < 3; r++) {
      const sy = 1 + r * 8;
      R(g, 1, sy, 20, 7, WOOD_D);
      R(g, 1, sy, 20, 1, '#4a2f1f');
      let bx = 2;
      let i = r * 3;
      while (bx < 20) {
        const w = hash(i, r, 11) < 0.3 ? 2 : 1;
        const h = 4 + Math.floor(hash(i, r, 5) * 3);
        if (bx + w > 20) break;
        if (r === 0 && bx > 15) break;
        const c = colors[i % colors.length];
        R(g, bx, sy + 7 - h, w, h, c);
        px(g, bx, sy + 7 - h, shade(c, 0.35));
        if (h > 4) px(g, bx, sy + 8 - h + 2, shade(c, -0.3));
        bx += w + (hash(i, r, 9) < 0.15 ? 1 : 0);
        i++;
      }
      R(g, 1, sy + 7, 20, 1, WOOD_L);
    }
    // Planta en el estante de arriba
    R(g, 17, 5, 3, 3, TERRA);
    blob(g, 18, 3, 2, 1, PAL.green);
    px(g, 17, 2, PAL.lime);
  }), x, y);
}

export function drawBallpit(ctx, x, y) {
  blit(ctx, sprite('ballpit', 34, 16, (g) => {
    const tube = PAL.sky;
    R(g, 2, 0, 30, 16, tube);
    R(g, 0, 2, 34, 12, tube);
    R(g, 1, 1, 32, 14, tube);
    R(g, 2, 0, 30, 1, shade(tube, 0.35));
    for (let i = 3; i < 32; i += 6) R(g, i, 0, 3, 3, WHITE);
    R(g, 1, 13, 32, 2, shade(tube, -0.3));
    R(g, 3, 3, 28, 10, PAL.navy);
    const balls = [PAL.red, PAL.yellow, PAL.lime, WHITE, PAL.orange, BLUSH, PAL.cyan];
    for (let i = 0; i < 46; i++) {
      const bx = 3 + Math.floor(hash(i, 1, 21) * 26);
      const by = 3 + Math.floor(hash(i, 2, 21) * 8);
      const c = balls[i % balls.length];
      R(g, bx, by, 2, 2, c);
      px(g, bx, by, shade(c, 0.4));
    }
  }), x, y);
}

export function drawPodcast(ctx, x, y, t) {
  const lit = t % 2 < 1.4;
  blit(ctx, sprite('podcast|' + lit, 26, 28, (g) => {
    // Cartel ON AIR
    R(g, 0, 0, 26, 7, PAL.ink);
    R(g, 1, 1, 24, 5, lit ? '#e04660' : '#5a2233');
    drawText(g, 'ON AIR', 2, 1, lit ? WHITE : '#8a4a5a');
    // Micros con brazo
    for (const mx of [6, 17]) {
      line(g, mx - 2, 15, mx, 12, PAL.slate);
      R(g, mx, 9, 3, 4, PAL.dark);
      R(g, mx, 9, 3, 1, PAL.silver);
      px(g, mx + 1, 10, PAL.slate);
    }
    // Mesa con espuma acústica
    R(g, 0, 14, 26, 3, '#2e3452');
    R(g, 0, 14, 26, 1, '#4a5374');
    R(g, 1, 17, 24, 11, '#3a2a4a');
    for (let i = 0; i < 6; i++) {
      for (let r = 0; r < 3; r++) {
        R(g, 2 + i * 4, 18 + r * 3, 3, 1, '#4d3862');
        px(g, 3 + i * 4, 19 + r * 3, '#4d3862');
      }
    }
    // Cascos sobre la mesa
    R(g, 10, 12, 5, 1, PAL.ink);
    px(g, 10, 13, PAL.red);
    px(g, 14, 13, PAL.red);
  }), x, y);
  // Medidor de nivel
  for (let i = 0; i < 4; i++) {
    const h = 1 + Math.floor(((Math.sin(t * 7 + i * 1.7) + 1) / 2) * 3);
    R(ctx, x + 11 + i, y + 26 - h, 1, h, i === 3 ? PAL.orange : PAL.lime);
  }
}

export function drawGym(ctx, x, y, t) {
  blit(ctx, sprite('gym', 36, 14, (g) => {
    // Cinta de correr
    R(g, 0, 8, 22, 5, PAL.dark);
    R(g, 0, 8, 22, 1, PAL.slate);
    R(g, 2, 9, 16, 2, '#1d2033');
    R(g, 18, 1, 2, 8, PAL.silver);
    px(g, 18, 1, WHITE);
    R(g, 15, 0, 7, 3, PAL.dark);
    R(g, 16, 1, 3, 1, PAL.cyan);
    R(g, 1, 13, 2, 1, PAL.ink);
    R(g, 19, 13, 2, 1, PAL.ink);
    // Soporte de mancuernas
    R(g, 25, 6, 10, 2, PAL.slate);
    R(g, 25, 6, 10, 1, PAL.silver);
    R(g, 26, 8, 1, 6, PAL.dark);
    R(g, 33, 8, 1, 6, PAL.dark);
    for (const dx of [26, 31]) {
      R(g, dx, 3, 1, 3, PAL.ink);
      R(g, dx + 3, 3, 1, 3, PAL.ink);
      R(g, dx + 1, 4, 2, 1, PAL.silver);
    }
    R(g, 27, 10, 6, 3, PAL.ink);
    R(g, 28, 9, 4, 1, PAL.ink);
    px(g, 28, 10, PAL.slate);
  }), x, y);
  const k = Math.floor(t * 6) % 4;
  for (let i = 0; i < 4; i++) R(ctx, x + 3 + ((i * 4 + k) % 15), y + 9, 1, 2, '#2e3452');
}

const GOLD = '#f2c14e';
const GOLD_L = '#fff0a8';
const GOLD_D = '#b8862a';
const GOLD_DD = '#7a5518';

export function drawStatue(ctx, x, y, t) {
  blit(ctx, sprite('statue', 16, 26, (g) => {
    // Pedestal de mármol
    box(g, 2, 18, 12, 8, '#dfe6ee', 0.3, -0.3);
    R(g, 1, 17, 14, 2, WHITE);
    R(g, 1, 18, 14, 1, '#c9d3dc');
    R(g, 5, 21, 6, 2, GOLD_D);
    R(g, 6, 21, 4, 1, GOLD);
    // Unicornio dorado
    R(g, 4, 14, 1, 3, GOLD_D);
    R(g, 6, 14, 1, 3, GOLD_DD);
    R(g, 10, 14, 1, 3, GOLD_D);
    R(g, 12, 14, 1, 3, GOLD_DD);
    blob(g, 8, 11, 5, 2, GOLD);
    R(g, 4, 10, 7, 1, GOLD_L);
    R(g, 5, 13, 7, 1, GOLD_D);
    R(g, 11, 5, 2, 6, GOLD);
    R(g, 12, 3, 3, 4, GOLD);
    R(g, 14, 5, 1, 2, GOLD_D);
    px(g, 13, 4, GOLD_DD);
    px(g, 12, 3, GOLD_L);
    // Cuerno y crin
    px(g, 14, 2, GOLD_L);
    px(g, 15, 1, WHITE);
    px(g, 14, 1, GOLD_L);
    R(g, 10, 3, 1, 6, GOLD_D);
    px(g, 11, 2, GOLD_D);
    // Cola
    R(g, 2, 9, 2, 1, GOLD_D);
    R(g, 1, 10, 2, 3, GOLD_D);
    px(g, 1, 13, GOLD_DD);
  }), x, y);
  if (t % 3 < 0.35) {
    px(ctx, x + 7, y + 9, WHITE);
    px(ctx, x + 6, y + 9, GOLD_L);
    px(ctx, x + 8, y + 9, GOLD_L);
    px(ctx, x + 7, y + 8, GOLD_L);
    px(ctx, x + 7, y + 10, GOLD_L);
  }
}

export function drawNapPod(ctx, x, y, t = 0) {
  blit(ctx, sprite('nappod', 30, 16, (g) => {
    R(g, 3, 0, 24, 1, '#eef3f7');
    R(g, 1, 1, 28, 13, '#eef3f7');
    R(g, 0, 3, 30, 9, '#eef3f7');
    R(g, 3, 0, 20, 1, WHITE);
    R(g, 1, 12, 28, 2, '#c9d3dc');
    R(g, 3, 14, 24, 1, PAL.silver);
    // Interior
    R(g, 3, 3, 18, 9, '#1b2350');
    R(g, 3, 3, 18, 1, '#0e1333');
    R(g, 4, 9, 16, 3, '#3b5dc9');
    R(g, 4, 9, 16, 1, shade('#3b5dc9', 0.3));
    R(g, 5, 5, 4, 4, WHITE);
    R(g, 5, 8, 4, 1, '#c9d3dc');
    // Panel
    R(g, 22, 4, 5, 7, PAL.silver);
    R(g, 23, 5, 3, 2, PAL.dark);
  }), x, y);
  px(ctx, x + 23 + (Math.floor(t * 2) % 3), y + 9, PAL.cyan);
}

export function drawChef(ctx, x, y, t) {
  blit(ctx, sprite('chef', 34, 18, (g) => {
    // Encimera y armarios
    R(g, 0, 6, 34, 2, '#e8eef4');
    R(g, 0, 6, 34, 1, WHITE);
    box(g, 0, 8, 34, 10, '#c9d3dc', 0.15, -0.3);
    for (const dx of [1, 12, 23]) {
      R(g, dx, 9, 10, 8, '#dfe6ee');
      R(g, dx + 9, 9, 1, 8, PAL.silver);
      R(g, dx + 4, 11, 2, 1, PAL.slate);
    }
    // Fogón con olla
    R(g, 2, 5, 12, 1, PAL.ink);
    box(g, 4, 0, 8, 5, '#94b0c2', 0.35, -0.3);
    R(g, 3, 0, 10, 1, PAL.slate);
    px(g, 7, -1, PAL.dark);
    // Tabla con verduras
    R(g, 19, 4, 11, 2, WOOD_L);
    R(g, 19, 5, 11, 1, WOOD);
    R(g, 20, 3, 3, 1, PAL.orange);
    R(g, 24, 2, 2, 2, PAL.red);
    px(g, 24, 2, BLUSH);
    R(g, 27, 3, 2, 1, PAL.green);
  }), x, y);
  const k = Math.floor(t * 3) % 3;
  ctx.fillStyle = 'rgba(244,244,244,.5)';
  ctx.fillRect(x + 6, y - 3 - k, 1, 2);
  ctx.fillRect(x + 9, y - 2 - ((k + 1) % 3), 1, 2);
}

export function drawRobot(ctx, x, y, t) {
  blit(ctx, sprite('robot', 16, 24, (g) => {
    // Antena
    R(g, 7, 0, 2, 3, PAL.slate);
    // Cabeza
    R(g, 3, 3, 10, 7, '#c9d3dc');
    R(g, 2, 4, 12, 5, '#c9d3dc');
    R(g, 3, 3, 10, 1, WHITE);
    R(g, 13, 4, 1, 5, PAL.silver);
    R(g, 4, 5, 8, 3, PAL.ink);
    // Cuerpo
    R(g, 6, 10, 4, 1, PAL.slate);
    box(g, 2, 11, 12, 9, '#eef3f7', 0.3, -0.25);
    R(g, 4, 13, 8, 4, PAL.sky);
    R(g, 4, 13, 8, 1, shade(PAL.sky, 0.35));
    R(g, 7, 14, 3, 2, WHITE);
    px(g, 10, 14, WHITE);
    // Brazos y base
    R(g, 0, 12, 2, 6, PAL.silver);
    R(g, 14, 12, 2, 6, PAL.silver);
    R(g, 14, 11, 2, 1, PAL.slate);
    R(g, 4, 20, 8, 2, PAL.dark);
    R(g, 3, 22, 10, 2, PAL.ink);
  }), x, y);
  px(ctx, x + 7, y, (t % 1.2) < 0.6 ? PAL.red : '#6b2233');
  const e = (t * 2) % 2 < 1 ? 0 : 3;
  R(ctx, x + 5 + e, y + 6, 2, 1, PAL.cyan);
  R(ctx, x + 11 - e, y + 6, 1, 1, PAL.cyan);
}

export function drawRack(ctx, x, y, t, i) {
  blit(ctx, sprite('rack', 12, 24, (g) => {
    R(g, 0, 0, 12, 24, '#1d2033');
    R(g, 0, 0, 12, 1, PAL.slate);
    R(g, 0, 1, 1, 23, '#333c57');
    R(g, 11, 1, 1, 23, '#10121f');
    R(g, 2, 1, 8, 1, '#333c57');
    for (let r = 0; r < 5; r++) {
      R(g, 1, 3 + r * 4, 10, 3, '#2b3047');
      R(g, 1, 3 + r * 4, 10, 1, '#3a4160');
      R(g, 6, 4 + r * 4, 4, 1, '#1a1c2c');
    }
    R(g, 2, 22, 8, 1, '#10121f');
  }), x, y);
  for (let r = 0; r < 5; r++) {
    const on = Math.sin(t * (3 + ((i + r) % 4)) + i * 1.7 + r) > 0;
    px(ctx, x + 2, y + 4 + r * 4, on ? PAL.lime : PAL.green);
    px(ctx, x + 4, y + 4 + r * 4, on ? PAL.cyan : PAL.teal);
  }
}

export function drawClock(ctx, x, y, t) {
  blit(ctx, sprite('clock', 10, 10, (g) => {
    blob(g, 5, 5, 5, 5, '#eef3f7');
    blob(g, 5, 5, 4, 4, WHITE);
    px(g, 5, 1, PAL.dark);
    px(g, 9, 5, PAL.dark);
    px(g, 5, 9, PAL.dark);
    px(g, 1, 5, PAL.dark);
    R(g, 2, 8, 6, 1, '#dde5ee');
  }), x, y);
  const m = t * 0.9;
  line(ctx, x + 5, y + 5, x + 5 + Math.cos(m) * 3.4, y + 5 + Math.sin(m) * 3.4, PAL.slate);
  line(ctx, x + 5, y + 5, x + 5 + Math.cos(m / 12) * 2, y + 5 + Math.sin(m / 12) * 2, PAL.ink);
  px(ctx, x + 5, y + 5, PAL.red);
}

export function drawPoster(ctx, x, y) {
  blit(ctx, sprite('poster', 14, 18, (g) => {
    R(g, 0, 0, 14, 18, '#2a1f3d');
    R(g, 1, 1, 12, 16, '#5d275d');
    R(g, 1, 1, 12, 7, '#7b3a8a');
    // Arcoíris
    const rb = [PAL.red, PAL.orange, PAL.yellow, PAL.lime, PAL.sky];
    rb.forEach((c, i) => R(g, 2, 2 + i, 3 - (i > 2 ? 1 : 0), 1, c));
    // Unicornio
    R(g, 4, 8, 6, 3, WHITE);
    R(g, 9, 6, 2, 3, WHITE);
    R(g, 10, 5, 2, 2, WHITE);
    px(g, 12, 4, PAL.yellow);
    px(g, 11, 3, PAL.yellow);
    R(g, 8, 6, 1, 3, BLUSH);
    R(g, 3, 8, 1, 2, PAL.cyan);
    R(g, 4, 11, 1, 3, WHITE);
    R(g, 8, 11, 1, 3, WHITE);
    R(g, 4, 10, 6, 1, '#dde5ee');
    // Lema
    R(g, 3, 15, 8, 1, PAL.yellow);
    for (const [sx, sy] of [[3, 3], [10, 2], [12, 12], [2, 13]]) px(g, sx, sy, WHITE);
  }), x, y);
}

export function drawCorkboard(ctx, x, y) {
  blit(ctx, sprite('cork', 22, 16, (g) => {
    R(g, 0, 0, 22, 16, WOOD);
    R(g, 0, 0, 22, 1, WOOD_L);
    R(g, 1, 1, 20, 14, '#c9955f');
    for (let i = 0; i < 40; i++) px(g, 1 + Math.floor(hash(i, 3, 1) * 20), 1 + Math.floor(hash(i, 4, 1) * 14), '#a8763f');
    const notes = [[2, 2, PAL.yellow], [9, 2, PAL.cyan], [15, 3, BLUSH], [3, 9, PAL.lime]];
    for (const [nx, ny, c] of notes) {
      R(g, nx, ny, 5, 5, c);
      R(g, nx, ny + 4, 5, 1, shade(c, -0.2));
      R(g, nx + 1, ny + 2, 3, 1, shade(c, -0.35));
      px(g, nx + 2, ny, PAL.red);
    }
    // Foto
    R(g, 11, 9, 7, 6, WHITE);
    R(g, 12, 10, 5, 3, PAL.sky);
    R(g, 12, 12, 5, 1, PAL.green);
    px(g, 14, 10, PAL.yellow);
  }), x, y);
}

export function drawWhiteboard(ctx, x, y) {
  blit(ctx, sprite('whiteboard', 28, 16, (g) => {
    R(g, 0, 0, 28, 15, '#c9d3dc');
    R(g, 0, 0, 28, 1, WHITE);
    R(g, 1, 1, 26, 12, WHITE);
    R(g, 27, 1, 1, 13, PAL.silver);
    // Notas y gráficos
    R(g, 3, 3, 8, 1, PAL.blue);
    R(g, 3, 5, 11, 1, '#d98896');
    R(g, 3, 7, 6, 1, '#b8c4cf');
    R(g, 3, 9, 9, 1, '#b8c4cf');
    R(g, 16, 3, 1, 8, PAL.dark);
    R(g, 16, 10, 9, 1, PAL.dark);
    R(g, 18, 7, 2, 3, PAL.orange);
    R(g, 21, 5, 2, 5, PAL.green);
    line(g, 17, 8, 24, 3, PAL.red);
    R(g, 22, 2, 4, 3, PAL.yellow);
    // Bandeja de rotuladores
    R(g, 3, 13, 22, 2, PAL.silver);
    R(g, 5, 13, 3, 1, PAL.red);
    R(g, 9, 13, 3, 1, PAL.blue);
    R(g, 13, 13, 3, 1, PAL.green);
  }), x, y);
}

export function drawMeeting(ctx, x, y) {
  blit(ctx, sprite('meeting', 40, 22, (g) => {
    const ch = '#3b4466';
    for (let i = 0; i < 3; i++) {
      box(g, 6 + i * 12, 0, 8, 6, ch, 0.25, -0.3);
    }
    // Mesa
    R(g, 0, 5, 40, 9, '#a86f45');
    R(g, 0, 5, 40, 1, '#d4996a');
    R(g, 1, 6, 38, 1, '#c28457');
    R(g, 0, 13, 40, 2, '#7a4a2a');
    R(g, 3, 15, 2, 3, '#5a361e');
    R(g, 35, 15, 2, 3, '#5a361e');
    // Portátil, papeles y cafés
    R(g, 7, 6, 7, 4, PAL.silver);
    R(g, 8, 7, 5, 2, PAL.sky);
    R(g, 6, 10, 9, 1, '#c9d3dc');
    R(g, 20, 8, 5, 3, WHITE);
    R(g, 21, 9, 3, 1, PAL.silver);
    R(g, 29, 8, 2, 2, WHITE);
    px(g, 29, 8, WOOD_D);
    R(g, 33, 9, 2, 2, WHITE);
    px(g, 33, 9, WOOD_D);
    // Sillas de delante (de espaldas)
    for (let i = 0; i < 3; i++) {
      box(g, 6 + i * 12, 16, 8, 6, ch, 0.3, -0.3);
      R(g, 7 + i * 12, 18, 6, 1, shade(ch, -0.15));
    }
  }), x, y);
}

export function drawCar(ctx, x, y) {
  blit(ctx, sprite('car', 58, 26, (g) => {
    const c = PAL.red;
    const cL = shade(c, 0.28);
    const cD = shade(c, -0.3);
    // Cabina
    R(g, 13, 1, 28, 1, c);
    R(g, 11, 2, 32, 9, c);
    R(g, 13, 1, 26, 1, cL);
    R(g, 14, 3, 12, 7, '#9fe0f5');
    R(g, 28, 3, 12, 7, '#9fe0f5');
    R(g, 14, 3, 12, 2, '#d8f4fb');
    R(g, 28, 3, 12, 2, '#d8f4fb');
    line(g, 16, 9, 21, 4, WHITE);
    line(g, 30, 9, 34, 5, 'rgba(255,255,255,.7)');
    R(g, 26, 3, 2, 8, cD);
    // Carrocería
    R(g, 1, 11, 56, 9, c);
    R(g, 0, 12, 58, 7, c);
    R(g, 1, 11, 56, 1, cL);
    R(g, 0, 17, 58, 2, cD);
    R(g, 26, 12, 1, 5, cD);
    R(g, 20, 13, 3, 1, cD);
    R(g, 32, 13, 3, 1, cD);
    // Faros y parachoques
    R(g, 0, 13, 3, 3, PAL.yellow);
    px(g, 0, 13, WHITE);
    R(g, 55, 13, 3, 3, '#ff5a5a');
    R(g, 0, 19, 10, 2, PAL.silver);
    R(g, 48, 19, 10, 2, PAL.silver);
    // Ruedas
    for (const wx of [11, 45]) {
      blob(g, wx, 20, 5, 5, PAL.ink);
      blob(g, wx, 20, 3, 3, '#3a4160');
      blob(g, wx, 20, 2, 2, PAL.silver);
      px(g, wx - 1, 19, WHITE);
      px(g, wx, 20, PAL.slate);
    }
  }), x, y);
}

export function drawBoxes(ctx, x, y) {
  blit(ctx, sprite('boxes', 30, 24, (g) => {
    const card = '#c98a60';
    const stack = [[0, 12, 16, 12], [17, 14, 13, 10], [3, 1, 12, 11]];
    for (const [dx, dy, w, h] of stack) {
      R(g, dx, dy, w, h, card);
      R(g, dx, dy, w, 2, '#e0a878');
      R(g, dx + w - 2, dy + 2, 2, h - 2, '#a86f45');
      R(g, dx + Math.floor(w / 2) - 1, dy, 3, h, '#e8d0a0');
      R(g, dx + Math.floor(w / 2) - 1, dy, 3, 2, '#f4e4c0');
      R(g, dx, dy + h - 1, w, 1, '#8a5a36');
    }
    R(g, 2, 17, 4, 3, WHITE);
    R(g, 2, 18, 3, 1, PAL.silver);
    px(g, 25, 18, PAL.red);
    px(g, 24, 19, PAL.red);
    px(g, 26, 19, PAL.red);
    px(g, 25, 20, PAL.red);
  }), x, y);
}

export function drawBike(ctx, x, y) {
  blit(ctx, sprite('bike', 26, 14, (g) => {
    const f = PAL.teal;
    for (const wx of [4, 20]) {
      blob(g, wx, 9, 4, 4, PAL.ink);
      g.clearRect(wx - 2, 7, 5, 5);
      g.clearRect(wx - 3, 8, 7, 3);
      px(g, wx, 9, PAL.silver);
      line(g, wx - 2, 9, wx + 2, 9, 'rgba(148,176,194,.6)');
      line(g, wx, 7, wx, 11, 'rgba(148,176,194,.6)');
    }
    line(g, 4, 9, 10, 4, f);
    line(g, 10, 4, 18, 4, f);
    line(g, 18, 4, 20, 9, f);
    line(g, 10, 4, 12, 9, f);
    line(g, 4, 9, 12, 9, f);
    line(g, 12, 9, 18, 4, f);
    R(g, 8, 2, 4, 1, PAL.ink);
    R(g, 9, 3, 1, 1, PAL.slate);
    R(g, 17, 1, 1, 3, PAL.slate);
    R(g, 16, 0, 4, 1, PAL.ink);
    R(g, 11, 9, 3, 1, PAL.slate);
  }), x, y);
}
