// Productos físicos: se diseñan como cualquier producto, pero para vender
// hay que fabricar lotes (que tardan en llegar), gestionar el stock y fijar
// el precio. Las devoluciones dependen de la calidad.
import { CATEGORIES, FEATURES, HW_PRICES } from './data.js';
import { fmtMoney, fmtNum } from './util.js';
import { has, findProduct, notify, money } from './core.js';
import { share, satisfaction, quality, potential, coreDone } from './sim.js';
import { seasonDemand } from './world.js';
import { warFx } from './rivals.js';

export const isHW = (p) => CATEGORIES[p.cat].kind === 'hw';
export const leadTime = (s) => (has(s, 'factory') ? 18 : 30);
export const hwPrice = (p) => Math.round(CATEGORIES[p.cat].ref * (p.priceMult ?? 1));

export function unitCost(s, p) {
  let m = 1;
  for (const [k, l] of Object.entries(p.features)) if (FEATURES[k].unit) m += FEATURES[k].unit * l;
  if (has(s, 'factory')) m *= 0.85;
  if (p.sold > 1e6) m *= 0.8;
  else if (p.sold > 1e5) m *= 0.9;
  return Math.round(CATEGORIES[p.cat].unit * m);
}

// Unidades que la gente querría comprar hoy (sin contar el stock).
export function hwDemand(s, p) {
  if (!p.launched) return 0;
  const sat = satisfaction(s, p);
  const annual = potential(s, p) * share(s, p) * (0.12 + 0.88 * p.awareness) * (0.35 + 0.65 * sat);
  const priceF = Math.pow(1 / (p.priceMult ?? 1), 1.6);
  return (annual / 365) * priceF * seasonDemand(s, p.cat) * warFx(s, p).target * (p.antitrust > s.day ? 0.8 : 1);
}

export const incoming = (p) => (p.orders || []).reduce((a, o) => a + o.qty, 0);

// Paso diario de un producto físico. Devuelve el margen del día.
export function hwStep(s, p) {
  const arrived = p.orders.filter((o) => o.arrive <= s.day);
  if (arrived.length) {
    const qty = arrived.reduce((a, o) => a + o.qty, 0);
    p.stock += qty;
    p.orders = p.orders.filter((o) => o.arrive > s.day);
    notify(s, `🚚 Llegan ${fmtNum(qty)} unidades de ${p.name}.`, 'good');
  }
  if (!p.launched) return 0;
  const demand = hwDemand(s, p);
  const sold = Math.min(p.stock, demand);
  p.stock -= sold;
  const returns = sold * (1 - quality(p)) * 0.15;
  const price = hwPrice(p);
  const cost = unitCost(s, p);
  const revenue = (sold - returns) * price;
  money(s, revenue, 'hardware');
  p.sold += sold - returns;
  p.demand = demand;
  p.lost = Math.max(0, demand - sold);
  if (p.lost > 1 && !p.stockout) {
    p.stockout = true;
    notify(s, `📦 ¡Sin stock de ${p.name}! Estás perdiendo ventas: fabrica más.`, 'bad');
  } else if (p.stock > demand) p.stockout = false;
  if (p.lost > 1) p.awareness *= 0.999;
  // Dispositivos en uso: se retiran poco a poco (unos 3 años de vida).
  p.users = p.users * 0.999 + sold - returns;
  const lvl = p.features.appstore || 0;
  const store = lvl ? p.users * 0.0006 * (CATEGORIES[p.cat].monet.store || 0) * (1 + 0.3 * (lvl - 1)) : 0;
  money(s, store, 'store');
  money(s, (-p.stock * cost * 0.01) / 30, 'storage');
  p.rev = { hw: revenue, store, total: revenue + store, units: sold - returns, ads: 0, subs: 0, tx: 0, api: 0, premium: 0 };
  return (sold - returns) * (price - cost) + store;
}

export function orderUnits(s, pid, qty) {
  const p = findProduct(s, pid);
  if (!p || !isHW(p)) return { ok: false };
  if (!coreDone(p)) return { ok: false, msg: 'Termina primero el diseño básico del producto.' };
  const cost = qty * unitCost(s, p);
  if (s.money < cost) return { ok: false, msg: `Fabricar ${fmtNum(qty)} unidades cuesta ${fmtMoney(cost)}.` };
  money(s, -cost, 'manufacturing');
  p.orders.push({ qty, arrive: s.day + leadTime(s), cost });
  return { ok: true, msg: `🏭 Pedido de ${fmtNum(qty)} unidades: llegan en ${leadTime(s)} días.` };
}

export function setHwPrice(s, pid, mult) {
  const p = findProduct(s, pid);
  if (!p || !isHW(p) || !HW_PRICES.includes(mult)) return { ok: false };
  p.priceMult = mult;
  return { ok: true };
}

