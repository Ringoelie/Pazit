// Pixel art dibujado con rectángulos: personas, muebles y una fuente de 3x5.
import { PAL } from './data.js';

export function R(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x | 0, y | 0, w, h);
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * (amt < 0 ? v : 255 - v))));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
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
  ' ': '000000000000000',
};
const ACCENTS = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U', Ñ: 'N' };

export function textWidth(str, scale = 1) {
  return Math.max(0, str.length * 4 - 1) * scale;
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

// ---------------------------------------------------------------- personas

function head(ctx, x, y, L, t, mood) {
  const skin = L.skin;
  R(ctx, x + 2, y + 1, 6, 6, skin);
  R(ctx, x + 1, y + 2, 8, 4, skin);
  R(ctx, x + 1, y + 4, 1, 1, shade(skin, -0.12));
  R(ctx, x + 8, y + 4, 1, 1, shade(skin, -0.12));
  const blink = (t + L.style * 0.7) % 4 < 0.12;
  if (L.glasses) R(ctx, x + 2, y + 4, 6, 1, PAL.silver);
  if (blink) {
    R(ctx, x + 3, y + 4, 1, 1, shade(skin, -0.35));
    R(ctx, x + 6, y + 4, 1, 1, shade(skin, -0.35));
  } else {
    R(ctx, x + 3, y + 4, 1, 1, PAL.ink);
    R(ctx, x + 6, y + 4, 1, 1, PAL.ink);
  }
  if (L.beard) {
    R(ctx, x + 2, y + 6, 6, 1, L.hair);
    R(ctx, x + 3, y + 7, 4, 1, L.hair);
  } else if (mood > 70) {
    R(ctx, x + 4, y + 6, 2, 1, shade(skin, -0.4));
    R(ctx, x + 3, y + 5, 1, 1, shade(skin, -0.25));
    R(ctx, x + 6, y + 5, 1, 1, shade(skin, -0.25));
  } else if (mood < 30) {
    R(ctx, x + 4, y + 6, 2, 1, shade(skin, -0.4));
    R(ctx, x + 3, y + 7, 1, 1, shade(skin, -0.25));
    R(ctx, x + 6, y + 7, 1, 1, shade(skin, -0.25));
  } else {
    R(ctx, x + 4, y + 6, 2, 1, shade(skin, -0.3));
  }
  const h = L.hair;
  switch (L.style) {
    case 0:
      R(ctx, x + 2, y, 6, 1, h);
      R(ctx, x + 1, y + 1, 8, 2, h);
      R(ctx, x + 1, y + 3, 1, 1, h);
      R(ctx, x + 8, y + 3, 1, 1, h);
      break;
    case 1:
      R(ctx, x + 2, y, 6, 1, h);
      R(ctx, x + 1, y + 1, 8, 2, h);
      R(ctx, x, y + 2, 2, 7, h);
      R(ctx, x + 8, y + 2, 2, 7, h);
      break;
    case 2:
      R(ctx, x + 4, y - 2, 2, 2, h);
      R(ctx, x + 2, y, 6, 1, h);
      R(ctx, x + 1, y + 1, 8, 2, h);
      break;
    case 3:
      R(ctx, x + 1, y - 1, 8, 1, h);
      R(ctx, x, y, 10, 3, h);
      R(ctx, x, y + 3, 1, 2, h);
      R(ctx, x + 9, y + 3, 1, 2, h);
      R(ctx, x + 2, y - 1, 1, 1, shade(h, 0.2));
      break;
    case 4:
      R(ctx, x + 3, y + 1, 2, 1, shade(skin, 0.35));
      break;
    default:
      R(ctx, x + 4, y - 2, 2, 4, h);
      R(ctx, x + 1, y + 2, 1, 1, h);
      R(ctx, x + 8, y + 2, 1, 1, h);
  }
}

// Persona sentada vista de frente (10x16). La mesa tapa la parte baja.
export function drawSeated(ctx, x, y, L, shirt, t, mood) {
  R(ctx, x + 1, y + 8, 8, 8, shirt);
  R(ctx, x + 1, y + 8, 8, 1, shade(shirt, 0.15));
  R(ctx, x, y + 9, 1, 5, shade(shirt, -0.15));
  R(ctx, x + 9, y + 9, 1, 5, shade(shirt, -0.15));
  R(ctx, x + 4, y + 7, 2, 1, shade(L.skin, -0.15));
  head(ctx, x, y, L, t, mood);
}

// Persona de pie (10x18) con dos fotogramas de caminar.
export function drawStanding(ctx, x, y, L, shirt, frame, t, mood) {
  R(ctx, x + 2, y + 8, 6, 6, shirt);
  R(ctx, x + 2, y + 8, 6, 1, shade(shirt, 0.15));
  const swing = frame ? 1 : 0;
  R(ctx, x + 1, y + 9 + swing, 1, 4, shade(shirt, -0.15));
  R(ctx, x + 8, y + 10 - swing, 1, 4, shade(shirt, -0.15));
  R(ctx, x + 1, y + 13 + swing, 1, 1, L.skin);
  R(ctx, x + 8, y + 14 - swing, 1, 1, L.skin);
  R(ctx, x + 2, y + 14, 6, 1, L.pants);
  R(ctx, x + 2, y + 15, 2, frame ? 2 : 3, L.pants);
  R(ctx, x + 6, y + 15, 2, frame ? 3 : 2, L.pants);
  R(ctx, x + 2, y + (frame ? 17 : 18), 2, 1, PAL.ink);
  R(ctx, x + 6, y + (frame ? 18 : 17), 2, 1, PAL.ink);
  R(ctx, x + 4, y + 7, 2, 1, shade(L.skin, -0.15));
  head(ctx, x, y, L, t, mood);
}

// Iconos de estado de 5x5 sobre la cabeza.
const ICONS = {
  zz: ['11110', '00100', '01000', '11110', '00000'],
  bang: ['00100', '00100', '00100', '00000', '00100'],
  heart: ['01010', '11111', '11111', '01110', '00100'],
  q: ['01110', '00010', '00100', '00000', '00100'],
  bulb: ['01110', '11111', '01110', '01110', '00100'],
  palm: ['11011', '01110', '00100', '00100', '01110'],
};
const ICON_COLOR = { zz: PAL.cyan, bang: PAL.red, heart: '#ff6b8b', q: PAL.silver, bulb: PAL.yellow, palm: PAL.green };

export function drawBubble(ctx, x, y, icon) {
  R(ctx, x, y, 7, 7, PAL.white);
  R(ctx, x + 1, y + 7, 2, 1, PAL.white);
  R(ctx, x, y + 7, 1, 1, PAL.white);
  const rows = ICONS[icon];
  ctx.fillStyle = ICON_COLOR[icon];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (rows[r][c] === '1') ctx.fillRect(x + 1 + c, y + 1 + r, 1, 1);
}

// ---------------------------------------------------------------- mobiliario

export function drawDesk(ctx, x, y, top, front) {
  R(ctx, x, y, 24, 4, top);
  R(ctx, x, y, 24, 1, shade(top, 0.2));
  R(ctx, x, y + 4, 24, 6, front);
  R(ctx, x + 1, y + 10, 2, 4, shade(front, -0.3));
  R(ctx, x + 21, y + 10, 2, 4, shade(front, -0.3));
}

export function drawChair(ctx, x, y, c) {
  R(ctx, x, y, 12, 10, c);
  R(ctx, x + 1, y + 1, 10, 1, shade(c, 0.2));
}

export function drawMonitor(ctx, x, y, glow, on) {
  R(ctx, x, y, 9, 7, PAL.dark);
  R(ctx, x + 1, y + 1, 7, 5, on ? glow : '#1f2436');
  if (on) R(ctx, x + 2, y + 2, 3, 1, shade(glow, 0.5));
  R(ctx, x + 4, y + 7, 1, 2, PAL.slate);
  R(ctx, x + 2, y + 9, 5, 1, PAL.slate);
}

export function drawPlant(ctx, x, y, t) {
  const sway = Math.sin(t * 1.3 + x) > 0.6 ? 1 : 0;
  R(ctx, x + 2, y + 9, 6, 5, '#b86f50');
  R(ctx, x + 2, y + 9, 6, 1, '#d08a66');
  R(ctx, x + 3 + sway, y, 2, 4, PAL.green);
  R(ctx, x, y + 3, 4, 3, PAL.green);
  R(ctx, x + 5, y + 2, 4, 4, PAL.green);
  R(ctx, x + 2, y + 5, 6, 4, '#2a8c50');
  R(ctx, x + 1, y + 3, 1, 1, PAL.lime);
  R(ctx, x + 7, y + 3, 1, 1, PAL.lime);
}

export function drawCoffee(ctx, x, y, t) {
  R(ctx, x, y + 4, 12, 16, '#3a3f58');
  R(ctx, x + 1, y + 5, 10, 3, PAL.slate);
  R(ctx, x + 2, y + 10, 8, 5, PAL.ink);
  R(ctx, x + 4, y + 13, 4, 2, PAL.white);
  R(ctx, x + 9, y + 6, 1, 1, (t * 2) % 2 < 1 ? PAL.red : PAL.lime);
  const k = Math.floor(t * 3) % 3;
  R(ctx, x + 5 + (k === 1 ? 1 : 0), y + 1 - k, 1, 2, 'rgba(244,244,244,.6)');
}

export function drawWhiteboard(ctx, x, y) {
  R(ctx, x, y, 28, 16, PAL.silver);
  R(ctx, x + 1, y + 1, 26, 13, PAL.white);
  R(ctx, x + 3, y + 3, 8, 1, PAL.blue);
  R(ctx, x + 3, y + 5, 12, 1, PAL.red);
  R(ctx, x + 16, y + 3, 1, 8, PAL.green);
  R(ctx, x + 16, y + 10, 8, 1, PAL.green);
  R(ctx, x + 18, y + 7, 2, 3, PAL.orange);
  R(ctx, x + 21, y + 5, 2, 5, PAL.orange);
  R(ctx, x + 3, y + 8, 9, 1, PAL.slate);
  R(ctx, x + 3, y + 10, 6, 1, PAL.slate);
}

export function drawVending(ctx, x, y, t) {
  R(ctx, x, y, 14, 22, PAL.red);
  R(ctx, x + 2, y + 2, 8, 16, PAL.ink);
  const colors = [PAL.yellow, PAL.lime, PAL.orange, PAL.cyan];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) R(ctx, x + 3 + c * 2, y + 3 + r * 4, 1, 2, colors[(r + c) % 4]);
  R(ctx, x + 11, y + 4, 2, 6, PAL.silver);
  R(ctx, x + 11, y + 12, 2, 1, (t % 1.5) < 0.75 ? PAL.lime : PAL.green);
}

