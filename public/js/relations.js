// Relaciones entre empleados. Una vez por semana los compañeros de mesa o de
// equipo interactúan: salen amistades que suben el ánimo, roces que lo bajan y
// restan productividad, parejas (que a veces rompen) y mentorías que hacen
// crecer a los juniors. Las bajas por agotamiento se deciden en sim.js.
import { clamp, chance, rint, rfloat, fmtPct } from './util.js';
import { findEmp, notify, levelOf, digest } from './core.js';
import { registerMail, sendMail } from './mail.js';
import { teamPowers, isAssignable, assignTargets, targetLabel } from './sim.js';

const MAX_REL = 400;
export const REL_KINDS = {
  friend: { icon: '🤝', name: 'Amistad' },
  couple: { icon: '💕', name: 'Pareja' },
  rival: { icon: '😤', name: 'Roces' },
};

export const relOf = (s, a, b) => s.rel.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
export const relationsOf = (s, id) => s.rel.filter((r) => r.kind && (r.a === id || r.b === id));
const other = (r, id) => (r.a === id ? r.b : r.a);

// Compañeros cercanos: sobre todo los de las mesas de al lado; si no, alguien
// de la misma tarea.
function partner(s, e) {
  const desks = s.office.layout?.desks || [];
  const d = e.region || e.traits.includes('remote') ? null : desks[e.desk];
  const near = [];
  const team = [];
  for (const f of s.employees) {
    if (f === e || f.off > 0) continue;
    const g = f.region || f.traits.includes('remote') ? null : desks[f.desk];
    if (d && g && Math.abs(d.x - g.x) <= 28 && Math.abs(d.y - g.y) <= 30) near.push(f);
    else if (e.assign && f.assign === e.assign) team.push(f);
  }
  const pool = near.length && (!team.length || chance(s, 0.7)) ? near : team;
  return pool.length ? pool[rint(s, 0, pool.length - 1)] : null;
}

// Química de cada pareja: fija, para que unas congenien y otras choquen.
function chemistry(a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  const c = ((Math.imul(x, 7919) + Math.imul(y, 104729)) >>> 0) % 1000 / 500 - 1;
  return c * c * c;
}

function interact(s, e, f) {
  let d = chemistry(e.id, f.id) * 12 + rfloat(s, -6, 6);
  if (e.traits.includes('social')) d += 3;
  if (f.traits.includes('social')) d += 3;
  d += ((e.mood + f.mood) / 2 - 60) / 8;
  if (s.policies.crunch) d -= 4;
  if (e.role === f.role) d += 1.5;
  if (e.traits.includes('gamer') && f.traits.includes('gamer') && s.office.perks.arcade) d += 4;
  if (e.traits.includes('perfectionist') !== f.traits.includes('perfectionist')) d -= 2;
  let r = relOf(s, e.id, f.id);
  if (!r) {
    r = { a: e.id, b: f.id, v: 0, kind: null, since: s.day };
    s.rel.push(r);
  }
  r.v = clamp(r.v + d, -100, 100);
  if (r.kind === 'couple') return;
  const before = r.kind;
  r.kind = r.v >= 45 ? 'friend' : r.v <= -40 ? 'rival' : null;
  if (r.kind === before) return;
  r.since = s.day;
  if (r.kind === 'friend') digest(s, 'friend', `🤝 ${e.name} y ${f.name} se han hecho amigos.`);
  if (r.kind === 'rival' && !s.mail.some((m) => m.type === 'relRival' && m.done == null)) sendMail(s, 'relRival', { a: e.id, b: f.id });
}

