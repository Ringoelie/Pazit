// Eventos aleatorios con decisiones. El contexto (ctx) es JSON plano para
// que un evento pendiente sobreviva a guardar y cargar la partida.
import { PERKS } from './data.js';
import { rint, chance, pick, dateOf, fmtMoney } from './util.js';
import { has, findEmp, findProduct, news, money, addEffect, makePerson, expectedSalary } from './core.js';
import { valuation, queueFeature, isAIProduct, featureAvailable, installPerk } from './sim.js';

const live = (s) => s.products.filter((p) => p.launched && p.users > 500);
const best = (s) => live(s).sort((a, b) => b.users - a.users)[0];
const pname = (s, ctx) => findProduct(s, ctx.pid)?.name ?? 'tu producto';

export const EVENTS = {
  viral: {
    weight: (s) => (live(s).length ? 3 : 0),
    setup: (s) => ({ pid: pick(s, live(s)).id }),
    view: (s, ctx) => ({
      icon: '🔥',
      title: '¡Te has hecho viral!',
      text: `Un post sobre ${pname(s, ctx)} arrasa en redes. Miles de personas lo comparten.`,
      choices: [
        { label: 'Aprovechar la ola ($5k en anuncios)', hint: '+300 hype' },
        { label: 'Disfrutar el momento', hint: '+150 hype' },
      ],
    }),
    resolve: (s, ctx, i) => {
      const p = findProduct(s, ctx.pid);
      if (!p) return '';
      if (i === 0 && s.money >= 5000) {
        money(s, -5000, 'marketing');
        p.hype += 300;
        return `${p.name} está en boca de todos.`;
      }
      p.hype += 150;
      return `${p.name} gana visibilidad.`;
    },
  },

  poach: {
    weight: (s) => (s.employees.some((e) => e.role !== 'founder' && e.skill >= 50 && !e.traits.includes('loyal')) ? 2.5 : 0),
    setup: (s) => {
      const list = s.employees.filter((e) => e.role !== 'founder' && e.skill >= 50 && !e.traits.includes('loyal'));
      const e = pick(s, list);
      return { eid: e.id, offer: Math.round((e.salary * 1.3) / 50) * 50 };
    },
    view: (s, ctx) => {
      const e = findEmp(s, ctx.eid);
      return {
        icon: '🏴‍☠️',
        title: 'Intento de fichaje',
        text: `Una BigTech le ofrece a ${e?.name ?? 'alguien del equipo'} ${fmtMoney(ctx.offer)}/mes. ¿Qué haces?`,
        choices: [
          { label: 'Igualar la oferta', hint: `Sueldo a ${fmtMoney(ctx.offer)}` },
          { label: 'Recordarle nuestra misión', hint: '50% se queda' },
          { label: 'Dejarle marchar' },
        ],
      };
    },
    resolve: (s, ctx, i) => {
      const e = findEmp(s, ctx.eid);
      if (!e) return '';
      if (i === 0) {
        e.salary = ctx.offer;
        e.mood = Math.min(100, e.mood + 15);
        return `${e.name} se queda. Y ahora cobra mejor.`;
      }
      if (i === 1 && chance(s, 0.5)) {
        e.mood = Math.max(0, e.mood - 10);
        return `${e.name} se queda, aunque no del todo convencido/a.`;
      }
      s.employees = s.employees.filter((x) => x !== e);
      news(s, `${e.name} ficha por una BigTech.`, 'bad');
      return `${e.name} se ha ido a la competencia.`;
    },
  },

  heatwave: {
    weight: (s) => {
      const m = dateOf(s.day).m;
      return m >= 5 && m <= 7 && !s.office.perks.ac ? 4 : 0;
    },
    view: () => ({
      icon: '🥵',
      title: 'Ola de calor',
      text: 'La oficina es un horno. El equipo rinde menos y se derrite frente al teclado.',
      choices: [
        { label: `Instalar aire acondicionado (${fmtMoney(PERKS.ac.cost)})`, hint: 'Problema resuelto' },
        { label: 'Aguantar con ventiladores', hint: '-20% producción 20 días' },
      ],
    }),
    resolve: (s, ctx, i) => {
      if (i === 0 && s.money >= PERKS.ac.cost) {
        money(s, -PERKS.ac.cost, 'office');
        installPerk(s, 'ac');
        return '❄️ Aire acondicionado instalado. ¡Qué gloria!';
      }
      addEffect(s, 'heat', 20, { heat: 0.8 });
      return 'Toca sudar. -20% de producción durante 20 días.';
    },
  },

  breach: {
    weight: (s) => {
      const list = s.products.filter((p) => p.launched && p.users > 5000);
      if (!list.length) return 0;
      return list.some((p) => !p.features.security) ? 2 : 0.3;
    },
    setup: (s) => {
      const list = s.products.filter((p) => p.launched && p.users > 5000);
      const weak = list.filter((p) => !p.features.security);
      const p = pick(s, weak.length ? weak : list);
      return { pid: p.id, fine: Math.round(Math.max(5000, p.users * 0.2) / 1000) * 1000 };
    },
    view: (s, ctx) => ({
      icon: '🕵️',
      title: 'Brecha de seguridad',
      text: `Unos hackers han accedido a datos de ${pname(s, ctx)}. La multa podría ser de ${fmtMoney(ctx.fine)}.`,
      choices: [
        { label: 'Comunicarlo con transparencia', hint: 'Multa, -10% usuarios, -3 reputación' },
        { label: 'Taparlo y rezar', hint: 'Si se descubre: el doble de todo' },
      ],
    }),
    resolve: (s, ctx, i) => {
      const p = findProduct(s, ctx.pid);
      s.stats.breaches += 1;
      if (!p) return '';
      if (i === 0) {
        money(s, -ctx.fine, 'other');
        p.users *= 0.9;
        s.reputation = Math.max(0, s.reputation - 3);
        if (featureAvailable(s, p, 'security') && !p.features.security) queueFeature(s, p.id, 'security');
        return 'La gente valora tu honestidad. Seguridad y 2FA añadida a la cola.';
      }
      if (chance(s, 0.5)) return 'Nadie se enteró... esta vez.';
      money(s, -ctx.fine * 2, 'other');
      p.users *= 0.75;
      s.reputation = Math.max(0, s.reputation - 15);
      news(s, `Escándalo: ${s.company} ocultó una brecha de datos en ${p.name}.`, 'bad');
      return 'Se descubrió el pastel. Multa doble y reputación por los suelos.';
    },
  },

  aiHype: {
    weight: (s) => (has(s, 'ml') ? 1.5 : 0),
    view: (s) => ({
      icon: '🧠',
      title: 'Fiebre de la IA',
      text: 'Los medios no hablan de otra cosa. Los productos con IA crecen un 50% más durante 60 días.',
      choices: [{ label: s.products.some(isAIProduct) ? '¡A surfear la ola!' : 'Tomar nota para el futuro' }],
    }),
    resolve: (s) => {
      addEffect(s, 'aiHype', 60, { aiHype: 1.5 });
      for (const p of s.products) if (isAIProduct(p)) p.hype += 100;
      return 'La IA está de moda.';
    },
  },

  recession: {
    weight: (s) => (s.day > 365 ? 1 : 0),
    view: () => ({
      icon: '📉',
      title: 'Crisis económica',
      text: 'Los mercados caen. Durante 90 días la publicidad paga un 30% menos y los inversores están tacaños.',
      choices: [{ label: 'Apretarse el cinturón' }],
    }),
    resolve: (s) => {
      addEffect(s, 'recession', 90, { ads: 0.7, invest: 0.6, econ: 0.9 });
      news(s, 'Recesión: la inversión en startups se congela.', 'bad');
      return 'Toca resistir.';
    },
  },

  hackathon: {
    weight: (s) => (s.employees.length >= 3 ? 2 : 0),
    view: (s) => ({
      icon: '🧑‍💻',
      title: 'Propuesta de hackathon',
      text: 'El equipo quiere organizar un hackathon de fin de semana con pizza y energía infinita.',
      choices: [
        { label: 'Adelante ($3k)', hint: `+${s.employees.length * 6} PI, +10 ánimo, -15 energía` },
        { label: 'Mejor no', hint: '-3 ánimo' },
      ],
    }),
    resolve: (s, ctx, i) => {
      if (i === 0 && s.money >= 3000) {
        money(s, -3000, 'other');
        s.rp += s.employees.length * 6;
        for (const e of s.employees) {
          e.mood = Math.min(100, e.mood + 10);
          e.energy = Math.max(0, e.energy - 15);
        }
        return '🍕 ¡Hackathon épico! Ideas nuevas para el laboratorio.';
      }
      for (const e of s.employees) e.mood = Math.max(0, e.mood - 3);
      return 'El equipo se queda con las ganas.';
    },
  },

  llama: {
    weight: (s) => (s.day > 60 && s.products.length ? 0.8 : 0),
    setup: (s) => ({ amount: Math.round((20000 + s.reputation * 1500) / 1000) * 1000 }),
    view: (s, ctx) => ({
      icon: '🦙',
      title: 'Un inversor excéntrico',
      text: `Un millonario te ofrece ${fmtMoney(ctx.amount)} sin pedir acciones. Solo quiere que tu próxima función se llame "Modo Llama".`,
      choices: [{ label: 'Aceptar, ¿por qué no?', hint: `+${fmtMoney(ctx.amount)}` }, { label: 'Tenemos principios' }],
    }),
    resolve: (s, ctx, i) => {
      if (i === 0) {
        money(s, ctx.amount, 'funding');
        return '🦙 Modo Llama activado. El dinero es real.';
      }
      s.reputation = Math.min(100, s.reputation + 1);
      return 'Mantienes tu dignidad (y +1 de reputación).';
    },
  },

  patent: {
    weight: (s) => (live(s).length && s.day > 120 ? 1.2 : 0),
    setup: (s) => ({ amount: Math.round(Math.max(8000, valuation(s) * 0.004) / 1000) * 1000 }),
    view: (s, ctx) => ({
      icon: '⚖️',
      title: 'Troll de patentes',
      text: `Una empresa fantasma te demanda por "usar un botón con forma de corazón". Piden ${fmtMoney(ctx.amount)}.`,
      choices: [
        { label: 'Pagar y olvidarse', hint: fmtMoney(ctx.amount) },
        { label: 'Pelear en los tribunales', hint: '60% ganas (+5 rep.), 40% pagas el doble' },
      ],
    }),
    resolve: (s, ctx, i) => {
      if (i === 0) {
        money(s, -ctx.amount, 'other');
        return 'Pagado. Qué rabia.';
      }
      if (chance(s, 0.6)) {
        s.reputation = Math.min(100, s.reputation + 5);
        news(s, `${s.company} gana a un troll de patentes. Internet aplaude.`, 'good');
        return '⚖️ ¡Victoria! El juez se ríe de la demanda.';
      }
      money(s, -ctx.amount * 2, 'other');
      return 'Perdiste. Pagas el doble más costas.';
    },
  },

  press: {
    weight: (s) => (s.products.some((p) => p.launched) ? 1.5 : 0),
    view: (s) => ({
      icon: '🎤',
      title: 'Entrevista en la prensa',
      text: 'Un medio tecnológico quiere entrevistarte sobre el futuro de tu empresa.',
      choices: [{ label: 'Aceptar', hint: '+5 reputación, +80 hype' }, { label: 'No tengo tiempo' }],
    }),
    resolve: (s, ctx, i) => {
      if (i !== 0) return '';
      s.reputation = Math.min(100, s.reputation + 5);
      const p = best(s) || s.products.find((x) => x.launched);
      if (p) p.hype += 80;
      return '🎤 La entrevista es un éxito.';
    },
  },

  birthday: {
    weight: (s) => (s.employees.length >= 2 ? 1.5 : 0),
    setup: (s) => ({ eid: pick(s, s.employees.filter((e) => e.role !== 'founder')).id }),
    view: (s, ctx) => ({
      icon: '🎂',
      title: '¡Cumpleaños en la oficina!',
      text: `Hoy es el cumpleaños de ${findEmp(s, ctx.eid)?.name ?? 'alguien del equipo'}.`,
      choices: [{ label: 'Tarta para todos ($100)', hint: '+5 ánimo a todos' }, { label: 'Un simple "felicidades"', hint: '-10 ánimo a esa persona' }],
    }),
    resolve: (s, ctx, i) => {
      const e = findEmp(s, ctx.eid);
      if (i === 0) {
        money(s, -100, 'other');
        for (const o of s.employees) o.mood = Math.min(100, o.mood + 5);
        return '🎂 ¡Qué rica estaba!';
      }
      if (e) e.mood = Math.max(0, e.mood - 10);
      return 'Un poco triste, la verdad.';
    },
  },

  conference: {
    weight: (s) => (s.reputation >= 15 ? 1.2 : 0),
    view: () => ({
      icon: '🎟️',
      title: 'Invitación a TechConf',
      text: 'Te invitan a dar una charla en la conferencia tecnológica más importante del año.',
      choices: [{ label: 'Ir ($5k de viaje)', hint: '+8 reputación y nuevos candidatos' }, { label: 'Rechazar' }],
    }),
    resolve: (s, ctx, i) => {
      if (i !== 0 || s.money < 5000) return '';
      money(s, -5000, 'other');
      s.reputation = Math.min(100, s.reputation + 8);
      s.candidatesDay = -999;
      return '🎟️ Tu charla fue la más comentada. Hay gente con ganas de unirse.';
    },
  },

  cloudDown: {
    weight: (s) => (s.infra.cloud && live(s).length ? 0.6 : 0),
    view: () => ({
      icon: '☁️',
      title: 'Caída mundial de la nube',
      text: 'Tu proveedor cloud se ha caído en medio mundo. Tus productos están fuera de línea hoy.',
      choices: [{ label: 'Esperar y refrescar Twitter' }],
    }),
    resolve: (s) => {
      for (const p of live(s)) p.down = Math.max(p.down, 1);
      return 'Mañana todo vuelve a la normalidad.';
    },
  },

  buyout: {
    weight: (s) => (valuation(s) > 5e7 && !s.funding.ipo ? 0.5 : 0),
    setup: (s) => ({ amount: Math.round((valuation(s) * 1.5) / 1e6) * 1e6 }),
    view: (s, ctx) => ({
      icon: '🤑',
      title: 'Oferta de compra',
      text: `MegaCorp quiere comprar ${s.company} por ${fmtMoney(ctx.amount)}. Te llevarías ${fmtMoney((ctx.amount * s.equity) / 100)}. La partida terminaría.`,
      choices: [{ label: 'Rechazar: esto es solo el principio', hint: '+5 reputación' }, { label: 'Vender la empresa', hint: 'Fin de la partida' }],
    }),
    resolve: (s, ctx, i) => {
      if (i === 1) {
        s.gameOver = { reason: 'sold', day: s.day, amount: ctx.amount, mine: (ctx.amount * s.equity) / 100 };
        return '🤑 ¡Vendida!';
      }
      s.reputation = Math.min(100, s.reputation + 5);
      return 'MegaCorp se queda con las ganas.';
    },
  },

  burnout: {
    weight: (s) => (s.policies.crunch && s.employees.length >= 3 ? 4 : 0),
    view: () => ({
      icon: '🫠',
      title: 'Síntomas de burnout',
      text: 'Varias personas del equipo están al límite por el crunch.',
      choices: [{ label: 'Dar 3 días libres a todos', hint: 'Energía +40' }, { label: 'Seguir apretando', hint: '-15 ánimo a todos' }],
    }),
    resolve: (s, ctx, i) => {
      if (i === 0) {
        for (const e of s.employees) {
          e.off = Math.max(e.off, 3);
          e.offReason = e.offReason || 'Descanso';
          e.energy = Math.min(100, e.energy + 40);
        }
        return 'El equipo vuelve con las pilas cargadas.';
      }
      for (const e of s.employees) e.mood = Math.max(0, e.mood - 15);
      return 'Se nota la tensión en el ambiente...';
    },
  },

  grant: {
    weight: (s) => (Object.keys(s.research).length >= 3 ? 1 : 0),
    setup: (s) => ({ amount: Math.round((15000 + Object.keys(s.research).length * 4000) / 1000) * 1000 }),
    view: (s, ctx) => ({
      icon: '🏛️',
      title: 'Subvención de I+D',
      text: `El gobierno premia tu investigación con ${fmtMoney(ctx.amount)}. Solo hay que rellenar 47 formularios.`,
      choices: [{ label: 'Rellenar formularios', hint: `+${fmtMoney(ctx.amount)}, -10 energía al equipo` }, { label: 'Paso de burocracia' }],
    }),
    resolve: (s, ctx, i) => {
      if (i !== 0) return '';
      money(s, ctx.amount, 'other');
      for (const e of s.employees) e.energy = Math.max(0, e.energy - 10);
      return '🏛️ Subvención concedida.';
    },
  },

  cryptoCrash: {
    weight: (s) => (s.products.some((p) => p.features.crypto && p.launched) ? 2 : 0),
    view: () => ({
      icon: '🪙',
      title: 'Desplome cripto',
      text: 'Las criptomonedas caen un 70% en una semana. Los productos con integración cripto pierden usuarios.',
      choices: [{ label: 'HODL' }],
    }),
    resolve: (s) => {
      for (const p of s.products) if (p.features.crypto) {
        p.users *= 0.85;
        p.hype = Math.max(0, p.hype - 50);
      }
      return 'Hay que diversificar.';
    },
  },

  darkmodeDemand: {
    weight: (s) => (s.products.some((p) => p.launched && !p.features.darkmode && !p.queue.some((t) => t.f === 'darkmode') && featureAvailable(s, p, 'darkmode')) ? 1.2 : 0),
    setup: (s) => ({
      pid: pick(s, s.products.filter((p) => p.launched && !p.features.darkmode && !p.queue.some((t) => t.f === 'darkmode') && featureAvailable(s, p, 'darkmode'))).id,
    }),
    view: (s, ctx) => ({
      icon: '🌙',
      title: 'Los usuarios exigen modo oscuro',
      text: `Miles de usuarios de ${pname(s, ctx)} piden modo oscuro. Sus ojos lo agradecerán.`,
      choices: [{ label: 'Añadirlo a la cola', hint: '+hype si lo lanzas' }, { label: 'Ignorarlos', hint: '-5% conocimiento' }],
    }),
    resolve: (s, ctx, i) => {
      const p = findProduct(s, ctx.pid);
      if (!p) return '';
      if (i === 0) {
        queueFeature(s, p.id, 'darkmode');
        p.hype += 40;
        return '🌙 Modo oscuro en la cola.';
      }
      p.awareness *= 0.95;
      return 'Los usuarios se quejan en redes.';
    },
  },

  influencer: {
    weight: (s) => (live(s).length ? 1.2 : 0),
    setup: (s) => ({ pid: pick(s, live(s)).id }),
    view: (s, ctx) => ({
      icon: '📹',
      title: 'Un influencer te critica',
      text: `Un youtuber con 3 millones de seguidores dice que ${pname(s, ctx)} es "cringe".`,
      choices: [{ label: 'Responder con humor', hint: '60%: +100 hype · 40%: -50 hype' }, { label: 'Ignorarlo', hint: '-2% conocimiento' }],
    }),
    resolve: (s, ctx, i) => {
      const p = findProduct(s, ctx.pid);
      if (!p) return '';
      if (i === 0) {
        if (chance(s, 0.6)) {
          p.hype += 100;
          return '😂 Tu respuesta se hace viral. ¡Punto para ti!';
        }
        p.hype = Math.max(0, p.hype - 50);
        p.awareness *= 0.95;
        return 'El chiste no hizo gracia...';
      }
      p.awareness *= 0.98;
      return 'La polémica se apaga sola.';
    },
  },

  rackFire: {
    weight: (s) => (s.infra.racks >= 3 ? 0.8 : 0),
    setup: (s) => ({ lost: Math.min(s.infra.racks, rint(s, 1, 2)) }),
    view: (s, ctx) => ({
      icon: '🧯',
      title: 'Incendio en la sala de servidores',
      text: `Un cortocircuito ha quemado ${ctx.lost} ${ctx.lost === 1 ? 'rack' : 'racks'}. Por suerte nadie ha salido herido.`,
      choices: [{ label: 'Llamar al seguro' }],
    }),
    resolve: (s, ctx) => {
      s.infra.racks = Math.max(0, s.infra.racks - ctx.lost);
      money(s, ctx.lost * 1500, 'other');
      return `El seguro cubre ${fmtMoney(ctx.lost * 1500)}.`;
    },
  },

  legend: {
    weight: (s) => (s.day > 90 ? 0.8 : 0),
    view: () => ({
      icon: '🌟',
      title: 'Una leyenda busca trabajo',
      text: 'Una ingeniera legendaria, autora de un framework famoso, busca nuevo proyecto. Está en tu lista de candidatos.',
      choices: [{ label: '¡A por ella!' }],
    }),
    resolve: (s) => {
      const e = makePerson(s, pick(s, ['dev', 'dev', 'design', 'research']), { skill: rint(s, 88, 96), traits: ['tenx', 'mentor'] });
      e.salary = Math.round((expectedSalary(e, s) * 1.1) / 50) * 50;
      s.candidates.unshift(e);
      return `${e.name} está en tu pestaña de contratación.`;
    },
  },

  layoffs: {
    weight: (s) => (s.day > 200 ? 0.9 : 0),
    view: () => ({
      icon: '📦',
      title: 'Despidos masivos en BigTech',
      text: 'Las grandes tecnológicas despiden a miles de personas. Durante 30 días habrá más talento y pedirá menos sueldo.',
      choices: [{ label: 'Revisar candidatos' }],
    }),
    resolve: (s) => {
      addEffect(s, 'layoffs', 30, { talent: 1.15, salary: 0.85 });
      s.candidatesDay = -999;
      return 'Nuevos candidatos de primer nivel disponibles.';
    },
  },

  festival: {
    weight: (s) => (s.employees.length >= 5 ? 1 : 0),
    view: () => ({
      icon: '🎉',
      title: 'Aniversario de la empresa',
      text: '¿Celebramos otro año de startup con una fiesta?',
      choices: [{ label: 'Fiesta ($200 por persona)', hint: '+12 ánimo' }, { label: 'Cena sencilla', hint: '+3 ánimo' }],
    }),
    resolve: (s, ctx, i) => {
      if (i === 0) {
        money(s, -200 * s.employees.length, 'other');
        for (const e of s.employees) e.mood = Math.min(100, e.mood + 12);
        return '🎉 ¡Menuda fiesta!';
      }
      for (const e of s.employees) e.mood = Math.min(100, e.mood + 3);
      return 'Una cena agradable.';
    },
  },
};

