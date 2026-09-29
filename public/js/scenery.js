// Escenario de cada oficina: suelo, paredes, ventanas con el cielo de cada
// estación, rótulo y luz ambiente. El fondo se pinta una sola vez por oficina;
// lo que se mueve (nubes, nieve, estrellas) se dibuja en cada fotograma.
import { PAL } from './data.js';
import { dateOf } from './util.js';
import { WALL } from './layout.js';
import * as S from './sprites.js';

const { R, shade, mix, hash, px, blob } = S;

export const THEMES = {
  garage: { wall: '#65748a', trim: '#46536a', floor: ['#7b8594', '#757f8e'], desk: ['#c49a6c', '#8a6340'], chair: '#3b4466', bg: '#191c30', win: null, sign: ['#1a1c2c', '#ffcd75'] },
  cowork: { wall: '#ecdcbc', trim: '#9a6a44', floor: ['#b98555', '#ae7a4b', '#c4905f'], desk: ['#f4f4f4', '#c9d3dc'], chair: '#3b5dc9', bg: '#231d2e', win: 'std', frame: '#f4f4f4', sign: ['#29366f', '#ffcd75'] },
  small: { wall: '#c7d4e0', trim: '#6a7f98', floor: ['#3a4a8a', '#36457f'], desk: ['#eaeef2', '#b8c4cf'], chair: '#23284a', bg: '#1a1f3a', win: 'std', frame: '#eef3f7', sign: ['#1a1c2c', '#73eff7'] },
  loft: { wall: '#9c4a3a', trim: '#2b2330', floor: ['#7a4a2a', '#704426', '#6a3f22'], desk: ['#3a3f58', '#2a2e44'], chair: '#ef7d57', bg: '#1f161c', win: 'industrial', frame: '#23222e', sign: ['#2b2330', '#ef7d57'] },
  tower: { wall: '#29366f', trim: '#1a2250', floor: ['#d6dee6', '#cad4de'], desk: ['#f4f4f4', '#94b0c2'], chair: '#333c57', bg: '#10152c', win: 'glass', frame: '#1a2250', sign: ['#10152c', '#73eff7'] },
  campus: { wall: '#eef3ea', trim: '#8fb58a', floor: ['#e2c79a', '#d9bd8e', '#e8cfa6'], desk: ['#fff4e0', '#e2cfae'], chair: '#38b764', bg: '#18261f', win: 'std', frame: '#ffffff', sign: ['#257179', '#f4f4f4'] },
  orbital: { wall: '#2b3047', trim: '#1a1c2c', floor: ['#4a5470', '#454e69'], desk: ['#94b0c2', '#566c86'], chair: '#73eff7', bg: '#07080f', win: 'porthole', frame: '#94b0c2', sign: ['#07080f', '#73eff7'] },
  island: { wall: '#e8d5a8', trim: '#8a6340', floor: ['#c08a58', '#b57f50', '#c9955f'], desk: ['#f4f4f4', '#d9c7a3'], chair: '#38b764', bg: '#0f2a33', win: 'std', frame: '#f4f4f4', sign: ['#257179', '#ffcd75'], view: 'sea' },
  moon: { wall: '#dfe6ee', trim: '#566c86', floor: ['#8a8f9e', '#80859a'], desk: ['#dfe6ee', '#94b0c2'], chair: '#3b5dc9', bg: '#05060c', win: 'porthole', frame: '#94b0c2', sign: ['#1a1c2c', '#73eff7'], view: 'moon' },
};

// Estilos de decoración: cambian suelo, paredes, muebles y (salvo en el
// espacio) las ventanas.
const STYLE_THEMES = {
  cyberpunk: { wall: '#2a1a3d', trim: '#140b22', floor: ['#1b1530', '#1e1836'], desk: ['#2b2d42', '#1b1c2c'], chair: '#ff3dac', bg: '#07050d', win: 'glass', frame: '#140b22', sign: ['#140b22', '#ff3dac'] },
  zen: { wall: '#f1ead8', trim: '#6b4024', floor: ['#b7c28a', '#aebb80'], desk: ['#c9a06a', '#8a6340'], chair: '#5d6b3a', bg: '#1e2416', win: 'std', frame: '#8a6340', sign: ['#3a2a1a', '#f1ead8'] },
  retro: { wall: '#f7b5c8', trim: '#5ec4b6', floor: ['#f4e9d8', '#f0e3cf'], desk: ['#f4f4f4', '#5ec4b6'], chair: '#ff6b8b', bg: '#2a1f3d', win: 'std', frame: '#f4f4f4', sign: ['#29366f', '#ffcd75'] },
  beach: { wall: '#bfe3f0', trim: '#f4f4f4', floor: ['#efe4cc', '#e8dcc2', '#f4ead6'], desk: ['#f4f4f4', '#d9c7a3'], chair: '#41a6f6', bg: '#123a4a', win: 'std', frame: '#f4f4f4', sign: ['#257179', '#f4f4f4'], view: 'sea' },
};
const SPACE = new Set(['orbital', 'moon']);

// Tema final de una oficina con su estilo: kind elige cómo se pintan suelo y
// paredes; view, qué se ve por las ventanas.
export function themeFor(office, style) {
  const base = THEMES[office];
  const st = style && STYLE_THEMES[style];
  if (!st) return { ...base, kind: office, view: base.view || office };
  const t = { ...base, ...st, kind: style, view: st.view || base.view || office };
  if (SPACE.has(office)) Object.assign(t, { win: base.win, frame: base.frame, view: base.view || office });
  if (office === 'garage') t.win = null;
  return t;
}

