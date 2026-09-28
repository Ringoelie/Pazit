// Motor del juego: cálculos derivados, acciones del jugador y el paso diario.
// No toca el DOM, así que también se puede ejecutar en Node para pruebas.
import {
  ROLES, HIRABLE, MAKERS, OFFICES, PERKS, POLICIES, FEATURES, CATEGORIES, RESEARCH, RESEARCH_BY_ID,
  CAMPAIGNS, ROUNDS, CLIENTS, JOBS, QUESTS, ACHIEVEMENTS, MAX_FEATURE_LEVEL, LEVEL_COST, LEVEL_APPEAL,
  PREMIUM_PRICES, STARTUP_SUFFIX, PRODUCT_NAMES, REGIONS, UNIVERSAL_WEIGHT,
} from './data.js';
import { rnd, rint, rfloat, pick, chance, gauss, clamp, dateOf, fmtMoney, fmtNum, MONTHS } from './util.js';
import {
  uid, has, officeOf, findEmp, findProduct, notify, news, money, effectMult, addEffect, levelOf,
  expectedSalary, makeLooks, makePerson, perkStats,
} from './core.js';
import { EVENTS } from './events.js';
import { defaultLayout, addItem, canPlace, getRef, snapPos, deskEffects, itemDef } from './layout.js';
import { sendMail, mailStep } from './mail.js';
import { worldDay, seasonDemand, seasonTx, regionMarket, regionArpu, regionRent, regionStaff } from './world.js';
import { ensureRivals, rivalMonth, onShip, warFx } from './rivals.js';
import { isHW, hwStep } from './hw.js';

export { has, officeOf, findEmp, findProduct, perkStats, expectedSalary, levelOf };

const RACK_COST = 5000;
const RACK_UPKEEP = 150;
const RACK_UNITS = 40;
const CLOUD_PRICE = 12;
const LOAN_RATE = 0.012;
const MAX_PRODUCTS = 5;
const MAX_QUEUE = 8;
const MAX_ACTIVE_CONTRACTS = 3;
const INVESTORS = [
  'Pixel Ventures', 'Andreessen Hormigas', 'Secuoya Capital', 'Y Combinado', 'Tiburones Angels',
  'SoftBanco', 'Fondo Unicornio', 'Capital Cohete', 'Index Ventures-ish', 'Lince Partners',
];
const FLOORS = { angel: 3e5, seed: 1.5e6, a: 8e6, b: 4e7, c: 2e8, ipo: 1e9 };

// ---------------------------------------------------------------- partida nueva

export function newGame({ company = 'Mi Startup', founder = 'Alex', looks = null, seed } = {}) {
  const s = {
    v: 1,
    rng: seed ?? (Math.random() * 2 ** 31) | 0,
    company,
    day: 0,
    money: 25000,
    rp: 0,
    reputation: 5,
    equity: 100,
    speed: 1,
    nextId: 1,
    employees: [],
    candidates: [],
    candidatesDay: 0,
    products: [],
    contracts: { offers: [], active: [], next: 3, failed: 0 },
    research: {},
    office: { tier: 0, perks: {}, layout: defaultLayout(0, {}, { fixtures: true }) },
    policies: {},
    infra: { cloud: true, racks: 0, outages: 0 },
    competitors: [],
    mail: [],
    nextMailDay: 12,
    regions: {},
    laws: {},
    campaigns: [],
    ledger: { month: { inc: {}, exp: {} }, last: null },
    rev30: [],
    history: [],
    loans: [],
    funding: { round: 0, offer: null, cooldown: 0, raised: 0, ipo: false, sentiment: 1, lastIssue: -999 },
    effects: [],
    event: null,
    nextEventDay: 30,
    quests: {},
    achievements: {},
    stats: { contractsDone: 0, revenue: 0, peakUsers: 0, shipped: 0, acquired: 0, breaches: 0, soldShares: false },
    news: [],
    notes: [],
    redDays: 0,
    gameOver: null,
    settings: { sound: true },
  };
  const f = makePerson(s, 'founder', { skill: 45, traits: [] });
  f.name = founder;
  f.mood = 85;
  f.energy = 100;
  if (looks) f.looks = { ...f.looks, ...looks };
  f.desk = 0;
  s.employees.push(f);
  for (const [cat, def] of Object.entries(CATEGORIES)) {
    for (const [name, appeal] of def.rivals) s.competitors.push(makeCompetitor(s, cat, name, appeal));
  }
  ensureRivals(s);
  refreshCandidates(s);
  s.contracts.offers.push(makeContract(s), makeContract(s));
  sendMail(s, 'welcome');
  s.notes.length = 0;
  news(s, `${company} nace en un garaje. ¡Todo gran imperio empezó así!`, 'good');
  return s;
}

function makeCompetitor(s, cat, name, appeal) {
  return { id: uid(s), cat, name, appeal, users: 0, alive: true, since: s.day };
}

// ---------------------------------------------------------------- derivados

export const roleUnlocked = (s, role) => !ROLES[role].unlock || has(s, ROLES[role].unlock);
export const featureUnlocked = (s, f) => !FEATURES[f].research || has(s, FEATURES[f].research);
export const categoryUnlocked = (s, c) => !CATEGORIES[c].research || has(s, CATEGORIES[c].research);
export const isRemote = (e) => e.traits.includes('remote');
// Quien trabaja en remoto o en una sede extranjera no ocupa mesa en la sede.
export const atHQ = (e) => !isRemote(e) && !e.region;
export const onsite = (s) => s.employees.filter(atHQ).length;
export const freeDesks = (s) => officeOf(s).desks - onsite(s);
export const canWork = (e) => e.off <= 0;

export function teamPowers(s) {
  const p = { ops: 0, sales: 0, people: 0, legal: 0 };
  for (const e of s.employees) {
    if (e.off > 0) continue;
    if (e.role === 'devops') p.ops += e.skill / 50;
    else if (e.role === 'sales') p.sales += e.skill / 50;
    else if (e.role === 'hr') p.people += e.skill / 50;
    else if (e.role === 'legal') p.legal += e.skill / 50;
  }
  return p;
}
export const salesMult = (s, tp = teamPowers(s)) => 1 + Math.min(1, tp.sales * 0.06);
export const growthMult = (s) => (has(s, 'growth') ? 1.25 : 1);

export function productivity(s, e, ps = perkStats(s)) {
  let m = 0.7 + (0.6 * e.mood) / 100;
  m *= e.energy >= 50 ? 1 : 0.55 + (0.45 * e.energy) / 50;
  const t = e.traits;
  if (t.includes('tenx')) m *= 1.4;
  if (t.includes('perfectionist')) m *= 0.9;
  if (t.includes('remote')) m *= 0.9;
  if (t.includes('coffee')) m *= s.office.perks.coffee ? 1.2 : 0.85;
  if (t.includes('nightowl') && s.policies.flex) m *= 1.15;
  m *= 1 + ps.prod;
  if (s.policies.crunch) m *= 1.25;
  if (s.policies.fourday) m *= 0.85;
  const pt = ROLES[e.role].produces;
  if (s.policies.copilot && (pt === 'code' || pt === 'design' || pt === 'flex')) m *= 1.2;
  if ((pt === 'code' || pt === 'flex') && has(s, 'frameworks')) m *= 1.1;
  if (pt === 'design' && has(s, 'designsystem')) m *= 1.1;
  if (has(s, 'agi')) m *= 1.5;
  if (!s.office.perks.ac) m *= effectMult(s, 'heat');
  m *= effectMult(s, 'prod');
  m *= 1 - deskFx(s, e).noise;
  return m;
}

// Efectos del sitio donde se sienta alguien: decoración cercana y ruido.
export function deskFx(s, e) {
  if (e.desk == null || isRemote(e)) return { comfort: 0, noise: 0 };
  return deskEffects(s.office.layout, e.desk);
}

// El plano pertenece a una oficina concreta; si no cuadra, se regenera.
export function ensureLayout(s) {
  const L = s.office.layout;
  if (!L || L.tier !== s.office.tier || L.desks.length !== officeOf(s).desks) {
    s.office.layout = defaultLayout(s.office.tier, s.office.perks, { fixtures: s.office.tier === 0 && !L });
  }
  return s.office.layout;
}
export const output = (s, e, ps) => (e.skill / 10) * productivity(s, e, ps);

// ---- productos

