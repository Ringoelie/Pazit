// Pruebas de los sistemas de profundidad: correo, temporadas, expansión,
// leyes, rivales y productos físicos.
// Uso: node tests/depth.test.js
import assert from 'node:assert/strict';
import * as G from '../public/js/sim.js';
import { sendMail, answerMail, pendingMail, mailStep } from '../public/js/mail.js';
import { seasonDemand, seasonTx, openRegion, regionMarket, complianceIssues, lawActive } from '../public/js/world.js';
import { ensureRivals, warFx, poachFrom, smear, rivalMonth } from '../public/js/rivals.js';
import { orderUnits, unitCost, leadTime, hwPrice } from '../public/js/hw.js';
import { makePerson } from '../public/js/core.js';
import { fmtNum, fmtMoney } from '../public/js/util.js';

const fresh = (seed = 1) => {
  const s = G.newGame({ seed });
  s.notes.length = 0;
  return s;
};
const step = (s, n) => {
  for (let i = 0; i < n; i++) {
    s.event = null;
    G.stepDay(s);
    s.notes.length = 0;
  }
};
// Lanza un producto de golpe con las funciones indicadas.
function quickProduct(s, cat, features) {
  G.createProduct(s, 'Prueba', cat);
  const p = s.products[s.products.length - 1];
  Object.assign(p.features, features);
  p.queue = [];
  p.invested = 2000;
  G.launch(s, p.id);
  return p;
}

// 1. Correo: llega el de bienvenida, se contesta y caduca con la opción por defecto.
{
  const s = fresh();
  assert.ok(s.mail.some((m) => m.type === 'welcome'), 'correo de bienvenida');
  const e = makePerson(s, 'dev', { skill: 60 });
  e.salary = 1000;
  e.mood = 40;
  s.employees.push(e);
  const m = sendMail(s, 'raise', { eid: e.id });
  assert.ok(m.choices.length === 3 && pendingMail(s).length === 1);
  assert.equal(answerMail(s, m.id, 0).ok, true);
  assert.ok(e.salary > 1000, 'la subida se aplica');
  assert.equal(answerMail(s, m.id, 0).ok, false, 'no se contesta dos veces');
  // Si ya cobra lo que pedía, que caduque no le baja el ánimo.
  const paid = sendMail(s, 'raise', { eid: e.id });
  let mood = e.mood;
  s.day = paid.expires;
  mailStep(s);
  assert.equal(paid.done, 2);
  assert.equal(e.mood, mood, 'sin castigo si ya cobra lo esperado');
  e.salary = 1000;
  const m2 = sendMail(s, 'raise', { eid: e.id });
  mood = e.mood;
  s.day = m2.expires;
  mailStep(s);
  assert.equal(m2.done, 2, 'al caducar se aplica la última opción');
  assert.ok(m2.expired && e.mood < mood);
}

// 2. Temporadas.
{
  const s = fresh();
  s.day = 320; // noviembre
  assert.equal(seasonDemand(s, 'phone'), 1.8);
  assert.equal(seasonTx(s, 'shop'), 2);
  s.day = 100; // abril
  assert.equal(seasonDemand(s, 'phone'), 1);
}

// 3. Expansión: el mercado crece según el idioma y el personal regional no ocupa mesa.
{
  const s = fresh();
  s.money = 1e8;
  const p = quickProduct(s, 'blog', { landing: 1, articles: 1 });
  assert.equal(regionMarket(s, p), 1);
  assert.equal(openRegion(s, 'latam').ok, true);
  assert.equal(openRegion(s, 'latam').ok, false, 'no se abre dos veces');
  assert.ok(Math.abs(regionMarket(s, p) - 1.2) < 1e-9, 'Latinoamérica habla tu idioma');
  openRegion(s, 'na');
  const noLang = regionMarket(s, p);
  p.features.i18n = 1;
  assert.ok(regionMarket(s, p) > noLang, 'Multi-idioma abre Norteamérica');
  G.refreshCandidates(s);
  const c = s.candidates.find((x) => x.region);
  assert.ok(c, 'aparecen candidatos regionales');
  const desks = G.freeDesks(s);
  assert.equal(G.hire(s, c.id).ok, true);
  assert.equal(G.freeDesks(s), desks, 'el personal regional no ocupa mesa en la sede');
}

// 4. Leyes: entran en vigor, detectan incumplimientos y multan.
{
  const s = fresh(9);
  const p = quickProduct(s, 'blog', { landing: 1, articles: 1 });
  p.users = 2e5;
  s.day = 239;
  step(s, 2);
  assert.ok(lawActive(s, 'privacy'), 'la ley de privacidad entra en vigor');
  p.users = 2e5;
  assert.deepEqual(complianceIssues(s, p).map((l) => l.id), ['privacy']);
  const fine = sendMail(s, 'fine', { pid: p.id, law: 'privacy', amount: 10000 });
  const money = s.money;
  answerMail(s, fine.id, 1);
  assert.equal(Math.round(money - s.money), 10000, 'pagar la multa');
  p.features.privacy = 1;
  assert.equal(complianceIssues(s, p).length, 0, 'con Privacidad y RGPD cumple');
}

