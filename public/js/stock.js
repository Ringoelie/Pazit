// Bolsa: después de salir a bolsa, al empezar cada trimestre prometes unos
// ingresos al mercado (prudente, realista o ambiciosa) y al acabarlo se
// publican los resultados. Cumplir sube la acción y fallar la hunde, más
// cuanto más prometiste. La credibilidad que vas ganando amplifica las
// subidas y suaviza las caídas; rebajar la previsión a tiempo duele menos.
import { SEASONS } from './data.js';
import { clamp, dateOf, fmtMoney, fmtDate } from './util.js';
import { notify, news, addOfficeFx } from './core.js';
import { registerMail, sendMail } from './mail.js';
import { mrr, valuation } from './sim.js';
import { isHW } from './hw.js';

const ok = (msg) => ({ ok: true, msg });
const fail = (msg = '') => ({ ok: false, msg });

// mult: previsión sobre lo que esperan los analistas. now: reacción el día
// del anuncio. miss/bonus: castigo por no cumplir lo prometido o premio por
// cumplirlo, además de lo que mueva la sorpresa frente a los analistas.
export const GUIDANCE = {
  low: { name: 'Prudente', icon: '🐢', mult: 0.9, now: -0.03, miss: 0.08, bonus: 0, credUp: 4, credDown: 15, hint: 'Fácil de cumplir. Al mercado le sabe a poco: la acción baja un 3% hoy.' },
  mid: { name: 'Realista', icon: '🎯', mult: 1, now: 0, miss: 0.05, bonus: 0.02, credUp: 6, credDown: 10, hint: 'Lo que espera el mercado.' },
  high: { name: 'Ambiciosa', icon: '🚀', mult: 1.2, now: 0.06, miss: 0.14, bonus: 0.06, credUp: 10, credDown: 14, hint: 'La acción sube hoy; si no cumples, se hunde.' },
};
export const GUIDANCE_ORDER = ['low', 'mid', 'high'];
export const WARN_COST = 0.07;
export const SENTIMENT = [0.35, 2.2];

const isQuarterStart = (day) => {
  const d = dateOf(day);
  return d.d === 1 && d.m % 3 === 0;
};
// Primer día del trimestre siguiente.
function quarterEnd(day) {
  let d = day + 1;
  while (!isQuarterStart(d)) d++;
  return d;
}
export const quarterName = (q) => `T${q.n + 1} ${q.y}`;
export const nextQuarterDay = (day) => quarterEnd(day);

export const sharePrice = (s, v = valuation(s)) => v / (s.stock?.shares || 1e8);

export function ensureStock(s) {
  if (!s.funding.ipo) return null;
  return s.stock || (s.stock = { shares: 1e8, cred: 60, anchor: 1, q: null, hist: [], log: [], streak: 0 });
}

// Peso de cada mes según lo que vendes: el hardware se dispara en Navidad,
// las apps de citas en San Valentín...
function seasonIndex(s) {
  const prods = s.products.filter((p) => p.launched && p.rev?.total > 0);
  const tot = prods.reduce((a, p) => a + p.rev.total, 0);
  return (m) => {
    if (!tot) return 1;
    const S = SEASONS[m];
    let v = 0;
    for (const p of prods) {
      const dem = S?.demand?.[p.cat] ?? 1;
      const tx = S?.tx?.[p.cat] ?? 1;
      const f = isHW(p) ? dem : (1 + (dem - 1) * 0.4) * (1 + ((p.rev.tx || 0) / p.rev.total) * (tx - 1));
      v += p.rev.total * f;
    }
    return v / tot;
  };
}

// Lo que esperan los analistas entre `start` y `end`: los ingresos
// recurrentes de hoy (más el hardware del último mes) corregidos por
// temporada, con un pequeño extra porque cuentan con que sigas creciendo.
export function forecast(s, start, end) {
  const last = s.ledger.last?.inc || {};
  const daily = (mrr(s) + (last.hardware || 0) + (last.store || 0)) / 30.4;
  const idx = seasonIndex(s);
  const i0 = idx(dateOf(start - 1).m) || 1;
  let days = 0;
  for (let d = start; d < end; d++) days += idx(dateOf(d).m) / i0;
  return daily * days * 1.04;
}