export function drawSofa(ctx, x, y, c = '#5d6bd6') {
  R(ctx, x, y, 30, 6, shade(c, -0.15));
  R(ctx, x, y + 6, 30, 7, c);
  R(ctx, x, y + 4, 4, 10, shade(c, -0.3));
  R(ctx, x + 26, y + 4, 4, 10, shade(c, -0.3));
  R(ctx, x + 5, y + 7, 9, 1, shade(c, 0.25));
  R(ctx, x + 16, y + 7, 9, 1, shade(c, 0.25));
}

export function drawFoosball(ctx, x, y, t) {
  R(ctx, x, y + 2, 26, 12, '#7a4a2a');
  R(ctx, x + 2, y + 3, 22, 10, PAL.green);
  R(ctx, x + 12, y + 3, 1, 10, PAL.lime);
  for (let i = 0; i < 4; i++) {
    R(ctx, x - 1, y + 4 + i * 2.5, 28, 1, PAL.silver);
    R(ctx, x + 5 + i * 5, y + 4 + i * 2.5 - 1, 1, 3, i % 2 ? PAL.red : PAL.blue);
  }
  const bx = x + 4 + ((t * 9) % 18);
  R(ctx, bx, y + 8, 1, 1, PAL.white);
  R(ctx, x + 1, y + 14, 2, 3, '#4a2f1f');
  R(ctx, x + 23, y + 14, 2, 3, '#4a2f1f');
}