// 5. Rivales: estilos, guerra de precios, fichajes y campañas.
{
  const s = fresh(4);
  s.money = 1e7;
  ensureRivals(s);
  assert.ok(s.competitors.every((c) => c.style && c.ceo));
  s.research.monetization = 1;
  const p = quickProduct(s, 'blog', { landing: 1, articles: 1, subs: 1 });
  p.price = 5;
  const before = G.premiumConversion(s, p);
  p.war = { rival: s.competitors[0].id, until: s.day + 30, response: 'hold' };
  assert.ok(G.premiumConversion(s, p) < before, 'la guerra de precios baja la conversión');
  assert.deepEqual(warFx(s, { ...p, war: { ...p.war, response: 'match' } }), { conv: 1, rev: 0.8, target: 1 });
  const rival = s.competitors.find((c) => c.cat === 'blog');
  const cands = s.candidates.length;
  assert.equal(poachFrom(s, rival.id).ok, true);
  assert.equal(s.candidates.length, cands + 1, 'fichar talento añade un candidato');
  assert.equal(poachFrom(s, rival.id).ok, false, 'hay que esperar para volver a fichar');
  const appeal = rival.appeal;
  assert.equal(smear(s, rival.id).ok, true);
  assert.ok(rival.appeal < appeal && rival.rivalry > 0);
  const other = s.competitors.find((c) => c.cat === 'search');
  assert.equal(smear(s, other.id).ok, false, 'sin producto en ese mercado no hay campaña');
  for (let i = 0; i < 24; i++) rivalMonth(s);
  assert.ok(s.mail.some((m) => ['priceWar', 'rivalLawsuit', 'rivalPoach', 'rivalAd'].includes(m.type)) || s.news.some((n) => /actualización/.test(n.text)), 'los rivales actúan');
}

// 6. Hardware: pedido, llegada, ventas, stock y margen.
{
  const s = fresh(6);
  s.money = 1e7;
  s.research.hardware = 1;
  const p = quickProduct(s, 'phone', { hwdesign: 2, os: 2 });
  assert.equal(p.kind, 'hw');
  assert.equal(p.users, 0, 'un móvil empieza sin dispositivos en uso');
  p.awareness = 0.3;
  const cost = unitCost(s, p);
  const money = s.money;
  const revenue = s.stats.revenue;
  assert.equal(orderUnits(s, p.id, 1000).ok, true);
  assert.equal(Math.round(money - s.money), 1000 * cost, 'se paga la fabricación por adelantado');
  step(s, leadTime(s) - 1);
  assert.equal(p.stock, 0, 'el pedido aún no ha llegado');
  step(s, 1);
  assert.ok(p.sold > 0 || p.stock > 0, 'llega el pedido');
  step(s, 60);
  assert.ok(p.sold > 500, 'se venden unidades');
  assert.ok(p.stock < 1000);
  assert.ok(s.stats.revenue - revenue >= p.sold * hwPrice(p) * 0.99, 'ingresos por ventas');
  assert.ok(hwPrice(p) > cost, 'hay margen');
  if (p.stock < 1) assert.ok(p.stockout, 'se avisa de la falta de stock');
  assert.equal(orderUnits(s, p.id, 1e9).ok, false, 'no se puede fabricar sin dinero');
}

// 7. Errores corregidos.
{
  // Un producto físico no se cae con la nube ni se queda caído para siempre.
  const s = fresh(7);
  s.money = 1e9;
  for (const r of ['hardware', 'compliance']) s.research[r] = 0;
  const p = quickProduct(s, 'phone', { hwdesign: 2, os: 2 });
  p.users = 2e5;
  p.stock = 1e6;
  s.event = { id: 'cloudDown', ctx: {} };
  G.resolveEvent(s, 0);
  assert.equal(p.down, 0, 'la caída de la nube no afecta al hardware');
  p.down = 1;
  step(s, 2);
  assert.equal(p.down, 0, 'una caída antigua se recupera');
  assert.equal(p.overload, 0, 'el hardware no sufre la sobrecarga de servidores');
  // Las leyes solo exigen funciones que el producto puede tener.
  for (const law of ['privacy', 'aiact']) s.laws[law] = 0;
  assert.deepEqual(complianceIssues(s, p), [], 'sin multas imposibles de evitar');
}
{
  // Talento fichado a un rival: sigue en la lista tras refrescar candidatos.
  const s = fresh(8);
  s.money = 1e7;
  const c = s.competitors.find((x) => x.alive);
  assert.equal(poachFrom(s, c.id).ok, true);
  const id = s.candidates[0].id;
  G.refreshCandidates(s);
  assert.ok(s.candidates.some((x) => x.id === id), 'el fichaje no desaparece');
  // Comprar al rival termina su guerra de precios.
  const p = quickProduct(s, c.cat, {});
  p.war = { rival: c.id, until: s.day + 60, response: 'hold' };
  assert.equal(warFx(s, p).conv, 0.7);
  c.alive = false;
  assert.equal(warFx(s, p).conv, 1, 'un rival que ya no existe no te hace la guerra');
}
{
  // Partidas antiguas sin rivales de hardware los reciben al cargar.
  const s = fresh(9);
  s.competitors = s.competitors.filter((c) => c.cat !== 'phone');
  ensureRivals(s);
  assert.ok(s.competitors.some((c) => c.cat === 'phone' && c.alive));
}
{
  // Aceptar una subida nunca baja el sueldo.
  const s = fresh(10);
  const e = makePerson(s, 'dev', { skill: 60 });
  s.employees.push(e);
  const m = sendMail(s, 'raise', { eid: e.id });
  e.salary = 99999;
  answerMail(s, m.id, 0);
  assert.equal(e.salary, 99999);
}
assert.equal(fmtNum(999999), '1M');
assert.equal(fmtNum(999.7), '1k');
assert.equal(fmtMoney(999.6e6), '$1B');
assert.equal(fmtNum(12345), '12.3k');

console.log('OK');
