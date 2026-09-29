// Ciberseguridad: cuantos más usuarios tienes, más te atacan. El nivel de
// seguridad sale de la investigación, del equipo de seguridad y de lo que
// contrates (auditorías, bug bounty, copias de seguridad). Las filtraciones y
// los secuestros llegan al correo y piden una decisión.
import { FEATURES } from './data.js';
import { clamp, chance, rint, rfloat, fmtMoney, fmtNum } from './util.js';
import { has, findProduct, notify, news, money, addEffect, hasEffect } from './core.js';
import { registerMail, sendMail } from './mail.js';
import { lawActive } from './world.js';
import { teamPowers, totalUsers, mrr, queueFeature, featureAvailable } from './sim.js';
import { isHW } from './hw.js';

export const BOUNTY_COST = 3000;
export const BACKUP_COST = 2000;
export const AUDIT_COST = 15000;
export const AUDIT_DAYS = 90;
const fail = (msg = '') => ({ ok: false, msg });

// Nivel de seguridad de 0 a 85. El equipo de seguridad protege menos cuanto
// más grande es la superficie que tiene que vigilar.
export function secLevel(s, tp = teamPowers(s)) {
  let l = 10;
  if (has(s, 'infosec')) l += 15;
  if (has(s, 'zerotrust')) l += 20;
  l += Math.min(30, (tp.sec * 36) / Math.max(1.5, attackSurface(s) * 1.5));
  l += Math.min(5, tp.ops);
  if (s.sec.bounty) l += 8;
  if (s.day - s.sec.audit < AUDIT_DAYS) l += 10;
  return clamp(Math.round(l), 0, 85);
}

// Superficie de ataque: nadie ataca a una startup con 5.000 usuarios.
export function attackSurface(s) {
  const u = totalUsers(s);
  return u < 5000 ? 0 : Math.log10(u) - 3;
}

export const dailyRisk = (s, tp) => 0.0016 * attackSurface(s) * (1 - secLevel(s, tp) / 100) * (hasEffect(s, 'secShield') ? 0.5 : 1);
export const yearlyAttacks = (s, tp) => dailyRisk(s, tp) * 365;

const targets = (s) => s.products.filter((p) => p.launched && !isHW(p) && p.users > 1000);

