// Mascotas de la oficina. Cada una tiene su sitio en el plano (cama, cesta,
// percha o base de carga) y su manera de moverse:
// - el perro visita a la gente y vuelve a su cama;
// - el gato duerme mucho y, cuando se despierta, se sube a una mesa;
// - el loro vuela a los monitores y repite lo que oye;
// - el perro robot patrulla sin descanso, también de noche.
import { WALL } from './layout.js';
import * as S from './sprites.js';

export const PET_IDS = ['pet', 'cat', 'parrot', 'robodog'];
export const PET_NAMES = { pet: '🐕 Bit', cat: '🐈 Michi', parrot: '🦜 Paco', robodog: '🤖 K-9000' };
const PHRASES = ['HOLA!', 'DEPLOY!', 'BUG!', 'CAFE?', 'UNICORNIO!', 'CRUNCH!', 'RONDA A!', 'FUNCIONA!', 'LANZA YA!', 'GUAPO!'];
const SPEED = { pet: 22, cat: 17, parrot: 44, robodog: 20 };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Dónde se queda cada mascota cuando está en casa.
function homeOf(it) {
  switch (it.id) {
    case 'parrot': return { x: it.x + 1, y: it.y - 5 };
    case 'robodog': return { x: it.x + 1, y: it.y - 4 };
    default: return { x: it.x + 2, y: it.y };
  }
}

function busyDesks(s, layout) {
  const used = new Set(s.employees.filter((e) => !e.region && !e.traits.includes('remote')).map((e) => e.desk));
  return layout.desks.filter((_, i) => used.has(i));
}

// Siguiente destino según la especie.
function nextTarget(view, s, layout, p, it) {
  const home = homeOf(it);
  const desks = busyDesks(s, layout);
  const L = view.L;
  const lounge = () => ({ x: L.loungeX + rand(0, Math.max(10, L.W - L.loungeX - 24)), y: WALL + 8 + rand(0, 60) });
  const r = Math.random();
  switch (p.kind) {
    case 'cat':
      if (p.mode !== 'sleep' && r < 0.45) return { ...home, home: true };
      if (desks.length && r < 0.85) {
        const d = pick(desks);
        return { x: d.x + 16, y: d.y + 6, desk: d.y };
      }
      return lounge();
    case 'parrot':
      if (p.mode !== 'sleep' && r < 0.5) return { ...home, home: true };
      if (desks.length) {
        const d = pick(desks);
        return { x: d.x + 2, y: d.y - 3, desk: d.y };
      }
      return lounge();
    case 'robodog':
      return r < 0.15 ? { ...home, home: true } : r < 0.6 || !desks.length ? lounge() : (() => {
        const d = pick(desks);
        return { x: d.x + 8, y: d.y + 20 };
      })();
    default:
      if (p.mode !== 'sleep' && r < 0.3) return { ...home, home: true };
      if (desks.length && r < 0.8) {
        const d = pick(desks);
        return { x: d.x + 8, y: d.y + 20 };
      }
      return lounge();
  }
}

export function updatePets(view, s, layout, dt, speed) {
  const alive = new Set();
  for (const it of layout.items) {
    if (!PET_IDS.includes(it.id)) continue;
    alive.add(it.uid);
    const home = homeOf(it);
    let p = view.pets.get(it.uid);
    if (!p) {
      p = { kind: it.id, x: home.x, y: home.y, sx: home.x, sy: home.y, mode: 'sleep', timer: rand(3, 8), left: false, love: 0, say: '', sayT: 0, prog: 0 };
      view.pets.set(it.uid, p);
    }
    p.love = Math.max(0, p.love - dt);
    p.sayT = Math.max(0, p.sayT - dt);
    if (view.edit) {
      Object.assign(p, { mode: 'sleep', x: home.x, y: home.y, timer: 3 });
      continue;
    }
    // Como la gente, las mascotas siguen a su ritmo con el juego en pausa.
    const mult = [0, 1, 1.4, 1.8][speed] || 1;
    if (p.mode === 'walk') {
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const v = SPEED[p.kind] * mult * dt;
      p.prog = Math.min(1, p.prog + v / Math.max(1, p.dist));
      if (d <= v) {
        p.x = p.tx;
        p.y = p.ty;
        p.mode = p.home ? 'sleep' : 'sit';
        p.timer = p.home ? (p.kind === 'cat' ? rand(14, 26) : rand(8, 16)) : rand(3, 7);
        if (p.kind === 'robodog') p.timer = p.home ? rand(3, 6) : rand(0.5, 2);
        if (p.kind === 'parrot' && !p.home && Math.random() < 0.8) {
          p.say = pick(PHRASES);
          p.sayT = 2.5;
        }
      } else {
        p.x += (dx / d) * v;
        p.y += (dy / d) * v;
        p.left = dx < 0;
      }
      continue;
    }
    p.timer -= dt * mult;
    if (p.timer > 0) continue;
    const to = nextTarget(view, s, layout, p, it);
    p.home = !!to.home;
    p.desk = to.desk ?? null;
    p.tx = to.x;
    p.ty = to.y;
    p.sx = p.x;
    p.sy = p.y;
    p.dist = Math.hypot(p.tx - p.x, p.ty - p.y);
    p.prog = 0;
    p.mode = 'walk';
  }
  for (const uid of view.pets.keys()) if (!alive.has(uid)) view.pets.delete(uid);
}

