// Eventos aleatorios. No interrumpen la partida: llegan al correo. Los que
// piden una decisión caducan como cualquier correo (se aplica la opción por
// defecto, `def`, o la última); los que solo informan se aplican al llegar.
// El contexto (ctx) es JSON plano para que sobreviva a guardar y cargar.
import { PERKS } from './data.js';
import { rint, chance, pick, dateOf, fmtMoney } from './util.js';
import { has, findEmp, findProduct, news, money, addEffect, removeEffect, makePerson, expectedSalary, addOfficeFx } from './core.js';
import { valuation, queueFeature, isAIProduct, featureAvailable, installPerk, teamPowers } from './sim.js';
import { registerMail, sendMail } from './mail.js';
import { isHW } from './hw.js';

const live = (s) => s.products.filter((p) => p.launched && p.users > 500);
const best = (s) => live(s).sort((a, b) => b.users - a.users)[0];
const pname = (s, ctx) => findProduct(s, ctx.pid)?.name ?? 'tu producto';

const CELEBS = ['la cantante Luna Vega', 'el futbolista Dani Rayo', 'la actriz Marta Solís', 'el streamer PixelKing', 'la chef Aitana Mar', 'el rapero MC Bit'];

export const EVENTS = {
  xmas: {
    from: 'El equipo',
    weight: (s) => {
      const d = dateOf(s.day);
      return d.m === 11 && d.d >= 5 && s.xmas !== d.y && s.employees.length >= 2 ? 40 : 0;
    },
    setup: (s) => {
      s.xmas = dateOf(s.day).y;
      return { n: s.employees.length };
    },
    view: (s, ctx) => ({
      icon: '🎄',
      title: 'Fiesta de Navidad',
      text: 'El equipo pregunta si este año habrá fiesta de empresa. Ya hay quien ha comprado un jersey feo.',
      choices: [
        { label: `Fiesta por todo lo alto (${fmtMoney(300 * ctx.n)})`, hint: '+15 ánimo, +1 reputación' },
        { label: `Cena sencilla (${fmtMoney(80 * ctx.n)})`, hint: '+6 ánimo' },
        { label: 'Este año no hay fiesta', hint: '-6 ánimo' },
      ],
    }),
    resolve: (s, ctx, i) => {
      const cost = [300, 80, 0][i] * s.employees.length;
      if (i < 2 && s.money < cost) return 'No llega el dinero para la fiesta. El equipo lo entiende... más o menos.';
      if (i < 2) {
        money(s, -cost, 'other');
        for (const e of s.employees) e.mood = Math.min(100, e.mood + (i === 0 ? 15 : 6));
        if (i === 0) s.reputation = Math.min(100, s.reputation + 1);
        addOfficeFx(s, 'xmasParty', i === 0 ? 3 : 1);
        return i === 0 ? '🎄 ¡Fiestón! Hasta el perro llevaba gorro de Papá Noel.' : '🍽️ Una cena tranquila y agradable.';
      }
      for (const e of s.employees) e.mood = Math.max(0, e.mood - 6);
      return 'Sin fiesta. Alguien ha dejado una nota triste en la nevera.';
    },
  },

  celebrity: {
    from: 'Recepción',
    weight: (s) => (s.reputation >= 35 && live(s).length ? 0.6 : 0),
    setup: (s) => ({ name: pick(s, CELEBS), pid: best(s).id }),
    arrive: (s) => addOfficeFx(s, 'celebrity', 1),
    days: 3,
    view: (s, ctx) => ({
      icon: '🌟',
      title: 'Visita famosa',
      text: `${ctx.name[0].toUpperCase() + ctx.name.slice(1)} usa ${pname(s, ctx)} cada día y se presenta en la oficina con un fotógrafo.`,
      choices: [
        { label: 'Fotos y a las redes', hint: '+150 hype, +3 reputación' },
        { label: 'Proponerle ser imagen de marca ($50k)', hint: '+600 hype, +5 reputación' },
        { label: 'Pedirle que no distraiga al equipo', hint: '+2 ánimo' },
      ],
    }),
    resolve: (s, ctx, i) => {
      const p = findProduct(s, ctx.pid);
      if (i === 1 && s.money >= 50000 && p) {
        money(s, -50000, 'marketing');
        p.hype += 600;
        s.reputation = Math.min(100, s.reputation + 5);
        return `🌟 ${ctx.name} será la cara de ${p.name}.`;
      }
      if (i <= 1 && p) {
        p.hype += 150;
        s.reputation = Math.min(100, s.reputation + 3);
        return '📸 Las fotos arrasan en redes.';
      }
      for (const e of s.employees) e.mood = Math.min(100, e.mood + 2);
      return 'Se va encantado/a y el equipo sigue a lo suyo.';
    },
  },

  blackout: {
    from: 'Mantenimiento',
    weight: (s) => (s.employees.length >= 3 ? (s.office.generator ? 0.2 : 0.7) : 0),
    // El apagón pasa en cuanto llega el aviso: medio día perdido.
    arrive: (s) => {
      if (s.office.generator) return;
      if (s.infra.racks) for (const p of live(s)) if (!isHW(p)) p.down = Math.max(p.down, 1);
      addEffect(s, 'blackout', 1, { prod: 0.5 });
      addOfficeFx(s, 'blackout', 1);
    },
    view: (s) =>
      s.office.generator
        ? { icon: '🔌', title: 'Apagón en el barrio', text: 'Se ha ido la luz en toda la zona... pero tu generador ha arrancado solo.', choices: [{ label: '¡Bien por el generador!' }] }
        : {
          icon: '🔌',
          title: 'Apagón en el barrio',
          text: `Se ha ido la luz en toda la zona: medio día sin ordenadores y sin café.${s.infra.racks ? ' Tus servidores propios también se han apagado.' : ''}`,
          choices: [
            { label: 'Comprar un generador ($8k)', hint: 'Los próximos apagones no te afectarán' },
            { label: 'No hace falta', hint: 'El próximo apagón volverá a parar la oficina' },
          ],
        },
    resolve: (s, ctx, i) => {
      if (s.office.generator) return '⚡ El generador salva el día.';
      if (i !== 0) return 'Sin generador. A cruzar los dedos.';
      if (s.money < 8000) return 'No tienes $8k para el generador.';
      money(s, -8000, 'office');
      s.office.generator = true;
      return '⚡ Generador instalado. La próxima vez ni te enterarás.';
    },
  },

  viral: {
    from: 'Marketing',
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
    from: 'Personas (RR.HH.)',
    weight: (s) => (s.employees.some((e) => e.role !== 'founder' && e.skill >= 50 && !e.traits.includes('loyal')) ? 1 : 0),
    setup: (s) => {
      const list = s.employees.filter((e) => e.role !== 'founder' && e.skill >= 50 && !e.traits.includes('loyal'));
      const e = pick(s, list);
      return { eid: e.id, offer: Math.round((e.salary * 1.3) / 50) * 50 };
    },
    days: 5,
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
    from: 'Mantenimiento',
    weight: (s) => {
      const m = dateOf(s.day).m;
      return m >= 5 && m <= 7 && !s.office.perks.ac ? 4 : 0;
    },
    arrive: (s) => addEffect(s, 'heat', 20, { heat: 0.8 }),
    view: () => ({
      icon: '🥵',
      title: 'Ola de calor',
      text: 'La oficina es un horno. El equipo rinde menos y se derrite frente al teclado.',
      choices: [
        { label: `Instalar aire acondicionado (${fmtMoney(PERKS.ac.cost)})`, hint: 'Problema resuelto' },
        { label: 'Aguantar con ventiladores', hint: '-20% producción hasta que pase (20 días)' },
      ],
    }),
    resolve: (s, ctx, i) => {
      if (i === 0 && s.money >= PERKS.ac.cost) {
        money(s, -PERKS.ac.cost, 'office');
        installPerk(s, 'ac');
        removeEffect(s, 'heat');
        return '❄️ Aire acondicionado instalado. ¡Qué gloria!';
      }
      return i === 0 ? `No tienes ${fmtMoney(PERKS.ac.cost)}: toca sudar.` : 'Toca sudar hasta que pase la ola de calor.';
    },
  },

  aiHype: {
    from: 'TechDiario',
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
    from: 'Prensa económica',
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
    from: 'El equipo',
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
        addOfficeFx(s, 'hackathon', 2);
        return '🍕 ¡Hackathon épico! Ideas nuevas para el laboratorio.';
      }
      for (const e of s.employees) e.mood = Math.max(0, e.mood - 3);
      return 'El equipo se queda con las ganas.';
    },
  },

  llama: {
    from: 'Un millonario',
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
    from: 'Bufete Troll & Asociados',
    weight: (s) => (live(s).length && s.day > 120 ? 1.2 : 0),
    setup: (s) => ({ amount: Math.round(Math.max(8000, valuation(s) * 0.004) / 1000) * 1000 }),
    view: (s, ctx) => ({
      icon: '⚖️',
      title: 'Troll de patentes',
      text: `Una empresa fantasma te demanda por "usar un botón con forma de corazón". Piden ${fmtMoney(ctx.amount)}.`,
      choices: [
        { label: 'Pagar y olvidarse', hint: fmtMoney(ctx.amount) },
        { label: 'Pelear en los tribunales', hint: `${Math.round(Math.min(0.9, 0.6 + teamPowers(s).legal * 0.08) * 100)}% ganas (+5 rep.); si no, pagas el doble` },
      ],
    }),
    resolve: (s, ctx, i) => {
      if (i === 0) {
        money(s, -ctx.amount, 'other');
        return 'Pagado. Qué rabia.';
      }
      if (chance(s, Math.min(0.9, 0.6 + teamPowers(s).legal * 0.08))) {
        s.reputation = Math.min(100, s.reputation + 5);
        news(s, `${s.company} gana a un troll de patentes. Internet aplaude.`, 'good');
        return '⚖️ ¡Victoria! El juez se ríe de la demanda.';
      }
      money(s, -ctx.amount * 2, 'other');
      return 'Perdiste. Pagas el doble más costas.';
    },
  },

  press: {
    from: 'TechDiario',
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

  conference: {
    from: 'TechConf',
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
    from: 'Tu proveedor de nube',
    weight: (s) => (s.infra.cloud && live(s).some((p) => !isHW(p)) ? 0.6 : 0),
    view: () => ({
      icon: '☁️',
      title: 'Caída mundial de la nube',
      text: 'Tu proveedor cloud se ha caído en medio mundo. Tus productos están fuera de línea hoy.',
      choices: [{ label: 'Esperar y refrescar Twitter' }],
    }),
    resolve: (s) => {
      for (const p of live(s)) if (!isHW(p)) p.down = Math.max(p.down, 1);
      return 'Mañana todo vuelve a la normalidad.';
    },
  },

  buyout: {
    from: 'MegaCorp',
    weight: (s) => (valuation(s) > 5e7 && !s.funding.ipo ? 0.5 : 0),
    setup: (s) => ({ amount: Math.round((valuation(s) * 1.5) / 1e6) * 1e6 }),
    def: 0,
    days: 10,
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
    from: 'Personas (RR.HH.)',
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
    from: 'Ministerio de Innovación',
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
    from: 'Prensa económica',
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
    from: 'Soporte',
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
    from: 'Redes sociales',
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
    from: 'Mantenimiento',
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
    from: 'Selección de personal',
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
      e.keepUntil = s.day + 30;
      s.candidates.unshift(e);
      return `${e.name} está en tu pestaña de contratación.`;
    },
  },

  layoffs: {
    from: 'Prensa económica',
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
    from: 'El equipo',
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

// Un evento llega al correo. Si solo informa, se aplica ya.
export function deliverEvent(s, id, ctx = {}) {
  const def = EVENTS[id];
  if (!def) return null;
  def.arrive?.(s, ctx);
  if (def.view(s, ctx).choices.length > 1) return sendMail(s, 'event', { id, ctx });
  return sendMail(s, 'event', { id, ctx, out: def.resolve(s, ctx, 0) || '' });
}

registerMail({
  event: {
    make: (s, { id, ctx, out }) => {
      const def = EVENTS[id];
      if (!def) return null;
      const v = def.view(s, ctx);
      const info = out != null;
      return {
        from: def.from || 'Oficina',
        icon: v.icon,
        subject: v.title,
        body: info && out ? `${v.text} ${out}` : v.text,
        choices: info ? null : v.choices,
        days: def.days || 7,
        def: def.def,
      };
    },
    resolve: (s, { id, ctx }, i) => EVENTS[id]?.resolve(s, ctx, i) || 'Hecho.',
  },
});
