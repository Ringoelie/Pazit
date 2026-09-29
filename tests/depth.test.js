// Pruebas de los sistemas de profundidad: correo, temporadas, expansión,
// leyes, rivales y productos físicos.
// Uso: node tests/depth.test.js
import assert from 'node:assert/strict';
import { OFFICES } from '../public/js/data.js';
import * as G from '../public/js/sim.js';
import { sendMail, answerMail, pendingMail, mailStep, mailDeadline } from '../public/js/mail.js';
import { seasonDemand, seasonTx, openRegion, regionMarket, complianceIssues, lawActive } from '../public/js/world.js';
import { ensureRivals, warFx, poachFrom, smear, rivalMonth } from '../public/js/rivals.js';
import { orderUnits, unitCost, leadTime, hwPrice } from '../public/js/hw.js';
import { makePerson } from '../public/js/core.js';
import { fmtNum, fmtMoney } from '../public/js/util.js';
import { secLevel, attackSurface, yearlyAttacks } from '../public/js/security.js';
import { storeCut, platformDemand, MOBILE_SHARE, platformsMonth } from '../public/js/platforms.js';
import { relFx, relOf, relationsWeek } from '../public/js/relations.js';
import { EVENTS, deliverEvent } from '../public/js/events.js';
import { officeFx, birthdayOf, isBirthday, hasEffect, effectMult, addEffect, digest, flushDigest } from '../public/js/core.js';
import { botDay } from './bot.js';