export function featureCost(f, level) {
  const out = {};
  for (const [k, v] of Object.entries(FEATURES[f].cost)) out[k] = Math.round(v * LEVEL_COST ** (level - 1));
  return out;
}
export const costTotal = (c) => (c.code || 0) + (c.design || 0) + (c.ai || 0);

export function queuedLevel(p, f) {
  return (p.features[f] || 0) + p.queue.filter((t) => t.f === f).length;
}

export function quality(p) {
  return clamp(1 - p.bugs / (25 + p.invested * 0.05), 0.35, 1);
}

export function productAppeal(s, p) {
  const cat = CATEGORIES[p.cat];
  let a = 0;
  for (const [k, l] of Object.entries(p.features)) {
    const w = cat.features[k] ?? (FEATURES[k].universal ? UNIVERSAL_WEIGHT : 0);
    a += FEATURES[k].appeal * w * (1 + LEVEL_APPEAL * (l - 1));
  }
  return Math.max(1, a * (0.5 + 0.5 * quality(p)));
}

export function rivalsAppeal(s, cat, exceptPid = null) {
  let sum = 0;
  for (const c of s.competitors) if (c.alive && c.cat === cat) sum += c.appeal;
  for (const p of s.products) if (p.launched && p.cat === cat && p.id !== exceptPid) sum += productAppeal(s, p);
  return sum;
}

export function share(s, p) {
  const a = productAppeal(s, p);
  return a / (a + rivalsAppeal(s, p.cat, p.id));
}

export const marketGrowth = (s) => Math.pow(1.01, s.day / 30);

export function potential(s, p) {
  let bonus = 0;
  for (const [k, l] of Object.entries(p.features)) {
    const m = FEATURES[k].market;
    if (m) bonus += m * (1 + 0.2 * (l - 1));
  }
  return CATEGORIES[p.cat].market * marketGrowth(s) * (1 + bonus) * regionMarket(s, p);
}

export function satisfaction(s, p) {
  const f = p.features;
  let sat = 0.6;
  for (const [k, l] of Object.entries(f)) {
    const r = FEATURES[k].retention;
    if (r) sat += r * (1 + 0.3 * (l - 1));
  }
  sat += (quality(p) - 1) * 0.6;
  if (f.ads && p.ads) sat -= 0.04 + 0.012 * (f.ads - 1);
  if (f.subs && p.price > 0) sat -= 0.01 + 0.003 * p.price;
  if (p.down > 0) sat -= 0.25;
  sat -= (p.overload || 0) * 0.4;
  return clamp(sat, 0.05, 1);
}

export function premiumConversion(s, p, price = p.price, sat = satisfaction(s, p)) {
  if (!p.features.subs || price <= 0) return 0;
  const cat = CATEGORIES[p.cat];
  const conv = (0.025 * cat.monet.subs * sat * (1 + 0.12 * (p.features.subs - 1))) / Math.pow(price / 5, 1.1);
  return Math.min(0.35, conv) * warFx(s, p).conv;
}

const AI_FEATURES = ['recs', 'chatbot', 'voice', 'aigen'];
export const isAIProduct = (p) => AI_FEATURES.some((f) => p.features[f]);

// Ingresos diarios de un producto por fuente.
export function productRevenue(s, p, tp = teamPowers(s)) {
  const out = { ads: 0, subs: 0, tx: 0, api: 0, total: 0, premium: 0 };
  if (isHW(p)) return p.rev || out;
  if (!p.launched || p.down > 0) return out;
  const cat = CATEGORIES[p.cat];
  const f = p.features;
  const mult = salesMult(s, tp) * (1 + (f.analytics ? FEATURES.analytics.revenue * f.analytics : 0)) * effectMult(s, 'econ') * regionArpu(s, p) * warFx(s, p).rev;
  if (f.ads && p.ads) out.ads = p.users * 0.0012 * cat.monet.ads * (1 + 0.3 * (f.ads - 1)) * effectMult(s, 'ads');
  if (f.subs && p.price > 0) {
    out.premium = p.users * premiumConversion(s, p);
    out.subs = (out.premium * p.price) / 30;
  }
  let tx = 0;
  if (f.payments) tx += 1 + 0.25 * (f.payments - 1);
  if (f.bank) tx += 1.2 + 0.3 * (f.bank - 1);
  if (tx) out.tx = p.users * 0.003 * cat.monet.tx * tx * seasonTx(s, p.cat);
  if (f.api) out.api = p.users * 0.0004 * cat.monet.api * (1 + 0.3 * (f.api - 1));
  out.ads *= mult;
  out.subs *= mult;
  out.tx *= mult;
  out.api *= mult;
  out.total = out.ads + out.subs + out.tx + out.api;
  return out;
}

// ---- infraestructura

export function loadMult(s, tp = teamPowers(s)) {
  let m = 1;
  if (has(s, 'containers')) m *= 0.8;
  if (has(s, 'edge')) m *= 0.8;
  if (has(s, 'quantum')) m *= 0.6;
  m *= 1 - Math.min(0.3, tp.ops * 0.03);
  return m;
}

export function productLoad(s, p, tp) {
  if (!p.launched) return 0;
  let fl = 0;
  for (const [k, l] of Object.entries(p.features)) {
    const ld = FEATURES[k].load;
    if (ld) fl += ld * (1 + 0.15 * (l - 1));
  }
  return (p.users / 1000) * CATEGORIES[p.cat].load * (1 + fl) * loadMult(s, tp);
}

export const totalLoad = (s, tp = teamPowers(s)) => s.products.reduce((a, p) => a + productLoad(s, p, tp), 0);
export function rackUnits(s) {
  let u = RACK_UNITS;
  if (has(s, 'containers')) u *= 1.5;
  if (has(s, 'edge')) u *= 1.5;
  if (has(s, 'quantum')) u *= 2;
  return u;
}
export const rackCapacity = (s) => s.infra.racks * rackUnits(s);
export const cloudPrice = (s) => CLOUD_PRICE * (has(s, 'edge') ? 0.7 : 1);
export const rackCoverage = (s, tp = teamPowers(s)) => Math.floor(tp.ops * 20) + 3;
export { RACK_COST, RACK_UPKEEP, RACK_UNITS };

export function infraStatus(s, tp = teamPowers(s)) {
  const load = totalLoad(s, tp);
  const cap = rackCapacity(s);
  const excess = Math.max(0, load - cap);
  const cloudUnits = s.infra.cloud ? excess : 0;
  const overload = !s.infra.cloud && load > 0 ? excess / load : 0;
  return {
    load, cap, excess, cloudUnits, overload,
    cloudMonthly: cloudUnits * cloudPrice(s),
    rackMonthly: s.infra.racks * RACK_UPKEEP,
    coverage: rackCoverage(s, tp),
  };
}

// ---- totales y finanzas

export const totalUsers = (s) => s.products.reduce((a, p) => a + (p.launched ? p.users : 0), 0);

export function dailyRevenue(s, tp = teamPowers(s)) {
  return s.products.reduce((a, p) => a + productRevenue(s, p, tp).total, 0);
}
// MRR = media de los últimos 30 días, para que una caída puntual no lo hunda.
export function mrr(s, tp) {
  const w = s.rev30;
  if (!w || !w.length) return dailyRevenue(s, tp) * 30;
  return (w.reduce((a, b) => a + b, 0) / w.length) * 30;
}
export const payroll = (s) => s.employees.reduce((a, e) => a + e.salary, 0);

export function policyMonthly(s) {
  let c = 0;
  for (const [id, on] of Object.entries(s.policies)) if (on && POLICIES[id].cost) c += POLICIES[id].cost * s.employees.length;
  return c;
}

export function monthlyCosts(s, tp = teamPowers(s)) {
  const inf = infraStatus(s, tp);
  const out = {
    salaries: payroll(s),
    rent: officeOf(s).rent,
    perks: perkStats(s).upkeep,
    cloud: inf.cloudMonthly,
    servers: inf.rackMonthly,
    policies: policyMonthly(s),
    regions: regionRent(s),
    interest: s.loans.reduce((a, l) => a + l.left * LOAN_RATE, 0),
  };
  out.total = Object.values(out).reduce((a, b) => a + b, 0);
  return out;
}

export function valuation(s, tp) {
  const m = mrr(s, tp);
  let v = m * 12 * 8 + totalUsers(s) * 4 + Math.max(0, s.money) + s.infra.racks * 2500 + Object.keys(s.research).length * 15000;
  if (s.funding.ipo) v *= s.funding.sentiment;
  return v;
}
export const netWorth = (s, v = valuation(s)) => (v * s.equity) / 100;