// Elige producto: más usuarios, más atractivo; la función Seguridad lo protege.
function pickTarget(s, list) {
  const w = list.map((p) => p.users / (1 + (p.features.security || 0) * 0.4));
  let r = w.reduce((a, b) => a + b, 0) * rfloat(s, 0, 1);
  for (let i = 0; i < list.length; i++) {
    r -= w[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

export function securityDay(s, tp) {
  if (s.sec.bounty) money(s, -BOUNTY_COST / 30, 'security');
  if (s.sec.backups) money(s, -BACKUP_COST / 30, 'security');
  const h = s.sec.hidden;
  if (h && s.day >= h.day) {
    s.sec.hidden = null;
    exposeLeak(s, h);
  }
  // Informes de hackers éticos, sobre todo con programa de bug bounty.
  if (s.day % 7 === 0 && targets(s).length && chance(s, s.sec.bounty ? 0.06 : 0.01)) {
    sendMail(s, 'secReport', { reward: Math.round(Math.max(2000, mrr(s, tp) * 0.02) / 500) * 500 });
  }
  const list = targets(s);
  if (!list.length || !chance(s, dailyRisk(s, tp))) return;
  attack(s, list, tp);
}

function attack(s, list, tp) {
  const p = pickTarget(s, list);
  const r = rfloat(s, 0, 8.5);
  s.sec.incidents += 1;
  if (r < 3) {
    s.stats.breaches = (s.stats.breaches || 0) + 1;
    sendMail(s, 'secBreach', { pid: p.id, n: Math.round(p.users * rfloat(s, 0.05, 0.3)) });
  } else if (r < 5) {
    p.down = Math.max(p.down, 3);
    sendMail(s, 'secRansom', { pid: p.id, amount: Math.round(Math.max(20000, mrr(s, tp) * 0.4) / 1000) * 1000 });
  } else if (r < 7) {
    if (has(s, 'zerotrust') || has(s, 'edge')) {
      notify(s, `🛡️ Ataque DDoS contra ${p.name} mitigado sin problemas.`, 'good');
      return;
    }
    p.down = Math.max(p.down, rint(s, 1, 2));
    notify(s, `🌊 Ataque DDoS: ${p.name} está caído. Seguridad avanzada o Edge computing lo evitarían.`, 'bad');
    news(s, `${p.name} sufre un ataque de denegación de servicio.`, 'bad');
  } else if (secLevel(s, tp) >= 50) {
    notify(s, '🎣 Tu equipo de seguridad ha bloqueado un intento de phishing.', 'good');
  } else {
    const loss = Math.round(clamp(s.money * 0.03, 2000, 80000) / 100) * 100;
    money(s, -loss, 'security');
    notify(s, `🎣 Alguien picó en un correo de phishing: te han robado ${fmtMoney(loss)}.`, 'bad');
  }
}

// Una filtración que ocultaste sale a la luz.
function exposeLeak(s, h) {
  const p = findProduct(s, h.pid);
  s.reputation = Math.max(0, s.reputation - 15);
  if (p) p.users *= 0.88;
  const fine = lawActive(s, 'privacy') ? Math.round((h.n * 3) / 1000) * 1000 : 0;
  if (fine) money(s, -fine, 'fines');
  notify(s, `📰 Sale a la luz la filtración que ocultaste${p ? ` en ${p.name}` : ''}.${fine ? ` Multa: ${fmtMoney(fine)}.` : ''}`, 'bad');
  news(s, `Escándalo: ${s.company} ocultó una filtración de datos.`, 'bad');
}

// ---------------------------------------------------------------- acciones

export function toggleBounty(s) {
  if (!has(s, 'infosec')) return fail('Investiga Ciberseguridad primero.');
  s.sec.bounty = !s.sec.bounty;
  return { ok: true, msg: s.sec.bounty ? '🐞 Programa de bug bounty en marcha.' : 'Programa de bug bounty cancelado.' };
}

export function toggleBackups(s) {
  s.sec.backups = !s.sec.backups;
  return { ok: true, msg: s.sec.backups ? '💾 Copias de seguridad diarias activadas.' : 'Copias de seguridad desactivadas.' };
}

export function buyAudit(s) {
  if (s.day - s.sec.audit < AUDIT_DAYS) return fail('Ya tienes una auditoría reciente.');
  if (s.money < AUDIT_COST) return fail(`Cuesta ${fmtMoney(AUDIT_COST)}.`);
  money(s, -AUDIT_COST, 'security');
  s.sec.audit = s.day;
  return { ok: true, msg: '🔍 Auditoría hecha: +10 de seguridad durante 3 meses.' };
}

// ---------------------------------------------------------------- correo

registerMail({
  secBreach: {
    make: (s, { pid, n }) => {
      const p = findProduct(s, pid);
      if (!p) return null;
      const law = lawActive(s, 'privacy');
      return {
        from: 'Equipo de seguridad',
        icon: '🕵️',
        subject: `Filtración de datos en ${p.name}`,
        body: `Unos atacantes han robado los datos de ${fmtNum(n)} usuarios de ${p.name}.${law ? ' La ley de protección de datos obliga a notificarlo.' : ''}`,
        choices: [
          { label: 'Ocultarlo', hint: 'Si sale a la luz: -15 reputación, se va el 12% y multa triple' },
          { label: 'Avisar a los usuarios', hint: `-4 reputación, se va un 3%${law ? ', multa reducida' : ''}` },
        ],
        days: 7,
      };
    },
    resolve: (s, { pid, n }, i) => {
      const p = findProduct(s, pid);
      if (!p) return 'Ese producto ya no existe.';
      if (i === 0) {
        if (chance(s, 0.55)) s.sec.hidden = { pid, n, day: s.day + rint(s, 20, 60) };
        return 'Lo has ocultado... de momento.';
      }
      s.reputation = Math.max(0, s.reputation - 4);
      p.users *= 0.97;
      if (featureAvailable(s, p, 'security') && !p.features.security) queueFeature(s, p.id, 'security');
      const fine = lawActive(s, 'privacy') ? Math.round((n * 0.5) / 1000) * 1000 : 0;
      if (fine) money(s, -fine, 'fines');
      return `Has avisado a tiempo${fine ? `. Multa reducida: ${fmtMoney(fine)}` : ''}. ${FEATURES.security.name} va a la cola.`;
    },
  },

  secRansom: {
    make: (s, { pid, amount }) => {
      const p = findProduct(s, pid);
      if (!p) return null;
      return {
        from: 'Remitente desconocido',
        icon: '💀',
        subject: `Ransomware: han secuestrado ${p.name}`,
        body: `Han cifrado los servidores de ${p.name} y piden ${fmtMoney(amount)} en cripto para devolverlos. ${s.sec.backups ? 'Tienes copias de seguridad al día.' : 'No tienes copias de seguridad recientes.'}`,
        choices: [
          { label: `Pagar ${fmtMoney(amount)}`, hint: '3 de cada 4 veces cumplen' },
          { label: 'Llamar a la policía', hint: '4 días caído, +2 reputación' },
          s.sec.backups ? { label: 'Restaurar las copias', hint: '1 día caído' } : { label: 'Reconstruir desde cero', hint: '6 días caído y pierdes usuarios' },
        ],
        days: 3,
      };
    },
    resolve: (s, { pid, amount }, i) => {
      const p = findProduct(s, pid);
      if (!p) return 'Ese producto ya no existe.';
      if (i === 0 && s.money >= amount) {
        money(s, -amount, 'security');
        if (chance(s, 0.75)) {
          p.down = 1;
          return 'Te devuelven las claves. Mañana todo vuelve a funcionar.';
        }
        p.down = 5;
        return 'Han cobrado y no han cumplido. Toca reconstruir.';
      }
      if (i === 1) {
        p.down = 4;
        s.reputation = Math.min(100, s.reputation + 2);
        return 'La policía investiga. Vuelves en 4 días.';
      }
      if (s.sec.backups) {
        p.down = 1;
        return '💾 Copias restauradas: vuelves mañana.';
      }
      p.down = 6;
      p.users *= 0.95;
      return 'Sin copias, toca reconstruir: 6 días caído.';
    },
  },

  secReport: {
    make: (s, { reward }) => ({
      from: 'Hacker ético',
      icon: '🐞',
      subject: 'He encontrado una vulnerabilidad',
      body: `Una investigadora de seguridad ha encontrado un fallo grave en tus sistemas y te lo cuenta antes de publicarlo. Pide una recompensa de ${fmtMoney(reward)}.`,
      choices: [
        { label: 'Ignorarlo', hint: 'Alguien menos amable podría encontrarlo' },
        { label: `Pagar ${fmtMoney(reward)} y arreglarlo`, hint: '+2 reputación y la mitad de riesgo durante 2 meses' },
      ],
      days: 10,
    }),
    resolve: (s, { reward }, i) => {
      if (i === 1 && s.money >= reward) {
        money(s, -reward, 'security');
        s.reputation = Math.min(100, s.reputation + 2);
        addEffect(s, 'secShield', 60, {});
        return '🐞 Fallo arreglado. La comunidad de seguridad te aplaude.';
      }
      const list = targets(s);
      if (list.length && chance(s, 0.4)) {
        const p = list[rint(s, 0, list.length - 1)];
        s.sec.hidden = { pid: p.id, n: Math.round(p.users * 0.1), day: s.day + rint(s, 15, 45) };
      }
      return 'Has ignorado el aviso.';
    },
  },
});
