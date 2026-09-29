// Helpers de estado compartidos por la simulación y los eventos.
import { ROLES, LEVELS, TRAITS, LOOKS, FIRST_NAMES, LAST_NAMES, OFFICES, PERKS, REGIONS } from './data.js';
import { rnd, rint, rfloat, pick, chance, gauss, clamp, dateOf } from './util.js';

export const uid = (s) => s.nextId++;
export const has = (s, id) => s.research[id] != null;
export const officeOf = (s) => OFFICES[s.office.tier];
export const findEmp = (s, id) => s.employees.find((e) => e.id === id);
export const findProduct = (s, id) => s.products.find((p) => p.id === id);

// Cola de avisos que la interfaz convierte en toasts.
export function notify(s, text, kind = 'info') {
  s.notes.push({ text, kind });
}

// Avisos menores (ascensos, funciones terminadas, cumpleaños...): en vez de
// uno cada vez, se cuentan y salen juntos en un resumen semanal.
const DIGEST = {
  feature: ['📦', 'función terminada', 'funciones terminadas'],
  promo: ['🎉', 'ascenso', 'ascensos'],
  bday: ['🎂', 'cumpleaños', 'cumpleaños'],
  vacation: ['🌴', 'persona de vacaciones', 'personas de vacaciones'],
  friend: ['🤝', 'amistad nueva', 'amistades nuevas'],
  couple: ['💕', 'pareja nueva', 'parejas nuevas'],
  mentor: ['🎓', 'mentoría nueva', 'mentorías nuevas'],
  mentorDone: ['🎓', 'junior ya vuela solo/a', 'juniors ya vuelan solos'],
};
export function digest(s, kind, text) {
  const d = s.digest || (s.digest = { n: {}, last: '' });
  d.n[kind] = (d.n[kind] || 0) + 1;
  d.last = text;
}
export function flushDigest(s) {
  const d = s.digest;
  s.digest = { n: {}, last: '' };
  const parts = Object.entries(d?.n || {}).filter(([k, n]) => n > 0 && DIGEST[k]);
  const total = parts.reduce((a, [, n]) => a + n, 0);
  if (!total) return;
  // Si solo ha pasado una cosa, se cuenta tal cual.
  if (total === 1) return notify(s, d.last, 'good');
  notify(s, '📰 Esta semana: ' + parts.map(([k, n]) => `${DIGEST[k][0]} ${n} ${n === 1 ? DIGEST[k][1] : DIGEST[k][2]}`).join(' · '), 'good');
}

export function news(s, text, kind = 'info') {
  s.news.unshift({ day: s.day, text, kind });
  if (s.news.length > 40) s.news.length = 40;
}

// Todo movimiento de caja pasa por aquí para que el libro mensual cuadre.
export function money(s, amount, cat) {
  if (!amount) return;
  s.money += amount;
  const bucket = amount >= 0 ? s.ledger.month.inc : s.ledger.month.exp;
  bucket[cat] = (bucket[cat] || 0) + Math.abs(amount);
  if (amount > 0 && ['ads', 'subs', 'tx', 'api', 'contracts', 'hardware', 'store'].includes(cat)) s.stats.revenue += amount;
}

// Un efecto de N días añadido hoy dura del día siguiente al día de hoy + N,
// ambos incluidos (el día de hoy ya se ha simulado).
export function effectMult(s, key) {
  let m = 1;
  for (const ef of s.effects) if (ef.until >= s.day && ef[key] != null) m *= ef[key];
  return m;
}
export function hasEffect(s, id) {
  return s.effects.some((ef) => ef.id === id && ef.until >= s.day);
}
export function addEffect(s, id, days, mods) {
  s.effects = s.effects.filter((ef) => ef.id !== id);
  s.effects.push({ id, until: s.day + days, ...mods });
}
export function removeEffect(s, id) {
  s.effects = s.effects.filter((ef) => ef.id !== id);
}

// Efectos visuales en la oficina (hackathon, Navidad, cumpleaños, apagón...).
export function addOfficeFx(s, kind, days, extra = {}) {
  s.officeFx = (s.officeFx || []).filter((f) => f.until >= s.day && f.kind !== kind);
  s.officeFx.push({ kind, until: s.day + days, ...extra });
}
export const officeFx = (s, kind) => (s.officeFx || []).find((f) => f.kind === kind && f.until >= s.day);