export function loanLimit(s) {
  const debt = s.loans.reduce((a, l) => a + l.left, 0);
  return Math.max(0, Math.round((20000 + mrr(s) * 6 + s.reputation * 1500) / 1000) * 1000 - debt);
}

export function roundReady(s) {
  const r = ROUNDS[s.funding.round];
  if (!r) return false;
  if (r.id === 'angel') return s.products.some((p) => p.launched);
  if (r.valuation) return valuation(s) >= r.valuation;
  return totalUsers(s) >= r.users || mrr(s) >= r.mrr;
}

export function competitorPrice(c) {
  return Math.max(2e6, c.users * 9 + c.appeal * 20000);
}

// ---------------------------------------------------------------- generadores

export function makeContract(s) {
  const scale = 1 + s.reputation / 18;
  const jobs = JOBS.filter((j) => !j.research || has(s, j.research));
  const job = pick(s, jobs);
  const total = Math.round(rint(s, 30, 90) * scale);
  const need = { code: 0, design: 0, ai: 0 };
  for (const [k, w] of Object.entries(job.mix)) need[k] = Math.max(1, Math.round(total * w));
  const tp = teamPowers(s);
  const pay = Math.round((total * rint(s, 55, 80) * (1 + scale * 0.08) * (1 + Math.min(0.6, tp.sales * 0.08))) / 50) * 50;
  return {
    id: uid(s),
    client: pick(s, CLIENTS),
    title: job.title,
    need,
    done: { code: 0, design: 0, ai: 0 },
    days: Math.ceil(total / (3.2 * Math.sqrt(scale))) + rint(s, 8, 16),
    pay,
    rep: 1 + Math.round(total / 60),
    expires: s.day + rint(s, 8, 15),
    deadline: 0,
  };
}

export function refreshCandidates(s) {
  const roles = HIRABLE.filter((r) => roleUnlocked(s, r));
  const tp = teamPowers(s);
  const n = Math.min(10, 4 + Math.floor(tp.people) + Math.floor(s.reputation / 25));
  const list = [];
  if (s.day < 60) list.push(makePerson(s, 'dev'), makePerson(s, 'design'));
  const weight = { dev: 3, design: 2, marketer: 1.2, research: 1.2 };
  while (list.length < n) {
    const total = roles.reduce((a, r) => a + (weight[r] || 1), 0);
    let x = rnd(s) * total;
    let role = roles[0];
    for (const r of roles) {
      x -= weight[r] || 1;
      if (x <= 0) {
        role = r;
        break;
      }
    }
    list.push(makePerson(s, role));
  }
  for (const id of Object.keys(s.regions)) {
    const n = rint(s, 1, 2);
    for (let i = 0; i < n; i++) list.push(makePerson(s, pick(s, roles), { region: id }));
  }
  s.candidates = list;
  s.candidatesDay = s.day;
}

function startupName(s) {
  const base = pick(s, PRODUCT_NAMES);
  return chance(s, 0.6) ? base + pick(s, STARTUP_SUFFIX) : base + ' ' + pick(s, ['Labs', 'AI', 'Pro', 'Go', 'X']);
}

// ---------------------------------------------------------------- acciones

const ok = (msg) => ({ ok: true, msg });
const fail = (msg) => ({ ok: false, msg });

export function hire(s, candId) {
  const c = s.candidates.find((x) => x.id === candId);
  if (!c) return fail('Ese candidato ya no está disponible.');
  if (c.region) {
    if (s.regions[c.region] == null) return fail('Ya no tienes sede en esa región.');
    if (regionStaff(s, c.region) >= REGIONS[c.region].cap) return fail(`La sede de ${REGIONS[c.region].name} está llena.`);
  } else if (!isRemote(c) && freeDesks(s) <= 0) return fail('No quedan escritorios libres. Múdate a una oficina más grande.');
  else if (isRemote(c) && s.employees.filter(isRemote).length >= officeOf(s).desks) {
    return fail('Demasiado personal remoto para coordinarlo desde esta oficina.');
  }
  const fee = Math.round(c.salary * 0.5);
  if (s.money < fee) return fail(`Necesitas ${fmtMoney(fee)} para la contratación.`);
  money(s, -fee, 'hiring');
  s.candidates = s.candidates.filter((x) => x !== c);
  c.hired = s.day;
  c.mood = 75;
  if (atHQ(c)) c.desk = firstFreeDesk(s);
  s.employees.push(c);
  autoAssign(s, c);
  return ok(`¡${c.name} se une al equipo como ${ROLES[c.role].name}!`);
}

function firstFreeDesk(s) {
  const used = new Set(s.employees.filter(atHQ).map((e) => e.desk));
  for (let i = 0; i < 999; i++) if (!used.has(i)) return i;
  return 0;
}

// Asigna a un recién llegado a lo más lógico para no dejarle mirando el techo.
function autoAssign(s, e) {
  const produces = ROLES[e.role].produces;
  if (MAKERS.includes(e.role)) {
    const c = s.contracts.active[0];
    const p = s.products.find((x) => x.queue.length) || s.products[0];
    if (p) e.assign = 'p:' + p.id;
    else if (c) e.assign = 'c:' + c.id;
  } else if (produces === 'hype' || produces === 'lead') {
    const p = s.products.find((x) => x.launched) || s.products[0];
    e.assign = p ? 'p:' + p.id : produces === 'hype' ? 'brand' : null;
  }
}

export function assignTargets(s, e) {
  const out = [];
  const role = e.role;
  if (MAKERS.includes(role) || role === 'marketer' || role === 'pm') {
    for (const p of s.products) out.push({ v: 'p:' + p.id, label: `📦 ${p.name}` });
  }
  if (MAKERS.includes(role)) {
    for (const c of s.contracts.active) out.push({ v: 'c:' + c.id, label: `📝 ${c.title} (${c.client})` });
  }
  if (role === 'founder') out.push({ v: 'rd', label: '🔬 Investigación' });
  if (role === 'marketer') out.push({ v: 'brand', label: '✨ Marca de empresa' });
  return out;
}
export const isAssignable = (e) => MAKERS.includes(e.role) || e.role === 'marketer' || e.role === 'pm';

export function assign(s, empId, target) {
  const e = findEmp(s, empId);
  if (!e) return fail('Empleado no encontrado.');
  e.assign = target || null;
  return ok();
}

export function assignIdle(s, target) {
  let n = 0;
  const onProduct = target.startsWith('p:');
  for (const e of s.employees) {
    if (e.assign) continue;
    if (MAKERS.includes(e.role) || (onProduct && (e.role === 'marketer' || e.role === 'pm'))) {
      e.assign = target;
      n++;
    }
  }
  return n ? ok(`${n} ${n === 1 ? 'persona asignada' : 'personas asignadas'}.`) : fail('No hay nadie libre. Cambia asignaciones en la pestaña Equipo.');
}

export function fire(s, empId) {
  const e = findEmp(s, empId);
  if (!e || e.role === 'founder') return fail('No puedes despedirte a ti mismo.');
  money(s, -e.salary, 'salaries');
  s.employees = s.employees.filter((x) => x !== e);
  for (const o of s.employees) o.mood = Math.max(0, o.mood - 3);
  return ok(`${e.name} ha sido despedido/a. Indemnización: ${fmtMoney(e.salary)}.`);
}

export function raise(s, empId) {
  const e = findEmp(s, empId);
  if (!e || e.role === 'founder') return fail('No aplica.');
  const next = Math.max(Math.round((e.salary * 1.08) / 50) * 50, expectedSalary(e, s));
  e.salary = next;
  e.mood = Math.min(100, e.mood + 12);
  e.unhappy = 0;
  return ok(`${e.name} ahora cobra ${fmtMoney(next)}/mes. ¡Está encantado/a!`);
}

export const trainCost = (e) => 800 + e.skill * 50;
export function train(s, empId) {
  const e = findEmp(s, empId);
  if (!e) return fail('Empleado no encontrado.');
  if (e.off > 0) return fail(`${e.name} no está disponible ahora.`);
  if (e.skill >= 100) return fail('Ya está al máximo.');
  const cost = trainCost(e);
  if (s.money < cost) return fail(`La formación cuesta ${fmtMoney(cost)}.`);
  money(s, -cost, 'training');
  e.skill = Math.min(100, e.skill + rint(s, 3, 6));
  e.off = 3;
  e.offReason = 'Formación';
  return ok(`${e.name} se va 3 días a un bootcamp.`);
}