export function drawAC(ctx, x, y, t) {
  R(ctx, x, y, 22, 7, PAL.white);
  R(ctx, x + 1, y + 5, 20, 1, PAL.silver);
  R(ctx, x + 18, y + 2, 2, 1, PAL.lime);
  const k = Math.floor(t * 4) % 3;
  R(ctx, x + 4 + k * 5, y + 8 + k, 3, 1, 'rgba(115,239,247,.55)');
}

export function drawArcade(ctx, x, y, t) {
  R(ctx, x, y, 14, 24, PAL.plum);
  R(ctx, x, y, 14, 3, PAL.red);
  R(ctx, x + 2, y + 4, 10, 8, PAL.ink);
  const f = Math.floor(t * 4) % 4;
  R(ctx, x + 3 + f * 2, y + 6, 2, 2, PAL.yellow);
  R(ctx, x + 9 - f, y + 9, 1, 1, PAL.cyan);
  R(ctx, x + 1, y + 13, 12, 4, shade(PAL.plum, -0.2));
  R(ctx, x + 3, y + 14, 1, 2, PAL.ink);
  R(ctx, x + 7, y + 14, 2, 2, PAL.red);
  R(ctx, x + 10, y + 14, 2, 2, PAL.lime);
}

export function drawBookshelf(ctx, x, y) {
  R(ctx, x, y, 22, 24, '#7a4a2a');
  const colors = [PAL.red, PAL.blue, PAL.yellow, PAL.green, PAL.orange, PAL.cyan, PAL.plum];
  for (let r = 0; r < 3; r++) {
    R(ctx, x + 1, y + 1 + r * 8, 20, 7, '#4a2f1f');
    for (let i = 0; i < 6; i++) R(ctx, x + 2 + i * 3, y + 2 + r * 8 + (i % 2), 2, 6 - (i % 2), colors[(i + r * 2) % colors.length]);
  }
}

