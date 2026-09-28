// Vista de la oficina en canvas: fondo cacheado, empleados animados, cámara
// con zoom y arrastre, y modo edición para recolocar mesas y muebles.
import { OFFICES, ROLES, PAL, PERKS } from './data.js';
import * as S from './sprites.js';
import { THEMES, paintBackground, paintWindows, paintVignette } from './scenery.js';
import {
  WALL, FLAT, NEAR_RADIUS, isWall, deskRect, itemRect, serverRoom, loungeX, canPlace, snapPos, getRef, deskEffects,
} from './layout.js';

// Muebles a los que el equipo va a descansar.
const BREAK = new Set(['coffee', 'snacks', 'arcade', 'sofa', 'foosball', 'ballpit', 'gym', 'nappods', 'chef', 'robot', 'library', 'cooler', 'aquarium', 'meeting']);
const MAKERS_VIEW = ['founder', 'dev', 'design', 'ai', 'marketer', 'pm'];
const GLYPH = {
  code: ['</>', PAL.sky], design: ['~', PAL.orange], ai: ['01', PAL.silver], flex: ['*', PAL.yellow],
  hype: ['!', '#ff6b8b'], rp: ['?', PAL.lime], ops: ['%', PAL.green], sales: ['$', PAL.cyan], people: ['♥', '#ff6b8b'], lead: ['>', PAL.cyan],
};

function drawItem(g, id, x, y, t) {
  switch (id) {
    case 'plant': return S.drawPlant(g, x, y, t);
    case 'rug': return S.drawRug(g, x, y);
    case 'lamp': return S.drawLamp(g, x, y, t);
    case 'coffee': return S.drawCoffee(g, x, y, t);
    case 'cooler': return S.drawCooler(g, x, y, t);
    case 'snacks': return S.drawVending(g, x, y, t);
    case 'sofa': return S.drawSofa(g, x, y);
    case 'foosball': return S.drawFoosball(g, x, y, t);
    case 'aquarium': return S.drawAquarium(g, x, y, t);
    case 'meeting': return S.drawMeeting(g, x, y);
    case 'arcade': return S.drawArcade(g, x, y, t);
    case 'library': return S.drawBookshelf(g, x, y);
    case 'ballpit': return S.drawBallpit(g, x, y);
    case 'podcast': return S.drawPodcast(g, x, y, t);
    case 'gym': return S.drawGym(g, x, y, t);
    case 'statue': return S.drawStatue(g, x, y, t);
    case 'nappods': return S.drawNapPod(g, x, y, t);
    case 'chef': return S.drawChef(g, x, y, t);
    case 'robot': return S.drawRobot(g, x, y, t);
    case 'whiteboard': return S.drawWhiteboard(g, x, y);
    case 'ac': return S.drawAC(g, x, y, t);
    case 'car': return S.drawCar(g, x, y);
    case 'boxes': return S.drawBoxes(g, x, y);
    case 'bike': return S.drawBike(g, x, y);
  }
}

export class OfficeView {
  constructor(canvas, { onPick, onHover, onEditPick, onEditDrop } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = document.createElement('canvas');
    this.wctx = this.world.getContext('2d');
    this.bg = document.createElement('canvas');
    this.shadeLayer = document.createElement('canvas');
    this.bgKey = '';
    this.onPick = onPick;
    this.onHover = onHover;
    this.onEditPick = onEditPick;
    this.onEditDrop = onEditDrop;
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
    this.editHits = [];
    this.edit = false;
    this.editSel = null;
    this.drag = null;
    this.tier = -1;
    this.s = null;
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
    this.canvas.style.touchAction = this.edit || mx > 0 || my > 0 ? 'none' : 'pan-y';
  }

  toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const px = (clientX - r.left) * this.dpr;
    const py = (clientY - r.top) * this.dpr;
    return { x: this.cam.x + (px - this.offX()) / this.zoom, y: this.cam.y + (py - this.offY()) / this.zoom, px, py };
  }

  // ---------------------------------------------------------------- edición

  setEdit(on) {
    this.edit = on;
    this.drag = null;
    this.editSel = null;
    this.hover = null;
    this.onHover?.(null);
    this.clampCam();
  }

  // El plano tal y como se ve ahora: con el objeto arrastrado en su sitio provisional.
  viewLayout() {
    const L = this.s.office.layout;
    const d = this.drag;
    if (!d || !d.moved) return L;
    return {
      ...L,
      desks: L.desks.map((k, i) => ('d:' + i === d.ref ? { x: d.x, y: d.y } : k)),
      items: L.items.map((it) => ('i:' + it.uid === d.ref ? { ...it, x: d.x, y: d.y } : it)),
    };
  }

  // ---------------------------------------------------------------- entrada

  bindInput() {
    const c = this.canvas;
    let pan = null;
    let pinch = null;
    c.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
        pan = null;
        this.drag = null;
        return;
      }
      if (this.edit && this.s) {
        const w = this.toWorld(e.clientX, e.clientY);
        const ref = this.editHitTest(w.x, w.y);
        const r = ref && getRef(this.s.office.layout, ref);
        if (r) {
          this.drag = { ref, id: r.id, ox: w.x - r.obj.x, oy: w.y - r.obj.y, x: r.obj.x, y: r.obj.y, sx: e.clientX, sy: e.clientY, moved: false, valid: true };
          c.setPointerCapture?.(e.pointerId);
          return;
        }
      }
      pan = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false };
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
      const d = this.drag;
      if (d) {
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
        if (d.moved) {
          const w = this.toWorld(e.clientX, e.clientY);
          const p = snapPos(d.id, w.x - d.ox, w.y - d.oy);
          d.x = p.x;
          d.y = p.y;
          d.valid = canPlace(this.s.office.layout, this.s.office.tier, d.id, p.x, p.y, d.ref);
        }
        return;
      }
      if (pan && e.buttons) {
        const dx = e.clientX - pan.x;
        const dy = e.clientY - pan.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) pan.moved = true;
        if (pan.moved) {
          this.cam.x = pan.cx - (dx * this.dpr) / this.zoom;
          this.cam.y = pan.cy - (dy * this.dpr) / this.zoom;
          this.clampCam();
        }
        return;
      }
      if (this.edit) {
        const w = this.toWorld(e.clientX, e.clientY);
        c.style.cursor = this.editHitTest(w.x, w.y) ? 'move' : 'grab';
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
      const d = this.drag;
      if (d) {
        this.drag = null;
        if (e.type !== 'pointerup') return;
        if (d.moved) this.onEditDrop?.(d.ref, d.x, d.y, d.valid);
        else this.onEditPick?.(d.ref);
        return;
      }
      if (pan && !pan.moved && e.type === 'pointerup') {
        if (this.edit) this.onEditPick?.(null);
        else {
          const w = this.toWorld(e.clientX, e.clientY);
          this.onPick?.(this.hitTest(w.x, w.y));
        }
      }
      pan = null;
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
        // Un paso de zoom por cada muesca de rueda (~100 px); los trackpads
        // mandan muchos eventos pequeños y se van acumulando.
        const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1) * (e.ctrlKey ? 3 : 1);
        if (Math.sign(dy) !== Math.sign(this.wheel || 0)) this.wheel = 0;
        this.wheel = (this.wheel || 0) + dy;
        if (Math.abs(this.wheel) < 90) return;
        this.wheel = 0;
        const w = this.toWorld(e.clientX, e.clientY);
        this.zoomBy(dy < 0 ? 1 : -1, w.px, w.py);
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

  editHitTest(x, y) {
    for (let i = this.editHits.length - 1; i >= 0; i--) {
      const h = this.editHits[i];
      if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h.ref;
    }
    return null;
  }

  // ---------------------------------------------------------------- efectos

  onDay(s) {
    if (!this.L || this.edit) return;
    const working = s.employees.filter((e) => e.off <= 0 && !e.traits.includes('remote') && !e.region);
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

  ensureView(s) {
    if (s.office.tier !== this.tier) {
      this.tier = s.office.tier;
      const o = OFFICES[this.tier];
      this.L = { o, W: o.w, H: o.h, theme: THEMES[o.theme], loungeX: loungeX(this.tier), room: serverRoom(this.tier) };
      this.world.width = this.L.W;
      this.world.height = this.L.H;
      this.bg.width = this.L.W;
      this.bg.height = this.L.H;
      this.shadeLayer.width = this.L.W;
      this.shadeLayer.height = this.L.H;
      paintVignette(this.shadeLayer.getContext('2d'), this.L);
      this.bgKey = '';
      this.people.clear();
      this.canvas.parentElement?.style.setProperty('--office-ar', `${this.L.W} / ${this.L.H}`);
      this.userZoom = false;
      this.resize();
    }
    const key = this.tier + ':' + s.company;
    if (key !== this.bgKey) {
      this.bgKey = key;
      this.drawBackground(s);
    }
  }

  drawBackground(s) {
    const { windows, clock } = paintBackground(this.bg.getContext('2d'), this.L, s);
    this.windows = windows;
    this.clockPos = clock;
  }

  // ---------------------------------------------------------------- personas

  personPos(e) {
    const st = this.people.get(e.id);
    if (st && st.mode !== 'desk') return { x: st.x, y: st.y };
    const d = this.s?.office.layout.desks[e.desk];
    if (!d) return null;
    return { x: d.x + 10, y: d.y + 1 };
  }

  usePoints(layout) {
    const pts = [];
    for (const it of layout.items) {
      if (!BREAK.has(it.id)) continue;
      const r = itemRect(it);
      pts.push({ x: r.x + r.w / 2 - 5, y: Math.max(WALL + 2, r.y + r.h - 14) });
    }
    return pts;
  }

  updatePeople(s, layout, dt, speed) {
    const alive = new Set();
    const mult = [0, 1, 1.5, 2.2][speed] || 1;
    const points = this.usePoints(layout);
    for (const e of s.employees) {
      if (e.traits.includes('remote') || e.region) continue;
      alive.add(e.id);
      const d = layout.desks[e.desk];
      if (!d) continue;
      let st = this.people.get(e.id);
      const home = { x: d.x + 10, y: d.y - 2 };
      if (!st) {
        st = { mode: 'desk', x: home.x, y: home.y, tx: 0, ty: 0, timer: 0, phase: Math.random() * 10 };
        this.people.set(e.id, st);
      }
      if (e.off > 0 || this.edit) {
        st.mode = 'desk';
        continue;
      }
      if (st.mode === 'desk') {
        if (speed > 0 && points.length && e.energy < 88 && Math.random() < dt * 0.025 * mult) {
          const p = points[Math.floor(Math.random() * points.length)];
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
        if (st.mode === 'return') {
          st.tx = home.x;
          st.ty = home.y + 8;
        }
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
    this.s = s;
    this.t += dt;
    this.ensureView(s);
    const layout = this.viewLayout();
    this.updatePeople(s, layout, dt, speed);
    const L = this.L;
    const g = this.wctx;
    const t = this.t;
    const dragRef = this.drag?.moved ? this.drag.ref : null;
    g.drawImage(this.bg, 0, 0);
    paintWindows(g, L, s, t, this.windows);
    this.drawWallDecor(g, s, t);
    this.drawRacks(g, s, t);
    if (this.edit) this.drawGrid(g);
    this.hits = [];
    this.editHits = [];

    for (const it of layout.items) {
      if (!isWall(it.id)) continue;
      drawItem(g, it.id, it.x, it.y, t);
      this.editHits.push({ ref: 'i:' + it.uid, ...itemRect(it) });
    }
    for (const it of layout.items) {
      if (!FLAT.has(it.id)) continue;
      drawItem(g, it.id, it.x, it.y, t);
      this.editHits.push({ ref: 'i:' + it.uid, ...itemRect(it) });
    }

    const drawables = [];
    for (const it of layout.items) {
      if (isWall(it.id) || FLAT.has(it.id)) continue;
      const r = itemRect(it);
      const draw = () => {
        S.floorShadow(g, r.x, r.y + r.h - 1, r.w);
        drawItem(g, it.id, it.x, it.y, t);
      };
      drawables.push({ y: r.y + r.h, ref: 'i:' + it.uid, rect: r, draw });
    }
    const byDesk = new Map();
    for (const e of s.employees) if (!e.traits.includes('remote') && !e.region) byDesk.set(e.desk, e);
    layout.desks.forEach((d, i) => {
      drawables.push({ y: d.y + 24, ref: 'd:' + i, rect: deskRect(d), draw: () => this.drawDesk(g, d, byDesk.get(i), t, i) });
    });
    for (const e of s.employees) {
      const st = this.people.get(e.id);
      if (!st || st.mode === 'desk' || e.off > 0) continue;
      drawables.push({ y: st.y + 18, draw: () => this.drawWalker(g, e, st, t) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) {
      d.draw();
      if (d.ref) this.editHits.push({ ref: d.ref, ...d.rect });
    }

    this.drawLights(g, layout, t);
    if (this.edit) this.drawEditOverlay(g, layout, dragRef);
    this.drawEffects(g, dt);
    if (!this.edit) this.drawLabel(g, s);

    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.fillStyle = L.theme.bg;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const z = this.zoom;
    const sw = Math.min(L.W, this.viewW());
    const sh = Math.min(L.H, this.viewH());
    const ox = this.offX();
    const oy = this.offY();
    // Si sobra hueco alrededor de la oficina: trama de puntos y sombra.
    if (ox > 0 || oy > 0) {
      c.fillStyle = this.dots();
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
      const d = Math.max(3, Math.round(z * 3));
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.fillRect(ox + d, oy + d, sw * z, sh * z);
    }
    c.drawImage(this.world, this.cam.x, this.cam.y, sw, sh, ox, oy, sw * z, sh * z);
  }

  dots() {
    if (!this.pattern) {
      const p = document.createElement('canvas');
      p.width = p.height = 14;
      const pg = p.getContext('2d');
      pg.fillStyle = 'rgba(255,255,255,.06)';
      pg.fillRect(0, 0, 2, 2);
      this.pattern = this.ctx.createPattern(p, 'repeat');
    }
    return this.pattern;
  }

  drawGrid(g) {
    const L = this.L;
    g.fillStyle = 'rgba(244,244,244,.18)';
    for (let y = WALL + 4; y < L.H; y += 8) for (let x = 4; x < L.W; x += 8) g.fillRect(x, y, 1, 1);
    const r = L.room;
    g.fillStyle = 'rgba(177,62,83,.35)';
    for (let y = r.y; y < r.y + r.h; y += 2) for (let x = r.x; x < r.x + r.w; x += 2) if ((x + y) % 8 === 0) g.fillRect(x, y, 2, 2);
  }

  // Ánimo y ruido de cada mesa, selección, radio de efecto y vista previa.
  drawEditOverlay(g, layout, dragRef) {
    layout.desks.forEach((d, i) => {
      const fx = deskEffects(layout, i);
      let x = d.x + 3;
      if (fx.comfort) {
        const txt = '+' + fx.comfort;
        S.R(g, x - 1, d.y - 8, S.textWidth(txt) + 2, 7, PAL.ink);
        S.drawText(g, txt, x, d.y - 7, PAL.lime);
        x += S.textWidth(txt) + 4;
      }
      if (fx.noise) {
        const txt = '-' + Math.round(fx.noise * 100) + '%';
        S.R(g, x - 1, d.y - 8, S.textWidth(txt) + 2, 7, PAL.ink);
        S.drawText(g, txt, x, d.y - 7, '#ff6b8b');
      }
    });
    const ref = dragRef || this.editSel;
    const r = ref && getRef(layout, ref);
    if (!r) return;
    const rect = r.kind === 'desk' ? deskRect(r.obj) : itemRect(r.obj);
    const p = PERKS[r.id];
    if (p && (p.near || p.noise)) {
      g.save();
      g.strokeStyle = p.noise ? '#ff6b8b' : PAL.lime;
      g.lineWidth = 1;
      g.setLineDash([2, 3]);
      g.beginPath();
      g.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, NEAR_RADIUS, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    if (dragRef) {
      g.fillStyle = this.drag.valid ? 'rgba(167,240,112,.3)' : 'rgba(177,62,83,.45)';
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    this.outline(g, rect.x, rect.y, rect.w, rect.h);
  }

  // Reloj y pantalla de videollamada con el equipo en remoto.
  drawWallDecor(g, s, t) {
    if (this.clockPos) S.drawClock(g, this.clockPos.x, this.clockPos.y, t);
    const remote = s.employees.filter((e) => e.traits.includes('remote') || e.region);
    if (!remote.length) return;
    const x = 32;
    S.R(g, x - 1, 18, 32, 21, PAL.ink);
    S.R(g, x, 18, 30, 1, PAL.slate);
    S.R(g, x + 1, 20, 28, 14, '#10131f');
    const shown = remote.slice(0, 6);
    shown.forEach((e, i) => {
      const fx = x + 2 + (i % 3) * 9;
      const fy = 21 + Math.floor(i / 3) * 6;
      S.R(g, fx, fy, 8, 5, i % 2 ? '#2b3a55' : '#33456a');
      S.R(g, fx + 2, fy + 1, 4, 3, e.looks.skin);
      S.R(g, fx + 2, fy, 4, 1, e.looks.hair);
      S.R(g, fx + 1, fy + 4, 6, 1, ROLES[e.role].color);
      if ((t + i) % 5 < 0.2) S.R(g, fx, fy, 8, 5, 'rgba(115,239,247,.35)');
    });
    S.R(g, x + 1, 34, 28, 4, PAL.dark);
    S.drawText(g, String(remote.length), x + 3, 34, PAL.lime);
    S.px(g, x + 26, 35, (t % 1) < 0.5 ? PAL.red : '#6b2233');
  }

  // Halos de luz de las lámparas y viñeta final.
  drawLights(g, layout, t) {
    g.globalCompositeOperation = 'lighter';
    for (const it of layout.items) {
      if (it.id !== 'lamp' || (t + it.x) % 9 <= 0.15) continue;
      g.drawImage(S.glowSprite('rgba(255,196,110,.38)', 26), it.x + 4 - 26, it.y + 5 - 26);
    }
    const r = this.L.room;
    if (this.s.infra.racks) g.drawImage(S.glowSprite('rgba(65,166,246,.12)', 30), r.x + r.w - 50, r.y - 10);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(this.shadeLayer, 0, 0);
  }

  // Racks alineados a la derecha; a la izquierda quedan el rótulo y el contador.
  drawRacks(g, s, t) {
    const n = s.infra.racks;
    if (!n) return;
    const r = this.L.room;
    const label = S.textWidth('SERVIDORES') + 12;
    const max = Math.max(1, Math.floor((r.w - label - 4) / 14));
    const shown = Math.min(n, max);
    const x0 = r.x + r.w - 4 - shown * 14;
    for (let i = 0; i < shown; i++) S.drawRack(g, x0 + i * 14, r.y + 8, t, i);
    if (n > shown) S.drawText(g, '+' + (n - shown), r.x + 6, r.y + 16, PAL.lime);
  }

  drawDesk(g, d, e, t, i) {
    const T = this.L.theme;
    const cx = d.x;
    const cy = d.y;
    const st = e && this.people.get(e.id);
    const seated = e && e.off <= 0 && (!st || st.mode === 'desk');
    const phase = st?.phase || 0;
    const working = !!e && !(MAKERS_VIEW.includes(e.role) && !e.assign);
    const busy = seated && working && !this.edit;
    S.floorShadow(g, cx + 2, cy + 27, 24);
    // Con la mesa vacía la silla queda metida bajo el tablero.
    S.drawChair(g, cx + 8, seated ? cy + 4 : cy + 8, T.chair);
    const roleColor = e ? ROLES[e.role].color : PAL.slate;
    if (seated) {
      const bob = busy && Math.sin(t * 6 + phase) > 0.7 ? 1 : 0;
      S.drawSeated(g, cx + 9, cy - 1 + bob, e.looks, roleColor, t + phase, e.mood, e.role);
      this.hits.push({ id: e.id, x: cx + 8, y: cy - 2, w: 14, h: 20 });
    }
    S.drawDesk(g, cx + 2, cy + 14, T.desk[0], T.desk[1]);
    S.drawMonitor(g, cx + 1, cy + 6, S.shade(roleColor, 0.25), !!seated, t + phase, i, busy);
    S.drawDeskProp(g, cx + 22, cy + 11, i % 7, t + phase, busy);
    if (seated) {
      S.R(g, cx + 11, cy + 14, 8, 2, '#c9d3dc');
      S.R(g, cx + 11, cy + 15, 8, 1, PAL.slate);
      const k = busy ? Math.floor((t + phase) * 8) % 2 : 0;
      S.R(g, cx + 11, cy + 13 - k, 2, 2, e.looks.skin);
      S.R(g, cx + 17, cy + 13 - (1 - k), 2, 2, S.shade(e.looks.skin, -0.12));
      const icon = !this.edit && this.statusIcon(e, t + phase);
      if (icon) S.drawBubble(g, cx + 17, cy - 10, icon);
    } else if (e && e.off > 0) {
      S.drawBubble(g, cx + 12, cy + 2, 'palm');
    }
    if (e && this.selected === e.id && !this.edit) this.outline(g, cx + 9, cy - 1, 12, 18);
  }

  statusIcon(e, t) {
    if (e.energy < 25) return 'zz';
    if (e.mood < 30) return 'bang';
    if (MAKERS_VIEW.includes(e.role) && !e.assign) return t % 3 < 2 ? 'q' : null;
    if (e.role === 'research' && t % 7 < 1.2) return 'bulb';
    if (e.mood > 85 && t % 9 < 1) return 'heart';
    return null;
  }

  drawWalker(g, e, st, t) {
    const moving = st.mode !== 'break';
    const frame = moving ? Math.floor(t * 8) % 2 : 'idle';
    const x = Math.round(st.x);
    const y = Math.round(st.y);
    g.fillStyle = 'rgba(14,10,30,.28)';
    g.fillRect(x, y + 19, 10, 1);
    g.fillRect(x + 1, y + 20, 8, 1);
    S.drawStanding(g, x - 1, y - 2, e.looks, ROLES[e.role].color, frame, t + (st.phase || 0), e.mood, e.role);
    if (st.mode === 'break' && (t + (st.phase || 0)) % 4 < 1.5) S.drawBubble(g, x + 7, y - 11, e.energy < 40 ? 'zz' : 'heart');
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
    S.R(g, x + 1, y, w - 2, 8, PAL.ink);
    S.R(g, x, y + 1, w, 6, PAL.ink);
    const tx = Math.max(x + 2, Math.min(x + w - 3, Math.round(pos.x + 5)));
    S.R(g, tx - 1, y + 8, 3, 1, PAL.ink);
    S.px(g, tx, y + 9, PAL.ink);
    S.drawText(g, name, x + 2, y + 2, PAL.white);
  }

  drawEffects(g, dt) {
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= dt * 9;
      g.globalAlpha = Math.max(0, Math.min(1, f.life));
      S.drawTextShadow(g, f.txt, f.x, f.y, f.color, PAL.ink);
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