export function acceptContract(s, id) {
  const c = s.contracts.offers.find((x) => x.id === id);
  if (!c) return fail('Esa oferta ya no existe.');
  if (s.contracts.active.length >= MAX_ACTIVE_CONTRACTS) return fail(`Máximo ${MAX_ACTIVE_CONTRACTS} contratos a la vez.`);
  s.contracts.offers = s.contracts.offers.filter((x) => x !== c);
  c.deadline = s.day + c.days;
  s.contracts.active.push(c);
  for (const e of s.employees) if (!e.assign && MAKERS.includes(e.role)) e.assign = 'c:' + c.id;
  return ok(`Contrato aceptado: ${c.title} para ${c.client}.`);
}

export function abandonContract(s, id) {
  const c = s.contracts.active.find((x) => x.id === id);
  if (!c) return fail('Contrato no encontrado.');
  s.contracts.active = s.contracts.active.filter((x) => x !== c);
  unassignTarget(s, 'c:' + id);
  s.reputation = Math.max(0, s.reputation - 3);
  s.contracts.failed = (s.contracts.failed || 0) + 1;
  return ok(`Has abandonado el contrato con ${c.client}. Tu reputación se resiente.`);
}

function unassignTarget(s, target) {
  for (const e of s.employees) if (e.assign === target) e.assign = null;
  reassignIdle(s);
}

// Quien se queda sin tarea pasa al siguiente contrato o al producto con más trabajo.
function reassignIdle(s) {
  const c = s.contracts.active[0];
  const p = [...s.products].sort((a, b) => b.queue.length - a.queue.length)[0];
  const target = c ? 'c:' + c.id : p ? 'p:' + p.id : null;
  if (!target) return;
  for (const e of s.employees) if (!e.assign && MAKERS.includes(e.role)) e.assign = target;
}

export function createProduct(s, name, cat) {
  if (!CATEGORIES[cat]) return fail('Categoría desconocida.');
  if (!categoryUnlocked(s, cat)) return fail('Aún no has investigado esa categoría.');
  if (s.products.length >= MAX_PRODUCTS) return fail(`Máximo ${MAX_PRODUCTS} productos a la vez.`);
  name = (name || '').trim().slice(0, 24) || startupName(s);
  const p = {
    id: uid(s), name, cat, launched: false, launchDay: null, created: s.day,
    features: {}, queue: [], bugs: 0, invested: 0,
    users: 0, peak: 0, hype: 0, awareness: 0, ads: false, price: 0, down: 0, overload: 0,
    launchHunt: false, sat: 0.6, share: 0, rev: null,
  };
  if (CATEGORIES[cat].kind === 'hw') Object.assign(p, { kind: 'hw', stock: 0, orders: [], priceMult: 1, sold: 0, demand: 0, lost: 0 });
  s.products.push(p);
  for (const f of CATEGORIES[cat].core) queueFeature(s, p.id, f);
  for (const e of s.employees) if (!e.assign && MAKERS.includes(e.role)) e.assign = 'p:' + p.id;
  return ok(`Nace ${name}. Sus funciones básicas ya están en la cola.`);
}

export function suggestProductName(s) {
  return startupName(s);
}

export function featureAvailable(s, p, f) {
  return CATEGORIES[p.cat].features[f] != null || (!!FEATURES[f].universal && !isHW(p));
}

export function queueFeature(s, pid, f) {
  const p = findProduct(s, pid);
  if (!p) return fail('Producto no encontrado.');
  if (!featureAvailable(s, p, f)) return fail('Esa función no encaja con este producto.');
  if (!featureUnlocked(s, f)) return fail(`Necesitas investigar ${RESEARCH_BY_ID[FEATURES[f].research].name}.`);
  if (p.queue.length >= MAX_QUEUE) return fail(`La cola admite ${MAX_QUEUE} tareas.`);
  const lvl = queuedLevel(p, f) + 1;
  if (lvl > MAX_FEATURE_LEVEL) return fail('Ya está al nivel máximo.');
  p.queue.push({ f, lvl, need: featureCost(f, lvl), done: { code: 0, design: 0, ai: 0 } });
  return ok();
}

export function dequeue(s, pid, idx) {
  const p = findProduct(s, pid);
  if (!p || !p.queue[idx]) return fail('Tarea no encontrada.');
  const [t] = p.queue.splice(idx, 1);
  // Las tareas posteriores de la misma función bajan un nivel.
  for (const o of p.queue.slice(idx)) {
    if (o.f !== t.f) continue;
    o.lvl -= 1;
    o.need = featureCost(o.f, o.lvl);
    for (const k of ['code', 'design', 'ai']) o.done[k] = Math.min(o.done[k], o.need[k] || 0);
  }
  return ok();
}

export function moveTask(s, pid, idx, dir) {
  const p = findProduct(s, pid);
  const j = idx + dir;
  if (!p || !p.queue[idx] || !p.queue[j]) return fail();
  if (p.queue[idx].f === p.queue[j].f) return fail('Los niveles de una misma función van en orden.');
  [p.queue[idx], p.queue[j]] = [p.queue[j], p.queue[idx]];
  return ok();
}

export const coreDone = (p) => CATEGORIES[p.cat].core.every((f) => p.features[f]);

export function launch(s, pid) {
  const p = findProduct(s, pid);
  if (!p || p.launched) return fail('No se puede lanzar.');
  if (!coreDone(p)) return fail('Termina primero las funciones básicas.');
  p.launched = true;
  p.launchDay = s.day;
  p.awareness = Math.min(0.3, 0.03 + p.hype * 0.0003);
  p.hype += 40;
  p.users = isHW(p) ? 0 : 50 + p.hype * 3;
  s.reputation = Math.min(100, s.reputation + 3);
  news(s, `🚀 ${s.company} lanza ${p.name} (${CATEGORIES[p.cat].name}).`, 'good');
  return ok(`🚀 ¡${p.name} está en línea!`);
}

export function setPrice(s, pid, price) {
  const p = findProduct(s, pid);
  if (!p || !PREMIUM_PRICES.includes(price)) return fail();
  p.price = price;
  return ok();
}

export function toggleAds(s, pid) {
  const p = findProduct(s, pid);
  if (!p || !p.features.ads) return fail('Primero desarrolla la función de publicidad.');
  p.ads = !p.ads;
  return ok();
}

export function renameProduct(s, pid, name) {
  const p = findProduct(s, pid);
  name = (name || '').trim().slice(0, 24);
  if (!p || !name) return fail();
  p.name = name;
  return ok();
}

export function retireProduct(s, pid) {
  const p = findProduct(s, pid);
  if (!p) return fail();
  s.products = s.products.filter((x) => x !== p);
  s.campaigns = s.campaigns.filter((c) => c.pid !== pid);
  unassignTarget(s, 'p:' + pid);
  news(s, `${s.company} cierra ${p.name}. Descanse en paz.`, 'bad');
  return ok(`${p.name} ha sido retirado.`);
}

export function researchState(s, r) {
  if (has(s, r.id)) return 'done';
  if ((r.req || []).some((q) => !has(s, q))) return 'locked';
  return 'available';
}

export function doResearch(s, id) {
  const r = RESEARCH_BY_ID[id];
  if (!r) return fail();
  if (researchState(s, r) !== 'available') return fail('Aún no está disponible.');
  if (s.rp < r.cost) return fail(`Necesitas ${r.cost} PI.`);
  s.rp -= r.cost;
  s.research[id] = s.day;
  news(s, `🔬 ${s.company} domina ${r.name}.`, 'good');
  return ok(`Investigación completada: ${r.name}.`);
}

export function perkState(s, id) {
  const p = PERKS[id];
  const n = s.office.perks[id] || 0;
  if (p.research && !has(s, p.research)) return { ok: false, why: `Requiere ${RESEARCH_BY_ID[p.research].name}` };
  if (s.office.tier < p.tier) return { ok: false, why: `Requiere ${OFFICES[p.tier].name}` };
  if (n >= p.max) return { ok: false, why: 'Máximo alcanzado' };
  return { ok: true };
}