// ---------------------------------------------------------------- utilidades

function clip(g, x, y, w, h, fn) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  fn();
  g.restore();
}

// Motas de ruido: rules = [[umbral, color], ...] con umbrales crecientes.
function speckle(g, x0, y0, w, h, seed, rules) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const v = hash(x, y, seed);
      for (const [p, c] of rules) {
        if (v < p) {
          px(g, x, y, c);
          break;
        }
      }
    }
  }
}

// Tarima: filas de tablas de largo variable con juntas al tresbolillo.
function planks(g, x0, y0, w, h, ph, tones, seed, nails = false) {
  clip(g, x0, y0, w, h, () => {
    for (let row = 0; row * ph < h; row++) {
      const y = y0 + row * ph;
      let x = x0 - Math.floor(hash(row, 0, seed) * 40);
      for (let k = 0; x < x0 + w; k++) {
        const len = 26 + Math.floor(hash(row, k, seed + 1) * 30);
        const c = tones[Math.floor(hash(row, k, seed + 2) * tones.length)];
        R(g, x, y, len, ph, c);
        R(g, x, y, len, 1, shade(c, 0.07));
        R(g, x, y + ph - 1, len, 1, shade(c, -0.22));
        R(g, x + len - 1, y, 1, ph - 1, shade(c, -0.28));
        const n = Math.floor(hash(row, k, seed + 3) * 3);
        for (let i = 0; i < n; i++) {
          const gx = x + 3 + Math.floor(hash(row, k * 7 + i, seed + 4) * Math.max(1, len - 12));
          const gy = y + 1 + Math.floor(hash(row, k * 5 + i, seed + 5) * Math.max(1, ph - 2));
          R(g, gx, gy, 3 + i * 3, 1, shade(c, -0.1));
        }
        if (nails) {
          px(g, x + 2, y + 2, shade(c, -0.4));
          px(g, x + len - 3, y + 2, shade(c, -0.4));
        }
        x += len;
      }
    }
  });
}

// ---------------------------------------------------------------- suelos

