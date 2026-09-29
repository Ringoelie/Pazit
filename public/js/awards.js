// Premios Pixel: cada 1 de noviembre se anuncian las nominaciones según cómo
// te ha ido el año y el 20 se celebra la gala. Ir con todo el equipo sube el
// ánimo y las opciones. Los premios dan reputación y se lucen en una vitrina.
import { AWARDS } from './data.js';
import { clamp, chance, dateOf, fmtMoney, fmtPct } from './util.js';
import { notify, news, money, addOfficeFx } from './core.js';
import { registerMail, sendMail } from './mail.js';
import { valuation, satisfaction } from './sim.js';
import { isHW } from './hw.js';

const GALA_COST = 150;

function base(s, tp) {
  return { day: s.day, val: valuation(s, tp), research: Object.keys(s.research).length };
}

// Candidaturas del año con su puntuación (0-1) y un texto que lo explica.
export function nominations(s, tp) {
  const A = s.awards;
  const out = [];
  const val = valuation(s, tp);
  const growth = val / Math.max(1, A.base.val);
  if (val >= 5e6 && growth >= 2) out.push({ id: 'startup', score: Math.min(1, (growth - 1) / 5), why: `valoración ×${growth.toFixed(1)}` });
  const best = s.products
    .filter((p) => p.launched && !isHW(p) && p.users >= 1e4)
    .map((p) => ({ p, sat: satisfaction(s, p) }))
    .sort((a, b) => b.sat - a.sat)[0];
  if (best && best.sat >= 0.7) out.push({ id: 'product', pid: best.p.id, score: (best.sat - 0.6) / 0.4, why: `${best.p.name}, ${fmtPct(best.sat)} de satisfacción` });
  const n = s.employees.length;
  const mood = n ? s.employees.reduce((a, e) => a + e.mood, 0) / n : 0;
  if (n >= 10 && mood >= 70) out.push({ id: 'work', score: (mood - 60) / 40, why: `ánimo medio ${Math.round(mood)}` });
  const gained = Object.keys(s.research).length - A.base.research;
  if (gained >= 3) out.push({ id: 'innovation', score: Math.min(1, gained / 8), why: `${gained} tecnologías investigadas` });
  return out;
}

export const winChance = (s, nom, gala = 1) => clamp(0.25 + 0.4 * nom.score + s.reputation / 300 + [0.1, 0, -0.1][gala], 0.1, 0.85);

export function awardsDay(s, tp) {
  const A = s.awards || (s.awards = { won: [], base: null, noms: null });
  if (!A.base) A.base = base(s, tp);
  const d = dateOf(s.day);
  if (d.m !== 10) return;
  if (d.d === 1 && A.noms?.year !== d.y) {
    const noms = nominations(s, tp);
    A.noms = { year: d.y, list: noms, gala: 1, done: false };
    if (noms.length) sendMail(s, 'awardsGala', { year: d.y });
  }
  if (d.d === 20 && A.noms?.year === d.y && !A.noms.done) ceremony(s, tp);
}

function ceremony(s, tp) {
  const A = s.awards;
  const N = A.noms;
  N.done = true;
  const wins = [];
  for (const nom of N.list) {
    if (!chance(s, winChance(s, nom, N.gala))) continue;
    wins.push(nom);
    A.won.push({ year: N.year, id: nom.id, why: nom.why });
    s.reputation = Math.min(100, s.reputation + 3);
    const p = nom.pid != null && s.products.find((x) => x.id === nom.pid);
    if (p) p.hype += 150;
  }
  A.base = base(s, tp);
  if (!N.list.length) return;
  if (!wins.length) {
    notify(s, `🏆 Premios Pixel ${N.year}: esta vez no hubo suerte. ¡El año que viene!`, 'info');
    return;
  }
  addOfficeFx(s, 'award', 1, { n: wins.length });
  const names = wins.map((w) => `${AWARDS[w.id].icon} ${AWARDS[w.id].name}`).join(' y ');
  news(s, `🏆 ${s.company} gana en los Premios Pixel ${N.year}: ${names}.`, 'good');
  notify(s, `🏆 ¡Premios Pixel ${N.year}! Ganas ${names}.`, 'achievement');
}

registerMail({
  awardsGala: {
    make: (s, { year }) => {
      const N = s.awards?.noms;
      if (!N || N.year !== year || !N.list.length) return null;
      const cost = GALA_COST * s.employees.length;
      const list = N.list.map((n) => `${AWARDS[n.id].icon} ${AWARDS[n.id].name} (${n.why}, ${fmtPct(winChance(s, n, 1))})`).join(', ');
      return {
        from: 'Premios Pixel',
        icon: '🏆',
        subject: `Nominaciones a los Premios Pixel ${year}`,
        body: `¡Enhorabuena! Estáis nominados a: ${list}. La gala es el 20 de noviembre. ¿Quién viene?`,
        choices: [
          { label: `Todo el equipo (${fmtMoney(cost)})`, hint: '+8 ánimo y más opciones de ganar' },
          { label: 'Voy yo con alguien del equipo', hint: 'Sin coste' },
          { label: 'No vamos', hint: 'Menos opciones de ganar' },
        ],
        days: 7,
        def: 1,
      };
    },
    resolve: (s, { year }, i) => {
      const N = s.awards?.noms;
      if (!N || N.year !== year || N.done) return 'La gala ya pasó.';
      const cost = GALA_COST * s.employees.length;
      if (i === 0 && s.money < cost) {
        N.gala = 1;
        return `No hay ${fmtMoney(cost)} para llevar a todo el equipo: vas con alguien.`;
      }
      N.gala = i;
      if (i === 0) {
        money(s, -cost, 'other');
        for (const e of s.employees) e.mood = Math.min(100, e.mood + 8);
        return '🎩 Todo el equipo irá de gala. Ya hay quien ensaya el discurso.';
      }
      return i === 1 ? 'Irás a la gala con alguien del equipo.' : 'Este año no vais a la gala.';
    },
  },
});
