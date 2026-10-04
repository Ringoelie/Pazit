// Bandeja de entrada: mensajes de empleados, clientes, inversores, rivales y
// reguladores. Los que piden una decisión caducan y, si no contestas, se
// aplica la opción por defecto (la última, salvo que el correo diga otra).
// Otros módulos añaden tipos con registerMail().
import { LEVELS, CATEGORIES, FEATURES, MAX_FEATURE_LEVEL } from './data.js';
import { rnd, rint, pick, fmtMoney } from './util.js';
import { uid, has, findEmp, findProduct, notify, levelOf, expectedSalary } from './core.js';
import { queueFeature, featureAvailable, featureUnlocked, queuedLevel, makeContract, mrr, isRemote } from './sim.js';

export const MAIL_TYPES = {};
export function registerMail(types) {
  Object.assign(MAIL_TYPES, types);
}

const MAX_MAIL = 50;

// Plazo para contestar: entre 2 semanas y un mes de juego (a velocidad normal,
// de 1 a 2 minutos). Cada tipo de correo pide más o menos prisa con `days`.
export const mailDeadline = (days = 14) => Math.min(30, Math.max(14, Math.round(days * 2.5)));

export function sendMail(s, type, ctx = {}) {
  const def = MAIL_TYPES[type];
  const m = def?.make(s, ctx);
  if (!m) return null;
  const mail = {
    id: uid(s),
    type,
    ctx,
    day: s.day,
    from: m.from,
    icon: m.icon,
    subject: m.subject,
    body: m.body,
    choices: m.choices || null,
    def: m.choices && m.def != null ? m.def : null,
    expires: m.choices ? s.day + mailDeadline(m.days) : null,
    // Decisiones graves: con la opción del menú, el juego se pausa al llegar.
    critical: !!m.choices && (typeof def.critical === 'function' ? !!def.critical(s, ctx) : !!def.critical),
    read: false,
    done: null,
    outcome: '',
  };
  s.mail.unshift(mail);
  if (s.mail.length > MAX_MAIL) {
    // Se tiran primero los más viejos ya resueltos o informativos.
    const drop = [...s.mail].reverse().find((x) => !x.choices || x.done != null);
    s.mail = s.mail.filter((x) => x !== (drop || s.mail[s.mail.length - 1]));
  }
  notify(s, `📬 ${m.subject}`, 'mail');
  if (mail.critical && s.settings.pauseCritical && s.speed > 0) s.pauseFor = mail.id;
  return mail;
}

export function answerMail(s, id, idx) {
  const m = s.mail.find((x) => x.id === id);
  if (!m || !m.choices || m.done != null) return { ok: false, msg: 'Ese correo ya está contestado.' };
  m.done = idx;
  m.read = true;
  m.outcome = MAIL_TYPES[m.type]?.resolve?.(s, m.ctx, idx) || 'Hecho.';
  return { ok: true, msg: m.outcome };
}

// Opción que se aplica si el correo caduca sin respuesta.
export const defaultChoice = (m) => m.def ?? m.choices.length - 1;

export const pendingMail = (s) => s.mail.filter((m) => m.choices && m.done == null);
export const unreadMail = (s) => s.mail.filter((m) => !m.read).length;

export function markAllRead(s) {
  for (const m of s.mail) m.read = true;
}

// Caducidad de decisiones y correos "de ambiente" cada pocos días.
export function mailStep(s) {
  for (const m of s.mail) {
    if (m.choices && m.done == null && m.expires <= s.day) {
      const idx = defaultChoice(m);
      m.done = idx;
      m.expired = true;
      m.outcome = '⌛ Sin respuesta: ' + (MAIL_TYPES[m.type]?.resolve?.(s, m.ctx, idx) || 'se aplicó la opción por defecto.');
    }
  }
  if (s.day < s.nextMailDay) return;
  s.nextMailDay = s.day + rint(s, 20, 35);
  const pool = [];
  for (const [type, def] of Object.entries(MAIL_TYPES)) {
    if (!def.ambient) continue;
    const ctx = def.ambient(s);
    if (ctx) pool.push({ type, ctx, w: def.weight || 1 });
  }
  if (!pool.length) return;
  let r = rnd(s) * pool.reduce((a, x) => a + x.w, 0);
  for (const x of pool) {
    r -= x.w;
    if (r <= 0) return void sendMail(s, x.type, x.ctx);
  }
  sendMail(s, pool[0].type, pool[0].ctx);
}

const pendingFor = (s, type, key, val) => s.mail.some((m) => m.type === type && m.done == null && m.ctx[key] === val);
const levelName = (skill) => LEVELS[levelOf(skill)].name;