export function drawBallpit(ctx, x, y) {
  R(ctx, x, y, 34, 16, PAL.cyan);
  R(ctx, x + 2, y + 2, 30, 12, PAL.sky);
  const colors = [PAL.red, PAL.yellow, PAL.lime, PAL.white, PAL.orange, PAL.plum];
  for (let i = 0; i < 40; i++) R(ctx, x + 3 + ((i * 7) % 27), y + 3 + ((i * 5) % 9), 2, 2, colors[i % colors.length]);
}

export function drawPodcast(ctx, x, y, t) {
  R(ctx, x, y + 6, 26, 14, PAL.dark);
  R(ctx, x + 2, y + 8, 22, 5, PAL.slate);
  R(ctx, x + 8, y + 1, 2, 7, PAL.silver);
  R(ctx, x + 7, y, 4, 3, PAL.ink);
  R(ctx, x + 16, y + 1, 2, 7, PAL.silver);
  R(ctx, x + 15, y, 4, 3, PAL.ink);
  R(ctx, x + 1, y - 7, 24, 5, (t % 2) < 1.4 ? PAL.red : '#6b2233');
  drawText(ctx, 'ON AIR', x + 2, y - 7, PAL.white);
}

export function drawGym(ctx, x, y, t) {
  R(ctx, x, y + 8, 22, 5, PAL.ink);
  R(ctx, x + 1, y + 9, 20, 3, PAL.slate);
  const k = Math.floor(t * 6) % 4;
  R(ctx, x + 2 + k * 5, y + 10, 2, 1, PAL.silver);
  R(ctx, x + 18, y, 2, 9, PAL.silver);
  R(ctx, x + 15, y, 7, 3, PAL.dark);
  R(ctx, x + 26, y + 10, 8, 2, PAL.silver);
  R(ctx, x + 25, y + 8, 2, 6, PAL.ink);
  R(ctx, x + 33, y + 8, 2, 6, PAL.ink);
}

export function drawNapPod(ctx, x, y) {
  R(ctx, x, y + 2, 30, 14, PAL.white);
  R(ctx, x + 2, y, 26, 2, PAL.white);
  R(ctx, x + 3, y + 4, 16, 8, '#29366f');
  R(ctx, x + 21, y + 5, 5, 5, PAL.silver);
  R(ctx, x + 5, y + 6, 4, 3, PAL.silver);
  R(ctx, x + 22, y + 11, 3, 1, PAL.cyan);
}

export function drawChef(ctx, x, y, t) {
  R(ctx, x, y + 6, 34, 12, PAL.silver);
  R(ctx, x, y + 6, 34, 2, PAL.white);
  R(ctx, x + 4, y + 2, 8, 5, PAL.dark);
  R(ctx, x + 20, y + 3, 10, 3, PAL.orange);
  const k = Math.floor(t * 3) % 3;
  R(ctx, x + 7, y - 2 - k, 1, 3, 'rgba(244,244,244,.6)');
  R(ctx, x + 22, y - 1 - ((k + 1) % 3), 1, 3, 'rgba(244,244,244,.5)');
}

export function drawRobot(ctx, x, y, t) {
  R(ctx, x + 2, y, 10, 8, PAL.silver);
  R(ctx, x + 4, y + 3, 6, 2, PAL.ink);
  R(ctx, x + ((t * 2) % 2 < 1 ? 5 : 8), y + 3, 1, 2, PAL.cyan);
  R(ctx, x + 6, y - 3, 2, 3, PAL.slate);
  R(ctx, x + 6, y - 4, 2, 1, PAL.red);
  R(ctx, x + 1, y + 9, 12, 9, PAL.white);
  R(ctx, x + 3, y + 11, 8, 4, PAL.sky);
  R(ctx, x - 1, y + 10, 2, 6, PAL.silver);
  R(ctx, x + 13, y + 10, 2, 6, PAL.silver);
  R(ctx, x + 3, y + 18, 8, 2, PAL.ink);
}

