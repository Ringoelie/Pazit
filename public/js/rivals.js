// Rivales con personalidad: cada competidor tiene CEO, estilo y rivalidad
// contigo. Cada mes pueden declararte una guerra de precios, demandarte,
// intentar fichar a tu gente o copiar tus funciones. Tú también puedes atacar.
import { RIVAL_STYLES, FEATURES, CATEGORIES, FIRST_NAMES, LAST_NAMES } from './data.js';
import { rint, pick, chance, fmtMoney, fmtPct } from './util.js';
import { findEmp, findProduct, news, money, makePerson } from './core.js';
import { registerMail, sendMail } from './mail.js';
import { legalWinChance } from './world.js';

const STYLE_IDS = Object.keys(RIVAL_STYLES);

export function ensureRivals(s) {
  for (const c of s.competitors) {
    if (c.style) continue;
    c.style = pick(s, STYLE_IDS);
    c.ceo = `${pick(s, FIRST_NAMES)} ${pick(s, LAST_NAMES)}`;
    c.rivalry = 0;
    c.last = '';
    c.lastDay = 0;
  }
}

const findComp = (s, id) => s.competitors.find((c) => c.id === id && c.alive);
const setLast = (s, c, text) => {
  c.last = text;
  c.lastDay = s.day;
};
const bestProduct = (s, cat) => s.products.filter((p) => p.launched && p.cat === cat).sort((a, b) => b.users - a.users)[0];

// Efecto de una guerra de precios sobre un producto.
export function warFx(s, p) {
  const w = p.war;
  if (!w || w.until <= s.day) return { conv: 1, rev: 1, target: 1 };
  if (w.response === 'match') return { conv: 1, rev: 0.8, target: 1 };
  return { conv: 0.7, rev: 1, target: 0.93 };
}

export function rivalMonth(s) {
  ensureRivals(s);
  for (const c of s.competitors) {
    if (!c.alive) continue;
    c.appeal *= 1 + RIVAL_STYLES[c.style].growth;
    const p = bestProduct(s, c.cat);
    if (!p) continue;
    c.rivalry = Math.min(100, c.rivalry + 2 + (p.share || 0) * 12);
    if (!chance(s, 0.07 + c.rivalry / 450)) continue;
    switch (c.style) {
      case 'agresivo':
        if (chance(s, 0.6) && !(p.war?.until > s.day)) {
          p.war = { rival: c.id, until: s.day + 60, response: 'hold' };
          c.appeal *= 1.06;
          setLast(s, c, `guerra de precios contra ${p.name}`);
          sendMail(s, 'priceWar', { cid: c.id, pid: p.id });
        } else {
          setLast(s, c, `demanda a ${s.company}`);
          sendMail(s, 'rivalLawsuit', { cid: c.id, amount: Math.max(20000, Math.round((c.users * 0.01) / 1000) * 1000) });
        }
        break;
      case 'cazatalentos': {
        const list = s.employees.filter((e) => e.role !== 'founder' && e.skill >= 55 && !e.traits.includes('loyal') && e.off <= 0);
        if (!list.length) break;
        const e = pick(s, list);
        setLast(s, c, `intenta fichar a ${e.name}`);
        sendMail(s, 'rivalPoach', { cid: c.id, eid: e.id, offer: Math.round((e.salary * 1.35) / 50) * 50 });
        break;
      }
      case 'innovador':
        c.appeal *= 1.1;
        setLast(s, c, 'lanza una gran actualización');
        news(s, `💡 ${c.name} sorprende con una actualización enorme.`);
        break;
      case 'copion':
        c.appeal *= 1.03;
        p.hype = Math.max(0, p.hype - 40);
        p.awareness *= 0.97;
        setLast(s, c, `campaña comparándose con ${p.name}`);
        sendMail(s, 'rivalAd', { cid: c.id, pid: p.id });
        break;
      default:
        break;
    }
  }
}