// El bocadillo del loro no se sale por la derecha.
const speechX = (view, x, text) => Math.max(1, Math.min(x, view.L.W - S.textWidth(text) - 5));

// La mascota ha salido de casa: se dibuja por su cuenta, ordenada por altura.
export function petDrawables(view, g, t) {
  const out = [];
  for (const [uid, p] of view.pets) {
    if (p.mode === 'sleep' || view.edit) continue;
    // Encima de una mesa o de un monitor, se dibuja después de esa mesa.
    const y = p.desk != null && p.mode === 'sit' ? p.desk + 25 : p.y + 9;
    out.push({ y, draw: () => drawPet(view, g, uid, p, t) });
  }
  return out;
}

function drawPet(view, g, uid, p, t) {
  const x = Math.round(p.x);
  const walking = p.mode === 'walk';
  // El loro vuela en arco.
  const lift = p.kind === 'parrot' && walking ? Math.round(Math.sin(p.prog * Math.PI) * 18) : 0;
  const y = Math.round(p.y) - lift;
  if (p.kind !== 'parrot') {
    g.fillStyle = 'rgba(14,10,30,.25)';
    g.fillRect(x + 2, Math.round(p.y) + 9, 9, 1);
  }
  const frame = Math.floor(t * 8) % 2 ? 'w1' : 'w0';
  switch (p.kind) {
    case 'cat':
      S.drawCat(g, x, y, view.catCoat, walking ? frame : 'sit', p.left);
      break;
    case 'parrot':
      S.drawParrot(g, x, y, walking ? (Math.floor(t * 10) % 2 ? 'fly1' : 'fly0') : 'sit', p.left);
      if (p.sayT > 0) S.drawSpeech(g, speechX(view, x + 6, p.say), y - 10, p.say);
      break;
    case 'robodog':
      S.drawRoboDog(g, x, y, walking ? frame : 'w0', p.left, t);
      break;
    default:
      S.drawDog(g, x, y, view.petCoat, walking ? frame : 'sit', p.left);
  }
  view.hits.push({ id: 'pet:' + uid, x: x - 1, y: y - 1, w: 15, h: 12 });
  if (p.love > 0) S.drawBubble(g, x + 5, y - 10, 'heart');
}

// La casa de la mascota (y la mascota si está dentro).
export function drawPetHome(view, g, it, t) {
  const p = view.pets.get(it.uid);
  const home = !p || p.mode === 'sleep' || view.edit;
  switch (it.id) {
    case 'cat':
      S.drawCatBasket(g, it.x, it.y, view.catCoat, home, t);
      break;
    case 'parrot':
      S.drawPerch(g, it.x, it.y);
      if (home) S.drawParrot(g, it.x + 1, it.y - 5, 'sit', false);
      if (home && p?.sayT > 0) S.drawSpeech(g, speechX(view, it.x + 7, p.say), it.y - 15, p.say);
      break;
    case 'robodog':
      S.drawRoboDock(g, it.x, it.y, t);
      if (home) S.drawRoboDog(g, it.x + 1, it.y - 4, 'w0', false, t);
      break;
    default:
      S.drawDogBed(g, it.x, it.y, view.petCoat, home, t);
  }
  if (home && p) {
    view.hits.push({ id: 'pet:' + it.uid, x: it.x, y: it.y - 6, w: 16, h: 16 });
    if (p.love > 0) S.drawBubble(g, it.x + 8, it.y - 12, 'heart');
  }
}

// Tocar a una mascota: se despierta y pide mimos (el loro habla).
export function petLove(view, id) {
  const p = view.pets.get(+String(id).split(':')[1]);
  if (!p) return null;
  p.love = 1.8;
  if (p.kind === 'parrot') {
    p.say = pick(PHRASES);
    p.sayT = 2.5;
  }
  if (p.mode === 'sleep') p.timer = 0;
  return p.kind;
}

// Luz del perro robot por la noche.
export function petLights(view, g, dark) {
  if (dark < 0.2) return;
  for (const p of view.pets.values()) {
    if (p.kind !== 'robodog') continue;
    g.drawImage(S.glowSprite('rgba(115,239,247,.35)', 16), Math.round(p.x) + (p.left ? -10 : 8), Math.round(p.y) - 12);
  }
}