export function drawRack(ctx, x, y, t, i) {
  R(ctx, x, y, 12, 24, PAL.ink);
  R(ctx, x + 1, y + 1, 10, 22, '#262a3e');
  for (let r = 0; r < 5; r++) {
    R(ctx, x + 2, y + 2 + r * 4, 8, 3, PAL.dark);
    const on = Math.sin(t * (3 + ((i + r) % 4)) + i * 1.7 + r) > 0;
    R(ctx, x + 3, y + 3 + r * 4, 1, 1, on ? PAL.lime : PAL.green);
    R(ctx, x + 5, y + 3 + r * 4, 1, 1, on ? PAL.cyan : PAL.teal);
  }
}

export function drawClock(ctx, x, y, t) {
  R(ctx, x + 1, y, 8, 10, PAL.white);
  R(ctx, x, y + 1, 10, 8, PAL.white);
  R(ctx, x + 4, y + 2, 2, 4, PAL.ink);
  const a = t * 0.8;
  R(ctx, x + 5 + Math.round(Math.cos(a) * 2), y + 5 + Math.round(Math.sin(a) * 2), 1, 1, PAL.red);
}

export function drawPoster(ctx, x, y) {
  R(ctx, x, y, 14, 18, PAL.plum);
  R(ctx, x + 1, y + 1, 12, 16, '#7b3a8a');
  // Un pequeño unicornio
  R(ctx, x + 4, y + 7, 6, 4, PAL.white);
  R(ctx, x + 9, y + 5, 3, 3, PAL.white);
  R(ctx, x + 11, y + 3, 1, 2, PAL.yellow);
  R(ctx, x + 4, y + 11, 1, 3, PAL.white);
  R(ctx, x + 8, y + 11, 1, 3, PAL.white);
  R(ctx, x + 3, y + 7, 1, 2, PAL.cyan);
  R(ctx, x + 2, y + 8, 1, 2, '#ff6b8b');
}

// ---------------------------------------------------------------- decoración

export function drawRug(ctx, x, y) {
  R(ctx, x, y, 32, 20, '#8a2f41');
  R(ctx, x + 2, y + 2, 28, 16, PAL.red);
  R(ctx, x + 4, y + 4, 24, 12, '#c9566b');
  for (let i = 0; i < 4; i++) R(ctx, x + 7 + i * 6, y + 9, 2, 2, PAL.yellow);
  for (let i = 0; i < 8; i++) {
    R(ctx, x + 1 + i * 4, y - 1, 1, 1, PAL.yellow);
    R(ctx, x + 1 + i * 4, y + 20, 1, 1, PAL.yellow);
  }
}

export function drawLamp(ctx, x, y, t) {
  const on = (t + x) % 9 > 0.15;
  if (on) R(ctx, x - 2, y + 7, 12, 2, 'rgba(255,205,117,.25)');
  R(ctx, x, y, 8, 6, on ? PAL.yellow : '#b8925a');
  R(ctx, x + 1, y, 6, 1, PAL.white);
  R(ctx, x + 3, y + 6, 2, 14, PAL.slate);
  R(ctx, x + 1, y + 20, 6, 2, PAL.ink);
}

export function drawCooler(ctx, x, y, t) {
  R(ctx, x + 2, y, 6, 8, 'rgba(115,239,247,.8)');
  R(ctx, x + 3, y + 1, 1, 5, PAL.white);
  const b = Math.floor(t * 2) % 6;
  R(ctx, x + 5, y + 6 - b, 1, 1, PAL.white);
  R(ctx, x + 1, y + 8, 8, 12, PAL.white);
  R(ctx, x + 1, y + 8, 8, 1, PAL.silver);
  R(ctx, x + 3, y + 11, 4, 2, PAL.sky);
  R(ctx, x + 2, y + 18, 6, 2, PAL.silver);
}

