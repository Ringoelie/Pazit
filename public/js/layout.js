// Plano de la oficina: dónde está cada mesa y cada mueble. Geometría pura
// (sin DOM) para que la simulación, el editor y las pruebas la compartan.
import { OFFICES, PERKS, FIXTURES } from './data.js';

export const WALL = 44;
export const GRID = 4;
export const NEAR_RADIUS = 48;
const COLS = [2, 4, 7, 8, 10, 14, 20, 24, 28];
const DESK_X0 = 14;
const DESK_Y0 = WALL + 30;

// Caja que ocupa cada objeto (x, y es su esquina superior izquierda).
export const SIZES = {
  plant: [10, 14], rug: [32, 20], lamp: [8, 22], coffee: [12, 20], cooler: [10, 20], snacks: [14, 22],
  sofa: [30, 14], foosball: [28, 17], aquarium: [24, 18], meeting: [40, 22], arcade: [14, 24], library: [22, 24],
  ballpit: [34, 16], podcast: [26, 28], gym: [36, 14], statue: [16, 26], nappods: [30, 16], chef: [34, 18],
  robot: [16, 24], whiteboard: [28, 16], ac: [22, 7], car: [58, 28], boxes: [30, 24], bike: [26, 14], pet: [16, 10],
  cat: [14, 9], parrot: [10, 20], robodog: [16, 8],
  lava: [6, 12], poster: [12, 16], beanbag: [12, 9], palm: [12, 26], neon: [34, 12], zen: [16, 14], jukebox: [14, 22],
  pingpong: [32, 18], fireplace: [24, 22], hammock: [28, 14], mural: [40, 21], telescope: [12, 20], ticker: [28, 16],
  // No es un mueble: el árbol de Navidad busca sitio libre con estas medidas.
  xmastree: [16, 26],
  stage: [44, 30],
  trophies: [18, 26],
  pumpkin: [10, 9],
};
// Objetos de pared: solo se mueven en horizontal, a esta altura.
export const WALL_ITEMS = { whiteboard: 20, ac: 2, poster: 20, neon: 22, mural: 19, ticker: 20 };
// Objetos planos: se dibujan bajo todo y no chocan con nada.
export const FLAT = new Set(['rug']);

export const isWall = (id) => WALL_ITEMS[id] != null;
export const itemDef = (id) => PERKS[id] || FIXTURES[id];