const FLOORS = {
  garage(g, x0, y0, w, h, T, L) {
    const base = T.floor[0];
    R(g, x0, y0, w, h, base);
    speckle(g, x0, y0, w, h, 11, [[0.035, shade(base, -0.1)], [0.06, shade(base, 0.07)], [0.064, shade(base, -0.25)]]);
    for (let x = x0 + 60; x < x0 + w; x += 64) {
      R(g, x, y0, 1, h, shade(base, -0.16));
      R(g, x + 1, y0, 1, h, shade(base, 0.06));
    }
    for (let y = y0 + 44; y < y0 + h; y += 48) {
      R(g, x0, y, w, 1, shade(base, -0.16));
      R(g, x0, y + 1, w, 1, shade(base, 0.06));
    }
    // Plaza de aparcamiento gastada donde estaba el coche, con mancha de aceite
    const cx = Math.round((L.loungeX + 44) / 4) * 4;
    const oy = WALL + 80;
    blob(g, cx + 30, oy, 11, 4, shade(base, -0.1));
    blob(g, cx + 33, oy, 6, 2, shade(base, -0.18));
    const paint = mix(PAL.yellow, base, 0.45);
    for (const lx of [cx - 6, cx + 63]) {
      for (let y = WALL + 50; y < WALL + 100; y++) if (hash(lx, y, 3) > 0.18) R(g, lx, y, 2, 1, paint);
    }
  },
  cowork(g, x0, y0, w, h, T) {
    planks(g, x0, y0, w, h, 6, T.floor, 21);
  },
  small(g, x0, y0, w, h, T) {
    for (let y = y0; y < y0 + h; y += 16) {
      for (let x = x0; x < x0 + w; x += 16) {
        const c = T.floor[((x - x0) / 16 + (y - y0) / 16) % 2];
        R(g, x, y, 16, 16, c);
        R(g, x, y, 16, 1, shade(c, -0.1));
        R(g, x, y, 1, 16, shade(c, -0.1));
      }
    }
    speckle(g, x0, y0, w, h, 31, [[0.035, shade(T.floor[0], 0.06)], [0.07, shade(T.floor[0], -0.07)]]);
  },
  loft(g, x0, y0, w, h, T) {
    planks(g, x0, y0, w, h, 8, T.floor, 41, true);
  },
  tower(g, x0, y0, w, h, T) {
    for (let y = y0; y < y0 + h; y += 16) {
      for (let x = x0; x < x0 + w; x += 24) {
        const c = T.floor[hash(x, y, 51) < 0.5 ? 0 : 1];
        R(g, x, y, 24, 16, c);
        R(g, x, y, 24, 1, shade(c, 0.35));
        R(g, x, y, 1, 16, shade(c, 0.25));
        R(g, x + 23, y + 1, 1, 15, shade(c, -0.12));
        R(g, x + 1, y + 15, 23, 1, shade(c, -0.12));
        if (hash(x, y, 52) < 0.3) R(g, x + 5, y + 5, 6, 1, shade(c, 0.4));
      }
    }
  },
  campus(g, x0, y0, w, h, T, L) {
    planks(g, x0, y0, w, h, 5, T.floor, 61);
    // Zona de descanso con césped artificial
    const zx = L.loungeX - 4;
    const zy = WALL + 30;
    const zw = L.W - L.loungeX - 4;
    const zh = Math.min(h - 72, 150);
    const turf = '#5ab552';
    R(g, zx + 3, zy, zw - 6, zh, turf);
    R(g, zx, zy + 3, zw, zh - 6, turf);
    R(g, zx + 1, zy + 1, zw - 2, zh - 2, turf);
    // Franjas de césped cortado
    clip(g, zx + 1, zy + 1, zw - 2, zh - 2, () => {
      for (let x = zx; x < zx + zw; x += 24) R(g, x, zy, 12, zh, '#63bf5a');
    });
    speckle(g, zx + 2, zy + 2, zw - 4, zh - 4, 62, [[0.06, '#4a9f45'], [0.1, '#7fd477']]);
    R(g, zx + 3, zy + zh - 1, zw - 6, 1, '#3e8a3c');
    R(g, zx + 3, zy + zh, zw - 6, 1, 'rgba(10,8,24,.18)');
    R(g, zx + 3, zy, zw - 6, 1, '#7fd477');
  },
  island(g, x0, y0, w, h, T) {
    planks(g, x0, y0, w, h, 6, T.floor, 71, true);
  },
  beach(g, x0, y0, w, h, T) {
    planks(g, x0, y0, w, h, 7, T.floor, 81);
  },
  moon(g, x0, y0, w, h, T) {
    for (let y = y0; y < y0 + h; y += 24) {
      for (let x = x0; x < x0 + w; x += 24) {
        const c = T.floor[((x - x0) / 24 + (y - y0) / 24) % 2];
        R(g, x, y, 24, 24, c);
        R(g, x, y, 24, 1, shade(c, 0.2));
        R(g, x, y, 1, 24, shade(c, 0.1));
        R(g, x + 23, y, 1, 24, shade(c, -0.25));
        R(g, x, y + 23, 24, 1, shade(c, -0.25));
      }
    }
    speckle(g, x0, y0, w, h, 91, [[0.05, shade(T.floor[0], -0.15)], [0.08, shade(T.floor[0], 0.12)]]);
  },
  cyberpunk(g, x0, y0, w, h, T) {
    R(g, x0, y0, w, h, T.floor[0]);
    for (let x = x0; x < x0 + w; x += 16) R(g, x, y0, 1, h, '#2e2050');
    for (let y = y0; y < y0 + h; y += 16) R(g, x0, y, w, 1, '#2e2050');
    for (let x = x0 + 8; x < x0 + w; x += 48) R(g, x, y0, 1, h, (x / 48) % 2 < 1 ? 'rgba(255,61,172,.55)' : 'rgba(61,242,255,.5)');
    for (let y = y0 + 24; y < y0 + h; y += 48) R(g, x0, y, w, 1, 'rgba(61,242,255,.35)');
  },
  zen(g, x0, y0, w, h, T) {
    for (let y = y0, row = 0; y < y0 + h; y += 16, row++) {
      for (let x = x0 - (row % 2) * 16; x < x0 + w; x += 32) {
        const c = T.floor[(row + Math.floor(x / 32)) % 2 ? 0 : 1];
        R(g, x, y, 32, 16, c);
        for (let k = 2; k < 16; k += 2) R(g, x + 1, y + k, 30, 1, shade(c, 0.06));
        R(g, x, y, 32, 1, '#5d6b3a');
        R(g, x, y, 1, 16, '#5d6b3a');
      }
    }
  },
  retro(g, x0, y0, w, h, T) {
    R(g, x0, y0, w, h, T.floor[0]);
    const cs = ['#ff6b8b', '#5ec4b6', '#ffcd75', '#3b5dc9'];
    for (let i = 0; i < (w * h) / 180; i++) {
      const x = x0 + Math.floor(hash(i, 1, 101) * w);
      const y = y0 + Math.floor(hash(i, 2, 101) * h);
      const c = cs[i % 4];
      const k = i % 3;
      if (k === 0) {
        R(g, x, y, 3, 1, c);
        R(g, x + 1, y + 1, 1, 1, c);
      } else if (k === 1) {
        px(g, x, y, c);
        px(g, x + 1, y + 1, c);
        px(g, x + 2, y, c);
        px(g, x + 3, y + 1, c);
      } else R(g, x, y, 2, 2, c);
    }
  },
  orbital(g, x0, y0, w, h, T) {
    for (let y = y0; y < y0 + h; y += 16) {
      for (let x = x0; x < x0 + w; x += 32) {
        const c = T.floor[((x - x0) / 32 + (y - y0) / 16) % 2];
        R(g, x, y, 32, 16, c);
        R(g, x, y, 32, 1, shade(c, 0.22));
        R(g, x, y, 1, 16, shade(c, 0.12));
        R(g, x + 31, y + 1, 1, 15, shade(c, -0.3));
        R(g, x + 1, y + 15, 31, 1, shade(c, -0.3));
        for (const [rx, ry] of [[3, 3], [28, 3], [3, 12], [28, 12]]) {
          px(g, x + rx, y + ry, shade(c, 0.35));
          px(g, x + rx + 1, y + ry + 1, shade(c, -0.35));
        }
      }
    }
    // Pasillo iluminado
    for (let x = x0 + 4; x < x0 + w; x += 8) R(g, x, y0 + 4, 4, 1, 'rgba(115,239,247,.5)');
  },
};

// ---------------------------------------------------------------- paredes

