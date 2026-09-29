// Clientes empresa (B2B). Con la investigación Ventas B2B, de vez en cuando
// una empresa se interesa por uno de tus productos: pide ciertas funciones,
// un acuerdo de nivel de servicio (días caído al año como mucho) y paga una
// cuota anual. Los comerciales traen más clientes y cierran más ventas. Al
// cabo de un año renuevan solos, salvo que hayas incumplido lo pactado.
import { B2B_FIT, B2B_SIZES, B2B_REQS, B2B_CLIENTS, FEATURES, RESEARCH_BY_ID } from './data.js';
import { clamp, chance, rnd, rint, pick, fmtMoney, fmtPct } from './util.js';
import { uid, has, findProduct, notify, news, money, digest } from './core.js';
import { teamPowers, quality, featureAvailable, featureUnlocked } from './sim.js';
import { isHW } from './hw.js';

const fail = (msg = '') => ({ ok: false, msg });
const MAX_LEADS = 3;

export const b2bFit = (p) => (isHW(p) ? 0 : B2B_FIT[p.cat] ?? 0);
const candidates = (s) => s.products.filter((p) => p.launched && b2bFit(p) > 0.1 && p.down <= 0);

// Probabilidad de cerrar la venta.
export function winChance(s, lead) {
  const p = findProduct(s, lead.pid);
  if (!p) return 0;
  const size = { small: 0.15, mid: 0, corp: -0.1 }[lead.size];
  return clamp(0.2 + teamPowers(s).sales * 0.07 + (quality(p) - 0.7) * 0.8 + s.reputation / 250 + size, 0.05, 0.9);
}

export const missingReqs = (s, lead) => {
  const p = findProduct(s, lead.pid);
  return p ? lead.reqs.filter((f) => !p.features[f]) : lead.reqs;
};

// Cuota diaria de todos los clientes activos (cuenta en el MRR).
export const b2bDaily = (s) => (s.b2b?.deals || []).reduce((a, d) => a + d.value / 365, 0);

function newLead(s) {
  const list = candidates(s);
  if (!list.length) return;
  let r = list.reduce((a, p) => a + b2bFit(p), 0) * rnd(s);
  let p = list[0];
  for (const x of list) {
    r -= b2bFit(x);
    if (r <= 0) {
      p = x;
      break;
    }
  }
  const size = s.reputation >= 40 && p.users >= 1e5 && chance(s, 0.3) ? 'corp' : (s.reputation >= 20 || p.users >= 1e4) && chance(s, 0.5) ? 'mid' : 'small';
  const Z = B2B_SIZES[size];
  const opts = B2B_REQS.filter((f) => featureAvailable(s, p, f));
  const reqs = [];
  while (reqs.length < Math.min(Z.reqs, opts.length)) {
    const f = pick(s, opts);
    if (!reqs.includes(f)) reqs.push(f);
  }
  const taken = new Set([...s.b2b.leads, ...s.b2b.deals].map((x) => x.client));
  const client = pick(s, B2B_CLIENTS.filter((c) => !taken.has(c))) || pick(s, B2B_CLIENTS);
  const value = Math.round((rint(s, Z.value[0], Z.value[1]) * (0.8 + quality(p) * 0.4)) / 1000) * 1000;
  s.b2b.leads.push({ id: uid(s), client, size, pid: p.id, value, sla: Z.sla, reqs, expires: s.day + 45, state: 'open', resolve: 0 });
  digest(s, 'b2bLead', `🏢 ${client} se interesa por ${p.name}: ${fmtMoney(value)} al año. Mira Contratos.`);
}