export function drawAquarium(ctx, x, y, t) {
  R(ctx, x, y, 24, 12, PAL.ink);
  R(ctx, x + 1, y + 1, 22, 10, '#2a6fbf');
  R(ctx, x + 1, y + 8, 22, 3, '#d9b86a');
  R(ctx, x + 4, y + 5, 1, 4, PAL.green);
  R(ctx, x + 18, y + 4, 1, 5, PAL.green);
  const fx = x + 3 + Math.floor((t * 6) % 16);
  R(ctx, fx, y + 4, 3, 2, PAL.orange);
  R(ctx, fx - 1, y + 4, 1, 1, PAL.yellow);
  const gx = x + 18 - Math.floor((t * 4) % 14);
  R(ctx, gx, y + 7, 2, 1, PAL.yellow);
  R(ctx, x + 12, y + 2 + Math.floor((t * 3) % 6), 1, 1, PAL.white);
  R(ctx, x + 2, y + 12, 20, 6, '#7a4a2a');
  R(ctx, x + 2, y + 12, 20, 1, '#9a6a44');
}

export function drawStatue(ctx, x, y, t) {
  const gold = '#f2c14e';
  const dark = '#b8862a';
  R(ctx, x + 4, y + 8, 8, 5, gold);
  R(ctx, x + 10, y + 4, 4, 5, gold);
  R(ctx, x + 13, y + 1, 1, 3, PAL.white);
  R(ctx, x + 3, y + 7, 2, 3, dark);
  R(ctx, x + 5, y + 13, 1, 5, dark);
  R(ctx, x + 10, y + 13, 1, 5, dark);
  if (t % 3 < 0.3) R(ctx, x + 7, y + 9, 1, 1, PAL.white);
  R(ctx, x + 1, y + 18, 14, 8, PAL.silver);
  R(ctx, x + 1, y + 18, 14, 1, PAL.white);
  R(ctx, x + 3, y + 21, 10, 2, PAL.slate);
}

export function drawMeeting(ctx, x, y) {
  for (let i = 0; i < 3; i++) {
    R(ctx, x + 6 + i * 12, y, 8, 5, PAL.dark);
    R(ctx, x + 6 + i * 12, y + 17, 8, 5, PAL.dark);
  }
  R(ctx, x, y + 5, 40, 10, '#a86f45');
  R(ctx, x, y + 5, 40, 2, '#c98a60');
  R(ctx, x + 2, y + 15, 2, 3, '#6b4024');
  R(ctx, x + 36, y + 15, 2, 3, '#6b4024');
  R(ctx, x + 8, y + 8, 5, 3, PAL.white);
  R(ctx, x + 24, y + 8, 6, 3, PAL.silver);
}

export function drawCar(ctx, x, y) {
  R(ctx, x + 4, y + 25, 50, 3, 'rgba(26,28,44,.35)');
  R(ctx, x + 10, y, 32, 10, PAL.red);
  R(ctx, x + 13, y + 2, 11, 7, PAL.cyan);
  R(ctx, x + 26, y + 2, 11, 7, PAL.cyan);
  R(ctx, x + 14, y + 3, 3, 2, PAL.white);
  R(ctx, x, y + 10, 54, 11, PAL.red);
  R(ctx, x, y + 10, 54, 2, '#d0566b');
  R(ctx, x, y + 17, 54, 2, '#8a2f41');
  R(ctx, x, y + 12, 4, 3, PAL.yellow);
  R(ctx, x + 50, y + 12, 4, 3, PAL.orange);
  for (const wx of [x + 6, x + 38]) {
    R(ctx, wx, y + 18, 10, 9, PAL.ink);
    R(ctx, wx + 3, y + 21, 4, 3, PAL.slate);
  }
}

export function drawBoxes(ctx, x, y) {
  for (const [dx, dy, w, h] of [[0, 12, 16, 12], [16, 14, 14, 10], [3, 0, 12, 12]]) {
    R(ctx, x + dx, y + dy, w, h, '#c98a60');
    R(ctx, x + dx, y + dy, w, 2, '#e0a878');
    R(ctx, x + dx + w / 2 - 1, y + dy, 2, h, '#e8d0a0');
  }
}

export function drawBike(ctx, x, y) {
  const ky = y + 2;
  for (const wx of [x, x + 16]) {
    R(ctx, wx, ky + 4, 9, 1, PAL.ink);
    R(ctx, wx, ky + 11, 9, 1, PAL.ink);
    R(ctx, wx, ky + 5, 1, 6, PAL.ink);
    R(ctx, wx + 8, ky + 5, 1, 6, PAL.ink);
  }
  R(ctx, x + 4, ky + 3, 17, 1, PAL.sky);
  R(ctx, x + 11, ky, 1, 8, PAL.sky);
  R(ctx, x + 9, ky - 1, 5, 2, PAL.ink);
  R(ctx, x + 20, ky - 2, 1, 6, PAL.sky);
}