export function levelOf(skill) {
  let l = 0;
  for (let i = 0; i < LEVELS.length; i++) if (skill >= LEVELS[i].min) l = i;
  return l;
}

export function payFactor(skill) {
  return skill < 50 ? 0.6 + ((Math.max(skill, 15) - 20) / 30) * 0.4 : 1 + ((skill - 50) / 30) * 0.6;
}

export function expectedSalary(e, s) {
  if (e.role === 'founder') return 0;
  let x = ROLES[e.role].base * payFactor(e.skill) * Math.pow(1.03, (s?.day || 0) / 365);
  if (e.region) x *= REGIONS[e.region].salary;
  if (e.traits.includes('tenx')) x *= 1.3;
  return Math.round(x / 50) * 50;
}

export function makeLooks(s) {
  return {
    skin: pick(s, LOOKS.skin),
    hair: pick(s, LOOKS.hair.slice(0, chance(s, 0.85) ? 7 : LOOKS.hair.length)),
    style: rint(s, 0, 5),
    pants: pick(s, LOOKS.pants),
    glasses: chance(s, 0.3),
    beard: chance(s, 0.2),
  };
}

export function makeName(s) {
  return `${pick(s, FIRST_NAMES)} ${pick(s, LAST_NAMES)}`;
}

const TRAIT_POOL = Object.keys(TRAITS).filter((t) => t !== 'remote');

// Cumpleaños: un día fijo del año para cada persona.
const MONTH_LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function dayToDate(n) {
  let m = 0;
  while (n >= MONTH_LEN[m]) n -= MONTH_LEN[m++];
  return { m, d: n + 1 };
}
// Las partidas antiguas no guardaban la fecha: se saca del id, siempre la misma.
export const birthdayOf = (e) => e.bday || dayToDate((e.id * 7919) % 365);
export function isBirthday(s, e) {
  const b = birthdayOf(e);
  const t = dateOf(s.day);
  return b.m === t.m && b.d === t.d;
}

export function makePerson(s, role, { skill, traits, remote, region } = {}) {
  const hr = s.employees.filter((e) => e.role === 'hr' && !e.off).reduce((a, e) => a + e.skill, 0);
  const boost = s.reputation * 0.35 + Math.min(15, hr / 25) + (effectMult(s, 'talent') - 1) * 100;
  const sk = skill ?? clamp(Math.round(gauss(s, 26 + boost + (region ? REGIONS[region].skill : 0), 13)), 12, 97);
  let tr = traits;
  if (!tr) {
    tr = [];
    const n = rnd(s) < 0.55 ? 1 : rnd(s) < 0.5 ? 2 : 0;
    while (tr.length < n) {
      const t = pick(s, TRAIT_POOL);
      if (!tr.includes(t)) tr.push(t);
    }
    if (!region && (remote ?? (has(s, 'remote') && chance(s, 0.3)))) tr.push('remote');
  }
  const e = {
    id: uid(s),
    name: makeName(s),
    role,
    skill: sk,
    xp: 0,
    salary: 0,
    mood: 70,
    energy: 90,
    traits: tr,
    looks: makeLooks(s),
    assign: null,
    off: 0,
    offReason: '',
    hired: s.day,
    unhappy: 0,
    bday: dayToDate(rint(s, 0, 364)),
  };
  if (region) e.region = region;
  e.salary = Math.round((expectedSalary(e, s) * rfloat(s, 0.95, 1.15) * effectMult(s, 'salary')) / 50) * 50;
  return e;
}

// Totales de las mejoras de oficina; se recalcula a menudo pero es barato.
export function perkStats(s) {
  const out = { mood: 0, energy: 0, prod: 0, xp: 0, hype: 0, upkeep: 0 };
  for (const [id, n] of Object.entries(s.office.perks)) {
    const p = PERKS[id];
    if (!p || !n) continue;
    out.mood += (p.mood || 0) * n;
    out.energy += (p.energy || 0) * n;
    out.prod += (p.prod || 0) * n;
    out.xp += (p.xp || 0) * n;
    out.hype += (p.hype || 0) * n;
    out.upkeep += (p.upkeep || 0) * n;
  }
  out.mood = Math.min(out.mood, 28);
  out.energy = Math.min(out.energy, 16);
  return out;
}