registerMail({
  welcome: {
    make: () => ({
      from: 'Tu yo del futuro',
      icon: '💌',
      subject: 'Bienvenida a tu bandeja de entrada',
      body: 'Aquí te escribirán empleados, clientes, inversores, rivales y reguladores, y aquí llegan también los imprevistos. Algunos correos piden una decisión: si no contestas a tiempo, se aplica la opción por defecto. ¡Suerte!',
    }),
  },

  raise: {
    weight: 3,
    ambient: (s) => {
      const list = s.employees.filter(
        (e) => e.role !== 'founder' && e.off <= 0 && e.salary < expectedSalary(e, s) * 0.92 && e.mood < 70 && !pendingFor(s, 'raise', 'eid', e.id),
      );
      return list.length ? { eid: pick(s, list).id } : null;
    },
    make: (s, { eid }) => {
      const e = findEmp(s, eid);
      if (!e) return null;
      const exp = expectedSalary(e, s);
      return {
        from: e.name,
        icon: '💸',
        subject: 'Petición de aumento',
        body: `Hola. Ya soy ${levelName(e.skill)} y cobro ${fmtMoney(e.salary)} al mes, pero en el mercado me pagarían ${fmtMoney(exp)}. ¿Podemos hablarlo?`,
        choices: [
          { label: `Subir a ${fmtMoney(exp)}`, hint: '+15 ánimo' },
          { label: 'Subida parcial (+5%)', hint: '+4 ánimo' },
          { label: 'Ahora no es posible', hint: '-12 ánimo' },
        ],
        days: 10,
      };
    },
    resolve: (s, { eid }, i) => {
      const e = findEmp(s, eid);
      if (!e) return 'Esa persona ya no está en la empresa.';
      if (i === 0) {
        e.salary = Math.max(e.salary, expectedSalary(e, s));
        e.mood = Math.min(100, e.mood + 15);
        e.unhappy = 0;
        return `${e.name} está encantado/a con su nuevo sueldo.`;
      }
      if (i === 1) {
        e.salary = Math.round((e.salary * 1.05) / 50) * 50;
        e.mood = Math.min(100, e.mood + 4);
        return `${e.name} acepta, aunque esperaba más.`;
      }
      if (e.salary >= expectedSalary(e, s) * 0.92) return `${e.name} ya cobra lo que pedía.`;
      e.mood = Math.max(0, e.mood - 12);
      return `${e.name} se queda con mal sabor de boca.`;
    },
  },

  remote: {
    weight: 0.8,
    ambient: (s) => {
      if (!has(s, 'remote')) return null;
      const list = s.employees.filter((e) => e.role !== 'founder' && !isRemote(e) && !e.region && !pendingFor(s, 'remote', 'eid', e.id));
      return list.length ? { eid: pick(s, list).id } : null;
    },
    make: (s, { eid }) => {
      const e = findEmp(s, eid);
      if (!e) return null;
      return {
        from: e.name,
        icon: '🏠',
        subject: '¿Puedo trabajar desde casa?',
        body: 'Me mudo lejos de la oficina. Rendiría igual (bueno, casi) trabajando en remoto. ¿Te parece bien?',
        choices: [{ label: 'Claro, adelante', hint: 'Libera su mesa; -10% productividad; +10 ánimo' }, { label: 'Prefiero verte en la oficina', hint: '-8 ánimo' }],
        days: 12,
      };
    },
    resolve: (s, { eid }, i) => {
      const e = findEmp(s, eid);
      if (!e) return 'Esa persona ya no está en la empresa.';
      if (i === 0) {
        if (!e.traits.includes('remote')) e.traits.push('remote');
        e.mood = Math.min(100, e.mood + 10);
        return `${e.name} ya trabaja en remoto. Su mesa queda libre.`;
      }
      e.mood = Math.max(0, e.mood - 8);
      return `${e.name} seguirá viniendo a la oficina, a regañadientes.`;
    },
  },

  idea: {
    weight: 2,
    ambient: (s) => {
      const makers = s.employees.filter((e) => ['dev', 'design', 'ai'].includes(e.role) && e.assign?.startsWith('p:'));
      if (!makers.length) return null;
      const e = pick(s, makers);
      const p = findProduct(s, +e.assign.slice(2));
      if (!p || p.queue.length >= 8) return null;
      const opts = Object.keys(CATEGORIES[p.cat].features).filter(
        (f) => featureAvailable(s, p, f) && featureUnlocked(s, f) && !p.queue.some((t) => t.f === f) && queuedLevel(p, f) < MAX_FEATURE_LEVEL,
      );
      return opts.length ? { eid: e.id, pid: p.id, f: pick(s, opts) } : null;
    },
    make: (s, { eid, pid, f }) => {
      const e = findEmp(s, eid);
      const p = findProduct(s, pid);
      if (!e || !p) return null;
      const F = FEATURES[f];
      const lvl = (p.features[f] || 0) + 1;
      return {
        from: e.name,
        icon: '💡',
        subject: `Idea para ${p.name}`,
        body: `He estado pensando: ${lvl > 1 ? `mejorar ${F.icon} ${F.name} al nivel ${lvl}` : `añadir ${F.icon} ${F.name}`} haría que ${p.name} destacara. ¿La probamos?`,
        choices: [{ label: 'Me encanta, prioridad máxima', hint: 'Va al principio de la cola; +hype' }, { label: 'Archivar la idea', hint: '-3 ánimo' }],
        days: 10,
      };
    },
    resolve: (s, { eid, pid, f }, i) => {
      const e = findEmp(s, eid);
      const p = findProduct(s, pid);
      if (i === 0 && p && e) {
        if (p.queue.some((t) => t.f === f)) return `${FEATURES[f].name} ya estaba en la cola.`;
        const r = queueFeature(s, pid, f);
        if (!r.ok) return 'No se pudo añadir: ' + (r.msg || 'la cola está llena.');
        p.queue.unshift(p.queue.pop());
        p.hype += 15;
        e.mood = Math.min(100, e.mood + 6);
        return `${FEATURES[f].name} encabeza la cola de ${p.name}.`;
      }
      if (e) e.mood = Math.max(0, e.mood - 3);
      return 'Idea archivada.';
    },
  },

  bigClient: {
    weight: 1.5,
    ambient: (s) => {
      if (s.reputation < 15 || s.contracts.active.length >= 3) return null;
      const c = makeContract(s);
      for (const k of ['code', 'design', 'ai']) c.need[k] = Math.round(c.need[k] * 2);
      c.pay = Math.round((c.pay * 3) / 100) * 100;
      c.days = Math.round(c.days * 1.6);
      c.rep += 3;
      return { contract: c };
    },
    make: (s, { contract: c }) => {
      return {
        from: c.client,
        icon: '🏢',
        subject: `Proyecto a medida: ${c.title}`,
        body: `Buscamos un equipo de confianza para un proyecto grande. Pagamos ${fmtMoney(c.pay)} si lo entregáis en ${c.days} días.`,
        choices: [{ label: 'Aceptar el proyecto', hint: `${fmtMoney(c.pay)} · +${c.rep} reputación al entregarlo` }, { label: 'Rechazar con amabilidad' }],
        days: 7,
      };
    },
    resolve: (s, { contract }, i) => {
      if (i !== 0) return 'Proyecto rechazado.';
      if (s.contracts.active.length >= 3) return 'Ya tienes 3 contratos en marcha: el cliente busca a otro.';
      const c = { ...contract, done: { code: 0, design: 0, ai: 0 } };
      c.deadline = s.day + c.days;
      s.contracts.active.push(c);
      return `Proyecto aceptado: ${c.title}. Asigna gente en la pestaña Contratos.`;
    },
  },

  investorCheck: {
    weight: 1,
    ambient: (s) => (s.funding.round > 0 && !pendingFor(s, 'investorCheck', 'x', 1) ? { x: 1 } : null),
    make: (s) => ({
      from: 'Consejo de inversores',
      icon: '📊',
      subject: 'Queremos un informe trimestral',
      body: '¿Cómo van los números? Nos gustaría ver el crecimiento de ingresos y usuarios de este trimestre.',
      choices: [{ label: 'Enviar el informe', hint: 'Si creces: +reputación. Si no: -reputación' }, { label: 'Ignorarlos', hint: '-1 reputación' }],
      days: 10,
    }),
    resolve: (s, ctx, i) => {
      if (i !== 0) {
        s.reputation = Math.max(0, s.reputation - 1);
        return 'Los inversores no están contentos con tu silencio.';
      }
      const past = s.history[Math.max(0, s.history.length - 13)];
      const growing = !past || mrr(s) >= past.mrr * 1.05;
      s.reputation = Math.max(0, Math.min(100, s.reputation + (growing ? 3 : -2)));
      return growing ? '📈 Los inversores aplauden tu crecimiento (+3 reputación).' : '📉 Les preocupa el estancamiento (-2 reputación).';
    },
  },
});