export function buyPerk(s, id) {
  const p = PERKS[id];
  if (!p) return fail();
  const st = perkState(s, id);
  if (!st.ok) return fail(st.why);
  if (s.money < p.cost) return fail(`Cuesta ${fmtMoney(p.cost)}.`);
  const it = addItem(ensureLayout(s), s.office.tier, id);
  if (!it) return fail('No hay hueco libre. Reorganiza la oficina en el editor o múdate.');
  money(s, -p.cost, 'office');
  s.office.perks[id] = (s.office.perks[id] || 0) + 1;
  return { ok: true, msg: `${p.icon} ${p.name} instalado.`, ref: 'i:' + it.uid };
}

// Instalación gratuita (por ejemplo, desde un evento).
export function installPerk(s, id) {
  addItem(ensureLayout(s), s.office.tier, id);
  s.office.perks[id] = (s.office.perks[id] || 0) + 1;
}

export function sellPerk(s, id) {
  const L = ensureLayout(s);
  const it = [...L.items].reverse().find((x) => x.id === id);
  if (it) return sellItem(s, it.uid);
  if (!s.office.perks[id]) return fail();
  return removePerk(s, id);
}

function removePerk(s, id) {
  const p = PERKS[id];
  s.office.perks[id] -= 1;
  if (!s.office.perks[id]) delete s.office.perks[id];
  money(s, Math.round(p.cost * 0.3), 'other');
  return ok(`${p.name} vendido por ${fmtMoney(p.cost * 0.3)}.`);
}

export const sellValue = (id) => (PERKS[id] ? Math.round(PERKS[id].cost * 0.3) : itemDef(id)?.sell ?? 0);

// Vende o quita un objeto concreto del plano.
export function sellItem(s, uid) {
  const L = ensureLayout(s);
  const it = L.items.find((x) => x.uid === uid);
  if (!it) return fail('Ese objeto ya no está.');
  L.items = L.items.filter((x) => x !== it);
  if (PERKS[it.id]) return removePerk(s, it.id);
  const f = itemDef(it.id);
  if (f.sell) money(s, f.sell, 'other');
  if (it.id === 'car') news(s, `Los padres de ${s.company.split(' ')[0]} buscan su coche desesperadamente.`, 'bad');
  return ok(f.sell ? `${f.icon} ${f.name}: +${fmtMoney(f.sell)}.` : `${f.icon} ${f.name} fuera.`);
}

// Mueve una mesa ('d:i') o un objeto ('i:uid') a otra posición del plano.
export function moveObject(s, ref, x, y) {
  const L = ensureLayout(s);
  const r = getRef(L, ref);
  if (!r) return fail();
  const pos = snapPos(r.id, x, y);
  if (!canPlace(L, s.office.tier, r.id, pos.x, pos.y, ref)) return fail('No cabe ahí.');
  r.obj.x = pos.x;
  r.obj.y = pos.y;
  return ok();
}

export function moveOffice(s, tier) {
  const o = OFFICES[tier];
  if (!o || tier <= s.office.tier) return fail();
  if (o.research && !has(s, o.research)) return fail(`Requiere ${RESEARCH_BY_ID[o.research].name}.`);
  if (s.money < o.move) return fail(`La mudanza cuesta ${fmtMoney(o.move)}.`);
  money(s, -o.move, 'office');
  s.office.tier = tier;
  s.office.layout = defaultLayout(tier, s.office.perks, { fixtures: false });
  news(s, `🏢 ${s.company} se muda a: ${o.name}.`, 'good');
  s.reputation = Math.min(100, s.reputation + 2);
  return ok(`¡Bienvenido a tu nueva oficina: ${o.name}!`);
}

export function togglePolicy(s, id) {
  const p = POLICIES[id];
  if (!p) return fail();
  if (p.research && !has(s, p.research)) return fail(`Requiere ${RESEARCH_BY_ID[p.research].name}.`);
  if (id === 'fourday' && s.policies.crunch && !s.policies.fourday) return fail('Incompatible con el crunch.');
  if (id === 'crunch' && s.policies.fourday && !s.policies.crunch) return fail('Incompatible con la semana de 4 días.');
  s.policies[id] = !s.policies[id];
  if (!s.policies[id]) delete s.policies[id];
  return ok();
}

export function setCloud(s, on) {
  if (!has(s, 'cloud') && !on) return fail('Investiga Infraestructura cloud para gestionar servidores propios.');
  s.infra.cloud = !!on;
  return ok();
}

export function buyRacks(s, n) {
  if (!has(s, 'cloud')) return fail('Investiga Infraestructura cloud primero.');
  const cost = RACK_COST * n;
  if (s.money < cost) return fail(`Cuesta ${fmtMoney(cost)}.`);
  money(s, -cost, 'servers');
  s.infra.racks += n;
  return ok(`+${n} ${n === 1 ? 'rack' : 'racks'} de servidores.`);
}

export function sellRacks(s, n) {
  n = Math.min(n, s.infra.racks);
  if (n <= 0) return fail();
  s.infra.racks -= n;
  money(s, n * 1500, 'other');
  return ok(`Vendidos ${n} racks.`);
}

export function campaignState(s, p, c) {
  if (c.once && p.launchHunt) return { ok: false, why: 'Ya lo usaste' };
  if (c.id === 'launchhunt' && !p.launched) return { ok: false, why: 'Lanza el producto antes' };
  if (s.campaigns.some((x) => x.pid === p.id && x.id === c.id)) return { ok: false, why: 'En curso' };
  if (s.money < c.cost) return { ok: false, why: fmtMoney(c.cost) };
  return { ok: true };
}

export function runCampaign(s, pid, cid) {
  const p = findProduct(s, pid);
  const c = CAMPAIGNS.find((x) => x.id === cid);
  if (!p || !c) return fail();
  const st = campaignState(s, p, c);
  if (!st.ok) return fail(st.why);
  money(s, -c.cost, 'marketing');
  if (c.id === 'launchhunt') {
    p.launchHunt = true;
    const gain = Math.round(30 + 400 * share(s, p) * quality(p));
    p.hype += gain;
    return ok(`🐱 ${p.name} llega al top de LaunchHunt: +${gain} de hype.`);
  }
  if (c.instant) {
    p.hype += c.instant * growthMult(s);
    return ok(`${c.icon} ¡Todo el mundo habla de ${p.name}!`);
  }
  s.campaigns.push({ pid, id: c.id, left: c.days, hype: c.hype });
  return ok(`${c.icon} Campaña "${c.name}" en marcha para ${p.name}.`);
}

export function acceptOffer(s) {
  const o = s.funding.offer;
  if (!o) return fail();
  const r = ROUNDS[o.round];
  money(s, o.amount, 'funding');
  s.equity = s.equity * (1 - o.dil / 100);
  s.funding.raised += o.amount;
  s.funding.round += 1;
  s.funding.offer = null;
  s.funding.cooldown = s.day + 120;
  s.stats.soldShares = true;
  s.reputation = Math.min(100, s.reputation + 5);
  if (r.id === 'ipo') {
    s.funding.ipo = true;
    s.funding.sentiment = 1;
    news(s, `🔔 ${s.company} sale a bolsa y recauda ${fmtMoney(o.amount)}.`, 'good');
    return ok(`🔔 ¡${s.company} ya cotiza en bolsa!`);
  }
  news(s, `💸 ${s.company} cierra su ${r.name}: ${fmtMoney(o.amount)} de ${o.investor}.`, 'good');
  return ok(`💸 ${r.name} cerrada: +${fmtMoney(o.amount)}.`);
}

export function rejectOffer(s) {
  if (!s.funding.offer) return fail();
  s.funding.offer = null;
  s.funding.cooldown = s.day + 45;
  return ok('Oferta rechazada. Volverán a llamar.');
}

export function issueShares(s) {
  if (!s.funding.ipo) return fail();
  if (s.day - s.funding.lastIssue < 180) return fail('Solo puedes emitir acciones cada 180 días.');
  const v = valuation(s);
  const amount = Math.round(v * 0.05);
  money(s, amount, 'funding');
  s.equity *= 0.95;
  s.funding.lastIssue = s.day;
  s.funding.sentiment *= 0.97;
  return ok(`Emisión de acciones: +${fmtMoney(amount)}.`);
}

export function takeLoan(s, amount) {
  if (s.loans.length >= 3) return fail('Máximo 3 préstamos.');
  if (amount <= 0 || amount > loanLimit(s)) return fail('El banco no te presta tanto.');
  s.loans.push({ id: uid(s), amount, left: amount, day: s.day });
  money(s, amount, 'loans');
  return ok(`Préstamo de ${fmtMoney(amount)} concedido (${(LOAN_RATE * 100).toFixed(1)}% mensual).`);
}