function startQuarter(s, St) {
  const end = quarterEnd(s.day);
  const d = dateOf(s.day);
  const exp = Math.max(1000, forecast(s, s.day, end));
  St.q = { y: d.y, n: Math.floor(d.m / 3), start: s.day, end, rev0: s.stats.revenue, exp, level: null, target: null, warned: false };
  sendMail(s, 'guidance', { y: St.q.y, n: St.q.n });
}

export const targetOf = (q) => q.target ?? q.exp * GUIDANCE.mid.mult;

export function stockDay(s) {
  const St = ensureStock(s);
  if (!St) return;
  // La confianza del mercado vuelve poco a poco a la normalidad.
  St.anchor = Math.exp(Math.log(St.anchor) * 0.997);
  if (St.q && s.day >= St.q.end) {
    publish(s, St);
    St.q = null;
  }
  // Si sales a bolsa con el trimestre casi acabado, se empieza en el siguiente.
  if (!St.q && (isQuarterStart(s.day) || quarterEnd(s.day) - s.day >= 30)) startQuarter(s, St);
  if (s.day % 7 === 0) {
    St.hist.push({ d: s.day, p: sharePrice(s) });
    if (St.hist.length > 156) St.hist.shift();
  }
}

// Reacción del mercado a unos resultados (sin la suerte del día a día): la
// sorpresa frente a los analistas y, encima, si cumpliste lo prometido.
// Cumplir siempre sube algo y fallar siempre baja.
export function reaction(level, rev, target, exp) {
  const G = GUIDANCE[level];
  const surprise = clamp((rev / Math.max(1, exp) - 1) * 0.6, -0.15, 0.15);
  return rev >= target ? Math.max(0.01, surprise + G.bonus) : Math.min(-0.02, surprise - G.miss);
}

// Lo que sube (o baja) la acción el día del anuncio: una previsión ambiciosa
// solo ilusiona si el mercado te cree.
export const announceMove = (St, level) => (level === 'high' ? GUIDANCE.high.now * (0.3 + St.cred / 80) : GUIDANCE[level].now);

function publish(s, St) {
  const q = St.q;
  const level = q.level || 'mid';
  const G = GUIDANCE[level];
  const target = targetOf(q);
  const rev = s.stats.revenue - q.rev0;
  const beat = rev >= target;
  const jump = reaction(level, rev, target, q.exp);
  s.funding.sentiment = clamp(s.funding.sentiment * (1 + jump), ...SENTIMENT);
  St.anchor = clamp(St.anchor * (1 + jump * 0.7), 0.45, 2);
  St.cred = clamp(St.cred + (beat ? G.credUp : -G.credDown), 0, 100);
  St.streak = beat ? St.streak + 1 : 0;
  St.log.unshift({ y: q.y, n: q.n, level, target, rev, jump, warned: q.warned });
  if (St.log.length > 8) St.log.length = 8;
  // Con stock options, al equipo le importa (y mucho) cómo va la acción.
  if (s.policies.stock) for (const e of s.employees) e.mood = clamp(e.mood + (beat ? 3 : -4), 0, 100);
  addOfficeFx(s, 'results', 1, { beat, pct: Math.round(jump * 100) });
  const name = quarterName(q);
  const pct = `${Math.abs(Math.round(jump * 100))}%`;
  if (beat) {
    news(s, `📈 ${s.company} supera su previsión del ${name}: ${fmtMoney(rev)} (prometió ${fmtMoney(target)}).`, 'good');
    notify(s, `📈 Resultados del ${name}: ${fmtMoney(rev)} de ${fmtMoney(target)} prometidos. ¡La acción sube un ${pct}!`, 'good');
  } else {
    news(s, `📉 ${s.company} no llega a su previsión del ${name}: ${fmtMoney(rev)} de ${fmtMoney(target)}.`, 'bad');
    notify(s, `📉 Resultados del ${name}: ${fmtMoney(rev)} de ${fmtMoney(target)} prometidos. La acción cae un ${pct}.`, 'bad');
  }
}