const WALLS = {
  garage(g, L, T) {
    const W = L.W;
    for (let row = 0, y = 0; y < WALL; row++, y += 8) {
      const off = row % 2 ? 8 : 0;
      for (let x = -off; x < W; x += 16) {
        const c = shade(T.wall, (hash(x, row, 71) - 0.5) * 0.1);
        R(g, x, y, 16, 8, c);
        R(g, x, y, 16, 1, shade(c, 0.12));
        R(g, x + 15, y, 1, 8, shade(T.wall, -0.2));
        R(g, x, y + 7, 16, 1, shade(T.wall, -0.2));
      }
    }
  },
  cowork(g, L, T) {
    R(g, 0, 0, L.W, WALL, T.wall);
    speckle(g, 0, 0, L.W, 26, 81, [[0.04, shade(T.wall, -0.04)]]);
    // Friso de madera
    const wood = '#c4905f';
    R(g, 0, 26, L.W, WALL - 26, wood);
    for (let x = 0; x < L.W; x += 8) {
      R(g, x, 28, 1, WALL - 30, shade(wood, -0.2));
      R(g, x + 1, 28, 1, WALL - 30, shade(wood, 0.12));
    }
    R(g, 0, 26, L.W, 2, shade(wood, 0.25));
    R(g, 0, 28, L.W, 1, shade(wood, -0.3));
  },
  small(g, L, T) {
    R(g, 0, 0, L.W, WALL, T.wall);
    for (let x = 0; x < L.W; x += 12) R(g, x, 0, 4, 30, shade(T.wall, 0.07));
    R(g, 0, 29, L.W, 2, shade(T.wall, 0.3));
    R(g, 0, 31, L.W, 1, shade(T.wall, -0.2));
    R(g, 0, 32, L.W, WALL - 32, shade(T.wall, -0.1));
  },
  loft(g, L, T) {
    const W = L.W;
    for (let row = 0, y = 0; y < WALL; row++, y += 4) {
      const off = row % 2 ? 4 : 0;
      for (let x = -off; x < W; x += 8) {
        const v = hash(x, row, 91);
        const c = v < 0.12 ? '#7e3a2e' : v > 0.9 ? '#b25a45' : shade(T.wall, (hash(x, row, 92) - 0.5) * 0.12);
        R(g, x, y, 7, 3, c);
        R(g, x, y, 7, 1, shade(c, 0.12));
      }
      R(g, 0, y + 3, W, 1, '#5e2c24');
      for (let x = -off + 7; x < W; x += 8) R(g, x, y, 1, 3, '#5e2c24');
    }
    // Viga de acero y tubería
    R(g, 0, 0, W, 4, '#2b2330');
    R(g, 0, 3, W, 1, '#1a1520');
    for (let x = 6; x < W; x += 24) px(g, x, 1, '#5a4a60');
    R(g, 0, 5, W, 2, '#7d8594');
    R(g, 0, 5, W, 1, '#b8c4cf');
    for (let x = 20; x < W; x += 64) R(g, x, 4, 3, 4, '#3a3f58');
  },
  tower(g, L, T) {
    R(g, 0, 0, L.W, WALL, T.wall);
    for (let x = 0; x < L.W; x += 32) {
      R(g, x, 0, 1, WALL, shade(T.wall, -0.25));
      R(g, x + 1, 0, 1, WALL, shade(T.wall, 0.12));
    }
  },
  campus(g, L, T) {
    R(g, 0, 0, L.W, WALL, T.wall);
    // Listones de madera
    const wood = '#d9b07a';
    for (let x = 0; x < L.loungeX - 8; x += 4) {
      R(g, x, 4, 2, WALL - 8, x % 8 ? wood : shade(wood, 0.1));
      R(g, x + 1, 4, 1, WALL - 8, shade(wood, -0.15));
    }
    // Jardín vertical detrás del rótulo
    const gx = 4;
    const gw = Math.min(140, L.loungeX - 16);
    R(g, gx, 3, gw, 24, '#2a6f45');
    for (let i = 0; i < gw * 3; i++) {
      const lx = gx + Math.floor(hash(i, 1, 101) * gw);
      const ly = 3 + Math.floor(hash(i, 2, 101) * 22);
      const c = [PAL.green, '#4fc56f', PAL.lime, '#1f6f4a'][i % 4];
      R(g, lx, ly, 2, 2, c);
    }
    R(g, gx, 27, gw, 2, '#8a6340');
    R(g, gx, 27, gw, 1, '#b4895f');
  },
  island(g, L, T) {
    R(g, 0, 0, L.W, WALL, T.wall);
    for (let x = 0; x < L.W; x += 6) {
      R(g, x, 0, 4, WALL, x % 12 ? '#dcc592' : '#e8d5a8');
      R(g, x + 3, 0, 1, WALL, '#b89a62');
      for (let y = 6 + (x % 18); y < WALL; y += 14) R(g, x, y, 4, 1, '#b89a62');
    }
  },
  beach(g, L, T) {
    R(g, 0, 0, L.W, WALL, T.wall);
    for (let y = 3; y < WALL; y += 5) {
      R(g, 0, y, L.W, 1, shade(T.wall, -0.1));
      R(g, 0, y + 1, L.W, 1, shade(T.wall, 0.15));
    }
  },
  moon(g, L, T) {
    const W = L.W;
    for (let x = 0; x < W; x += 32) {
      R(g, x, 0, 32, WALL, x % 64 ? T.wall : shade(T.wall, -0.04));
      R(g, x, 0, 1, WALL, shade(T.wall, 0.2));
      R(g, x + 31, 0, 1, WALL, shade(T.wall, -0.2));
      px(g, x + 3, 5, PAL.silver);
      px(g, x + 28, 5, PAL.silver);
    }
    R(g, 0, 30, W, 3, PAL.blue);
    R(g, 0, 30, W, 1, shade(PAL.blue, 0.3));
    R(g, 0, 1, W, 1, PAL.cyan);
  },
  cyberpunk(g, L, T) {
    R(g, 0, 0, L.W, WALL, T.wall);
    for (let x = 0; x < L.W; x += 24) R(g, x, 0, 1, WALL, '#3a2656');
    for (let x = 12; x < L.W; x += 72) {
      const c = (x / 72) % 2 < 1 ? '#ff3dac' : '#3df2ff';
      R(g, x - 1, 4, 3, WALL - 10, c === '#ff3dac' ? 'rgba(255,61,172,.25)' : 'rgba(61,242,255,.25)');
      R(g, x, 4, 1, WALL - 10, c);
    }
    R(g, 0, 3, L.W, 1, 'rgba(61,242,255,.6)');
  },
  zen(g, L, T) {
    R(g, 0, 0, L.W, WALL, T.wall);
    for (let x = 0; x < L.W; x += 12) R(g, x, 0, 1, WALL, '#8a6340');
    for (let y = 0; y < WALL; y += 10) R(g, 0, y, L.W, 1, '#a07a50');
    R(g, 0, 0, L.W, 2, '#6b4024');
  },
  retro(g, L, T) {
    R(g, 0, 0, L.W, WALL, T.wall);
    for (let x = 0; x < L.W; x += 8) {
      const y = 8 + ((x / 8) % 2) * 3;
      R(g, x, y, 5, 1, '#5ec4b6');
    }
    for (let i = 0; i < L.W / 10; i++) px(g, Math.floor(hash(i, 3, 111) * L.W), 14 + Math.floor(hash(i, 4, 111) * 20), i % 2 ? '#ffcd75' : '#3b5dc9');
    R(g, 0, 32, L.W, WALL - 32, '#5ec4b6');
    R(g, 0, 32, L.W, 1, shade('#5ec4b6', 0.3));
  },
  orbital(g, L, T) {
    const W = L.W;
    for (let x = 0; x < W; x += 24) {
      for (let y = 0; y < WALL; y += 20) {
        const c = hash(x, y, 111) < 0.5 ? T.wall : shade(T.wall, 0.06);
        R(g, x, y, 24, 20, c);
        R(g, x, y, 24, 1, shade(c, 0.25));
        R(g, x, y, 1, 20, shade(c, 0.12));
        R(g, x + 23, y, 1, 20, shade(c, -0.4));
        R(g, x, y + 19, 24, 1, shade(c, -0.4));
        px(g, x + 2, y + 2, PAL.slate);
        px(g, x + 21, y + 2, PAL.slate);
      }
    }
    // Tira de luz del techo
    R(g, 0, 1, W, 1, PAL.cyan);
    R(g, 0, 2, W, 1, 'rgba(115,239,247,.35)');
  },
};

