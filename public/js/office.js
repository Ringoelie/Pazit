// Vista de la oficina en canvas: fondo cacheado, empleados animados, cámara
// con zoom y arrastre, y modo edición para recolocar mesas y muebles.
import { OFFICES, ROLES, PAL, PERKS } from './data.js';
import { dateOf } from './util.js';
import { officeFx, isBirthday } from './core.js';
import * as S from './sprites.js';
import { themeFor, paintBackground, paintWindows, paintVignette } from './scenery.js';
import { PET_IDS, updatePets, petDrawables, drawPetHome, petLove, petLights } from './pets.js';
import {
  WALL, FLAT, NEAR_RADIUS, isWall, deskRect, itemRect, serverRoom, loungeX, canPlace, snapPos, getRef, deskEffects, findSpot,
} from './layout.js';

// Reloj de la oficina: un día visual dura 90 s a velocidad normal (unas tres
// semanas de juego). Más corto no daría tiempo a que la gente de las mesas del
// fondo de las oficinas grandes salga antes de que amanezca. Cada tramo acaba
// en [fracción del ciclo, hora]; 0 son las 6:00 de la mañana.
const CYCLE = 90;
const DAY_PARTS = [[0, 6], [0.04, 8], [0.08, 9], [0.74, 18], [0.78, 19], [0.86, 22], [1, 30]];
function hourOf(tod) {
  for (let i = 1; i < DAY_PARTS.length; i++) {
    const [f1, h1] = DAY_PARTS[i];
    const [f0, h0] = DAY_PARTS[i - 1];
    if (tod <= f1) return h0 + ((tod - f0) / (f1 - f0)) * (h1 - h0);
  }
  return 6;
}
// Oscuridad del exterior según la hora (0 = pleno día).
function darknessAt(hour) {
  const h = hour % 24;
  if (h >= 8 && h < 18) return 0;
  if (h >= 6 && h < 8) return 0.5 * (1 - (h - 6) / 2);
  if (h >= 18 && h < 19) return 0.08 * (h - 18);
  if (h >= 19 && h < 22) return 0.08 + 0.37 * ((h - 19) / 3);
  return h >= 22 && h < 23 ? 0.45 + 0.1 * (h - 22) : 0.55;
}
const frac = (v) => v - Math.floor(v);