function couples(s) {
  const taken = new Set();
  for (const r of s.rel) if (r.kind === 'couple') taken.add(r.a).add(r.b);
  for (const r of s.rel) {
    if (r.kind === 'friend' && r.v >= 80 && !taken.has(r.a) && !taken.has(r.b) && chance(s, 0.05)) {
      r.kind = 'couple';
      r.since = s.day;
      taken.add(r.a).add(r.b);
      const A = findEmp(s, r.a);
      const B = findEmp(s, r.b);
      digest(s, 'couple', `💕 ${A.name} y ${B.name} están saliendo.`);
    } else if (r.kind === 'couple') {
      const A = findEmp(s, r.a);
      const B = findEmp(s, r.b);
      const risk = 0.007 + (A.mood < 35 || B.mood < 35 ? 0.03 : 0);
      if (!chance(s, risk)) continue;
      r.kind = 'rival';
      r.v = -50;
      r.since = s.day;
      A.mood = Math.max(0, A.mood - 15);
      B.mood = Math.max(0, B.mood - 15);
      const pool = [A, B].filter((x) => x.role !== 'founder' && !x.traits.includes('loyal'));
      const leaver = pool.length ? pool[rint(s, 0, pool.length - 1)] : null;
      if (leaver && chance(s, 0.3)) {
        s.employees = s.employees.filter((x) => x !== leaver);
        notify(s, `💔 ${A.name} y ${B.name} lo han dejado. ${leaver.name} no puede más y se va de la empresa.`, 'bad');
      } else {
        notify(s, `💔 ${A.name} y ${B.name} lo han dejado. El ambiente está tenso.`, 'bad');
        if (!s.mail.some((m) => m.type === 'relRival' && m.done == null)) sendMail(s, 'relRival', { a: r.a, b: r.b });
      }
    }
  }
}

// Mentorías: un senior (o alguien con el rasgo Mentor que ya no sea junior)
// adopta a un junior.
function mentors(s) {
  const count = new Map();
  for (const e of s.employees) if (e.mentor) count.set(e.mentor, (count.get(e.mentor) || 0) + 1);
  for (const j of s.employees) {
    if (j.mentor) {
      if (levelOf(j.skill) >= 1) {
        const m = findEmp(s, j.mentor);
        j.mentor = null;
        if (m) digest(s, 'mentorDone', `🎓 ${j.name} ya vuela solo/a gracias a ${m.name}.`);
      }
      continue;
    }
    if (j.role === 'founder' || levelOf(j.skill) > 0 || !chance(s, 0.25)) continue;
    const pool = s.employees.filter((m) => m !== j && m.off <= 0 && !m.mentor && (count.get(m.id) || 0) < 2
      && levelOf(m.skill) >= 1
      && (m.role === j.role || m.traits.includes('mentor'))
      && (levelOf(m.skill) >= 2 || m.traits.includes('mentor')));
    if (!pool.length) continue;
    const m = pool[rint(s, 0, pool.length - 1)];
    j.mentor = m.id;
    count.set(m.id, (count.get(m.id) || 0) + 1);
    digest(s, 'mentor', `🎓 ${m.name} es ahora mentor/a de ${j.name}.`);
  }
}

export function relationsWeek(s) {
  const alive = new Set(s.employees.map((e) => e.id));
  s.rel = s.rel.filter((r) => alive.has(r.a) && alive.has(r.b));
  for (const e of s.employees) if (e.mentor && !alive.has(e.mentor)) e.mentor = null;
  const emps = s.employees.filter((e) => e.off <= 0);
  if (emps.length >= 2) {
    const n = Math.min(40, Math.ceil(emps.length / 2));
    for (let i = 0; i < n; i++) {
      const e = emps[rint(s, 0, emps.length - 1)];
      const f = partner(s, e);
      if (f) interact(s, e, f);
    }
  }
  couples(s);
  mentors(s);
  if (s.rel.length > MAX_REL) {
    s.rel.sort((x, y) => (y.kind ? 1000 : 0) + Math.abs(y.v) - ((x.kind ? 1000 : 0) + Math.abs(x.v)));
    s.rel.length = MAX_REL;
  }
}