// ---------------------------------------------------------------- ventanas

// Rectángulos de las ventanas de la zona de descanso según el tipo.
function windowRects(L, kind, from) {
  const out = [];
  if (!kind) return out;
  const spec = { std: [38, 24, 10, 48], industrial: [44, 26, 9, 52], glass: [28, 30, 9, 32], porthole: [24, 24, 10, 44] }[kind];
  const [w, h, y, step] = spec;
  for (let x = from + 4; x + w < L.W - 4; x += step) out.push({ x, y, w, h, kind });
  return out;
}

// Marco de cada ventana: se dibuja encima del cielo. El cristal queda vacío.
function frameSprite(kind, w, h, color) {
  return S.sprite(`win|${kind}|${w}|${h}|${color}`, w + 6, h + 6, (g) => {
    const x = 3;
    const y = 3;
    const glass = 'rgba(255,255,255,.16)';
    if (kind === 'porthole') {
      const r = w / 2;
      blob(g, x + r, y + r, r + 3, r + 3, color);
      g.globalCompositeOperation = 'destination-out';
      blob(g, x + r, y + r, r, r, '#000');
      g.globalCompositeOperation = 'source-over';
      for (let a = 0; a < 8; a++) px(g, x + r + Math.round(Math.cos((a * Math.PI) / 4) * (r + 2)), y + r + Math.round(Math.sin((a * Math.PI) / 4) * (r + 2)), PAL.slate);
      R(g, x + r - 5, y + 3, 3, 1, glass);
      R(g, x + r - 7, y + 4, 2, 1, glass);
      return;
    }
    const t = kind === 'glass' ? 1 : 2;
    R(g, x - t, y - t, w + t * 2, t, color);
    R(g, x - t, y + h, w + t * 2, t, color);
    R(g, x - t, y, t, h, color);
    R(g, x + w, y, t, h, color);
    R(g, x - t, y - t, w + t * 2, 1, shade(color, 0.2));
    if (kind === 'std') {
      R(g, x + Math.floor(w / 2), y, 1, h, color);
      R(g, x, y + Math.floor(h * 0.4), w, 1, color);
      R(g, x - 3, y + h + 2, w + 6, 1, shade(color, 0.15));
      R(g, x - 3, y + h + 3, w + 6, 1, shade(color, -0.3));
    } else if (kind === 'industrial') {
      for (let i = 1; i < 4; i++) R(g, x + Math.round((w * i) / 4), y, 1, h, color);
      R(g, x, y + Math.floor(h / 2), w, 1, color);
    } else {
      R(g, x + Math.floor(w / 2), y, 1, h, shade(color, 0.1));
    }
    S.line(g, x + 2, y + 8, x + 8, y + 2, glass);
    S.line(g, x + 3, y + 11, x + 11, y + 3, glass);
  }, 0);
}