export function b2bDay(s) {
  if (!s.b2b) s.b2b = { leads: [], deals: [], next: s.day + 30, won: 0, lost: 0 };
  const B = s.b2b;
  // Oportunidades nuevas: más a menudo con más comerciales.
  if (has(s, 'sales101') && s.day >= B.next) {
    B.next = s.day + Math.round(rint(s, 40, 70) / (1 + Math.min(2, teamPowers(s).sales * 0.1)));
    if (B.leads.length < MAX_LEADS) newLead(s);
  }
  for (const l of [...B.leads]) {
    if (!findProduct(s, l.pid)) {
      B.leads = B.leads.filter((x) => x !== l);
      continue;
    }
    if (l.state === 'open' && s.day >= l.expires) B.leads = B.leads.filter((x) => x !== l);
    else if (l.state === 'talks' && s.day >= l.resolve) closeLead(s, l);
  }
  for (const d of [...B.deals]) {
    const p = findProduct(s, d.pid);
    if (!p) {
      B.deals = B.deals.filter((x) => x !== d);
      notify(s, `🏢 ${d.client} cancela el contrato: ya no existe ${d.product}.`, 'bad');
      continue;
    }
    money(s, d.value / 365, 'b2b');
    if (p.down > 0) {
      d.down += 1;
      if (d.down > d.sla) slaBreach(s, d, p);
    }
    if (s.day >= d.end) renew(s, d);
  }
}

function closeLead(s, l) {
  const B = s.b2b;
  B.leads = B.leads.filter((x) => x !== l);
  const p = findProduct(s, l.pid);
  if (!chance(s, winChance(s, l))) {
    B.lost += 1;
    digest(s, 'b2bLost', `🏢 ${l.client} ha elegido a otro proveedor. Más comerciales y más calidad ayudan.`);
    return;
  }
  B.won += 1;
  B.deals.push({ id: l.id, client: l.client, size: l.size, pid: l.pid, product: p.name, value: l.value, sla: l.sla, start: s.day, end: s.day + 365, down: 0, breaches: 0 });
  news(s, `🤝 ${l.client} confía en ${p.name}.`, 'good');
  digest(s, 'b2bWon', `🤝 ¡Venta cerrada! ${l.client} paga ${fmtMoney(l.value)} al año por ${p.name}.`);
}

// Fin del año de contrato: casi siempre renuevan; tras una penalización, la mitad.
function renew(s, d) {
  if (chance(s, d.breaches ? 0.5 : 0.9)) {
    d.end = s.day + 365;
    d.breaches = 0;
    d.down = 0;
    digest(s, 'b2bRenew', `🤝 ${d.client} renueva un año más (${fmtMoney(d.value)}).`);
    return;
  }
  s.b2b.deals = s.b2b.deals.filter((x) => x !== d);
  notify(s, `🏢 ${d.client} no renueva su contrato de ${d.product}.`, 'bad');
}

// Más días caído de los pactados: penalización y, a la segunda, adiós.
function slaBreach(s, d, p) {
  d.down = 0;
  d.breaches += 1;
  const penalty = Math.round((d.value * 0.1) / 1000) * 1000;
  money(s, -penalty, 'b2b');
  s.reputation = Math.max(0, s.reputation - 1);
  if (d.breaches >= 2) {
    s.b2b.deals = s.b2b.deals.filter((x) => x !== d);
    notify(s, `🏢 ${d.client} rompe el contrato por las caídas de ${p.name}. Penalización: ${fmtMoney(penalty)}.`, 'bad');
    news(s, `${d.client} abandona ${p.name} por sus caídas de servicio.`, 'bad');
  } else notify(s, `⚠️ ${p.name} ha superado los días caído pactados con ${d.client}: penalización de ${fmtMoney(penalty)}. A la próxima, se van.`, 'bad');
}

// ---------------------------------------------------------------- acciones

export function pitchLead(s, id) {
  const l = s.b2b?.leads.find((x) => x.id === id);
  if (!l || l.state !== 'open') return fail();
  const miss = missingReqs(s, l);
  if (miss.length) return fail(`Antes necesitas: ${miss.map((f) => FEATURES[f].name).join(', ')}.`);
  l.state = 'talks';
  l.resolve = s.day + rint(s, 7, 14);
  return { ok: true, msg: `📨 Propuesta enviada a ${l.client}. Responderán en unos días (${fmtPct(winChance(s, l))} de cerrarla).` };
}

export function dropLead(s, id) {
  if (!s.b2b) return fail();
  s.b2b.leads = s.b2b.leads.filter((x) => x.id !== id);
  return { ok: true, msg: 'Oportunidad descartada.' };
}

// Lo que falta para cumplir un requisito, dicho de forma útil.
export function reqHint(s, p, f) {
  if (p.features[f]) return '✅';
  if (!featureUnlocked(s, f)) return `🔒 ${RESEARCH_BY_ID[FEATURES[f].research].name}`;
  return '❌';
}