export function deskRect(d) {
  return { x: d.x + 2, y: d.y, w: 24, h: 28 };
}
export function itemRect(it) {
  const [w, h] = SIZES[it.id] || [12, 12];
  return { x: it.x, y: it.y, w, h };
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const snap = (v) => Math.round(v / GRID) * GRID;

export function officeSize(tier) {
  const o = OFFICES[tier];
  return { W: o.w, H: o.h };
}

// Sala de servidores fija abajo a la derecha: ahí se dibujan los racks.
export function serverRoom(tier) {
  const { W, H } = officeSize(tier);
  const w = Math.min(Math.floor(W * 0.42), 220);
  return { x: W - w, y: H - 34, w, h: 34 };
}

export function loungeX(tier) {
  return DESK_X0 + COLS[tier] * 28 + 18;
}

// Referencias a objetos del plano como texto: 'd:3' (mesa) o 'i:12' (mueble).
export function getRef(L, ref) {
  if (!ref) return null;
  const [k, v] = ref.split(':');
  if (k === 'd') {
    const d = L.desks[+v];
    return d ? { kind: 'desk', obj: d, id: 'desk' } : null;
  }
  const it = L.items.find((x) => x.uid === +v);
  return it ? { kind: 'item', obj: it, id: it.id } : null;
}

export function rectFor(id, x, y) {
  return id === 'desk' ? deskRect({ x, y }) : itemRect({ id, x, y });
}

// ¿Cabe `id` en (x, y)? `ignore` es la referencia del objeto que se mueve.
export function canPlace(L, tier, id, x, y, ignore = null) {
  const { W, H } = officeSize(tier);
  const r = rectFor(id, x, y);
  if (isWall(id)) {
    if (y !== WALL_ITEMS[id] || r.x < 0 || r.x + r.w > W) return false;
    return !L.items.some((it) => 'i:' + it.uid !== ignore && isWall(it.id) && overlap(r, itemRect(it)));
  }
  if (r.x < 2 || r.x + r.w > W - 2 || r.y < WALL + 2 || r.y + r.h > H - 2) return false;
  if (overlap(r, serverRoom(tier))) return false;
  if (FLAT.has(id)) return true;
  for (let i = 0; i < L.desks.length; i++) {
    if ('d:' + i !== ignore && overlap(r, deskRect(L.desks[i]))) return false;
  }
  for (const it of L.items) {
    if ('i:' + it.uid === ignore || FLAT.has(it.id) || isWall(it.id)) continue;
    if (overlap(r, itemRect(it))) return false;
  }
  return true;
}

// Ajusta una posición a la rejilla (y a la altura de la pared si toca).
export function snapPos(id, x, y) {
  return { x: snap(x), y: isWall(id) ? WALL_ITEMS[id] : snap(y) };
}

// ¿Queda al menos `gap` px de pared libre a cada lado?
function wallGap(L, id, x, y, gap) {
  if (!gap) return true;
  const r = rectFor(id, x, y);
  const wide = { x: r.x - gap, y: r.y, w: r.w + gap * 2, h: r.h };
  return !L.items.some((it) => isWall(it.id) && overlap(wide, itemRect(it)));
}

// Busca el primer hueco libre, empezando por la zona de descanso.
export function findSpot(L, tier, id) {
  const { W, H } = officeSize(tier);
  const [w] = SIZES[id] || [12, 12];
  if (isWall(id)) {
    const y = WALL_ITEMS[id];
    const xs = [];
    for (let x = 0; x + w <= W; x += GRID) xs.push(x);
    // El aire va a la derecha; el resto, a partir del póster de la entrada y
    // con un poco de aire entre cuadros.
    const order = id === 'ac' ? xs.sort((a, b) => Math.abs(a - (W - w - 8)) - Math.abs(b - (W - w - 8))) : [...xs.filter((x) => x >= 64), ...xs.filter((x) => x < 64).reverse()];
    for (const gap of [6, 0]) {
      for (const x of order) if (canPlace(L, tier, id, x, y) && wallGap(L, id, x, y, gap)) return { x, y };
    }
    return null;
  }
  const lx = snap(loungeX(tier));
  const zones = [[lx, WALL + 4], [4, WALL + 4]];
  for (const [x0, y0] of zones) {
    for (let y = y0; y < H; y += GRID) {
      for (let x = x0; x < W; x += GRID) if (canPlace(L, tier, id, x, y)) return { x, y };
    }
  }
  return null;
}

// Plano por defecto de una oficina con las mejoras ya compradas.
export function defaultLayout(tier, perks = {}, { fixtures = tier === 0 } = {}) {
  const o = OFFICES[tier];
  const cols = COLS[tier];
  const L = { tier, desks: [], items: [], next: 1 };
  for (let i = 0; i < o.desks; i++) {
    L.desks.push({ x: DESK_X0 + (i % cols) * 28, y: DESK_Y0 + Math.floor(i / cols) * 30 });
  }
  if (fixtures) {
    const { W, H } = officeSize(tier);
    L.items.push({ uid: L.next++, id: 'car', x: snap(loungeX(tier) + 44), y: WALL + 60 });
    L.items.push({ uid: L.next++, id: 'boxes', x: 4, y: H - 28 });
    L.items.push({ uid: L.next++, id: 'bike', x: snap(W - 36), y: WALL + 8 });
  }
  for (const id of Object.keys(PERKS)) {
    for (let n = 0; n < (perks[id] || 0); n++) addItem(L, tier, id);
  }
  return L;
}

// Coloca un objeto en el primer hueco libre. Devuelve el objeto o null.
export function addItem(L, tier, id) {
  const spot = findSpot(L, tier, id);
  if (!spot) return null;
  const it = { uid: L.next++, id, x: spot.x, y: spot.y };
  L.items.push(it);
  return it;
}

// Ánimo por decoración cercana y productividad perdida por ruido en una mesa.
export function deskEffects(L, i) {
  const d = L?.desks[i];
  if (!d) return { comfort: 0, noise: 0 };
  const cx = d.x + 14;
  const cy = d.y + 16;
  let comfort = 0;
  let noise = 0;
  for (const it of L.items) {
    const p = PERKS[it.id];
    if (!p || (!p.near && !p.noise)) continue;
    const r = itemRect(it);
    if (Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy) > NEAR_RADIUS) continue;
    comfort += p.near || 0;
    noise += p.noise || 0;
  }
  return { comfort: Math.min(6, comfort), noise: Math.min(0.15, noise) };
}
