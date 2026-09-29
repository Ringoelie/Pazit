// Presentación de lanzamiento: se programa con antelación, la campaña previa
// sube el hype cada día y el día señalado el producto se lanza en directo.
// Sale mejor cuanto más completo y pulido está el producto y cuanto mejor
// presenta quien sube al escenario. Si ese día faltan las funciones básicas,
// la demo se cuelga delante de todo el mundo.
import { KEYNOTES, CATEGORIES } from './data.js';
import { rfloat, fmtMoney, fmtNum, fmtDate } from './util.js';
import { findProduct, notify, news, money, addOfficeFx } from './core.js';
import { launch, coreDone, quality } from './sim.js';
import { isHW } from './hw.js';

const fail = (msg = '') => ({ ok: false, msg });

export const KEYNOTE_TIERS = {
  epic: { icon: '🔥', name: 'épica' },
  good: { icon: '👍', name: 'buena' },
  meh: { icon: '😬', name: 'floja' },
};

// Quien presenta: la persona fundadora o alguien de marketing, la que mejor lo haga.
export function presenter(s) {
  const cands = s.employees.filter((e) => (e.role === 'founder' || e.role === 'marketer') && e.off <= 0);
  let best = null;
  let score = 0;
  for (const e of cands) {
    const v = 0.55 + e.skill / 220 + (e.traits.includes('social') ? 0.08 : 0);
    if (v > score) {
      score = v;
      best = e;
    }
  }
  return { e: best, score: best ? score : 0.5 };
}

// Pronóstico sin la suerte del directo (de 0 a ~1).
export function keynoteOdds(s, p) {
  const core = CATEGORIES[p.cat].core;
  const extras = Object.entries(p.features).reduce((a, [f, l]) => a + (core.includes(f) ? 0 : l), 0);
  const comp = Math.min(1, 0.55 + extras * 0.07);
  const host = presenter(s);
  return { score: comp * quality(p) * host.score, comp, quality: quality(p), host };
}

export const tierOf = (score) => (score >= 0.72 ? 'epic' : score >= 0.5 ? 'good' : 'meh');

export function scheduleKeynote(s, pid, size) {
  const p = findProduct(s, pid);
  const K = KEYNOTES[size];
  if (!p || !K) return fail();
  if (p.launched) return fail('Ese producto ya está en la calle.');
  if (p.keynote) return fail('Ya tiene una presentación programada.');
  if (s.money < K.cost) return fail(`Cuesta ${fmtMoney(K.cost)}.`);
  money(s, -K.cost, 'marketing');
  p.keynote = { size, day: s.day + K.days };
  news(s, `${K.icon} ${s.company} presentará ${p.name} el ${fmtDate(p.keynote.day)}.`, 'info');
  return { ok: true, msg: `${K.icon} Presentación programada para el ${fmtDate(p.keynote.day)}. ¡Empieza la campaña!` };
}

export function cancelKeynote(s, pid) {
  const p = findProduct(s, pid);
  if (!p?.keynote) return fail();
  p.keynote = null;
  s.reputation = Math.max(0, s.reputation - 1);
  return { ok: true, msg: 'Presentación cancelada. La prensa lo comenta con cierta sorna.' };
}

// Cada día: la campaña previa sube el hype y, llegado el día, se presenta.
export function keynoteDay(s) {
  for (const p of s.products) {
    if (p.launched || !p.keynote) continue;
    const K = KEYNOTES[p.keynote.size];
    p.hype += K.hype;
    const left = p.keynote.day - s.day;
    if (left === 3 && !coreDone(p)) notify(s, `⚠️ La presentación de ${p.name} es en 3 días y aún faltan funciones básicas.`, 'bad');
    if (left <= 0) runKeynote(s, p);
  }
}

function runKeynote(s, p) {
  const K = KEYNOTES[p.keynote.size];
  p.keynote = null;
  if (!coreDone(p)) {
    s.reputation = Math.max(0, s.reputation - 4);
    p.hype *= 0.5;
    addOfficeFx(s, 'keynote', 1, { name: p.name, tier: 'fail' });
    news(s, `😬 La demo de ${p.name} se cuelga en plena presentación.`, 'bad');
    notify(s, `😬 La demo de ${p.name} se cuelga en directo: aún faltaban funciones básicas. -4 de reputación.`, 'bad');
    return;
  }
  const tier = tierOf(keynoteOdds(s, p).score * rfloat(s, 0.85, 1.15));
  launch(s, p.id);
  const hw = isHW(p);
  if (tier === 'epic') {
    if (!hw) p.users *= 1 + 1.2 * K.reach;
    p.awareness = Math.min(0.6, p.awareness + 0.06 * K.reach);
    p.hype += 200 * K.reach;
    s.reputation = Math.min(100, s.reputation + 2 + K.reach);
    s.stats.epicKeynotes = (s.stats.epicKeynotes || 0) + 1;
  } else if (tier === 'good') {
    if (!hw) p.users *= 1 + 0.5 * K.reach;
    p.awareness = Math.min(0.6, p.awareness + 0.03 * K.reach);
    p.hype += 80 * K.reach;
    s.reputation = Math.min(100, s.reputation + 1);
  } else s.reputation = Math.max(0, s.reputation - 1);
  addOfficeFx(s, 'keynote', 1, { name: p.name, tier });
  const T = KEYNOTE_TIERS[tier];
  const who = hw ? `${fmtNum(Math.round(p.hype))} de hype` : `${fmtNum(Math.round(p.users))} usuarios el primer día`;
  news(s, `${K.icon} ${s.company} presenta ${p.name}: una presentación ${T.name}.`, tier === 'meh' ? 'bad' : 'good');
  notify(s, `🚀 ${T.icon} Presentación ${T.name} de ${p.name}: ${who}.`, tier === 'meh' ? 'info' : 'good');
}
