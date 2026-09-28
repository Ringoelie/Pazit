// Vista de la oficina en canvas: fondo cacheado, empleados animados, cámara
// con zoom entero (píxeles nítidos) y arrastre.
import { OFFICES, ROLES, PAL } from './data.js';
import { dateOf } from './util.js';
import * as S from './sprites.js';

const COLS = [2, 4, 7, 8, 10, 14, 20];
const CW = 28;
const CH = 30;
const WALL = 44;

const THEMES = {
  garage: { wall: '#566c86', trim: '#3e4c63', floor: ['#6f7d91', '#687689'], desk: ['#b4895f', '#8a6340'], chair: '#333c57', bg: '#20243a' },
  cowork: { wall: '#e9d8b8', trim: '#cdb896', floor: ['#b98555', '#ae7a4b'], desk: ['#f4f4f4', '#c9d3dc'], chair: '#3b5dc9', bg: '#2a2437' },
  small: { wall: '#c7d4e0', trim: '#94b0c2', floor: ['#3a4a8a', '#35447f'], desk: ['#e8e8e8', '#b8c4cf'], chair: '#1a1c2c', bg: '#1f2440' },
  loft: { wall: '#9c4a3a', trim: '#6e3228', floor: ['#7a4a2a', '#704426'], desk: ['#3a3f58', '#2a2e44'], chair: '#ef7d57', bg: '#241a22' },
  tower: { wall: '#29366f', trim: '#1f2a58', floor: ['#d6dee6', '#cad4de'], desk: ['#f4f4f4', '#94b0c2'], chair: '#333c57', bg: '#141a33' },
  campus: { wall: '#e6efe0', trim: '#b9cbb0', floor: ['#a8dcae', '#9dd2a4'], desk: ['#fff4e0', '#e2cfae'], chair: '#38b764', bg: '#1d2b24' },
  orbital: { wall: '#1a1c2c', trim: '#333c57', floor: ['#4a5470', '#454e69'], desk: ['#94b0c2', '#566c86'], chair: '#73eff7', bg: '#0b0c14' },
};

const WALL_ITEMS = { coffee: 12, snacks: 14, arcade: 14, library: 22, robot: 14 };
const FLOOR_ITEMS = { sofa: [30, 14], foosball: [26, 17], ballpit: [34, 16], gym: [35, 14], nappods: [30, 16], chef: [34, 18], podcast: [26, 20] };
const BREAK_PERKS = ['coffee', 'snacks', 'arcade', 'sofa', 'foosball', 'ballpit', 'gym', 'nappods', 'chef', 'robot', 'library'];
const GLYPH = {
  code: ['</>', PAL.sky], design: ['~', PAL.orange], ai: ['01', PAL.silver], flex: ['*', PAL.yellow],
  hype: ['!', '#ff6b8b'], rp: ['?', PAL.lime], ops: ['%', PAL.green], sales: ['$', PAL.cyan], people: ['♥', '#ff6b8b'], lead: ['>', PAL.cyan],
};

function layout(tier) {
  const o = OFFICES[tier];
  const cols = COLS[tier];
  const x0 = 14;
  const y0 = WALL + 30;
  const desks = [];
  for (let i = 0; i < o.desks; i++) desks.push({ x: x0 + (i % cols) * CW, y: y0 + Math.floor(i / cols) * CH });
  const loungeX = x0 + cols * CW + 18;
  return { o, cols, desks, x0, y0, loungeX, W: o.w, H: o.h, theme: THEMES[o.theme] };
}

export class OfficeView {
  constructor(canvas, { onPick, onHover } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = document.createElement('canvas');
    this.wctx = this.world.getContext('2d');
    this.bg = document.createElement('canvas');
    this.bgKey = '';
    this.onPick = onPick;
    this.onHover = onHover;
    this.zoom = 2;
    this.cam = { x: 0, y: 0 };
    this.userZoom = false;
    this.t = 0;
    this.people = new Map();
    this.floaters = [];
    this.confetti = [];
    this.selected = null;
    this.hover = null;
    this.hits = [];
    this.tier = -1;
    this.pointers = new Map();
    this.bindInput();
  }