const fresh = (seed = 1) => {
  const s = G.newGame({ seed });
  s.notes.length = 0;
  return s;
};
const step = (s, n) => {
  for (let i = 0; i < n; i++) {
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
  assert.ok(s.mail.some((m) => ['priceWar', 'rivalLawsuit', 'rivalPoach', 'rivalAd'].includes(m.type)) || s.news.some((n) => /actualización|comparándose/.test(n.text)), 'los rivales actúan');
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
  const cd = deliverEvent(s, 'cloudDown', {});
  assert.equal(cd.choices, null, 'un evento que solo informa no pide decisión');
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
// 8. Ciberseguridad.
{
  const s = fresh(11);
  s.money = 1e7;
  const p = quickProduct(s, 'blog', { landing: 1, articles: 1 });
  assert.ok(p.launched);
  p.users = 2000;
  assert.equal(attackSurface(s), 0, 'nadie ataca a una startup diminuta');
  p.users = 2e6;
  const base = secLevel(s);
  s.research.infosec = 0;
  const e = makePerson(s, 'security', { skill: 60 });
  s.employees.push(e);
  assert.ok(secLevel(s) > base + 15, 'investigación y especialistas suben la seguridad');
  assert.ok(yearlyAttacks(s) > 0);
  // Ransomware sin copias: 6 días caído; con copias, 1.
  const r = sendMail(s, 'secRansom', { pid: p.id, amount: 20000 });
  answerMail(s, r.id, r.choices.length - 1);
  assert.equal(p.down, 6);
  s.sec.backups = true;
  const r2 = sendMail(s, 'secRansom', { pid: p.id, amount: 20000 });
  answerMail(s, r2.id, r2.choices.length - 1);
  assert.equal(p.down, 1);
  // Filtración: avisar (la opción por defecto) cuesta reputación; ocultarla y que salga, mucho más.
  s.reputation = 50;
  const b = sendMail(s, 'secBreach', { pid: p.id, n: 1000 });
  answerMail(s, b.id, b.choices.length - 1);
  assert.equal(s.reputation, 46);
  s.sec.hidden = { pid: p.id, n: 1000, day: s.day + 1 };
  G.stepDay(s);
  G.stepDay(s);
  assert.ok(s.reputation <= 31, 'la filtración oculta sale a la luz');
}

// 9. Plataformas.
{
  const s = fresh(12);
  s.money = 1e7;
  for (const r of ['monetization', 'mobile', 'payments', 'webpay']) s.research[r] = 0;
  const p = quickProduct(s, 'blog', { landing: 1, articles: 1, subs: 1, mobile: 1 });
  p.users = 1e5;
  p.price = 5;
  const q = quickProduct(s, 'blog', { landing: 1, articles: 1, subs: 1 });
  q.users = 1e5;
  q.price = 5;
  assert.equal(storeCut(s, q), 0, 'sin app móvil no hay comisión');
  assert.ok(Math.abs(storeCut(s, p) - MOBILE_SHARE * 0.15) < 1e-9, 'programa para pequeños: 15%');
  const withApp = G.productRevenue(s, p).subs;
  const noApp = G.productRevenue(s, q).subs;
  assert.ok(withApp < noApp, 'la tienda se queda parte de las suscripciones');
  s.plat.webpay = true;
  assert.ok(Math.abs(storeCut(s, p) - MOBILE_SHARE * 0.15 * 0.5) < 1e-9, 'cobrar por la web reduce la comisión');
  p.storeBan = s.day + 10;
  assert.ok(platformDemand(s, p) < 0.7, 'expulsada de la tienda, menos demanda');
  const price = G.cloudPrice(s);
  s.plat.cloud = 1.2;
  assert.ok(Math.abs(G.cloudPrice(s) - price * 1.2) < 1e-9, 'la subida de la nube encarece la carga');
  const ban = sendMail(s, 'platBan', { pid: p.id, why: 'webpay' });
  answerMail(s, ban.id, ban.choices.length - 1);
  assert.equal(s.plat.webpay, false);
  assert.equal(p.storeBan, s.day + 3);
}

// 10. Relaciones entre empleados.
{
  const s = fresh(13);
  const a = makePerson(s, 'dev', { skill: 45, traits: [] });
  const b = makePerson(s, 'dev', { skill: 45, traits: [] });
  a.desk = 1;
  b.desk = 2;
  a.assign = b.assign = null;
  s.employees.push(a, b);
  s.rel.push({ a: a.id, b: b.id, v: -60, kind: 'rival', since: 0 });
  const fx = relFx(s);
  assert.ok(fx.get(a.id).mood < 0 && fx.get(a.id).prod < 0, 'los roces bajan ánimo y productividad');
  const m = sendMail(s, 'relRival', { a: a.id, b: b.id });
  answerMail(s, m.id, 0);
  assert.equal(relOf(s, a.id, b.id).kind, null, 'separarlos calma las cosas');
  assert.equal(b.desk, 3, 'se va a la mesa libre más lejana');
  // Mentoría: un senior adopta a un junior y le hace aprender más rápido.
  const j = makePerson(s, 'dev', { skill: 12, traits: [] });
  const sr = makePerson(s, 'dev', { skill: 80, traits: [] });
  s.employees.push(j, sr);
  for (let w = 0; w < 60 && !j.mentor; w++) relationsWeek(s);
  assert.ok(j.mentor, 'aparece una mentoría');
  // Bajas por agotamiento tras muchos días sin energía.
  const t = makePerson(s, 'dev', { skill: 40, traits: ['fragile'] });
  t.desk = 0;
  s.employees.push(t);
  s.policies.crunch = true;
  s.money = 1e9;
  for (let d = 0; d < 300 && t.offReason !== 'Baja por agotamiento'; d++) {
    t.energy = 5;
    G.stepDay(s);
    s.notes.length = 0;
  }
  assert.equal(t.offReason, 'Baja por agotamiento');
}

// 11. Estilos y eventos de oficina.
{
  const s = fresh(14);
  s.money = 1e6;
  const before = s.money;
  assert.equal(G.buyStyle(s, 'zen').ok, true);
  assert.equal(s.office.style, 'zen');
  assert.equal(before - s.money, 6000);
  G.clearStyle(s);
  assert.equal(G.buyStyle(s, 'zen').ok, true);
  assert.equal(before - s.money, 6000, 'un estilo comprado se vuelve a poner gratis');
  s.employees.push(makePerson(s, 'dev'), makePerson(s, 'design'));
  s.day = 340;
  assert.ok(EVENTS.xmas.weight(s) > 0, 'en diciembre toca fiesta de Navidad');
  const xm = deliverEvent(s, 'xmas', EVENTS.xmas.setup(s));
  const mood = s.employees[1].mood;
  answerMail(s, xm.id, 0);
  assert.ok(officeFx(s, 'xmasParty') && s.employees[1].mood > mood);
  assert.equal(EVENTS.xmas.weight(s), 0, 'solo una vez al año');
  const bo = deliverEvent(s, 'blackout', {});
  assert.ok(officeFx(s, 'blackout'), 'el apagón pasa en cuanto llega el aviso');
  answerMail(s, bo.id, 0);
  assert.equal(s.office.generator, true);
  assert.ok(EVENTS.blackout.weight(s) < 0.5, 'con generador, los apagones importan menos');
}

// 12. Los eventos no paran la partida y no hacen nada drástico solos.
{
  const s = fresh(15);
  s.money = 1e8;
  const offer = deliverEvent(s, 'buyout', { amount: 1e9 });
  assert.ok(offer.choices, 'la oferta de compra pide una decisión');
  const day = s.day;
  step(s, 31);
  assert.equal(s.day, day + 31, 'el tiempo sigue corriendo con eventos pendientes');
  assert.ok(!s.gameOver, 'si no contestas, la empresa no se vende');
  assert.equal(offer.done, 0);
  // Una partida guardada con un evento a medias lo recibe por correo.
  s.event = { id: 'viral', ctx: { pid: -1 } };
  G.stepDay(s);
  assert.equal(s.event, null);
  assert.equal(s.mail[0].type, 'event');
  // La ola de calor empieza al llegar y el aire acondicionado la corta.
  const hw = deliverEvent(s, 'heatwave', {});
  assert.ok(hasEffect(s, 'heat'));
  answerMail(s, hw.id, 0);
  assert.ok(!hasEffect(s, 'heat'), 'con aire acondicionado se acaba el calor');
}

// 13. Cada persona cumple años una vez al año, en su fecha.
{
  const s = fresh(16);
  for (let i = 0; i < 30; i++) s.employees.push(makePerson(s, 'dev'));
  const old = makePerson(s, 'dev');
  delete old.bday;
  s.employees.push(old);
  const b = birthdayOf(old);
  assert.deepEqual(birthdayOf(old), b, 'sin fecha guardada, siempre la misma');
  const count = new Map();
  for (let d = 0; d < 365; d++) {
    s.day += 1;
    for (const e of s.employees) if (isBirthday(s, e)) count.set(e.id, (count.get(e.id) || 0) + 1);
  }
  const leap = (e) => birthdayOf(e).m === 1 && birthdayOf(e).d === 29;
  for (const e of s.employees) if (!leap(e)) assert.equal(count.get(e.id), 1, `${e.name} cumple una vez al año`);
  assert.ok(!Object.keys(EVENTS).includes('birthday'), 'ya no hay cumpleaños aleatorios');
}

assert.equal(fmtNum(999999), '1M');
assert.equal(fmtNum(999.7), '1k');
assert.equal(fmtMoney(999.6e6), '$1B');
assert.equal(fmtNum(12345), '12.3k');

console.log('OK');

// 14. Errores corregidos: días de efectos y caídas, nube, tiendas, oficinas.
{
  const s = fresh(17);
  s.money = 1e9;
  // Un efecto de 1 día se nota al día siguiente.
  addEffect(s, 'prueba', 1, { prod: 0.5 });
  G.stepDay(s);
  assert.equal(effectMult(s, 'prod'), 0.5, 'el efecto de un día se aplica');
  G.stepDay(s);
  assert.equal(effectMult(s, 'prod'), 1, 'y se acaba');
  // Un día de caída cuesta un día de ingresos.
  s.research.monetization = 1;
  const p = quickProduct(s, 'blog', { landing: 1, articles: 1, subs: 1 });
  p.price = 5;
  p.users = 50000;
  G.stepDay(s);
  assert.ok(p.rev.total > 0);
  p.down = 1;
  G.stepDay(s);
  assert.equal(p.rev.total, 0, 'caído, no ingresa');
  assert.equal(p.down, 0);
  // El compromiso con la nube se paga por adelantado y se descuenta.
  s.plat.prepaid = 100000;
  s.infra.cloud = true;
  G.stepDay(s);
  assert.ok(s.plat.prepaid < 100000, 'lo pagado por adelantado se va gastando');
  // La comisión del 15% ganada en la denuncia es para siempre.
  s.plat.fee = 0.15;
  s.plat.webpayFree = true;
  p.features.mobile = 1;
  for (let i = 0; i < 400; i++) platformsMonth(s);
  assert.equal(s.plat.fee, 0.15);
  // La isla privada necesita el programa espacial.
  s.office.tier = OFFICES.findIndex((o) => o.id === 'campus');
  assert.equal(G.moveOffice(s, OFFICES.findIndex((o) => o.id === 'island')).ok, false);
  // Las copias que cuentan en un secuestro son las que había al llegar.
  s.sec.backups = false;
  const rm = sendMail(s, 'secRansom', { pid: p.id, amount: 20000, backups: false });
  s.sec.backups = true;
  answerMail(s, rm.id, 2);
  assert.equal(p.down, 6, 'activar las copias después no sirve');
  // Pagar sin dinero lo dice claramente.
  s.money = 100;
  p.down = 0;
  const rm2 = sendMail(s, 'secRansom', { pid: p.id, amount: 50000, backups: false });
  assert.match(answerMail(s, rm2.id, 0).msg, /No tienes/);
  // Dos filtraciones ocultas se suman.
  s.sec.hidden = null;
  s.money = 1e9;
  for (const n of [100000, 10]) {
    const b = sendMail(s, 'secBreach', { pid: p.id, n });
    const was = s.sec.hidden?.n || 0;
    while ((s.sec.hidden?.n || 0) === was) {
      b.done = null;
      answerMail(s, b.id, 0);
    }
  }
  assert.ok(s.sec.hidden.n >= 100010, 'la filtración grande no desaparece');
  // Dos juniors con el rasgo Mentor no se enseñan entre ellos.
  s.employees = s.employees.slice(0, 1);
  const j1 = makePerson(s, 'dev', { skill: 15, traits: ['mentor'] });
  const j2 = makePerson(s, 'dev', { skill: 15, traits: ['mentor'] });
  s.employees.push(j1, j2);
  for (let w = 0; w < 40; w++) relationsWeek(s);
  assert.ok(!j1.mentor && !j2.mentor, 'un junior no hace de mentor');
}

// 15. Ritmo: plazos largos, pausa opcional, resumen semanal y rivales con calma.
{
  const s = fresh(18);
  s.money = 1e8;
  assert.equal(mailDeadline(3), 14, 'nunca menos de dos semanas');
  assert.equal(mailDeadline(14), 30, 'nunca más de un mes');
  const e = makePerson(s, 'dev', { skill: 60 });
  s.employees.push(e);
  const m = sendMail(s, 'raise', { eid: e.id });
  assert.equal(m.expires - s.day, 25);
  // Una decisión grave pausa el juego solo si la opción está activada.
  const offer = deliverEvent(s, 'buyout', { amount: 1e9 });
  assert.equal(offer.critical, true);
  assert.equal(s.pauseFor, undefined, 'con la opción apagada no se pausa');
  s.settings.pauseCritical = true;
  const again = deliverEvent(s, 'buyout', { amount: 1e9 });
  assert.equal(s.pauseFor, again.id);
  assert.equal(sendMail(s, 'raise', { eid: e.id }).critical, false, 'un aumento no es grave');
  // Los avisos menores salen juntos una vez por semana.
  s.notes.length = 0;
  digest(s, 'promo', '🎉 A asciende a Mid.');
  flushDigest(s);
  assert.equal(s.notes.pop().text, '🎉 A asciende a Mid.', 'uno solo se cuenta tal cual');
  digest(s, 'promo', 'x');
  digest(s, 'promo', 'y');
  digest(s, 'feature', 'z');
  flushDigest(s);
  assert.match(s.notes.pop().text, /Esta semana: 🎉 2 ascensos · 📦 1 función terminada/);
  flushDigest(s);
  assert.equal(s.notes.length, 0, 'sin novedades no hay resumen');
  // Un año de juego con el bot: unas 30–60 decisiones, no 75.
  const b = G.newGame({ seed: 7919 });
  let decisions = 0;
  for (let d = 0; d < 365 * 2; d++) {
    botDay(b);
    const before = new Set(b.mail.map((x) => x.id));
    G.stepDay(b);
    b.notes.length = 0;
    if (d >= 365) decisions += b.mail.filter((x) => !before.has(x.id) && x.choices).length;
  }
  assert.ok(decisions <= 45, `demasiadas decisiones en el segundo año: ${decisions}`);
}

