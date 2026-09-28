// El mundo alrededor de tu empresa: temporadas, expansión internacional y leyes.
import { SEASONS, REGIONS, LAWS, FEATURES } from './data.js';
import { chance, dateOf, fmtMoney, fmtPct } from './util.js';
import { has, findProduct, news, money } from './core.js';
import { registerMail, sendMail } from './mail.js';
import { teamPowers, isAIProduct } from './sim.js';

// ---------------------------------------------------------------- temporadas

export const seasonOf = (s) => SEASONS[dateOf(s.day).m] || null;
export const seasonDemand = (s, cat) => seasonOf(s)?.demand?.[cat] ?? 1;
export const seasonTx = (s, cat) => seasonOf(s)?.tx?.[cat] ?? 1;

// ---------------------------------------------------------------- regiones

// Qué parte de una región alcanza un producto según sus idiomas.
export function langReach(p, region) {
  const r = REGIONS[region];
  const l = p.features.i18n || 0;
  if (r.lang === 'es') return 1;
  if (r.lang === 'en') return l ? 1 : 0.25;
  return l >= 3 ? 1 : Math.max(0.15, l / 3);
}

export const openRegions = (s) => Object.keys(s.regions || {});

export function regionMarket(s, p) {
  let m = 1;
  for (const id of openRegions(s)) m += REGIONS[id].market * langReach(p, id);
  return m;
}

// Ingreso medio por usuario ponderado por regiones (Norteamérica paga más).
export function regionArpu(s, p) {
  let w = 1;
  let v = 1;
  for (const id of openRegions(s)) {
    const x = REGIONS[id].market * langReach(p, id);
    w += x;
    v += x * REGIONS[id].arpu;
  }
  return v / w;
}

export const regionStaff = (s, id) => s.employees.filter((e) => e.region === id).length;
export const regionRent = (s) => openRegions(s).reduce((a, id) => a + REGIONS[id].rent, 0);

export function openRegion(s, id) {
  const r = REGIONS[id];
  if (!r) return { ok: false };
  if (s.regions[id] != null) return { ok: false, msg: 'Ya tienes sede allí.' };
  if (s.money < r.open) return { ok: false, msg: `Abrir la sede cuesta ${fmtMoney(r.open)}.` };
  money(s, -r.open, 'regions');
  s.regions[id] = s.day;
  s.reputation = Math.min(100, s.reputation + 3);
  s.candidatesDay = -999;
  news(s, `${r.flag} ${s.company} abre sede en ${r.name}.`, 'good');
  return { ok: true, msg: `${r.flag} ¡Nueva sede en ${r.name}! Ya puedes contratar allí.` };
}

// ---------------------------------------------------------------- leyes

export const lawActive = (s, id) => s.laws?.[id] != null;
export const lawById = (id) => LAWS.find((l) => l.id === id);

// Leyes que incumple un producto lanzado.
export function complianceIssues(s, p) {
  if (!p.launched) return [];
  const out = [];
  for (const law of LAWS) {
    if (!law.require || !lawActive(s, law.id) || p.features[law.require]) continue;
    if (law.minUsers && p.users < law.minUsers) continue;
    if (law.ai && !isAIProduct(p)) continue;
    out.push(law);
  }
  return out;
}

export const legalWinChance = (s, base) => Math.min(0.85, base + teamPowers(s).legal * 0.12);

function fineFor(p, law) {
  if (law.id === 'aiact') return Math.max(20000, Math.round((p.rev?.total || 0) * 365 * 0.03));
  return Math.max(10000, Math.round(p.users * 0.05));
}

export function worldDay(s, newMonth) {
  for (const law of LAWS) {
    if (s.laws[law.id] != null || s.day < law.day) continue;
    s.laws[law.id] = s.day;
    if (law.day > 0) {
      news(s, `${law.icon} Entra en vigor: ${law.name}.`, 'bad');
      sendMail(s, 'lawEnacted', { id: law.id });
    }
  }
  if (lawActive(s, 'digitaltax') && s.rev30?.length) {
    const avg = s.rev30.reduce((a, b) => a + b, 0) / s.rev30.length;
    if (avg * 30 > 1e6) money(s, -s.rev30[s.rev30.length - 1] * 0.03, 'taxes');
  }
  if (!newMonth) return;
  const shield = 1 - Math.min(0.6, teamPowers(s).legal * 0.15);
  for (const p of s.products) {
    for (const law of complianceIssues(s, p)) {
      if (chance(s, 0.25 * shield)) sendMail(s, 'fine', { pid: p.id, law: law.id, amount: fineFor(p, law) });
    }
    const pending = s.mail.some((m) => m.type === 'antitrust' && m.done == null && m.ctx.pid === p.id);
    if (lawActive(s, 'antitrust') && p.launched && (p.share || 0) > 0.6 && p.users > 1e6 && !(p.antitrust > s.day) && !pending) {
      sendMail(s, 'antitrust', { pid: p.id });
    }
  }
}