// Los copiones reaccionan cuando lanzas una función en su mercado.
export function onShip(s, p, f, lvl) {
  if (!p.launched) return;
  for (const c of s.competitors) {
    if (!c.alive || c.cat !== p.cat || c.style !== 'copion' || s.day - (c.copyDay || -999) < 30) continue;
    if (!chance(s, 0.35)) continue;
    const w = CATEGORIES[p.cat].features[f] ?? 0.4;
    c.appeal += FEATURES[f].appeal * w * (0.6 + 0.2 * lvl);
    c.rivalry = Math.min(100, c.rivalry + 5);
    c.copyDay = s.day;
    setLast(s, c, `copia tu función «${FEATURES[f].name}»`);
    news(s, `🦜 ${c.name} copia la función ${FEATURES[f].name} de ${p.name}.`, 'bad');
  }
}

// ---------------------------------------------------------------- tus ataques

export const poachCost = (c) => Math.round((15000 + c.appeal * 60) / 1000) * 1000;
export const smearCost = (s, c) => Math.round((20000 + c.users * 0.02) / 1000) * 1000;
export const rivalCooldown = (s, c, key, days) => Math.max(0, (c[key] ?? -999) + days - s.day);

export function poachFrom(s, cid) {
  const c = findComp(s, cid);
  if (!c) return { ok: false };
  const wait = rivalCooldown(s, c, 'poachDay', 60);
  if (wait) return { ok: false, msg: `Su gente está alerta. Espera ${wait} días.` };
  const cost = poachCost(c);
  if (s.money < cost) return { ok: false, msg: `Cuesta ${fmtMoney(cost)}.` };
  money(s, -cost, 'hiring');
  const roles = ['dev', 'dev', 'design', 'marketer', 'research'];
  const e = makePerson(s, pick(s, roles), { skill: rint(s, 68, 90) });
  e.salary = Math.round((e.salary * 1.2) / 50) * 50;
  s.candidates.unshift(e);
  c.appeal *= 0.97;
  c.rivalry = Math.min(100, c.rivalry + 15);
  c.poachDay = s.day;
  setLast(s, c, `pierde talento a manos de ${s.company}`);
  return { ok: true, msg: `🧲 ${e.name} deja ${c.name} y está en tu lista de candidatos.` };
}

export function smear(s, cid) {
  const c = findComp(s, cid);
  if (!c) return { ok: false };
  const p = bestProduct(s, c.cat);
  if (!p) return { ok: false, msg: 'Necesitas un producto lanzado en ese mercado.' };
  const wait = rivalCooldown(s, c, 'smearDay', 45);
  if (wait) return { ok: false, msg: `Espera ${wait} días para otra campaña.` };
  const cost = smearCost(s, c);
  if (s.money < cost) return { ok: false, msg: `Cuesta ${fmtMoney(cost)}.` };
  money(s, -cost, 'marketing');
  p.hype += 120;
  c.appeal *= 0.94;
  c.rivalry = Math.min(100, c.rivalry + 20);
  c.smearDay = s.day;
  setLast(s, c, `recibe una campaña comparativa de ${s.company}`);
  if (c.style === 'agresivo' && chance(s, 0.5)) {
    sendMail(s, 'rivalLawsuit', { cid: c.id, amount: Math.max(30000, cost * 2) });
  }
  return { ok: true, msg: `📣 Campaña contra ${c.name}: ${p.name} gana hype y ellos pierden atractivo.` };
}

// ---------------------------------------------------------------- correos