// Efecto diario en ánimo y productividad de cada persona.
export function relFx(s) {
  const fx = new Map();
  const add = (id, mood, prod) => {
    const f = fx.get(id) || { mood: 0, prod: 0 };
    f.mood += mood;
    f.prod += prod;
    fx.set(id, f);
  };
  for (const r of s.rel) {
    if (r.kind === 'friend') {
      add(r.a, 1.5, 0);
      add(r.b, 1.5, 0);
    } else if (r.kind === 'couple') {
      add(r.a, 4, 0);
      add(r.b, 4, 0);
    } else if (r.kind === 'rival') {
      add(r.a, -3, -0.04);
      add(r.b, -3, -0.04);
    }
  }
  for (const f of fx.values()) {
    f.mood = clamp(f.mood, -9, 6);
    f.prod = Math.max(-0.1, f.prod);
  }
  return fx;
}

export function relSummary(s) {
  const out = { friend: 0, couple: 0, rival: 0, mentor: 0, burnout: 0 };
  for (const r of s.rel) if (r.kind) out[r.kind] += 1;
  for (const e of s.employees) {
    if (e.mentor) out.mentor += 1;
    if (e.off > 0 && e.offReason === 'Baja por agotamiento') out.burnout += 1;
  }
  return out;
}

// Separar: la segunda persona deja su tarea y se va a la mesa libre más lejana.
function separate(s, A, B) {
  if (isAssignable(B)) {
    const alt = assignTargets(s, B).map((x) => x.v).filter((v) => v !== A.assign);
    B.assign = alt.length ? alt[rint(s, 0, alt.length - 1)] : null;
  }
  const desks = s.office.layout?.desks || [];
  const from = desks[A.desk];
  if (!from || B.region || B.traits.includes('remote')) return;
  const used = new Set(s.employees.filter((e) => !e.region && !e.traits.includes('remote')).map((e) => e.desk));
  let best = -1;
  let dist = 0;
  desks.forEach((d, i) => {
    if (used.has(i)) return;
    const k = Math.abs(d.x - from.x) + Math.abs(d.y - from.y);
    if (k > dist) {
      dist = k;
      best = i;
    }
  });
  if (best >= 0) B.desk = best;
}

registerMail({
  relRival: {
    make: (s, { a, b }) => {
      const A = findEmp(s, a);
      const B = findEmp(s, b);
      if (!A || !B) return null;
      const win = Math.min(0.9, 0.45 + teamPowers(s).people * 0.1);
      return {
        from: 'Personas (RR.HH.)',
        icon: '😤',
        subject: `${A.name} y ${B.name} no se soportan`,
        body: 'Las discusiones ya se notan en el ambiente: los dos rinden menos y están de peor humor.',
        choices: [
          { label: 'Separarlos', hint: `${B.name} deja su tarea y cambia de mesa` },
          { label: 'Mediar', hint: `${fmtPct(win)} de arreglarlo (RR.HH. ayuda)` },
          { label: 'Dejarlo estar', hint: 'Puede ir a peor' },
        ],
        days: 10,
      };
    },
    resolve: (s, { a, b }, i) => {
      const A = findEmp(s, a);
      const B = findEmp(s, b);
      if (!A || !B) return 'Esa persona ya no está en la empresa.';
      // Si el roce ya no está registrado, se vuelve a apuntar para poder resolverlo.
      let r = relOf(s, a, b);
      if (!r) s.rel.push((r = { a, b, v: -45, kind: 'rival', since: s.day }));
      if (i === 0) {
        separate(s, A, B);
        r.v = -20;
        r.kind = null;
        return `${B.name} cambia de mesa${B.assign ? ` y pasa a ${targetLabel(s, B.assign)}` : ''}.`;
      }
      if (i === 1) {
        if (chance(s, Math.min(0.9, 0.45 + teamPowers(s).people * 0.1))) {
          r.v = 10;
          r.kind = null;
          return 'Hacen las paces después de una larga charla.';
        }
        r.v = Math.max(-100, r.v - 15);
        return 'La mediación sale mal: ahora se llevan todavía peor.';
      }
      return 'Lo dejas estar.';
    },
  },
});