// Muebles a los que el equipo va a descansar.
const BREAK = new Set(['coffee', 'snacks', 'arcade', 'sofa', 'foosball', 'ballpit', 'gym', 'nappods', 'chef', 'robot', 'library', 'cooler', 'aquarium', 'meeting']);
const MAKERS_VIEW = ['founder', 'dev', 'design', 'ai', 'marketer', 'pm'];
const strHash = (str) => [...String(str)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const PARTY_TEXT = {
  launch: 'LANZAMIENTO!', funding: 'RONDA CERRADA!', ipo: 'SALIMOS A BOLSA!', move: 'OFICINA NUEVA!', acquire: 'COMPRADA!', achievement: 'LOGRO!',
};
const GLYPH = {
  code: ['</>', PAL.sky], design: ['~', PAL.orange], ai: ['01', PAL.silver], flex: ['*', PAL.yellow],
  hype: ['!', '#ff6b8b'], rp: ['?', PAL.lime], ops: ['%', PAL.green], sales: ['$', PAL.cyan], people: ['♥', '#ff6b8b'], lead: ['>', PAL.cyan],
  sec: ['#', PAL.lime], legal: ['&', PAL.silver],
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
    this.partyUntil = 0;
    this.banner = null;
    this.balloons = [];
    this.visitors = [];
    this.pets = new Map();
    this.petCoat = S.DOG_COATS[0];
    this.catCoat = S.CAT_COATS[0];
    this.crisis = false;
    this.tod = 0.2;
    this.hour = 10;
    this.dark = 0;
    this.style = null;
    this.monitors = [];
    this.relIdx = new Map();
    this.relDay = -1;
    this.treeSpot = null;
    this.bdays = new Set();
    this.treeDay = -1;
    this.celebKey = null;
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
    this.relDay = -1;
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
      // Con el dedo no hay "pasar por encima" (tras un pellizco quedaría un dedo moviéndose).
      if (e.pointerType === 'touch') return;
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

  // ---------------------------------------------------------------- fiestas y visitas

  // Celebración: confeti, globos, guirnalda, cartel y el equipo de pie.
  party(kind) {
    if (!this.L) return;
    this.partyUntil = this.t + 5;
    this.banner = { text: PARTY_TEXT[kind] || 'BIEN!', until: this.t + 4 };
    this.burst(kind === 'achievement' ? 50 : 90);
    const colors = [PAL.red, PAL.yellow, PAL.sky, PAL.lime, '#ff6b8b', PAL.orange];
    const n = kind === 'achievement' ? 3 : 8;
    for (let i = 0; i < n; i++) {
      this.balloons.push({ x: 8 + Math.random() * (this.L.W - 16), y: this.L.H - 12 - Math.random() * 30, c: colors[i % colors.length], v: 10 + Math.random() * 8 });
    }
  }

  // Un inversor (o una persona famosa) entra junto a la pared, se queda un rato
  // en la mesa de reuniones y se va.
  visit(kind = 'investor') {
    if (!this.L || !this.s) return;
    const meet = this.s.office.layout.items.find((it) => it.id === 'meeting');
    const tx = meet ? meet.x + 14 : this.L.loungeX + 20;
    const ty = meet ? meet.y + 12 : WALL + 30;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    this.visitors.push({
      x: -12,
      y: WALL + 6,
      path: [{ x: tx, y: WALL + 6 }, { x: tx, y: ty }],
      mode: 'in',
      timer: 0,
      kind,
      looks: kind === 'celebrity'
        ? { skin: pick(['#f6d2b5', '#c98a60', '#9a5f3c']), hair: pick(['#d9a441', '#b13e53', '#5d275d']), style: pick([1, 3, 5]), pants: PAL.plum, glasses: false, beard: false }
        : { skin: pick(['#f6d2b5', '#e8b48f', '#c98a60', '#9a5f3c']), hair: pick(['#94b0c2', PAL.ink, PAL.white, '#4a2f1f']), style: pick([0, 4]), pants: PAL.ink, glasses: Math.random() < 0.5, beard: false },
    });
  }

  updateVisitors(dt) {
    const step = 26 * dt;
    for (const v of this.visitors) {
      if (v.mode === 'stay') {
        v.timer -= dt;
        if (v.timer <= 0) {
          v.mode = 'out';
          v.path = [{ x: v.x, y: WALL + 6 }, { x: -14, y: WALL + 6 }];
        }
        continue;
      }
      const p = v.path[0];
      const dx = p.x - v.x;
      const dy = p.y - v.y;
      const d = Math.hypot(dx, dy);
      if (d <= step) {
        v.x = p.x;
        v.y = p.y;
        v.path.shift();
        if (!v.path.length) {
          if (v.mode === 'in') {
            v.mode = 'stay';
            v.timer = 6;
          } else v.gone = true;
        }
      } else {
        v.x += (dx / d) * step;
        v.y += (dy / d) * step;
      }
    }
    this.visitors = this.visitors.filter((v) => !v.gone);
  }

  drawVisitor(g, v, t) {
    const x = Math.round(v.x);
    const y = Math.round(v.y);
    g.fillStyle = 'rgba(14,10,30,.28)';
    g.fillRect(x, y + 19, 10, 1);
    g.fillRect(x + 1, y + 20, 8, 1);
    const frame = v.mode === 'stay' ? 'idle' : Math.floor(t * 8) % 2;
    if (v.kind === 'celebrity') {
      S.drawStanding(g, x - 1, y - 2, v.looks, PAL.yellow, frame, t, 90, 'marketer');
      S.R(g, x + 1, y + 4, 8, 1, PAL.ink);
      if (v.mode === 'stay' && t % 1.3 < 0.12) {
        g.fillStyle = 'rgba(255,255,255,.7)';
        g.fillRect(x - 8, y - 6, 26, 30);
      }
      if (v.mode === 'stay' && t % 2 < 1.2) S.drawBubble(g, x + 7, y - 11, 'star');
      return;
    }
    S.drawStanding(g, x - 1, y - 2, v.looks, PAL.white, frame, t, 90, 'legal');
    S.R(g, x + 9, y + 13, 4, 3, '#6b4024');
    S.R(g, x + 10, y + 12, 2, 1, PAL.ink);
    if (v.mode === 'stay' && t % 2 < 1.2) S.drawBubble(g, x + 7, y - 11, 'money');
  }

  // Una vez por día de juego: con quién tiene relación cada uno y dónde va el árbol.
  indexDay(s, layout) {
    this.relDay = s.day;
    this.relIdx = new Map();
    for (const r of s.rel || []) {
      if (!r.kind) continue;
      for (const [a, b] of [[r.a, r.b], [r.b, r.a]]) {
        const cur = this.relIdx.get(a);
        const rank = { couple: 3, rival: 2, friend: 1 };
        if (!cur || rank[r.kind] > rank[cur.kind]) this.relIdx.set(a, { kind: r.kind, other: b });
      }
    }
    this.bdays = new Set(s.employees.filter((e) => isBirthday(s, e)).map((e) => e.id));
    this.treeSpot = null;
    if (dateOf(s.day).m === 11 || officeFx(s, 'xmasParty')) this.treeSpot = findSpot(layout, s.office.tier, 'xmastree');
  }

  treeFor(s) {
    if (this.edit || !this.treeSpot) return null;
    return dateOf(s.day).m === 11 || officeFx(s, 'xmasParty') ? this.treeSpot : null;
  }

  // ---------------------------------------------------------------- mascotas

  // Tocar a una mascota. Devuelve su especie (o null).
  petLove(id) {
    return petLove(this, id);
  }

  // ---------------------------------------------------------------- fondo

  ensureView(s) {
    const style = s.office.style || null;
    if (s.office.tier !== this.tier) {
      this.tier = s.office.tier;
      const o = OFFICES[this.tier];
      this.style = style;
      this.L = { o, W: o.w, H: o.h, theme: themeFor(o.theme, style), loungeX: loungeX(this.tier), room: serverRoom(this.tier) };
      this.world.width = this.L.W;
      this.world.height = this.L.H;
      this.bg.width = this.L.W;
      this.bg.height = this.L.H;
      this.shadeLayer.width = this.L.W;
      this.shadeLayer.height = this.L.H;
      paintVignette(this.shadeLayer.getContext('2d'), this.L);
      this.bgKey = '';
      this.people.clear();
      this.pets.clear();
      this.visitors = [];
      this.floaters = [];
      this.balloons = [];
      this.banner = null;
      this.partyUntil = 0;
      this.editSel = null;
      this.relDay = -1;
      this.canvas.parentElement?.style.setProperty('--office-ar', `${this.L.W} / ${this.L.H}`);
      this.userZoom = false;
      this.resize();
    }
    if (style !== this.style) {
      this.style = style;
      this.L.theme = themeFor(this.L.o.theme, style);
    }
    const key = this.tier + ':' + s.company + ':' + style;
    if (key !== this.bgKey) {
      this.bgKey = key;
      this.petCoat = S.DOG_COATS[strHash(s.company) % S.DOG_COATS.length];
      this.catCoat = S.CAT_COATS[(strHash(s.company) >> 3) % S.CAT_COATS.length];
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

  // ¿Se queda trabajando por la noche? Crunch, hackathon o noctámbulos.
  staysLate(s, e) {
    return !!s.policies.crunch || !!officeFx(s, 'hackathon') || e.traits.includes('nightowl');
  }

  updatePeople(s, layout, dt, speed) {
    const alive = new Set();
    const mult = [0, 1, 1.5, 2.2][speed] || 1;
    const points = this.usePoints(layout);
    const h = this.hour % 24;
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
      if (e.off > 0) {
        st.mode = 'desk';
        continue;
      }
      // En el editor todo se queda quieto en su mesa (salvo quien ya se fue a casa).
      if (this.edit) {
        if (st.mode !== 'home') st.mode = 'desk';
        continue;
      }
      // Fuera de horario se va a casa (y vuelve por la mañana), cada cual a su hora.
      const away = !this.staysLate(s, e) && (h >= 18 + frac(st.phase) || h < 8 + frac(st.phase * 3));
      if (away && st.mode !== 'home' && st.mode !== 'leave') {
        if (st.mode === 'desk') {
          st.x = home.x;
          st.y = home.y + 8;
        }
        st.mode = 'leave';
        st.path = [{ x: st.x, y: WALL + 6 }, { x: -14, y: WALL + 6 }];
      } else if (!away && (st.mode === 'home' || st.mode === 'leave')) {
        if (st.mode === 'home') {
          st.x = -14;
          st.y = WALL + 6;
        }
        st.mode = 'arrive';
        st.path = [{ x: home.x, y: WALL + 6 }, { x: home.x, y: home.y + 8 }];
      }
      if (st.mode === 'home') continue;
      if (st.mode === 'leave' || st.mode === 'arrive') {
        const p = st.path[0];
        const dx = p.x - st.x;
        const dy = p.y - st.y;
        const dist = Math.hypot(dx, dy);
        // En las oficinas grandes se va (y se viene) con más prisa.
        const v = 40 * Math.max(1, this.L.W / 640) * mult * dt;
        if (dist <= v) {
          st.x = p.x;
          st.y = p.y;
          st.path.shift();
          if (!st.path.length) st.mode = st.mode === 'leave' ? 'home' : 'desk';
        } else {
          st.x += (dx / dist) * v;
          st.y += (dy / dist) * v;
        }
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
    // El reloj avanza con el juego y se para en pausa.
    this.tod = frac(this.tod + (dt * ([0, 1, 1.5, 2][speed] || 0)) / CYCLE);
    this.hour = hourOf(this.tod);
    this.blackout = !!officeFx(s, 'blackout');
    this.dark = this.edit ? 0 : Math.max(darknessAt(this.hour), this.blackout ? 0.6 : 0);
    this.updatePeople(s, layout, dt, speed);
    updatePets(this, s, layout, dt, speed);
    this.updateVisitors(dt);
    this.crisis = s.money < 0;
    if (s.day !== this.relDay) this.indexDay(s, layout);
    const celeb = officeFx(s, 'celebrity');
    if (celeb && this.celebKey !== celeb.until) {
      this.celebKey = celeb.until;
      this.visit('celebrity');
    }
    const L = this.L;
    const g = this.wctx;
    const t = this.t;
    const dragRef = this.drag?.moved ? this.drag.ref : null;
    g.drawImage(this.bg, 0, 0);
    paintWindows(g, L, s, t, this.windows, this.hour);
    this.drawWallDecor(g, s, t);
    this.drawRacks(g, s, t);
    if (this.partyUntil > t || officeFx(s, 'xmasParty') || officeFx(s, 'hackathon')) S.drawGarland(g, L.W, 3, t);
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
        if (PET_IDS.includes(it.id)) drawPetHome(this, g, it, t);
        else drawItem(g, it.id, it.x, it.y, t);
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
      if (!st || st.mode === 'desk' || st.mode === 'home' || e.off > 0) continue;
      drawables.push({ y: st.y + 18, draw: () => this.drawWalker(g, e, st, t) });
    }
    drawables.push(...petDrawables(this, g, t));
    for (const v of this.visitors) drawables.push({ y: v.y + 18, draw: () => this.drawVisitor(g, v, t) });
    const tree = this.treeFor(s, layout);
    if (tree) drawables.push({ y: tree.y + 26, draw: () => S.drawXmasTree(g, tree.x, tree.y, t) });
    this.monitors = [];
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
    if (this.clockPos) S.drawClock(g, this.clockPos.x, this.clockPos.y, this.hour);
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
  // De noche el interior se oscurece salvo que haya luces encendidas (queda
  // gente dentro o es por la tarde). Encima, halos de lámparas y pantallas.
  drawLights(g, layout, t) {
    const L = this.L;
    const h = this.hour % 24;
    const inside = this.s.employees.some((e) => e.off <= 0 && this.people.has(e.id) && this.people.get(e.id).mode !== 'home');
    const lightsOn = !this.blackout && (inside || (h >= 18 && h < 22));
    const dark = lightsOn ? Math.min(this.dark, 0.14) : this.dark;
    if (dark > 0.01) {
      g.fillStyle = `rgba(8,10,34,${dark.toFixed(3)})`;
      g.fillRect(0, WALL - 4, L.W, L.H - WALL + 4);
      g.fillStyle = `rgba(8,10,34,${(dark * 0.8).toFixed(3)})`;
      g.fillRect(0, 0, L.W, WALL - 4);
    }
    g.globalCompositeOperation = 'lighter';
    const boost = 0.6 + this.dark;
    for (const it of layout.items) {
      if (it.id !== 'lamp' || (t + it.x) % 9 <= 0.15) continue;
      g.drawImage(S.glowSprite(`rgba(255,196,110,${(0.3 * boost).toFixed(2)})`, 26), it.x + 4 - 26, it.y + 5 - 26);
    }
    if (this.dark > 0.15) {
      for (const m of this.monitors) {
        g.drawImage(S.glowSprite(m.candle ? 'rgba(255,170,80,.4)' : 'rgba(140,220,255,.3)', 10), m.x - 10, m.y - 10);
      }
      for (const it of layout.items) {
        if (it.id === 'snacks' || it.id === 'arcade' || it.id === 'aquarium') g.drawImage(S.glowSprite('rgba(115,239,247,.22)', 14), it.x - 7, it.y);
      }
    }
    petLights(this, g, this.dark);
    const r = L.room;
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
    const s = this.s;
    const cheer = seated && (this.partyUntil > t || !!officeFx(s, 'xmasParty')) && !this.edit;
    const isBday = seated && this.bdays.has(e.id);
    // Quien se queda de noche (o va sin energía) tiene ojeras.
    const night = this.hour % 24 >= 20 || this.hour % 24 < 7;
    const tired = !!seated && ((night && !this.edit) || e.energy < 25);
    if (seated) {
      const bob = cheer || isBday ? (Math.sin(t * 10 + phase * 3) > 0 ? 2 : 0) : busy && Math.sin(t * 6 + phase) > 0.7 ? 1 : 0;
      S.drawSeated(g, cx + 9, cy - 1 + bob, e.looks, roleColor, t + phase, e.mood, e.role, tired);
      if (officeFx(s, 'xmasParty') && !this.edit) S.drawHat(g, cx + 10, cy - 1 + bob, 'santa');
      else if (isBday) S.drawHat(g, cx + 10, cy - 1 + bob, 'party');
      this.hits.push({ id: e.id, x: cx + 8, y: cy - 2, w: 14, h: 20 });
    }
    S.drawDesk(g, cx + 2, cy + 14, T.desk[0], T.desk[1]);
    // En un apagón las pantallas se apagan y salen las velas.
    S.drawMonitor(g, cx + 1, cy + 6, S.shade(roleColor, 0.25), !!seated && !this.blackout, t + phase, i, busy && !this.blackout);
    if (isBday) S.drawCake(g, cx + 21, cy + 9, t);
    else if (seated && officeFx(s, 'hackathon') && i % 2 === 0) S.drawPizzaBox(g, cx + 19, cy + 12);
    else S.drawDeskProp(g, cx + 22, cy + 11, i % 7, t + phase, busy);
    if (seated && this.blackout) S.drawCandle(g, cx + 6, cy + 9, t + phase);
    if (seated) this.monitors.push({ x: cx + 5, y: cy + 9, candle: this.blackout });
    if (seated) {
      S.R(g, cx + 11, cy + 14, 8, 2, '#c9d3dc');
      S.R(g, cx + 11, cy + 15, 8, 1, PAL.slate);
      const k = busy ? Math.floor((t + phase) * 8) % 2 : 0;
      S.R(g, cx + 11, cy + 13 - k, 2, 2, e.looks.skin);
      S.R(g, cx + 17, cy + 13 - (1 - k), 2, 2, S.shade(e.looks.skin, -0.12));
      const icon = cheer ? (phase % 2 < 1 ? 'star' : 'heart') : !this.edit && this.statusIcon(e, t + phase);
      if (icon) S.drawBubble(g, cx + 17, cy - 10, icon);
    } else if (e && e.off > 0) {
      S.drawBubble(g, cx + 12, cy + 2, 'palm');
    }
    if (seated && this.selected === e.id && !this.edit) this.outline(g, cx + 9, cy - 1, 12, 18);
  }

  statusIcon(e, t) {
    if (e.energy < 25) return 'zz';
    if (e.mood < 30) return 'bang';
    if (this.bdays.has(e.id)) return t % 2 < 1 ? 'cake' : 'heart';
    // Parejas, roces y amistades se notan de vez en cuando.
    const rel = this.relIdx.get(e.id);
    if (rel?.kind === 'couple' && t % 9 < 0.9) return 'heart';
    if (rel?.kind === 'rival' && t % 8 < 0.9) return 'angry';
    if (rel?.kind === 'friend' && t % 11 < 0.9) return 'note';
    // Con la empresa en números rojos, el equipo suda.
    if (this.crisis && (t + e.id) % 7 < 1.2) return 'sweat';
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
    if (this.partyUntil > t) S.drawBubble(g, x + 7, y - 11, 'star');
    else if (st.mode === 'break' && (t + (st.phase || 0)) % 4 < 1.5) S.drawBubble(g, x + 7, y - 11, e.energy < 40 ? 'zz' : 'heart');
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
    if (!e || this.people.get(e.id)?.mode === 'home') return;
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
    for (const b of this.balloons) {
      b.y -= b.v * dt;
      S.drawBalloon(g, Math.round(b.x), Math.round(b.y), b.c, this.t);
    }
    this.balloons = this.balloons.filter((b) => b.y > -20);
    const bn = this.banner;
    if (bn && bn.until > this.t && !this.edit) {
      const tw = S.textWidth(bn.text, 2);
      const x = Math.round(this.L.W / 2 - tw / 2);
      const y = WALL + 8 + (Math.sin(this.t * 6) > 0 ? 0 : 1);
      S.R(g, x - 7, y - 5, tw + 14, 20, PAL.ink);
      S.R(g, x - 6, y - 4, tw + 12, 18, PAL.plum);
      S.R(g, x - 6, y - 4, tw + 12, 1, PAL.yellow);
      S.R(g, x - 6, y + 13, tw + 12, 1, PAL.orange);
      S.drawTextShadow(g, bn.text, x, y, PAL.yellow, PAL.ink, 2);
    } else if (bn) this.banner = null;
  }
}