export function setGuidance(s, level, at = null) {
  const q = s.stock?.q;
  const G = GUIDANCE[level];
  if (!q || !G) return fail();
  if (at && (q.y !== at.y || q.n !== at.n)) return fail('Ese trimestre ya pasó.');
  if (q.level) return fail('La previsión de este trimestre ya está anunciada.');
  q.level = level;
  q.target = q.exp * G.mult;
  const now = announceMove(s.stock, level);
  if (now) s.funding.sentiment = clamp(s.funding.sentiment * (1 + now), ...SENTIMENT);
  news(s, `${G.icon} ${s.company} prevé ingresar ${fmtMoney(q.target)} en el ${quarterName(q)}.`);
  const mood = now > 0 ? ` Al mercado le encanta: la acción sube un ${Math.round(now * 100)}%.` : now < 0 ? ` Al mercado le sabe a poco: la acción baja un ${Math.round(-now * 100)}%.` : '';
  return ok(`${G.icon} Previsión ${G.name.toLowerCase()}: ${fmtMoney(q.target)} este trimestre.${mood}`);
}

// Rebajar la previsión a tiempo: la acción cae hoy, pero menos que si fallas.
export function canWarn(s) {
  const q = s.stock?.q;
  return !!q && !!q.level && q.level !== 'low' && !q.warned && q.end - s.day > 7;
}
export function lowerGuidance(s) {
  if (!canWarn(s)) return fail('Ahora no puedes rebajar la previsión.');
  const St = s.stock;
  const q = St.q;
  q.warned = true;
  q.level = 'low';
  q.target = q.exp * GUIDANCE.low.mult;
  s.funding.sentiment = clamp(s.funding.sentiment * (1 - WARN_COST), ...SENTIMENT);
  St.anchor = clamp(St.anchor * 0.96, 0.45, 2);
  St.cred = clamp(St.cred - 6, 0, 100);
  news(s, `⚠️ ${s.company} rebaja su previsión del ${quarterName(q)} a ${fmtMoney(q.target)}.`, 'bad');
  return ok(`⚠️ Previsión rebajada a ${fmtMoney(q.target)}. La acción cae un ${Math.round(WARN_COST * 100)}%, pero ahora es más fácil cumplir.`);
}

// Cómo va el trimestre: ingresos hasta hoy y proyección al ritmo actual.
export function quarterStatus(s) {
  const q = s.stock?.q;
  if (!q) return null;
  const rev = s.stats.revenue - q.rev0;
  const elapsed = s.day - q.start;
  const len = q.end - q.start;
  const left = q.end - s.day;
  const rate = elapsed >= 7 ? rev / elapsed : q.exp / len;
  const proj = rev + rate * left;
  const target = targetOf(q);
  return { q, rev, proj, target, left, len, elapsed, ratio: proj / target };
}

registerMail({
  guidance: {
    make: (s, { y, n }) => {
      const St = s.stock;
      const q = St?.q;
      if (!q || q.y !== y || q.n !== n || q.level) return null;
      return {
        from: 'Relación con inversores',
        icon: '📊',
        subject: `Previsión de ingresos para el ${quarterName(q)}`,
        body: `Los analistas calculan que ${s.company} ingresará unos ${fmtMoney(q.exp)} este trimestre (hasta el ${fmtDate(q.end - 1)}). ¿Qué prometemos al mercado? Si cumplimos, la acción sube; si no, cae, y más cuanto más hayamos prometido. Credibilidad actual: ${Math.round(St.cred)}/100.`,
        choices: GUIDANCE_ORDER.map((k) => ({ label: `${GUIDANCE[k].icon} ${GUIDANCE[k].name}: ${fmtMoney(q.exp * GUIDANCE[k].mult)}`, hint: GUIDANCE[k].hint })),
        days: 8,
        def: 1,
      };
    },
    resolve: (s, at, i) => setGuidance(s, GUIDANCE_ORDER[i], at).msg || 'La previsión ya estaba anunciada.',
  },
});