export function repayLoan(s, id) {
  const l = s.loans.find((x) => x.id === id);
  if (!l) return fail();
  if (s.money < l.left) return fail(`Necesitas ${fmtMoney(l.left)}.`);
  money(s, -l.left, 'loans');
  s.loans = s.loans.filter((x) => x !== l);
  return ok('Préstamo devuelto. ¡Libre de deudas!');
}

export function acquire(s, compId) {
  const c = s.competitors.find((x) => x.id === compId && x.alive);
  if (!c) return fail();
  const price = competitorPrice(c);
  if (s.money < price) return fail(`Cuesta ${fmtMoney(price)}.`);
  money(s, -price, 'acquisitions');
  c.alive = false;
  const mine = s.products.filter((p) => p.launched && p.cat === c.cat).sort((a, b) => b.users - a.users)[0];
  if (mine) {
    mine.users += c.users * 0.35;
    mine.awareness = Math.min(1, mine.awareness + 0.1);
  }
  s.stats.acquired += 1;
  news(s, `🦈 ${s.company} compra ${c.name} por ${fmtMoney(price)}.`, 'good');
  return ok(`🦈 ${c.name} ahora es tuyo.`);
}

export const headhunterCost = (s) => 1500 + s.reputation * 100;
export function paidRefresh(s) {
  const cost = headhunterCost(s);
  if (s.money < cost) return fail(`Cuesta ${fmtMoney(cost)}.`);
  money(s, -cost, 'hiring');
  refreshCandidates(s);
  return ok('Nuevos candidatos disponibles.');
}

export function currentEvent(s) {
  if (!s.event) return null;
  const def = EVENTS[s.event.id];
  if (!def) {
    s.event = null;
    return null;
  }
  return def.view(s, s.event.ctx);
}

export function resolveEvent(s, idx) {
  if (!s.event) return fail();
  const def = EVENTS[s.event.id];
  const ctx = s.event.ctx;
  s.event = null;
  const msg = def.resolve(s, ctx, idx);
  return ok(msg);
}

// ---------------------------------------------------------------- paso diario

export function stepDay(s) {
  if (s.gameOver || s.event) return;
  s.day += 1;
  const today = dateOf(s.day);
  const newMonth = today.m !== dateOf(s.day - 1).m;
  const ps = perkStats(s);
  const tp = teamPowers(s);

  workAndPeople(s, ps, tp);
  marketing(s, ps);
  products(s, tp);
  infra(s, tp);
  costs(s, tp);
  contracts(s);
  market(s, newMonth);
  funding(s);
  if (s.day - s.candidatesDay >= 14) refreshCandidates(s);
  if (newMonth) monthly(s, today);
  mailStep(s);
  worldDay(s, newMonth);
  maybeEvent(s);
  quests(s);
  achievements(s);
  if (s.day % 7 === 0) record(s, tp);
  s.stats.peakUsers = Math.max(s.stats.peakUsers, totalUsers(s));

  if (s.money < 0) {
    s.redDays += 1;
    if (s.redDays === 1) notify(s, '⚠️ ¡Números rojos! Tienes 45 días para recuperarte o quebrarás.', 'bad');
    if (s.redDays === 30) notify(s, '⚠️ Quedan 15 días para la bancarrota.', 'bad');
    if (s.redDays >= 45) s.gameOver = { reason: 'bankrupt', day: s.day };
  } else s.redDays = 0;
}

function workAndPeople(s, ps, tp) {
  const o = officeOf(s);
  const work = new Map();
  const bucket = (key) => {
    let b = work.get(key);
    if (!b) work.set(key, (b = { code: 0, design: 0, ai: 0, flex: 0, skill: 0, makers: 0, perfect: 0, pm: 0 }));
    return b;
  };
  const socials = s.employees.filter((e) => e.traits.includes('social') && e.off <= 0).length;
  const mentor = s.employees.some((e) => e.traits.includes('mentor') && e.off <= 0);
  const crowded = onsite(s) > o.desks * 0.9;
  let policyMood = 0;
  if (s.policies.flex) policyMood += 5;
  if (s.policies.fourday) policyMood += 12;
  if (s.policies.crunch) policyMood -= 12;
  if (s.policies.food) policyMood += 6;
  if (s.policies.stock) policyMood += 8;
  const quits = [];

  for (const e of s.employees) {
    if (e.off > 0) {
      e.off -= 1;
      e.energy = Math.min(100, e.energy + 12);
      if (e.off <= 0) e.offReason = '';
      continue;
    }
    const out = output(s, e, ps);
    const produces = ROLES[e.role].produces;
    const a = e.assign;
    if (MAKERS.includes(e.role) && a && (a.startsWith('p:') || a.startsWith('c:'))) {
      const b = bucket(a);
      b[produces] += out;
      b.skill += e.skill;
      b.makers += 1;
      if (e.traits.includes('perfectionist')) b.perfect += 1;
    } else if (e.role === 'founder' && a === 'rd') {
      s.rp += out * 0.8;
    } else if (produces === 'rp') {
      s.rp += out;
    } else if (produces === 'hype') {
      if (a === 'brand') s.reputation = Math.min(100, s.reputation + out * 0.004);
      else if (a && a.startsWith('p:')) {
        const p = findProduct(s, +a.slice(2));
        if (p) p.hype += out * 0.8 * growthMult(s);
      }
    } else if (produces === 'lead' && a && a.startsWith('p:')) {
      bucket(a).pm += out / 10;
    }

    // Energía
    let fatigue = 5.5;
    if (e.traits.includes('fragile')) fatigue *= 1.5;
    if (e.role === 'founder') fatigue *= 0.8;
    if (s.policies.crunch) fatigue += 4;
    let rec = 3.5 + ps.energy;
    if (e.traits.includes('athlete') && s.office.perks.gym) rec += 4;
    if (s.policies.fourday) rec += 3;
    if (isRemote(e)) rec += 1;
    e.energy = clamp(e.energy - fatigue + rec, 0, 100);
    if (e.energy < 12) {
      e.off = 5;
      e.offReason = 'Vacaciones';
      if (s.employees.length <= 12) notify(s, `🌴 ${e.name} se toma 5 días de vacaciones para recargar pilas.`);
    }

    // Ánimo
    let target = 52 + o.mood + ps.mood + policyMood + Math.min(10, socials * 2) + Math.min(10, tp.people * 2.5);
    if (e.traits.includes('gamer') && s.office.perks.arcade) target += 10;
    if (e.role === 'founder') target += 12;
    else {
      const ratio = e.salary / Math.max(1, expectedSalary(e, s));
      target += clamp((ratio - 1) * 60, e.traits.includes('ambitious') ? -40 : -30, 12);
    }
    if (crowded && !isRemote(e)) target -= 3;
    target += deskFx(s, e).comfort;
    target += effectMult(s, 'mood') * 10 - 10;
    e.mood = clamp(e.mood + (target - e.mood) * 0.08, 0, 100);
    if (e.role !== 'founder' && !e.traits.includes('loyal')) {
      if (e.mood < 22) e.unhappy += 1;
      else e.unhappy = Math.max(0, e.unhappy - 2);
      if (e.unhappy > 25 && chance(s, 0.06)) quits.push(e);
    }

    // Experiencia
    let xpMult = 1 + ps.xp;
    if (e.traits.includes('ambitious')) xpMult *= 2;
    if (mentor) xpMult *= 1.2;
    if (s.policies.training) xpMult *= 1.5;
    e.xp += out * xpMult;
    const need = 25 + e.skill * 2.5;
    if (e.xp >= need && e.skill < 100) {
      e.xp -= need;
      const before = levelOf(e.skill);
      e.skill += 1;
      if (levelOf(e.skill) > before) {
        notify(s, `🎉 ${e.name} asciende a ${['Junior', 'Mid', 'Senior', 'Lead'][levelOf(e.skill)]}.`, 'good');
      }
    }
  }

  for (const e of quits) {
    s.employees = s.employees.filter((x) => x !== e);
    notify(s, `😤 ${e.name} ha renunciado. Estaba muy descontento/a.`, 'bad');
    news(s, `${e.name} deja ${s.company} por falta de motivación.`, 'bad');
  }

  for (const [key, b] of work) {
    const id = +key.slice(2);
    if (key.startsWith('p:')) {
      const p = findProduct(s, id);
      if (p) productWork(s, p, b);
    } else {
      const c = s.contracts.active.find((x) => x.id === id);
      if (c) contractWork(s, c, b);
    }
  }
}

