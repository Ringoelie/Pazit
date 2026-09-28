// Pruebas del plano de la oficina y del editor.
// Uso: node tests/layout.test.js
import assert from 'node:assert/strict';
import { OFFICES, PERKS } from '../public/js/data.js';
import { defaultLayout, canPlace, deskRect, itemRect, isWall, FLAT, deskEffects, serverRoom } from '../public/js/layout.js';
import * as G from '../public/js/sim.js';
import { exportSave, importSave } from '../public/js/state.js';

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function checkLayout(L, tier) {
  const solids = [
    ...L.desks.map((d, i) => ({ ref: 'd:' + i, r: deskRect(d), id: 'desk', x: d.x, y: d.y })),
    ...L.items.filter((it) => !FLAT.has(it.id) && !isWall(it.id)).map((it) => ({ ref: 'i:' + it.uid, r: itemRect(it), id: it.id, x: it.x, y: it.y })),
  ];
  for (let a = 0; a < solids.length; a++) {
    for (let b = a + 1; b < solids.length; b++) {
      assert.ok(!overlap(solids[a].r, solids[b].r), `solape en oficina ${tier}: ${solids[a].id} y ${solids[b].id}`);
    }
    assert.ok(!overlap(solids[a].r, serverRoom(tier)), `${solids[a].id} invade la sala de servidores (oficina ${tier})`);
  }
  for (const it of L.items) assert.ok(canPlace(L, tier, it.id, it.x, it.y, 'i:' + it.uid), `${it.id} mal colocado en oficina ${tier}`);
  L.desks.forEach((d, i) => assert.ok(canPlace(L, tier, 'desk', d.x, d.y, 'd:' + i), `mesa ${i} mal colocada en oficina ${tier}`));
}

// 1. Cada oficina coloca todas las mejoras disponibles a su máximo sin solapes.
for (let tier = 0; tier < OFFICES.length; tier++) {
  const perks = {};
  for (const [id, p] of Object.entries(PERKS)) if (p.tier <= tier) perks[id] = p.max;
  const L = defaultLayout(tier, perks, { fixtures: tier === 0 });
  assert.equal(L.desks.length, OFFICES[tier].desks);
  checkLayout(L, tier);
  const placed = {};
  for (const it of L.items) placed[it.id] = (placed[it.id] || 0) + 1;
  const missing = Object.entries(perks).filter(([id, n]) => (placed[id] || 0) < n).map(([id]) => id);
  if (tier > 0) assert.deepEqual(missing, [], `no caben en la oficina ${tier}: ${missing.join(', ')}`);
  else console.log(`garaje con todo al máximo: ${L.items.length} objetos, sin sitio para: ${missing.join(', ') || 'nada'}`);
}

// 2. Mover: no se puede poner nada encima de otra cosa ni fuera del suelo.
{
  const s = G.newGame({ seed: 42 });
  const L = s.office.layout;
  const d1 = L.desks[1];
  assert.equal(G.moveObject(s, 'd:0', d1.x, d1.y).ok, false, 'una mesa no puede pisar otra');
  assert.equal(G.moveObject(s, 'd:0', -40, 10).ok, false, 'no se puede sacar una mesa del suelo');
  const car = L.items.find((it) => it.id === 'car');
  assert.equal(G.moveObject(s, 'i:' + car.uid, d1.x, d1.y).ok, false, 'el coche no cabe encima de una mesa');
  const before = { ...L.desks[3] };
  assert.equal(G.moveObject(s, 'd:3', before.x, before.y + 4).ok, true, 'mover una mesa a un hueco libre');
  assert.equal(L.desks[3].y, before.y + 4);
  // Vender el coche da dinero y libera espacio.
  const money = s.money;
  assert.equal(G.sellItem(s, car.uid).ok, true);
  assert.equal(s.money, money + 1500);
  assert.ok(!L.items.some((it) => it.id === 'car'));
}

// 3. Decoración cerca sube el ánimo; juegos cerca restan productividad.
{
  const s = G.newGame({ seed: 7 });
  s.money = 1e6;
  s.office.tier = 2;
  s.office.layout = null;
  G.ensureLayout(s);
  const L = s.office.layout;
  const d = L.desks[0];
  assert.deepEqual(deskEffects(L, 0), { comfort: 0, noise: 0 });
  L.items.push({ uid: L.next++, id: 'plant', x: d.x + 30, y: d.y + 6 });
  L.items.push({ uid: L.next++, id: 'aquarium', x: d.x + 56, y: d.y + 2 });
  const fx = deskEffects(L, 0);
  assert.ok(fx.comfort >= 1, 'la planta cercana debe dar ánimo');
  const far = deskEffects(L, L.desks.length - 1);
  assert.equal(far.comfort, 0, 'una mesa lejana no recibe el efecto');
  L.items.push({ uid: L.next++, id: 'arcade', x: d.x + 4, y: d.y + 32 });
  assert.ok(deskEffects(L, 0).noise > 0, 'el arcade cercano hace ruido');
  const e = s.employees[0];
  e.desk = 0;
  const noisy = G.productivity(s, e);
  L.items.pop();
  assert.ok(G.productivity(s, e) > noisy, 'el ruido baja la productividad');
}

// 4. Comprar coloca el objeto; mudarse regenera el plano con las mejoras.
{
  const s = G.newGame({ seed: 3 });
  s.money = 1e7;
  const r = G.buyPerk(s, 'coffee');
  assert.ok(r.ok && r.ref, 'comprar la cafetera la coloca');
  assert.ok(s.office.layout.items.some((it) => it.id === 'coffee'));
  G.moveOffice(s, 1);
  assert.equal(s.office.layout.tier, 1);
  assert.ok(s.office.layout.items.some((it) => it.id === 'coffee'), 'la cafetera viaja a la nueva oficina');
  assert.ok(!s.office.layout.items.some((it) => it.id === 'car'), 'el coche se queda en el garaje');
  assert.equal(G.sellPerk(s, 'coffee').ok, true);
  assert.equal(s.office.perks.coffee, undefined);
  assert.ok(!s.office.layout.items.some((it) => it.id === 'coffee'));
}

// 5. Una partida guardada antes del editor recibe un plano al cargarse.
{
  const s = G.newGame({ seed: 5 });
  s.office.perks = { plant: 2, coffee: 1 };
  delete s.office.layout;
  const loaded = importSave(exportSave(s));
  assert.ok(loaded.office.layout, 'se crea el plano al cargar');
  assert.equal(loaded.office.layout.items.filter((it) => it.id === 'plant').length, 2);
  checkLayout(loaded.office.layout, 0);
}

console.log('OK');