registerMail({
  priceWar: {
    make: (s, { cid, pid }) => {
      const c = findComp(s, cid);
      const p = findProduct(s, pid);
      if (!c || !p) return null;
      return {
        from: `${c.ceo} (CEO de ${c.name})`,
        icon: '😠',
        subject: `${c.name} declara una guerra de precios`,
        body: `${c.name} baja sus precios para quitarle usuarios a ${p.name}. Durante 60 días la conversión a premium caerá y crecerás menos.`,
        choices: [
          { label: 'Bajar también nuestros precios', hint: 'Mantienes usuarios pero ingresas un 20% menos' },
          { label: `Campaña de respuesta (${fmtMoney(30000 + p.users * 0.01)})`, hint: '+150 hype; 50% de acabar con la guerra' },
          { label: 'Aguantar', hint: '-30% conversión y algo menos de crecimiento' },
        ],
        days: 7,
      };
    },
    resolve: (s, { cid, pid }, i) => {
      const p = findProduct(s, pid);
      if (!p?.war) return 'La guerra ya terminó.';
      if (i === 0) {
        p.war.response = 'match';
        return 'Igualas precios: menos ingresos, pero nadie se va.';
      }
      if (i === 1) {
        const cost = 30000 + p.users * 0.01;
        if (s.money < cost) {
          p.war.response = 'hold';
          return 'No había dinero para la campaña: toca aguantar.';
        }
        money(s, -cost, 'marketing');
        p.hype += 150;
        if (chance(s, 0.5)) {
          p.war.until = s.day;
          const c = findComp(s, cid);
          if (c) c.rivalry = Math.min(100, c.rivalry + 10);
          return '🎯 Tu campaña deja en ridículo su oferta. Fin de la guerra.';
        }
        return 'La campaña da hype, pero la guerra sigue.';
      }
      p.war.response = 'hold';
      return 'Aguantas el chaparrón.';
    },
  },

  rivalLawsuit: {
    make: (s, { cid, amount }) => {
      const c = findComp(s, cid);
      if (!c) return null;
      const win = legalWinChance(s, 0.35);
      return {
        from: `Abogados de ${c.name}`,
        icon: '⚖️',
        subject: `${c.name} te demanda`,
        body: `${c.ceo} asegura que ${s.company} le ha copiado una patente. Piden ${fmtMoney(amount)}.`,
        choices: [
          { label: 'Pelear en los tribunales', hint: `${fmtPct(win)} de ganar (+3 reputación); si pierdes, pagas un 60% más` },
          { label: 'Llegar a un acuerdo', hint: fmtMoney(amount) },
        ],
        days: 10,
      };
    },
    resolve: (s, { cid, amount }, i) => {
      const c = findComp(s, cid);
      if (i === 0) {
        if (chance(s, legalWinChance(s, 0.35))) {
          s.reputation = Math.min(100, s.reputation + 3);
          if (c) c.rivalry = Math.min(100, c.rivalry + 10);
          return '⚖️ ¡Ganas el juicio! Tu reputación sube.';
        }
        money(s, -amount * 1.6, 'fines');
        return `Pierdes el juicio: pagas ${fmtMoney(amount * 1.6)}.`;
      }
      money(s, -amount, 'fines');
      return `Acuerdo firmado: ${fmtMoney(amount)}.`;
    },
  },

  rivalPoach: {
    make: (s, { cid, eid, offer }) => {
      const c = findComp(s, cid);
      const e = findEmp(s, eid);
      if (!c || !e) return null;
      return {
        from: e.name,
        icon: '🧲',
        subject: `${c.name} me ha hecho una oferta`,
        body: `${c.ceo} me ofrece ${fmtMoney(offer)} al mes por irme a ${c.name}. Aquí cobro ${fmtMoney(e.salary)}. ¿Qué me dices?`,
        choices: [
          { label: `Igualar: ${fmtMoney(offer)}/mes`, hint: '+10 ánimo' },
          { label: 'Ofrecerle stock options', hint: 'Cedes un 0,3% de la empresa; +15 ánimo' },
          { label: 'Dejarle marchar', hint: `${c.name} gana atractivo` },
        ],
        days: 6,
      };
    },
    resolve: (s, { cid, eid, offer }, i) => {
      const c = findComp(s, cid);
      const e = findEmp(s, eid);
      if (!e) return 'Ya no trabajaba aquí.';
      if (i === 0) {
        e.salary = offer;
        e.mood = Math.min(100, e.mood + 10);
        return `${e.name} se queda con su nuevo sueldo.`;
      }
      if (i === 1) {
        s.equity *= 0.997;
        e.mood = Math.min(100, e.mood + 15);
        return `${e.name} se queda: ahora es un poco dueño/a de la empresa.`;
      }
      s.employees = s.employees.filter((x) => x !== e);
      if (c) c.appeal *= 1.04;
      news(s, `${e.name} ficha por ${c?.name || 'la competencia'}.`, 'bad');
      return `${e.name} se va a ${c?.name || 'la competencia'}.`;
    },
  },

  rivalAd: {
    make: (s, { cid, pid }) => {
      const c = findComp(s, cid);
      const p = findProduct(s, pid);
      if (!c || !p) return null;
      return {
        from: 'Tu equipo de marketing',
        icon: '🦜',
        subject: `${c.name} se compara con ${p.name}`,
        body: `${c.name} ha lanzado anuncios comparándose con ${p.name} y nos ha robado atención. Puedes responder desde la pestaña Mercado con una campaña comparativa.`,
      };
    },
  },
});