  // ---------------------------------------------------------------- cámara

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.dpr = dpr;
    if (!this.userZoom) this.fit();
    this.clampCam();
  }

  // Zoom entero si apenas desperdicia espacio (píxeles perfectos); si no,
  // fraccionario para que la oficina llene el hueco disponible.
  fitZoom() {
    if (!this.L) return 1;
    const f = Math.min(this.canvas.width / this.L.W, this.canvas.height / this.L.H);
    const i = Math.floor(f);
    return i >= 1 && i / f >= 0.85 ? i : f;
  }

  fit() {
    this.zoom = this.fitZoom();
    this.userZoom = false;
    this.cam.x = 0;
    this.cam.y = 0;
    this.clampCam();
  }

  zoomBy(d, cx, cy) {
    const old = this.zoom;
    const step = d > 0 ? Math.floor(old + 1e-6) + 1 : Math.ceil(old - 1e-6) - 1;
    const z = Math.max(Math.min(1, this.fitZoom()), Math.min(12, step));
    if (Math.abs(z - old) < 1e-6) return;
    cx ??= this.canvas.width / 2;
    cy ??= this.canvas.height / 2;
    const wx = this.cam.x + (cx - this.offX()) / old;
    const wy = this.cam.y + (cy - this.offY()) / old;
    this.zoom = z;
    this.userZoom = Math.abs(z - this.fitZoom()) > 1e-6;
    this.cam.x = wx - (cx - this.offX()) / z;
    this.cam.y = wy - (cy - this.offY()) / z;
    this.clampCam();
  }

  viewW() {
    return this.canvas.width / this.zoom;
  }
  viewH() {
    return this.canvas.height / this.zoom;
  }
  offX() {
    return this.L && this.viewW() > this.L.W ? Math.floor((this.canvas.width - this.L.W * this.zoom) / 2) : 0;
  }
  offY() {
    return this.L && this.viewH() > this.L.H ? Math.floor((this.canvas.height - this.L.H * this.zoom) / 2) : 0;
  }

  clampCam() {
    if (!this.L) return;
    const mx = Math.max(0, this.L.W - this.viewW());
    const my = Math.max(0, this.L.H - this.viewH());
    this.cam.x = Math.max(0, Math.min(mx, this.cam.x));
    this.cam.y = Math.max(0, Math.min(my, this.cam.y));
    this.canvas.style.touchAction = mx > 0 || my > 0 ? 'none' : 'pan-y';
  }

  toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const px = (clientX - r.left) * this.dpr;
    const py = (clientY - r.top) * this.dpr;
    return { x: this.cam.x + (px - this.offX()) / this.zoom, y: this.cam.y + (py - this.offY()) / this.zoom, px, py };
  }

  bindInput() {
    const c = this.canvas;
    let drag = null;
    let pinch = null;
    c.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
        drag = null;
      } else drag = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false };
    });
    c.addEventListener('pointermove', (e) => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d / pinch.d > 1.25) {
          this.zoomBy(1);
          pinch.d = d;
        } else if (d / pinch.d < 0.8) {
          this.zoomBy(-1);
          pinch.d = d;
        }
        return;
      }
      if (drag && e.buttons) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
        if (drag.moved) {
          this.cam.x = drag.cx - (dx * this.dpr) / this.zoom;
          this.cam.y = drag.cy - (dy * this.dpr) / this.zoom;
          this.clampCam();
        }
        return;
      }
      const w = this.toWorld(e.clientX, e.clientY);
      const hit = this.hitTest(w.x, w.y);
      if (hit !== this.hover) {
        this.hover = hit;
        c.style.cursor = hit ? 'pointer' : 'grab';
        this.onHover?.(hit, e.clientX, e.clientY);
      } else if (hit) this.onHover?.(hit, e.clientX, e.clientY);
    });
    const end = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) pinch = null;
      if (drag && !drag.moved && e.type === 'pointerup') {
        const w = this.toWorld(e.clientX, e.clientY);
        const hit = this.hitTest(w.x, w.y);
        this.onPick?.(hit);
      }
      drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      if (this.hover) {
        this.hover = null;
        this.onHover?.(null);
      }
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const w = this.toWorld(e.clientX, e.clientY);
        this.zoomBy(e.deltaY < 0 ? 1 : -1, w.px, w.py);
      },
      { passive: false },
    );
  }

  hitTest(x, y) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h.id;
    }
    return null;
  }

  // ---------------------------------------------------------------- efectos

  onDay(s) {
    if (!this.L) return;
    const working = s.employees.filter((e) => e.off <= 0 && !e.traits.includes('remote'));
    const n = Math.min(6, Math.ceil(working.length / 3));
    for (let i = 0; i < n; i++) {
      const e = working[Math.floor(Math.random() * working.length)];
      if (!e) break;
      const produces = ROLES[e.role].produces;
      if (['founder', 'dev', 'design', 'ai'].includes(e.role) && !e.assign) continue;
      const pos = this.personPos(e);
      if (!pos) continue;
      const [txt, color] = GLYPH[produces] || GLYPH.flex;
      this.floaters.push({ x: pos.x + 5 - S.textWidth(txt) / 2, y: pos.y - 4, txt, color, life: 1.4 });
    }
  }

  burst(n = 40) {
    if (!this.L) return;
    const colors = [PAL.yellow, PAL.red, PAL.lime, PAL.cyan, PAL.orange, '#ff6b8b', PAL.white];
    for (let i = 0; i < n; i++) {
      this.confetti.push({
        x: this.L.W / 2 + (Math.random() - 0.5) * this.L.W * 0.6,
        y: WALL + 4,
        vx: (Math.random() - 0.5) * 40,
        vy: -Math.random() * 40 - 10,
        c: colors[i % colors.length],
        life: 2 + Math.random(),
      });
    }
  }

  // ---------------------------------------------------------------- fondo

  ensureLayout(s) {
    if (s.office.tier !== this.tier) {
      this.tier = s.office.tier;
      this.L = layout(this.tier);
      this.world.width = this.L.W;
      this.world.height = this.L.H;
      this.bg.width = this.L.W;
      this.bg.height = this.L.H;
      this.bgKey = '';
      this.people.clear();
      this.canvas.parentElement?.style.setProperty('--office-ar', `${this.L.W} / ${this.L.H}`);
      this.userZoom = false;
      this.resize();
    }
    const key = JSON.stringify([this.tier, s.office.perks, s.company]);
    if (key !== this.bgKey) {
      this.bgKey = key;
      this.placePerks(s);
      this.drawBackground(s);
    }
  }

  placePerks(s) {
    const L = this.L;
    const P = s.office.perks;
    const pos = {};
    let x = L.loungeX + 30;
    for (const id of Object.keys(WALL_ITEMS)) {
      const n = id === 'arcade' ? P.arcade || 0 : P[id] ? 1 : 0;
      for (let i = 0; i < n; i++) {
        (pos[id] ||= []).push({ x, y: WALL + 24 - (id === 'coffee' ? 20 : id === 'robot' ? 20 : 24) });
        x += WALL_ITEMS[id] + 5;
      }
    }
    const plants = [{ x: 2, y: WALL + 12 }, { x: L.loungeX + 12, y: WALL + 12 }, { x: L.W - 14, y: WALL + 12 }];
    pos.plant = plants.slice(0, P.plant || 0);
    let fx = L.loungeX + 4;
    let fy = WALL + 40;
    let rowH = 0;
    for (const id of Object.keys(FLOOR_ITEMS)) {
      if (!P[id]) continue;
      const [w, h] = FLOOR_ITEMS[id];
      const n = P[id];
      for (let i = 0; i < n; i++) {
        if (fx + w > L.W - 6) {
          fx = L.loungeX + 4;
          fy += rowH + 12;
          rowH = 0;
        }
        (pos[id] ||= []).push({ x: fx, y: fy + (id === 'podcast' ? 8 : 0) });
        fx += w + 8;
        rowH = Math.max(rowH, h + (id === 'podcast' ? 8 : 0));
      }
    }
    this.perkPos = pos;
    this.usePoints = [];
    for (const id of BREAK_PERKS) {
      for (const p of pos[id] || []) {
        const w = WALL_ITEMS[id] || FLOOR_ITEMS[id]?.[0] || 12;
        const h = FLOOR_ITEMS[id]?.[1] || 24;
        const floor = !!FLOOR_ITEMS[id];
        this.usePoints.push({ x: p.x + w / 2 - 5, y: floor ? p.y + h - 6 : WALL + 24 });
      }
    }
  }

  drawBackground(s) {
    const L = this.L;
    const T = L.theme;
    const g = this.bg.getContext('2d');
    g.clearRect(0, 0, L.W, L.H);
    // Suelo
    for (let y = WALL; y < L.H; y += 8) {
      for (let x = 0; x < L.W; x += 16) {
        const alt = ((x / 16) + (y / 8)) % 2 === 0;
        S.R(g, x, y, 16, 8, T.floor[alt ? 0 : 1]);
      }
    }
    if (L.o.theme === 'cowork' || L.o.theme === 'loft') {
      for (let y = WALL; y < L.H; y += 8) S.R(g, 0, y, L.W, 1, S.shade(T.floor[0], -0.15));
    }
    if (L.o.theme === 'orbital') {
      for (let y = WALL + 4; y < L.H; y += 16) for (let x = 4; x < L.W; x += 16) S.R(g, x, y, 1, 1, PAL.silver);
    }
    if (L.o.theme === 'campus') {
      S.R(g, L.loungeX - 4, WALL + 30, L.W - L.loungeX, L.H - WALL - 34, '#f6c177');
      S.R(g, L.loungeX - 2, WALL + 32, L.W - L.loungeX - 4, L.H - WALL - 38, '#f8d49a');
    }
    // Pared
    S.R(g, 0, 0, L.W, WALL, T.wall);
    if (L.o.theme === 'loft') {
      for (let y = 0; y < WALL; y += 4) {
        const off = (y / 4) % 2 ? 4 : 0;
        for (let x = -off; x < L.W; x += 8) S.R(g, x + 7, y, 1, 4, T.trim);
        S.R(g, 0, y + 3, L.W, 1, T.trim);
      }
    }
    S.R(g, 0, WALL - 3, L.W, 3, T.trim);
    S.R(g, 0, WALL, L.W, 1, S.shade(T.floor[0], -0.3));
    // Rótulo de la empresa sobre la zona de mesas
    const name = s.company.slice(0, 18);
    const tw = S.textWidth(name, 1);
    const sx = Math.max(4, L.x0 + (L.cols * CW) / 2 - tw / 2 - 4);
    S.R(g, sx, 6, tw + 8, 11, PAL.ink);
    S.R(g, sx + 1, 7, tw + 6, 9, PAL.navy);
    S.drawText(g, name, sx + 4, 9, PAL.yellow);
    if (L.o.theme === 'garage') {
      this.drawGarageStuff(g);
      // Puerta de garaje
      const gx = L.loungeX + 8;
      const gw = Math.min(90, L.W - gx - 10);
      S.R(g, gx, 4, gw, WALL - 7, '#8a96a8');
      for (let y = 6; y < WALL - 4; y += 4) S.R(g, gx, y, gw, 1, '#6f7b8e');
      S.R(g, gx + gw / 2 - 4, WALL - 8, 8, 2, PAL.ink);
    } else {
      this.windows = [];
      const start = L.loungeX + 4;
      for (let x = start; x + 38 < L.W - 4; x += 48) this.windows.push({ x, y: 7, w: 38, h: 26 });
    }
    // Tablón de corcho con notas en garaje/coworking; póster en el resto
    if (L.o.theme === 'garage' || L.o.theme === 'cowork') {
      S.R(g, 4, 20, 22, 16, '#b86f50');
      S.R(g, 6, 22, 5, 5, PAL.yellow);
      S.R(g, 13, 23, 5, 5, PAL.cyan);
      S.R(g, 19, 22, 5, 5, '#ff6b8b');
      S.R(g, 8, 29, 5, 5, PAL.lime);
    } else S.drawPoster(g, 6, 20);
  }

  // El garaje de tus padres: coche, cajas y una bici. Solo decorado.
  drawGarageStuff(g) {
    const L = this.L;
    const cx = L.loungeX + 44;
    const cy = WALL + 62;
    S.R(g, cx + 6, cy + 26, 50, 3, 'rgba(26,28,44,.35)');
    S.R(g, cx + 14, cy + 20, 10, 4, 'rgba(26,28,44,.25)');
    S.R(g, cx + 12, cy, 32, 10, PAL.red);
    S.R(g, cx + 15, cy + 2, 11, 7, PAL.cyan);
    S.R(g, cx + 28, cy + 2, 11, 7, PAL.cyan);
    S.R(g, cx + 16, cy + 3, 3, 2, PAL.white);
    S.R(g, cx + 2, cy + 10, 54, 11, PAL.red);
    S.R(g, cx + 2, cy + 10, 54, 2, '#d0566b');
    S.R(g, cx + 2, cy + 17, 54, 2, '#8a2f41');
    S.R(g, cx + 2, cy + 12, 4, 3, PAL.yellow);
    S.R(g, cx + 52, cy + 12, 4, 3, PAL.orange);
    for (const wx of [cx + 8, cx + 40]) {
      S.R(g, wx, cy + 18, 10, 9, PAL.ink);
      S.R(g, wx + 3, cy + 21, 4, 3, PAL.slate);
    }
    // Cajas de mudanza apiladas
    const bx = 2;
    const by = L.H - 28;
    for (const [dx, dy, w, h] of [[0, 12, 16, 12], [16, 14, 14, 10], [3, 0, 12, 12]]) {
      S.R(g, bx + dx, by + dy, w, h, '#c98a60');
      S.R(g, bx + dx, by + dy, w, 2, '#e0a878');
      S.R(g, bx + dx + w / 2 - 1, by + dy, 2, h, '#e8d0a0');
    }
    // Bici apoyada en la pared
    const kx = L.W - 34;
    const ky = WALL + 8;
    for (const wx of [kx, kx + 16]) {
      S.R(g, wx, ky + 4, 9, 1, PAL.ink);
      S.R(g, wx, ky + 12, 9, 1, PAL.ink);
      S.R(g, wx, ky + 5, 1, 7, PAL.ink);
      S.R(g, wx + 8, ky + 5, 1, 7, PAL.ink);
    }
    S.R(g, kx + 4, ky + 3, 17, 1, PAL.sky);
    S.R(g, kx + 11, ky, 1, 8, PAL.sky);
    S.R(g, kx + 9, ky - 1, 5, 2, PAL.ink);
    S.R(g, kx + 20, ky - 2, 1, 6, PAL.sky);
  }

  // ---------------------------------------------------------------- personas

  personPos(e) {
    const st = this.people.get(e.id);
    if (st && st.mode !== 'desk') return { x: st.x, y: st.y };
    const d = this.L.desks[e.desk];
    if (!d) return null;
    return { x: d.x + 9, y: d.y + 1 };
  }

  updatePeople(s, dt, speed) {
    const alive = new Set();
    const mult = [0, 1, 1.5, 2.2][speed] || 1;
    for (const e of s.employees) {
      if (e.traits.includes('remote')) continue;
      alive.add(e.id);
      const d = this.L.desks[e.desk];
      if (!d) continue;
      let st = this.people.get(e.id);
      const home = { x: d.x + 9, y: d.y - 2 };
      if (!st) {
        st = { mode: 'desk', x: home.x, y: home.y, tx: 0, ty: 0, timer: 0, phase: Math.random() * 10 };
        this.people.set(e.id, st);
      }
      if (e.off > 0) {
        st.mode = 'desk';
        continue;
      }
      if (st.mode === 'desk') {
        if (speed > 0 && this.usePoints.length && e.energy < 88 && Math.random() < dt * 0.025 * mult) {
          const p = this.usePoints[Math.floor(Math.random() * this.usePoints.length)];
          st.mode = 'walk';
          st.x = home.x;
          st.y = home.y + 8;
          st.tx = p.x + (Math.random() * 8 - 4);
          st.ty = p.y;
        }
      } else if (st.mode === 'break') {
        st.timer -= dt * mult;
        if (st.timer <= 0 || speed === 0) {
          st.mode = 'return';
          st.tx = home.x;
          st.ty = home.y + 8;
        }
      } else {
        const dx = st.tx - st.x;
        const dy = st.ty - st.y;
        const dist = Math.hypot(dx, dy);
        const v = 24 * mult * dt;
        if (dist <= v) {
          st.x = st.tx;
          st.y = st.ty;
          if (st.mode === 'walk') {
            st.mode = 'break';
            st.timer = 3 + Math.random() * 4;
          } else st.mode = 'desk';
        } else {
          st.x += (dx / dist) * v;
          st.y += (dy / dist) * v;
        }
      }
    }
    for (const id of this.people.keys()) if (!alive.has(id)) this.people.delete(id);
  }

  // ---------------------------------------------------------------- dibujo

  frame(s, dt, speed) {
    this.t += dt;
    this.ensureLayout(s);
    this.updatePeople(s, dt, speed);
    const L = this.L;
    const g = this.wctx;
    const t = this.t;
    g.drawImage(this.bg, 0, 0);
    this.drawWindows(g, s, t);
    this.drawWallDecor(g, s, t);
    this.hits = [];

    // Objetos de pared (de pie contra la pared)
    const P = this.perkPos;
    for (const p of P.coffee || []) S.drawCoffee(g, p.x, p.y, t);
    for (const p of P.snacks || []) S.drawVending(g, p.x, p.y, t);
    for (const p of P.arcade || []) S.drawArcade(g, p.x, p.y, t);
    for (const p of P.library || []) S.drawBookshelf(g, p.x, p.y);
    for (const p of P.robot || []) S.drawRobot(g, p.x, p.y, t);
    for (const p of P.plant || []) S.drawPlant(g, p.x, p.y, t);

    // Objetos de suelo y servidores ordenados por profundidad junto a la gente
    const drawables = [];
    for (const [id, list] of Object.entries(P)) {
      if (!FLOOR_ITEMS[id]) continue;
      for (const p of list) drawables.push({ y: p.y + FLOOR_ITEMS[id][1], draw: () => this.drawFloorItem(g, id, p, t) });
    }
    this.queueRacks(s, drawables, t);

    const byDesk = new Map();
    for (const e of s.employees) if (!e.traits.includes('remote')) byDesk.set(e.desk, e);
    L.desks.forEach((d, i) => {
      const e = byDesk.get(i);
      drawables.push({ y: d.y + 24, draw: () => this.drawDesk(g, s, d, e, t) });
    });
    for (const e of s.employees) {
      const st = this.people.get(e.id);
      if (!st || st.mode === 'desk' || e.off > 0) continue;
      drawables.push({ y: st.y + 18, draw: () => this.drawWalker(g, e, st, t) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    this.drawEffects(g, dt);
    this.drawLabel(g, s);

    // Volcado al canvas visible
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.fillStyle = L.theme.bg;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const z = this.zoom;
    const sw = Math.min(L.W, this.viewW());
    const sh = Math.min(L.H, this.viewH());
    c.drawImage(this.world, this.cam.x, this.cam.y, sw, sh, this.offX(), this.offY(), sw * z, sh * z);
  }

  drawWindows(g, s, t) {
    if (!this.windows) return;
    const L = this.L;
    const m = dateOf(s.day).m;
    const theme = L.o.theme;
    const sky = theme === 'orbital' ? '#05060c' : m === 11 || m <= 1 ? '#b8cde0' : m >= 5 && m <= 7 ? '#41a6f6' : m >= 8 && m <= 10 ? '#f2a36b' : '#73cff7';
    for (const w of this.windows) {
      S.R(g, w.x - 2, w.y - 2, w.w + 4, w.h + 4, L.theme.trim);
      S.R(g, w.x, w.y, w.w, w.h, sky);
      if (theme === 'orbital') {
        for (let i = 0; i < 9; i++) {
          const sx = w.x + ((i * 13 + Math.floor(t * 2)) % w.w);
          S.R(g, sx, w.y + ((i * 7) % w.h), 1, 1, i % 3 ? PAL.white : PAL.cyan);
        }
        const ex = w.x + ((w.x + t * 1.5) % (w.w + 20)) - 10;
        S.R(g, ex, w.y + 14, 10, 8, PAL.blue);
        S.R(g, ex + 2, w.y + 15, 4, 3, PAL.green);
      } else {
        const cx = w.x + ((w.x * 3 + t * 3) % (w.w + 16)) - 12;
        g.save();
        g.beginPath();
        g.rect(w.x, w.y, w.w, w.h);
        g.clip();
        S.R(g, cx, w.y + 5, 12, 3, PAL.white);
        S.R(g, cx + 3, w.y + 3, 6, 2, PAL.white);
        if (theme === 'tower') {
          for (let i = 0; i < 6; i++) S.R(g, w.x + i * 7, w.y + w.h - 6 - ((i * 5) % 9), 6, 20, i % 2 ? '#29366f' : '#333c57');
          for (let i = 0; i < 6; i++) S.R(g, w.x + i * 7 + 2, w.y + w.h - 4 - ((i * 3) % 5), 1, 1, PAL.yellow);
        } else if (theme === 'campus') {
          S.R(g, w.x, w.y + w.h - 5, w.w, 5, PAL.green);
          S.R(g, w.x + 6, w.y + w.h - 11, 5, 7, '#2a8c50');
          S.R(g, w.x + 26, w.y + w.h - 9, 5, 5, '#2a8c50');
        } else {
          S.R(g, w.x, w.y + w.h - 4, w.w, 4, '#8fa5b8');
        }
        if (m === 11 || m <= 1) {
          for (let i = 0; i < 6; i++) S.R(g, w.x + ((i * 11 + t * 4) % w.w), w.y + ((i * 9 + t * 8) % w.h), 1, 1, PAL.white);
        }
        g.restore();
      }
      S.R(g, w.x + w.w / 2, w.y, 1, w.h, L.theme.trim);
    }
  }

  drawWallDecor(g, s, t) {
    const L = this.L;
    if (s.office.perks.whiteboard) S.drawWhiteboard(g, L.x0 + L.cols * CW - 34, 20);
    if (s.office.perks.ac) S.drawAC(g, L.W - 30, 2, t);
    S.drawClock(g, L.loungeX + 12, 20, t);
    const remote = s.employees.filter((e) => e.traits.includes('remote')).length;
    if (remote) {
      const x = 32;
      S.R(g, x, 19, 30, 19, PAL.ink);
      S.R(g, x + 1, 20, 28, 14, PAL.navy);
      const shown = Math.min(remote, 6);
      for (let i = 0; i < shown; i++) {
        const fx = x + 2 + (i % 3) * 9;
        const fy = 21 + Math.floor(i / 3) * 7;
        S.R(g, fx, fy, 8, 6, PAL.dark);
        S.R(g, fx + 3, fy + 1, 3, 3, ['#f6d2b5', '#c98a60', '#9a5f3c'][i % 3]);
        S.R(g, fx + 2, fy + 4, 5, 2, [PAL.sky, PAL.orange, PAL.lime][i % 3]);
      }
      S.drawText(g, String(remote), x + 12, 34, PAL.white);
    }
  }

  drawFloorItem(g, id, p, t) {
    switch (id) {
      case 'sofa': return S.drawSofa(g, p.x, p.y);
      case 'foosball': return S.drawFoosball(g, p.x, p.y, t);
      case 'ballpit': return S.drawBallpit(g, p.x, p.y);
      case 'gym': return S.drawGym(g, p.x, p.y, t);
      case 'nappods': return S.drawNapPod(g, p.x, p.y);
      case 'chef': return S.drawChef(g, p.x, p.y, t);
      case 'podcast': return S.drawPodcast(g, p.x, p.y, t);
    }
  }

  queueRacks(s, drawables, t) {
    const n = s.infra.racks;
    if (!n) return;
    const L = this.L;
    const max = Math.max(2, Math.floor((L.W - L.loungeX - 30) / 14));
    const shown = Math.min(n, max);
    const y = L.H - 30;
    const x0 = L.W - 8 - shown * 14;
    drawables.push({
      y: L.H,
      draw: () => {
        S.R(this.wctx, x0 - 3, y - 3, shown * 14 + 4, 29, 'rgba(26,28,44,.35)');
        for (let i = 0; i < shown; i++) S.drawRack(this.wctx, x0 + i * 14, y, t, i);
        if (n > shown) S.drawText(this.wctx, '+' + (n - shown), x0 - 3, y - 9, PAL.lime);
      },
    });
  }

  drawDesk(g, s, d, e, t) {
    const T = this.L.theme;
    const cx = d.x;
    const cy = d.y;
    const st = e && this.people.get(e.id);
    const seated = e && e.off <= 0 && (!st || st.mode === 'desk');
    S.drawChair(g, cx + 8, cy + 5, T.chair);
    const roleColor = e ? ROLES[e.role].color : PAL.slate;
    if (seated) {
      const working = !(['founder', 'dev', 'design', 'ai', 'marketer', 'pm'].includes(e.role) && !e.assign);
      const phase = st?.phase || 0;
      const bob = working && Math.sin(t * 6 + phase) > 0.7 ? 1 : 0;
      S.drawSeated(g, cx + 9, cy + 1 + bob, e.looks, roleColor, t + phase, e.mood);
      this.hits.push({ id: e.id, x: cx + 7, y: cy - 2, w: 14, h: 20 });
    }
    S.drawDesk(g, cx + 2, cy + 14, T.desk[0], T.desk[1]);
    S.drawMonitor(g, cx + 3, cy + 6, S.shade(roleColor, 0.25), !!seated);
    if (seated) {
      S.R(g, cx + 10, cy + 14, 8, 2, PAL.silver);
      const working = !(['founder', 'dev', 'design', 'ai', 'marketer', 'pm'].includes(e.role) && !e.assign);
      const phase = st?.phase || 0;
      const k = working ? Math.floor((t + phase) * 8) % 2 : 0;
      S.R(g, cx + 9, cy + 13 - k, 2, 2, e.looks.skin);
      S.R(g, cx + 17, cy + 12 + k, 2, 2, e.looks.skin);
      S.R(g, cx + 20, cy + 12, 3, 3, PAL.white);
      S.R(g, cx + 23, cy + 13, 1, 1, PAL.white);
      const icon = this.statusIcon(e, t + phase);
      if (icon) S.drawBubble(g, cx + 15, cy - 9, icon);
    } else if (e && e.off > 0) {
      S.drawBubble(g, cx + 11, cy + 2, 'palm');
    }
    if (e && this.selected === e.id) this.outline(g, cx + 8, cy, 12, 18);
  }

  statusIcon(e, t) {
    if (e.energy < 25) return 'zz';
    if (e.mood < 30) return 'bang';
    if (['founder', 'dev', 'design', 'ai', 'marketer', 'pm'].includes(e.role) && !e.assign) return (t % 3) < 2 ? 'q' : null;
    if (e.role === 'research' && t % 7 < 1.2) return 'bulb';
    if (e.mood > 85 && t % 9 < 1) return 'heart';
    return null;
  }

  drawWalker(g, e, st, t) {
    const moving = st.mode !== 'break';
    const frame = moving ? Math.floor(t * 8) % 2 : 0;
    const x = Math.round(st.x);
    const y = Math.round(st.y);
    S.R(g, x + 1, y + 18, 8, 1, 'rgba(26,28,44,.3)');
    S.drawStanding(g, x, y, e.looks, ROLES[e.role].color, frame, t, e.mood);
    if (st.mode === 'break' && t % 4 < 1.5) S.drawBubble(g, x + 6, y - 10, e.energy < 40 ? 'zz' : 'heart');
    this.hits.push({ id: e.id, x: x - 1, y: y - 2, w: 12, h: 21 });
    if (this.selected === e.id) this.outline(g, x - 1, y - 2, 12, 21);
  }

  outline(g, x, y, w, h) {
    const c = (this.t * 4) % 2 < 1 ? PAL.yellow : PAL.white;
    S.R(g, x - 1, y - 1, w + 2, 1, c);
    S.R(g, x - 1, y + h, w + 2, 1, c);
    S.R(g, x - 1, y, 1, h, c);
    S.R(g, x + w, y, 1, h, c);
  }

  drawLabel(g, s) {
    const id = this.hover ?? this.selected;
    if (id == null) return;
    const e = s.employees.find((x) => x.id === id);
    if (!e) return;
    const pos = this.personPos(e);
    if (!pos) return;
    const name = e.name.split(' ')[0];
    const w = S.textWidth(name) + 4;
    const x = Math.max(1, Math.min(this.L.W - w - 1, Math.round(pos.x + 5 - w / 2)));
    const y = Math.max(1, Math.round(pos.y) - 17);
    S.R(g, x, y, w, 8, PAL.ink);
    S.drawText(g, name, x + 2, y + 2, PAL.white);
  }

  drawEffects(g, dt) {
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= dt * 9;
      g.globalAlpha = Math.max(0, Math.min(1, f.life));
      S.drawText(g, f.txt, f.x, f.y, f.color);
    }
    g.globalAlpha = 1;
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const c of this.confetti) {
      c.life -= dt;
      c.vy += 60 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      S.R(g, c.x, c.y, 2, 2, c.c);
    }
    this.confetti = this.confetti.filter((c) => c.life > 0 && c.y < this.L.H);
  }
}