// Luz que entra por las ventanas y cae sobre el suelo.
function lightShaft(g, w, H) {
  const len = Math.min(64, H - WALL - 40);
  for (let i = 0; i < len; i++) {
    const a = 0.1 * (1 - i / len);
    g.fillStyle = `rgba(255,244,214,${a.toFixed(3)})`;
    g.fillRect(w.x + 2 + Math.round(i * 0.45), WALL + i, w.w - 4, 1);
  }
}

const SKIES = {
  winter: ['#8fb0d0', '#c8d9e8', '#e4edf4'],
  spring: ['#3f9ef0', '#73c1f5', '#b3e0f8'],
  summer: ['#2a86ec', '#58b2f4', '#9ed8fa'],
  autumn: ['#e8795a', '#f4a36c', '#ffd29a'],
};
const seasonSky = (m) => (m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn');

function cloud(g, x, y, big) {
  R(g, x + 3, y, big ? 7 : 5, 2, PAL.white);
  R(g, x, y + 2, big ? 14 : 10, 2, PAL.white);
  R(g, x + 1, y + 4, big ? 12 : 8, 1, '#dbe6ee');
}

function landscape(g, theme, w, night) {
  const bx = w.x;
  const by = w.y + w.h;
  if (theme === 'sea') {
    const sea = night ? '#16305a' : PAL.sky;
    R(g, bx, by - 11, w.w, 11, sea);
    R(g, bx, by - 11, w.w, 1, night ? '#2b4a80' : '#8fdcf2');
    R(g, bx, by - 6, w.w, 3, night ? '#122848' : PAL.blue);
    for (let i = 0; i < w.w; i += 7) px(g, bx + i + Math.floor(hash(w.x + i, 1, 5) * 4), by - 9 + (i % 3), night ? '#4a6aa0' : PAL.white);
    R(g, bx, by - 3, w.w, 3, night ? '#8a7a5a' : '#f2d8a0');
    if (hash(w.x, 7, 5) < 0.6) {
      const px0 = bx + w.w - 10;
      R(g, px0 + 3, by - 16, 1, 13, '#6b4024');
      R(g, px0 + 2, by - 10, 1, 7, '#6b4024');
      for (const [dx, dy, ww] of [[-2, -17, 5], [3, -18, 6], [0, -16, 3], [4, -16, 4]]) R(g, px0 + dx, by + dy, ww, 1, night ? '#1f4a35' : PAL.green);
    }
    return;
  }
  if (theme === 'campus') {
    R(g, bx, by - 6, w.w, 6, '#5ab552');
    for (let i = 0; i < w.w; i += 6) R(g, bx + i, by - 7 - Math.floor(hash(w.x + i, 1, 7) * 3), 6, 3, '#5ab552');
    for (const tx of [5, 20, 31]) {
      if (tx > w.w - 4) continue;
      R(g, bx + tx + 1, by - 9, 1, 4, '#6b4024');
      blob(g, bx + tx + 1, by - 11, 3, 3, '#2a8c50');
      px(g, bx + tx, by - 13, '#4fc56f');
    }
    return;
  }
  if (theme === 'tower') {
    for (let i = 0; i < w.w; i += 5) {
      const h = 6 + Math.floor(hash(w.x + i, 2, 9) * 12);
      const c = hash(w.x + i, 3, 9) < 0.5 ? '#3a4a8a' : '#29366f';
      R(g, bx + i, by - h, 5, h, c);
      for (let k = 2; k < h - 1; k += 3) if (hash(w.x + i, k, 10) < 0.45) px(g, bx + i + 2, by - h + k, PAL.yellow);
    }
    return;
  }
  if (theme === 'loft') {
    for (let i = 0; i < w.w; i += 9) {
      const h = 4 + Math.floor(hash(w.x + i, 2, 13) * 6);
      R(g, bx + i, by - h, 9, h, hash(w.x + i, 4, 13) < 0.5 ? '#7e3a2e' : '#5e2c24');
      R(g, bx + i, by - h, 9, 1, '#b25a45');
    }
    if (hash(w.x, 5, 13) < 0.5) return;
    const tx = bx + w.w - 12;
    R(g, tx, by - 16, 7, 6, '#8a6340');
    R(g, tx + 1, by - 10, 1, 4, '#4a2f1f');
    R(g, tx + 5, by - 10, 1, 4, '#4a2f1f');
    R(g, tx - 1, by - 17, 9, 1, '#6b4024');
    return;
  }
  // Ciudad a lo lejos (con más ventanas encendidas de noche)
  for (let i = 0; i < w.w; i += 6) {
    const h = 3 + Math.floor(hash(w.x + i, 2, 17) * 9);
    const c = night ? mix(PAL.navy, '#070a1e', 0.3) : mix(PAL.navy, '#8fa5b8', 0.55 + hash(w.x + i, 3, 17) * 0.2);
    R(g, bx + i, by - h, 6, h, c);
    if (h > 5) px(g, bx + i + 2, by - h + 2, night ? PAL.yellow : mix(PAL.yellow, c, 0.4));
    if (night && h > 7 && hash(w.x + i, 6, 17) < 0.6) px(g, bx + i + 4, by - h + 5, PAL.yellow);
  }
  R(g, bx, by - 2, w.w, 2, night ? '#1d2440' : '#6f8196');
}

// Cielo según la hora del día (6:00 = amanecer).
function skyFor(hour, season) {
  const h = hour % 24;
  if (h >= 21 || h < 5.5) return { c: ['#070a1e', '#0d1330', '#161e45'], night: true };
  if (h < 7.5) return { c: ['#3a3470', '#d9707a', '#ffc28a'], dawn: true };
  if (h >= 19) return { c: ['#2a2a6a', '#b13e53', '#ef7d57'], dusk: true };
  return { c: SKIES[season] };
}

// ---------------------------------------------------------------- API

// Pinta el fondo fijo. Devuelve dónde van las ventanas y el reloj.
export function paintBackground(g, L, s) {
  const T = L.theme;
  const th = L.o.theme;
  g.clearRect(0, 0, L.W, L.H);
  FLOORS[T.kind](g, 0, WALL, L.W, L.H - WALL, T, L);
  // Sala de servidores
  const r = L.room;
  R(g, r.x, r.y, r.w, r.h, '#1d2136');
  for (let y = r.y + 3; y < r.y + r.h; y += 8) {
    for (let x = r.x + 2; x < r.x + r.w; x += 8) {
      R(g, x, y, 8, 1, '#262b44');
      R(g, x, y, 1, 8, '#262b44');
      if ((x + y) % 16 === 0) for (let k = 2; k < 7; k += 2) R(g, x + 2, y + k, 5, 1, '#232840');
    }
  }
  const glow = g.createLinearGradient(0, r.y, 0, r.y + r.h);
  glow.addColorStop(0, 'rgba(65,166,246,0)');
  glow.addColorStop(1, 'rgba(65,166,246,.14)');
  g.fillStyle = glow;
  g.fillRect(r.x, r.y, r.w, r.h);
  R(g, r.x, r.y, r.w, 3, '#3a4160');
  R(g, r.x, r.y, r.w, 1, PAL.silver);
  R(g, r.x, r.y + 3, r.w, 1, 'rgba(14,10,30,.35)');
  R(g, r.x, r.y, 2, r.h, '#3a4160');
  R(g, r.x, r.y, 1, r.h, PAL.silver);
  R(g, r.x + 4, r.y + 5, S.textWidth('SERVIDORES') + 4, 7, '#12152a');
  S.drawText(g, 'SERVIDORES', r.x + 6, r.y + 6, PAL.sky);
  // Pared
  WALLS[T.kind](g, L, T);
  R(g, 0, 0, L.W, 1, 'rgba(10,8,24,.35)');
  R(g, 0, 1, L.W, 1, 'rgba(10,8,24,.18)');
  R(g, 0, 2, L.W, 1, 'rgba(10,8,24,.08)');
  // Rótulo y reloj
  const name = s.company.slice(0, 18);
  const tw = S.textWidth(name);
  const sw = tw + 12;
  const group = sw + 16;
  const sx = Math.max(4, Math.round((4 + L.loungeX - 8) / 2 - group / 2));
  const [board, ink] = T.sign;
  R(g, sx, 5, sw, 13, shade(board, -0.4));
  R(g, sx + 1, 6, sw - 2, 11, board);
  R(g, sx + 1, 6, sw - 2, 1, shade(board, 0.25));
  px(g, sx + 2, 8, shade(board, 0.4));
  px(g, sx + sw - 3, 8, shade(board, 0.4));
  px(g, sx + 2, 14, shade(board, 0.4));
  px(g, sx + sw - 3, 14, shade(board, 0.4));
  S.drawTextShadow(g, name, sx + 6, 9, ink, shade(board, -0.5));
  const clock = { x: sx + sw + 6, y: 7 };
  // Ventanas o puerta del garaje
  let windows = [];
  if (th === 'garage') {
    const gx = Math.max(L.loungeX + 8, clock.x + 16);
    const gw = Math.min(90, L.W - gx - 40);
    const door = '#8a96a8';
    R(g, gx - 2, 3, gw + 4, WALL - 5, '#3e4a5e');
    for (let p = 0; p < 4; p++) {
      const py = 5 + p * 9;
      R(g, gx, py, gw, 8, door);
      R(g, gx, py, gw, 1, shade(door, 0.25));
      R(g, gx, py + 7, gw, 1, shade(door, -0.3));
      for (let x = gx + 4; x < gx + gw - 6; x += 16) R(g, x, py + 2, 12, 4, p === 0 ? '#2b3a55' : shade(door, -0.08));
    }
    R(g, gx + gw / 2 - 5, WALL - 9, 10, 2, PAL.ink);
    // Tablero de herramientas
    const tx = gx + gw + 8;
    const tw2 = Math.min(28, L.W - tx - 32);
    if (tw2 > 14) {
      R(g, tx, 14, tw2, 20, '#b58a5c');
      R(g, tx, 14, tw2, 1, '#d4a878');
      for (let y = 17; y < 33; y += 3) for (let x = tx + 2; x < tx + tw2 - 1; x += 3) px(g, x, y, '#8a6340');
      R(g, tx + 3, 17, 2, 9, PAL.slate);
      R(g, tx + 2, 17, 4, 2, PAL.ink);
      R(g, tx + 9, 18, 1, 10, PAL.silver);
      R(g, tx + 8, 17, 3, 2, PAL.silver);
      if (tw2 > 20) {
        R(g, tx + 15, 18, 6, 8, PAL.red);
        R(g, tx + 15, 18, 6, 1, shade(PAL.red, 0.3));
        R(g, tx + 17, 26, 2, 3, PAL.dark);
      }
    }
  } else {
    windows = windowRects(L, T.win, L.loungeX);
    for (const w of windows) if (w.kind !== 'porthole') lightShaft(g, w, L.H);
  }
  // Rodapié y sombra en el suelo junto a la pared
  R(g, 0, WALL - 4, L.W, 4, T.trim);
  R(g, 0, WALL - 4, L.W, 1, shade(T.trim, 0.25));
  R(g, 0, WALL - 1, L.W, 1, shade(T.trim, -0.3));
  for (let i = 0; i < 4; i++) R(g, 0, WALL + i, L.W, 1, `rgba(10,8,24,${(0.2 - i * 0.05).toFixed(2)})`);
  // Corcho o póster
  if (T.kind === 'garage' || T.kind === 'cowork') S.drawCorkboard(g, 4, 20);
  else S.drawPoster(g, 6, 20);
  return { windows, clock };
}

// Cielo, nubes y paisaje de cada ventana; se llama en cada fotograma.
export function paintWindows(g, L, s, t, windows, hour = 12) {
  const view = L.theme.view;
  const m = dateOf(s.day).m;
  const season = seasonSky(m);
  const sk = skyFor(hour, season);
  const sky = sk.c;
  for (const w of windows) {
    if (w.kind === 'porthole') {
      const r = w.w / 2;
      g.save();
      g.beginPath();
      g.arc(w.x + r, w.y + r, r + 0.5, 0, Math.PI * 2);
      g.clip();
      R(g, w.x, w.y, w.w, w.h, '#05060c');
      for (let i = 0; i < 10; i++) {
        const sx = w.x + ((i * 13 + Math.floor(t * 2) + w.x) % w.w);
        px(g, sx, w.y + ((i * 7) % w.h), i % 3 ? PAL.white : PAL.cyan);
      }
      if (view === 'moon') {
        // La Tierra sale sobre el horizonte lunar
        blob(g, w.x + 8, w.y + 8, 4, 4, PAL.blue);
        blob(g, w.x + 7, w.y + 7, 2, 1, PAL.green);
        R(g, w.x, w.y + 16, w.w, 8, '#9aa0ad');
        R(g, w.x, w.y + 16, w.w, 1, '#c9ced8');
        blob(g, w.x + 16, w.y + 19, 3, 1, '#7d8292');
        blob(g, w.x + 6, w.y + 21, 2, 1, '#7d8292');
      } else {
        const ex = w.x + ((w.x + t * 1.5) % (w.w + 24)) - 12;
        blob(g, ex + 6, w.y + 16, 7, 7, PAL.blue);
        blob(g, ex + 4, w.y + 14, 3, 2, PAL.green);
        blob(g, ex + 8, w.y + 18, 2, 1, PAL.green);
        R(g, ex + 1, w.y + 12, 3, 1, 'rgba(255,255,255,.6)');
      }
      g.restore();
    } else {
      clip(g, w.x, w.y, w.w, w.h, () => {
        const b = Math.ceil(w.h / 3);
        R(g, w.x, w.y, w.w, b, sky[0]);
        R(g, w.x, w.y + b, w.w, b, sky[1]);
        R(g, w.x, w.y + b * 2, w.w, w.h - b * 2, sky[2]);
        if (sk.night) {
          for (let i = 0; i < 6; i++) px(g, w.x + Math.floor(hash(i, w.x, 3) * w.w), w.y + Math.floor(hash(i, w.x, 4) * w.h * 0.6), i % 3 ? PAL.white : '#a8b8ff');
          if (hash(w.x, 9, 9) < 0.35) {
            blob(g, w.x + 8, w.y + 6, 3, 3, '#fff4c0');
            blob(g, w.x + 10, w.y + 5, 2, 2, sky[0]);
          }
        } else {
          if (!sk.dawn && !sk.dusk && (season === 'summer' || season === 'spring')) {
            const sx = w.x + w.w - 9;
            blob(g, sx, w.y + 5, 2, 2, PAL.yellow);
            px(g, sx - 1, w.y + 4, '#fff4c0');
          }
          const cx = w.x + ((w.x * 3 + t * 3) % (w.w + 18)) - 14;
          cloud(g, cx, w.y + 4, true);
          const cx2 = w.x + ((w.x * 7 + t * 2) % (w.w + 18)) - 12;
          cloud(g, cx2, w.y + 11, false);
        }
        landscape(g, view, w, sk.night);
        if (season === 'winter') {
          for (let i = 0; i < 7; i++) px(g, w.x + ((i * 11 + t * 4) % w.w), w.y + ((i * 9 + t * 8) % w.h), PAL.white);
        }
      });
    }
    S.blit(g, frameSprite(w.kind, w.w, w.h, L.theme.frame), w.x - 3, w.y - 3);
  }
}

// Viñeta suave para dar profundidad a la escena.
export function paintVignette(g, L) {
  const grad = g.createRadialGradient(L.W / 2, L.H * 0.55, Math.min(L.W, L.H) * 0.35, L.W / 2, L.H * 0.55, Math.max(L.W, L.H) * 0.75);
  const dark = SPACE.has(L.o.theme) ? 'rgba(4,6,20,.4)' : 'rgba(12,8,30,.28)';
  grad.addColorStop(0, 'rgba(12,8,30,0)');
  grad.addColorStop(1, dark);
  g.clearRect(0, 0, L.W, L.H);
  g.fillStyle = grad;
  g.fillRect(0, 0, L.W, L.H);
}