const TYPES = ['code', 'design', 'ai'];

function pour(tasks, pool) {
  for (const t of TYPES) {
    let left = pool[t];
    for (const task of tasks) {
      if (left <= 0) break;
      const gap = (task.need[t] || 0) - task.done[t];
      if (gap <= 0) continue;
      const use = Math.min(gap, left);
      task.done[t] += use;
      left -= use;
    }
    pool[t] = left;
  }
  let flex = pool.flex;
  for (const task of tasks) {
    while (flex > 0.0001) {
      let best = null;
      let gapBest = 0;
      for (const t of TYPES) {
        const gap = (task.need[t] || 0) - task.done[t];
        if (gap > gapBest) {
          gapBest = gap;
          best = t;
        }
      }
      if (!best) break;
      const use = Math.min(gapBest, flex);
      task.done[best] += use;
      flex -= use;
    }
    if (flex <= 0.0001) break;
  }
  pool.flex = flex;
}

const taskDone = (task) => TYPES.every((t) => task.done[t] >= (task.need[t] || 0) - 1e-6);

function productWork(s, p, b) {
  const pmBoost = 1 + Math.min(0.35, b.pm * 0.12);
  const pool = { code: b.code * pmBoost, design: b.design * pmBoost, ai: b.ai * pmBoost, flex: b.flex * pmBoost };
  pour(p.queue, pool);
  // Lo que sobra se dedica a arreglar bugs.
  const spare = pool.code * 0.6 + pool.flex * 0.5 + pool.design * 0.25 + pool.ai * 0.3;
  p.bugs = Math.max(0, p.bugs - spare);
  const avgSkill = b.makers ? b.skill / b.makers : 40;
  const perfect = b.makers ? b.perfect / b.makers : 0;
  while (p.queue.length && taskDone(p.queue[0])) {
    const task = p.queue.shift();
    const total = costTotal(task.need);
    p.features[task.f] = Math.max(p.features[task.f] || 0, task.lvl);
    p.invested += total;
    p.bugs += total * 0.14 * (1.25 - avgSkill / 100) * (1 - 0.5 * perfect);
    s.stats.shipped += 1;
    const F = FEATURES[task.f];
    if (task.f === 'ads' && task.lvl === 1) p.ads = true;
    if (task.f === 'subs' && task.lvl === 1 && !p.price) p.price = 5;
    if (p.launched) p.hype += 4 + task.lvl * 2 + (F.hype && task.lvl === 1 ? F.hype : 0);
    onShip(s, p, task.f, task.lvl);
    notify(s, `📦 ${p.name}: ${F.icon} ${F.name} ${task.lvl > 1 ? 'nivel ' + task.lvl : 'lista'}.`, 'good');
    if (!p.launched && coreDone(p) && !p.readyNotified) {
      p.readyNotified = true;
      notify(s, `✅ ${p.name} ya se puede lanzar. Ve a Productos y pulsa Lanzar.`, 'good');
    }
  }
}

function contractWork(s, c, b) {
  const pool = { code: b.code, design: b.design, ai: b.ai, flex: b.flex };
  pour([c], pool);
  if (taskDone(c)) {
    s.contracts.active = s.contracts.active.filter((x) => x !== c);
    unassignTarget(s, 'c:' + c.id);
    money(s, c.pay, 'contracts');
    s.reputation = Math.min(100, s.reputation + c.rep);
    s.stats.contractsDone += 1;
    notify(s, `📝 Contrato entregado a ${c.client}: +${fmtMoney(c.pay)}.`, 'good');
  }
}

function marketing(s, ps) {
  const gm = growthMult(s);
  for (const c of s.campaigns) {
    const p = findProduct(s, c.pid);
    if (p) p.hype += c.hype * gm;
    c.left -= 1;
  }
  s.campaigns = s.campaigns.filter((c) => c.left > 0);
  if (ps.hype) for (const p of s.products) if (p.launched) p.hype += ps.hype;
}

function products(s, tp) {
  const aiHype = effectMult(s, 'aiHype');
  let dayRev = 0;
  for (const p of s.products) {
    if (isHW(p)) dayRev += hwStep(s, p);
    if (!p.launched) {
      p.hype *= 0.94;
      continue;
    }
    const sat = satisfaction(s, p);
    const sh = share(s, p);
    if (isHW(p)) {
      const gain = (Math.sqrt(p.hype) * 0.00012 * growthMult(s) + 0.0015 * sat * sh) * (1 - p.awareness);
      p.awareness = clamp(p.awareness + gain - 0.0015 * p.awareness, 0, 1);
      p.hype *= 0.94;
      p.sat = sat;
      p.share = sh;
      p.peak = Math.max(p.peak, p.users);
      continue;
    }
    const pot = potential(s, p);
    const boost = isAIProduct(p) ? aiHype : 1;
    const limits = seasonDemand(s, p.cat) * warFx(s, p).target * (p.antitrust > s.day ? 0.8 : 1);
    const target = pot * sh * (0.12 + 0.88 * p.awareness) * (0.35 + 0.65 * sat) * boost * limits;
    if (p.down > 0) {
      p.users *= 0.985;
      p.down -= 1;
    } else {
      const rate = p.users < target ? 0.012 + Math.min(0.05, Math.sqrt(p.hype) * 0.002) : 0.02 + (1 - sat) * 0.02;
      p.users += (target - p.users) * rate;
    }
    p.users = Math.max(0, p.users);
    const gain = (Math.sqrt(p.hype) * 0.00012 * growthMult(s) + 0.0015 * sat * sh) * (1 - p.awareness);
    p.awareness = clamp(p.awareness + gain - 0.0015 * p.awareness, 0, 1);
    p.hype *= 0.94;
    p.sat = sat;
    p.share = sh;
    p.peak = Math.max(p.peak, p.users);
    const rev = productRevenue(s, p, tp);
    p.rev = rev;
    money(s, rev.ads, 'ads');
    money(s, rev.subs, 'subs');
    money(s, rev.tx, 'tx');
    money(s, rev.api, 'api');
    dayRev += rev.total;
  }
  s.rev30.push(dayRev);
  if (s.rev30.length > 30) s.rev30.shift();
}

function infra(s, tp) {
  const st = infraStatus(s, tp);
  for (const p of s.products) p.overload = st.overload;
  money(s, -st.cloudMonthly / 30, 'cloud');
  money(s, -st.rackMonthly / 30, 'servers');
  const uncovered = Math.max(0, s.infra.racks - st.coverage);
  const risk = Math.min(0.2, uncovered * 0.004) + (st.cloudUnits > 0 ? 0.0005 : 0);
  if (risk > 0 && chance(s, risk)) {
    const live = s.products.filter((p) => p.launched && p.users > 100 && !p.down);
    if (live.length) {
      const p = pick(s, live);
      p.down = rint(s, 1, 3);
      s.infra.outages += 1;
      const why = uncovered ? 'Faltan DevOps para mantener tantos servidores.' : 'Tu proveedor cloud ha tenido problemas.';
      notify(s, `🔥 ¡${p.name} está caído! ${why}`, 'bad');
      news(s, `${p.name} sufre una caída de servicio.`, 'bad');
    }
  }
}

function costs(s, tp) {
  money(s, -payroll(s) / 30, 'salaries');
  money(s, -officeOf(s).rent / 30, 'rent');
  money(s, -perkStats(s).upkeep / 30, 'perks');
  money(s, -policyMonthly(s) / 30, 'policies');
  money(s, -regionRent(s) / 30, 'regions');
  for (const l of s.loans) money(s, -(l.left * LOAN_RATE) / 30, 'interest');
}

function contracts(s) {
  const C = s.contracts;
  for (const c of [...C.active]) {
    if (s.day > c.deadline) {
      C.active = C.active.filter((x) => x !== c);
      unassignTarget(s, 'c:' + c.id);
      s.reputation = Math.max(0, s.reputation - 4);
      C.failed = (C.failed || 0) + 1;
      notify(s, `❌ No llegaste a tiempo con ${c.client}. Sin pago y -4 de reputación.`, 'bad');
    }
  }
  C.offers = C.offers.filter((c) => c.expires > s.day);
  if (s.day >= C.next) {
    if (C.offers.length < 4) C.offers.push(makeContract(s));
    C.next = s.day + rint(s, 4, 7);
  }
}