registerMail({
  lawEnacted: {
    make: (s, { id }) => {
      const law = lawById(id);
      const advice = law.require
        ? has(s, 'compliance')
          ? `Añade "${FEATURES[law.require].name}" a tus productos afectados.`
          : 'Investiga "Cumplimiento normativo" para poder adaptar tus productos.'
        : '';
      return { from: 'Boletín Oficial', icon: law.icon, subject: `Entra en vigor: ${law.name}`, body: `${law.desc} ${advice}` };
    },
  },

  fine: {
    make: (s, { pid, law, amount }) => {
      const p = findProduct(s, pid);
      const L = lawById(law);
      if (!p) return null;
      const win = legalWinChance(s, 0.25);
      return {
        from: 'Agencia reguladora',
        icon: '🚨',
        subject: `Multa a ${p.name}: ${fmtMoney(amount)}`,
        body: `${p.name} incumple la ${L.name}. Añade "${FEATURES[L.require].name}" para evitar más sanciones.`,
        choices: [{ label: 'Recurrir con abogados', hint: `${fmtPct(win)} de ganar; si pierdes, pagas un 50% más` }, { label: 'Pagar la multa', hint: fmtMoney(amount) }],
        days: 14,
      };
    },
    resolve: (s, { amount }, i) => {
      if (i === 0) {
        if (chance(s, legalWinChance(s, 0.25))) return '⚖️ ¡Recurso ganado! No pagas nada.';
        money(s, -amount * 1.5, 'fines');
        return `Recurso perdido: pagas ${fmtMoney(amount * 1.5)}.`;
      }
      money(s, -amount, 'fines');
      return `Multa pagada: ${fmtMoney(amount)}.`;
    },
  },

  antitrust: {
    make: (s, { pid }) => {
      const p = findProduct(s, pid);
      if (!p) return null;
      const win = legalWinChance(s, 0.2);
      return {
        from: 'Comisión de la Competencia',
        icon: '🏛️',
        subject: `Investigación antimonopolio: ${p.name}`,
        body: `${p.name} controla el ${fmtPct(p.share)} de su mercado. Sospechamos abuso de posición dominante.`,
        choices: [
          { label: 'Recurrir con abogados', hint: `${fmtPct(win)} de ganar; si pierdes: multa del 5% de tus ingresos anuales y crecimiento limitado` },
          { label: 'Vender parte del negocio', hint: '-25% usuarios, +8 reputación' },
          { label: 'Colaborar', hint: 'Multa del 2% de tus ingresos anuales y crecimiento limitado 6 meses' },
        ],
        days: 20,
      };
    },
    resolve: (s, { pid }, i) => {
      const p = findProduct(s, pid);
      if (!p) return 'El producto ya no existe.';
      const annual = s.rev30.reduce((a, b) => a + b, 0) * 12;
      if (i === 0) {
        if (chance(s, legalWinChance(s, 0.2))) return '⚖️ El tribunal te da la razón. Caso cerrado.';
        money(s, -annual * 0.05, 'fines');
        p.antitrust = s.day + 270;
        return `Perdiste: multa de ${fmtMoney(annual * 0.05)} y crecimiento limitado 9 meses.`;
      }
      if (i === 1) {
        p.users *= 0.75;
        s.reputation = Math.min(100, s.reputation + 8);
        news(s, `${s.company} vende parte de ${p.name} para cumplir con Competencia.`);
        return 'Has cedido parte del negocio. Los reguladores quedan satisfechos.';
      }
      money(s, -annual * 0.02, 'fines');
      p.antitrust = s.day + 180;
      return `Multa de ${fmtMoney(annual * 0.02)} y crecimiento limitado 6 meses.`;
    },
  },
});