function market(s, newMonth) {
  const byCat = {};
  for (const c of s.competitors) if (c.alive) (byCat[c.cat] ||= []).push(c);
  for (const [cat, list] of Object.entries(byCat)) {
    const total = rivalsAppeal(s, cat);
    const pot = CATEGORIES[cat].market * marketGrowth(s);
    for (const c of list) c.users = (pot * c.appeal * 0.55) / total;
  }
  if (!newMonth) return;
  const pressure = {};
  for (const p of s.products) if (p.launched) pressure[p.cat] = (pressure[p.cat] || 0) + (p.share || 0);
  for (const c of s.competitors) {
    if (!c.alive) continue;
    c.appeal *= 1 + rfloat(s, 0.008, 0.028) + Math.min(0.06, (pressure[c.cat] || 0) * 0.1);
    if (chance(s, 0.05)) {
      c.appeal *= 1.15;
      news(s, `${c.name} lanza una gran actualización. Sube su atractivo.`);
    }
    const total = rivalsAppeal(s, c.cat);
    if (c.appeal / total < 0.04 && chance(s, 0.15)) {
      c.alive = false;
      news(s, `💀 ${c.name} cierra: no pudo competir en ${CATEGORIES[c.cat].name}.`);
    }
  }
  if (chance(s, 0.25)) {
    const cats = Object.keys(CATEGORIES).filter((c) => categoryUnlocked(s, c));
    const cat = pick(s, cats);
    const alive = s.competitors.filter((c) => c.alive && c.cat === cat);
    const avg = alive.length ? alive.reduce((a, c) => a + c.appeal, 0) / alive.length : 50;
    const c = makeCompetitor(s, cat, startupName(s), avg * rfloat(s, 0.4, 0.8));
    s.competitors.push(c);
    ensureRivals(s);
    news(s, `🌱 Nueva startup: ${c.name} entra en ${CATEGORIES[cat].name}.`);
  }
  rivalMonth(s);
}

function funding(s) {
  const F = s.funding;
  if (F.offer && F.offer.expires <= s.day) {
    F.offer = null;
    F.cooldown = s.day + 30;
    notify(s, 'La oferta de inversión ha caducado.');
  }
  if (!F.offer && s.day >= F.cooldown && roundReady(s)) {
    const r = ROUNDS[F.round];
    const dil = rint(s, r.dil[0], r.dil[1]);
    const v = Math.max(valuation(s), FLOORS[r.id]) * effectMult(s, 'invest') * rfloat(s, 0.9, 1.25);
    F.offer = { round: F.round, dil, amount: Math.round((v * dil) / 100 / 1000) * 1000, val: v, expires: s.day + 30, investor: pick(s, INVESTORS) };
    notify(s, `📈 ${F.offer.investor} quiere invertir: ${r.name}. Mira la pestaña Inversores.`, 'good');
  }
  if (F.ipo) {
    const drift = (1 - F.sentiment) * 0.02;
    F.sentiment = clamp(F.sentiment * Math.exp(gauss(s, drift, 0.015)), 0.5, 1.8);
  }
}

function monthly(s, today) {
  const L = s.ledger;
  L.last = { ...L.month, m: (today.m + 11) % 12 };
  L.month = { inc: {}, exp: {} };
  const inc = Object.values(L.last.inc).reduce((a, b) => a + b, 0);
  const exp = Object.values(L.last.exp).reduce((a, b) => a + b, 0);
  notify(s, `📅 Cierre de ${MONTHS[L.last.m]}: ingresos ${fmtMoney(inc)}, gastos ${fmtMoney(exp)}.`, inc >= exp ? 'good' : 'info');
  if (s.policies.stock) s.equity *= 0.998;
}

function maybeEvent(s) {
  if (s.day < s.nextEventDay || s.event) return;
  const pool = [];
  for (const [id, def] of Object.entries(EVENTS)) {
    const w = def.weight(s);
    if (w > 0) pool.push({ id, w });
  }
  s.nextEventDay = s.day + rint(s, 18, 34);
  if (!pool.length) return;
  const total = pool.reduce((a, x) => a + x.w, 0);
  let r = rnd(s) * total;
  let chosen = pool[0];
  for (const x of pool) {
    r -= x.w;
    if (r <= 0) {
      chosen = x;
      break;
    }
  }
  const ctx = EVENTS[chosen.id].setup ? EVENTS[chosen.id].setup(s) : {};
  if (ctx === null) return;
  s.event = { id: chosen.id, ctx };
}

// ---- objetivos y logros

const QUEST_CHECK = {
  contract: (s) => s.contracts.active.length > 0 || s.stats.contractsDone > 0,
  contractDone: (s) => s.stats.contractsDone > 0,
  hire: (s) => s.employees.length > 1,
  research: (s) => has(s, 'monetization'),
  product: (s) => s.products.length > 0,
  launch: (s) => s.products.some((p) => p.launched),
  users1k: (s) => totalUsers(s) >= 1000,
  monetize: (s) => s.products.some((p) => (p.features.ads && p.ads) || (p.features.subs && p.price > 0)),
  move: (s) => s.office.tier >= 1,
  funding: (s) => s.funding.round > 0,
  users100k: (s) => totalUsers(s) >= 1e5,
  mrr100k: (s) => mrr(s) >= 1e5,
  unicorn: (s) => valuation(s) >= 1e9,
  ipo: (s) => s.funding.ipo,
  agi: (s) => has(s, 'agi'),
};

function quests(s) {
  for (const q of QUESTS) {
    if (s.quests[q.id] != null || !QUEST_CHECK[q.id](s)) continue;
    s.quests[q.id] = s.day;
    if (q.reward) money(s, q.reward, 'other');
    notify(s, `🎯 Objetivo cumplido: ${q.text}${q.reward ? ` (+${fmtMoney(q.reward)})` : ''}`, 'good');
  }
}
export const currentQuest = (s) => QUESTS.find((q) => s.quests[q.id] == null) || null;

const ACH_CHECK = {
  firstHire: (s) => s.employees.length > 1,
  team10: (s) => s.employees.length >= 10,
  team50: (s) => s.employees.length >= 50,
  team100: (s) => s.employees.length >= 100,
  launch: (s) => s.products.some((p) => p.launched),
  portfolio: (s) => s.products.filter((p) => p.launched).length >= 3,
  users1m: (s) => totalUsers(s) >= 1e6,
  users100m: (s) => totalUsers(s) >= 1e8,
  users1b: (s) => totalUsers(s) >= 1e9,
  millionaire: (s) => s.money >= 1e6,
  unicorn: (s) => valuation(s) >= 1e9,
  decacorn: (s) => valuation(s) >= 1e10,
  ipo: (s) => s.funding.ipo,
  contracts10: (s) => s.stats.contractsDone >= 10,
  maxFeature: (s) => s.products.some((p) => Object.values(p.features).some((l) => l >= MAX_FEATURE_LEVEL)),
  allResearch: (s) => RESEARCH.every((r) => has(s, r.id)),
  acquire: (s) => s.stats.acquired > 0,
  leader: (s) => s.products.some((p) => p.launched && p.share > 0.5),
  orbital: (s) => s.office.tier >= OFFICES.length - 1,
  happy: (s) => s.employees.length >= 20 && s.employees.reduce((a, e) => a + e.mood, 0) / s.employees.length > 85,
  crunchSurvivor: (s) => s.stats.breaches > 0,
  bootstrapped: (s) => !s.stats.soldShares && mrr(s) >= 1e5,
  agi: (s) => has(s, 'agi'),
};

function achievements(s) {
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id]) continue;
    if (ACH_CHECK[a.id](s)) {
      s.achievements[a.id] = s.day;
      notify(s, `🏆 Logro desbloqueado: ${a.icon} ${a.name}`, 'achievement');
    }
  }
}

function record(s, tp) {
  const m = mrr(s, tp);
  s.history.push({
    d: s.day,
    cash: Math.round(s.money),
    users: Math.round(totalUsers(s)),
    mrr: Math.round(m),
    cost: Math.round(monthlyCosts(s, tp).total),
    val: Math.round(valuation(s, tp)),
  });
  if (s.history.length > 400) s.history = s.history.filter((_, i) => i % 2 === 0 || i > 300);
}

// Resumen para el HUD.
export function summary(s) {
  const tp = teamPowers(s);
  const m = mrr(s, tp);
  const c = monthlyCosts(s, tp);
  return { users: totalUsers(s), mrr: m, costs: c.total, net: m - c.total, val: valuation(s, tp), tp };
}
