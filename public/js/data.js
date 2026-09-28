// Tablas estáticas del juego: roles, rasgos, oficinas, mejoras, productos,
// investigación, marketing, rondas de inversión, objetivos y logros.

// Paleta "Sweetie 16" para que el pixel art y la interfaz combinen.
export const PAL = {
  ink: '#1a1c2c', plum: '#5d275d', red: '#b13e53', orange: '#ef7d57',
  yellow: '#ffcd75', lime: '#a7f070', green: '#38b764', teal: '#257179',
  navy: '#29366f', blue: '#3b5dc9', sky: '#41a6f6', cyan: '#73eff7',
  white: '#f4f4f4', silver: '#94b0c2', slate: '#566c86', dark: '#333c57',
};

// produces: tipo de punto que genera. 'flex' = el fundador cubre lo que falte.
export const ROLES = {
  founder: { name: 'Fundador/a', short: 'CEO', icon: '👑', produces: 'flex', base: 0, color: '#ffcd75' },
  dev: { name: 'Desarrollador/a', short: 'DEV', icon: '💻', produces: 'code', base: 3400, color: '#41a6f6' },
  design: { name: 'Diseñador/a', short: 'UX', icon: '🎨', produces: 'design', base: 3100, color: '#ef7d57' },
  marketer: { name: 'Marketing', short: 'MKT', icon: '📣', produces: 'hype', base: 3000, color: '#b13e53' },
  research: { name: 'Investigador/a', short: 'I+D', icon: '🔬', produces: 'rp', base: 3800, color: '#a7f070' },
  devops: { name: 'DevOps / SRE', short: 'OPS', icon: '🖥️', produces: 'ops', base: 4200, color: '#38b764', unlock: 'cloud' },
  pm: { name: 'Product Manager', short: 'PM', icon: '🧭', produces: 'lead', base: 4600, color: '#73eff7', unlock: 'agile' },
  sales: { name: 'Ventas', short: 'VTA', icon: '🤝', produces: 'sales', base: 3100, color: '#257179', unlock: 'sales101' },
  hr: { name: 'Personas (RR.HH.)', short: 'RH', icon: '🫶', produces: 'people', base: 2900, color: '#5d275d', unlock: 'people' },
  ai: { name: 'Ingeniero/a de IA', short: 'IA', icon: '🧠', produces: 'ai', base: 6400, color: '#94b0c2', unlock: 'ml' },
};
export const HIRABLE = ['dev', 'design', 'marketer', 'research', 'devops', 'pm', 'sales', 'hr', 'ai'];
// Roles que trabajan en productos o contratos.
export const MAKERS = ['founder', 'dev', 'design', 'ai'];
export const POINT_TYPES = {
  code: { name: 'Código', icon: '💻', color: '#41a6f6' },
  design: { name: 'Diseño', icon: '🎨', color: '#ef7d57' },
  ai: { name: 'IA', icon: '🧠', color: '#94b0c2' },
};

export const LEVELS = [
  { name: 'Junior', min: 0 },
  { name: 'Mid', min: 40 },
  { name: 'Senior', min: 65 },
  { name: 'Lead', min: 85 },
];

export const TRAITS = {
  tenx: { name: '10x', icon: '⚡', desc: '+40% productividad, pide un 30% más de sueldo.' },
  coffee: { name: 'Cafeinómano', icon: '☕', desc: '+20% con cafetera en la oficina, -15% sin ella.' },
  perfectionist: { name: 'Perfeccionista', icon: '🔍', desc: '-10% velocidad, pero genera la mitad de bugs.' },
  social: { name: 'Sociable', icon: '💬', desc: '+2 de ánimo para todo el equipo.' },
  ambitious: { name: 'Ambicioso/a', icon: '📈', desc: 'Aprende el doble de rápido; odia estar mal pagado.' },
  gamer: { name: 'Gamer', icon: '🎮', desc: '+10 de ánimo si hay máquina arcade.' },
  athlete: { name: 'Deportista', icon: '🏃', desc: 'Recupera el doble de energía con gimnasio.' },
  loyal: { name: 'Leal', icon: '🛡️', desc: 'Nunca renuncia.' },
  fragile: { name: 'Se quema fácil', icon: '🔥', desc: 'Pierde energía un 50% más rápido.' },
  nightowl: { name: 'Noctámbulo', icon: '🦉', desc: '+15% productividad con horario flexible.' },
  mentor: { name: 'Mentor', icon: '🎓', desc: 'Todo el equipo aprende un 20% más rápido.' },
  remote: { name: 'Remoto', icon: '🏠', desc: 'Trabaja desde casa: no ocupa escritorio, -10% productividad.' },
};

export const OFFICES = [
  { id: 'garage', name: 'Garaje de tus padres', desks: 4, rent: 0, move: 0, mood: -4, w: 256, h: 176, theme: 'garage' },
  { id: 'cowork', name: 'Coworking', desks: 8, rent: 1800, move: 3000, mood: 0, w: 320, h: 200, theme: 'cowork' },
  { id: 'small', name: 'Oficina pequeña', desks: 14, rent: 5500, move: 15000, mood: 2, w: 400, h: 232, theme: 'small' },
  { id: 'loft', name: 'Loft industrial', desks: 24, rent: 14000, move: 45000, mood: 4, w: 480, h: 264, theme: 'loft' },
  { id: 'tower', name: 'Planta en rascacielos', desks: 40, rent: 38000, move: 150000, mood: 6, w: 576, h: 300, theme: 'tower' },
  { id: 'campus', name: 'Campus tecnológico', desks: 70, rent: 95000, move: 500000, mood: 9, w: 704, h: 336, theme: 'campus' },
  { id: 'orbital', name: 'Estación orbital', desks: 120, rent: 320000, move: 3000000, mood: 12, w: 832, h: 368, theme: 'orbital', research: 'space' },
];

// near: ánimo extra para las mesas a menos de 48 px. noise: productividad que
// resta a esas mesas. El resto de efectos son globales.
export const PERKS = {
  plant: { name: 'Plantas', icon: '🪴', cost: 250, upkeep: 10, mood: 1, near: 1, max: 4, tier: 0, desc: '+1 ánimo, y +1 más a las mesas cercanas.' },
  rug: { name: 'Alfombra', icon: '🧶', cost: 300, near: 1, max: 4, tier: 0, desc: '+1 ánimo a las mesas cercanas. Se puede pisar.' },
  lamp: { name: 'Lámpara de pie', icon: '💡', cost: 180, near: 1, max: 4, tier: 0, desc: '+1 ánimo a las mesas cercanas.' },
  coffee: { name: 'Cafetera', icon: '☕', cost: 900, upkeep: 60, energy: 3, max: 1, tier: 0, desc: '+3 energía diaria. Imprescindible para los cafeinómanos.' },
  cooler: { name: 'Fuente de agua', icon: '🚰', cost: 400, upkeep: 20, energy: 1, max: 2, tier: 0, desc: '+1 energía diaria.' },
  whiteboard: { name: 'Pizarra', icon: '📋', cost: 600, prod: 0.04, max: 1, tier: 0, desc: '+4% productividad. Va en la pared.' },
  snacks: { name: 'Máquina de snacks', icon: '🍫', cost: 1800, upkeep: 150, energy: 2, mood: 1, max: 1, tier: 1, desc: '+2 energía, +1 ánimo.' },
  sofa: { name: 'Sofá chill', icon: '🛋️', cost: 1500, energy: 2, mood: 2, max: 2, tier: 1, desc: '+2 energía, +2 ánimo.' },
  foosball: { name: 'Futbolín', icon: '⚽', cost: 1400, mood: 4, noise: 0.05, max: 1, tier: 1, desc: '+4 ánimo. Ruidoso: -5% a las mesas cercanas.' },
  ac: { name: 'Aire acondicionado', icon: '❄️', cost: 4000, upkeep: 200, max: 1, tier: 1, desc: 'Evita la caída de productividad por olas de calor. Va en la pared.' },
  aquarium: { name: 'Acuario', icon: '🐠', cost: 2500, upkeep: 50, near: 2, max: 2, tier: 1, desc: '+2 ánimo a las mesas cercanas. Muy relajante.' },
  meeting: { name: 'Mesa de reuniones', icon: '🗣️', cost: 3000, prod: 0.03, max: 1, tier: 1, desc: '+3% productividad.' },
  arcade: { name: 'Máquina arcade', icon: '🕹️', cost: 5000, mood: 4, noise: 0.05, max: 2, tier: 2, desc: '+4 ánimo (+10 a los gamers). Ruidosa: -5% a las mesas cercanas.' },
  library: { name: 'Biblioteca técnica', icon: '📚', cost: 3500, xp: 0.25, max: 1, tier: 2, desc: 'El equipo aprende un 25% más rápido.' },
  ballpit: { name: 'Piscina de bolas', icon: '🎈', cost: 15000, mood: 6, noise: 0.04, max: 1, tier: 3, desc: '+6 ánimo. Muy startup. Algo ruidosa.' },
  podcast: { name: 'Estudio de podcast', icon: '🎙️', cost: 20000, upkeep: 600, hype: 2, max: 1, tier: 3, desc: '+2 hype diario para cada producto lanzado.' },
  gym: { name: 'Gimnasio', icon: '🏋️', cost: 30000, upkeep: 1500, energy: 4, mood: 3, noise: 0.03, max: 1, tier: 3, desc: '+4 energía, +3 ánimo. Algo ruidoso.' },
  statue: { name: 'Estatua de unicornio', icon: '🦄', cost: 25000, near: 2, max: 1, tier: 3, desc: '+2 ánimo a las mesas cercanas. Pura vanidad dorada.' },
  nappods: { name: 'Cápsulas de siesta', icon: '😴', cost: 45000, upkeep: 800, energy: 7, max: 1, tier: 4, desc: '+7 energía diaria.' },
  chef: { name: 'Chef privado', icon: '🍣', cost: 10000, upkeep: 12000, mood: 7, energy: 3, max: 1, tier: 4, desc: '+7 ánimo, +3 energía.' },
  robot: { name: 'Robot barista IA', icon: '🤖', cost: 150000, upkeep: 2500, energy: 6, mood: 4, max: 1, tier: 5, research: 'robots', desc: '+6 energía, +4 ánimo. Nunca se equivoca con tu café.' },
};

// Objetos que ya estaban en el garaje. Se pueden mover o quitar, no comprar.
export const FIXTURES = {
  car: { name: 'Coche de tus padres', icon: '🚗', sell: 1500, desc: 'Ocupa medio garaje. Tus padres preferirían que no lo vendieras.' },
  boxes: { name: 'Cajas de mudanza', icon: '📦', sell: 0, desc: 'Nadie sabe qué hay dentro.' },
  bike: { name: 'Bici vieja', icon: '🚲', sell: 80, desc: 'Le falta una rueda... no, están las dos.' },
};

export const POLICIES = {
  flex: { name: 'Horario flexible', icon: '🕐', desc: '+5 ánimo. Los noctámbulos rinden +15%.', research: 'people' },
  fourday: { name: 'Semana de 4 días', icon: '🌴', desc: '+12 ánimo, +3 energía diaria, -15% producción.', research: 'people' },
  crunch: { name: 'Crunch (horas extra)', icon: '🔥', desc: '+25% producción, -4 energía diaria, -12 ánimo.' },
  food: { name: 'Comida gratis', icon: '🥗', desc: '+6 ánimo. $150 por empleado al mes.', cost: 150 },
  training: { name: 'Presupuesto de formación', icon: '🎓', desc: 'El equipo aprende un 50% más rápido. $200 por empleado al mes.', cost: 200 },
  stock: { name: 'Stock options', icon: '📜', desc: '+8 ánimo. Cedes un 0,2% de la empresa cada mes.', research: 'people' },
  copilot: { name: 'Copilotos de IA', icon: '🤖', desc: '+20% producción de código y diseño. $60 por empleado al mes.', cost: 60, research: 'llm' },
};

// Funcionalidades de producto. cost: puntos por tipo en nivel 1; cada nivel cuesta x1.55.
export const FEATURES = {
  landing: { name: 'Landing page', icon: '🏠', cost: { code: 12, design: 18 }, appeal: 4 },
  auth: { name: 'Registro y login', icon: '🔑', cost: { code: 30, design: 8 }, appeal: 5 },
  profile: { name: 'Perfiles de usuario', icon: '🙂', cost: { code: 25, design: 25 }, appeal: 6 },
  articles: { name: 'Editor de contenidos', icon: '✍️', cost: { code: 35, design: 25 }, appeal: 8 },
  comments: { name: 'Comentarios y reseñas', icon: '💬', cost: { code: 35, design: 12 }, appeal: 6 },
  catalog: { name: 'Catálogo', icon: '🗂️', cost: { code: 45, design: 45 }, appeal: 9 },
  dashboard: { name: 'Panel de control', icon: '📋', cost: { code: 55, design: 45 }, appeal: 9 },
  feed: { name: 'Feed personalizado', icon: '📰', cost: { code: 65, design: 35 }, appeal: 11, load: 0.15 },
  search: { name: 'Búsqueda', icon: '🔎', cost: { code: 70, design: 10 }, appeal: 9, load: 0.15 },
  darkmode: { name: 'Modo oscuro', icon: '🌙', cost: { design: 30 }, appeal: 3 },
  notif: { name: 'Notificaciones', icon: '🔔', cost: { code: 45, design: 10 }, appeal: 5, retention: 0.02 },
  a11y: { name: 'Accesibilidad', icon: '♿', cost: { code: 20, design: 60 }, appeal: 4, market: 0.08 },
  i18n: { name: 'Multi-idioma', icon: '🌍', cost: { code: 40, design: 35 }, appeal: 4, market: 0.3 },
  security: { name: 'Seguridad y 2FA', icon: '🛡️', cost: { code: 75 }, appeal: 3, secure: true },
  analytics: { name: 'Analítica', icon: '📊', cost: { code: 55, design: 10 }, appeal: 2, retention: 0.02, revenue: 0.04 },
  gamification: { name: 'Gamificación', icon: '🏆', cost: { code: 55, design: 70 }, appeal: 8, retention: 0.03 },
  ads: { name: 'Publicidad', icon: '📢', cost: { code: 35, design: 10 }, appeal: -2, monet: 'ads', research: 'monetization' },
  subs: { name: 'Plan Premium', icon: '⭐', cost: { code: 60, design: 30 }, appeal: 2, monet: 'subs', research: 'monetization' },
  payments: { name: 'Pagos integrados', icon: '💳', cost: { code: 100, design: 35 }, appeal: 8, monet: 'tx', research: 'payments' },
  matching: { name: 'Algoritmo de matching', icon: '💘', cost: { code: 80, design: 20 }, appeal: 13, research: 'social' },
  chat: { name: 'Chat en tiempo real', icon: '📨', cost: { code: 110, design: 35 }, appeal: 14, load: 0.35, research: 'websockets' },
  collab: { name: 'Colaboración en vivo', icon: '👥', cost: { code: 130, design: 40 }, appeal: 14, load: 0.35, research: 'websockets' },
  mobile: { name: 'App móvil', icon: '📱', cost: { code: 170, design: 130 }, appeal: 14, market: 0.5, research: 'mobile' },
  offline: { name: 'Modo offline', icon: '📴', cost: { code: 90 }, appeal: 5, research: 'mobile' },
  api: { name: 'API pública', icon: '🔌', cost: { code: 140 }, appeal: 5, monet: 'api', research: 'api' },
  video: { name: 'Vídeo en streaming', icon: '🎬', cost: { code: 150, design: 45 }, appeal: 18, load: 2, research: 'video' },
  multiplayer: { name: 'Multijugador online', icon: '🎮', cost: { code: 150, design: 60 }, appeal: 17, load: 1, research: 'gamedev' },
  recs: { name: 'Recomendaciones IA', icon: '✨', cost: { code: 35, ai: 130 }, appeal: 16, retention: 0.03, research: 'ml' },
  chatbot: { name: 'Asistente LLM', icon: '🤖', cost: { code: 70, ai: 240 }, appeal: 22, load: 1.5, research: 'llm' },
  voice: { name: 'Control por voz', icon: '🎙️', cost: { code: 50, ai: 160 }, appeal: 12, research: 'llm' },
  aigen: { name: 'Generación con IA', icon: '🪄', cost: { code: 55, design: 40, ai: 300 }, appeal: 24, load: 2, research: 'genai' },
  bank: { name: 'Cuentas y tarjetas', icon: '🏦', cost: { code: 200, design: 60 }, appeal: 18, monet: 'tx', research: 'fintech' },
  crypto: { name: 'Integración cripto', icon: '🪙', cost: { code: 110 }, appeal: 4, hype: 80, research: 'blockchain' },
  vr: { name: 'Experiencia VR', icon: '🥽', cost: { code: 280, design: 280, ai: 70 }, appeal: 28, load: 1, research: 'vr' },
};
export const MAX_FEATURE_LEVEL = 10;
export const LEVEL_COST = 1.55;
export const LEVEL_APPEAL = 0.55;

function weights(str) {
  const out = {};
  for (const part of str.trim().split(/\s+/)) {
    const [k, v] = part.split(':');
    out[k] = Number(v);
  }
  return out;
}

// market: usuarios potenciales al empezar. monet: multiplicadores de ingresos.
// rivals: atractivo inicial de los competidores.
export const CATEGORIES = {
  blog: {
    name: 'Medio digital', icon: '📰', market: 1.5e6, load: 0.5, core: ['landing', 'articles'],
    monet: { ads: 1.3, subs: 0.7, tx: 0, api: 0.5 },
    rivals: [['Tintero', 30], ['PlumaNet', 45], ['Crónica.io', 60]],
    features: weights('landing:1 articles:1.5 comments:1.2 auth:0.8 profile:0.5 search:0.8 darkmode:1 notif:0.8 ads:1 subs:1 mobile:1 i18n:1.2 a11y:1 recs:1.2 analytics:1 gamification:0.5 security:0.5 aigen:0.8 voice:0.6 offline:0.8 api:0.5 chatbot:0.6'),
    desc: 'Mercado pequeño pero fácil. Ideal para empezar y vivir de la publicidad.',
  },
  shop: {
    name: 'Tienda online', icon: '🛒', market: 4e6, load: 0.6, core: ['landing', 'catalog'], research: 'payments',
    monet: { ads: 0.5, subs: 0.6, tx: 1.5, api: 0.8 },
    rivals: [['TiendaYa', 40], ['Shopixel', 70], ['Amazonia', 110]],
    features: weights('landing:1 catalog:1.5 auth:1 profile:0.6 search:1.3 payments:1.5 comments:1.2 notif:1 mobile:1.3 i18n:1.3 recs:1.5 analytics:1 security:1.2 darkmode:0.5 a11y:1 subs:0.6 ads:0.5 chatbot:1 aigen:0.6 api:0.8 crypto:0.8 gamification:0.6 offline:0.4 voice:0.7'),
    desc: 'Vive de las comisiones por venta. Necesita pagos integrados.',
  },
  social: {
    name: 'Red social', icon: '💞', market: 60e6, load: 1, core: ['auth', 'profile', 'feed'], research: 'social',
    monet: { ads: 1.2, subs: 0.35, tx: 0.2, api: 0.6 },
    rivals: [['Pío', 120], ['CaraLibro', 180], ['InstaPix', 260]],
    features: weights('auth:1 profile:1.2 feed:1.5 comments:1.2 chat:1.4 notif:1.3 search:1 mobile:1.5 darkmode:1 recs:1.5 video:1.2 ads:1 subs:0.5 gamification:0.8 i18n:1.2 a11y:1 security:1 analytics:0.8 aigen:1.2 vr:0.8 crypto:0.5 chatbot:0.7 voice:0.6 collab:0.4 landing:0.5 offline:0.5 api:0.6 payments:0.4'),
    desc: 'Mercado gigante y muy competido. Crece con usuarios y publicidad.',
  },
  dating: {
    name: 'App de citas', icon: '💘', market: 12e6, load: 0.7, core: ['auth', 'profile', 'matching'], research: 'social',
    monet: { ads: 0.6, subs: 1.6, tx: 0.2, api: 0 },
    rivals: [['Flechazo', 70], ['Chispa', 100], ['Match&Go', 150]],
    features: weights('auth:1 profile:1.5 matching:1.8 chat:1.4 notif:1 mobile:1.5 subs:1.2 ads:0.6 recs:1.4 security:1.2 darkmode:0.8 gamification:0.8 video:0.8 i18n:1 a11y:0.8 chatbot:0.6 aigen:0.8 voice:0.5 vr:0.7 analytics:0.6 landing:0.5 payments:0.3'),
    desc: 'La gente paga por encontrar pareja: suscripciones muy rentables.',
  },
  saas: {
    name: 'SaaS de productividad', icon: '🗃️', market: 6e6, load: 0.6, core: ['auth', 'dashboard'], research: 'sales101',
    monet: { ads: 0.2, subs: 2.2, tx: 0.3, api: 1.5 },
    rivals: [['Notario', 60], ['Tablerix', 90], ['Slackr', 140]],
    features: weights('landing:0.8 auth:1 dashboard:1.5 collab:1.6 chat:1 search:1 notif:1 api:1.5 analytics:1.3 security:1.5 subs:1.2 mobile:1 darkmode:1 a11y:1 i18n:1.1 offline:1 chatbot:1.3 aigen:1.2 voice:0.7 recs:0.6 payments:0.5 gamification:0.4'),
    desc: 'Pocos usuarios que pagan mucho. Ventas y API disparan los ingresos.',
  },
  streaming: {
    name: 'Streaming de vídeo', icon: '🎬', market: 40e6, load: 3, core: ['auth', 'video'], research: 'video',
    monet: { ads: 1, subs: 1.3, tx: 0.2, api: 0.3 },
    rivals: [['NetFlix-o', 150], ['StreamBox', 220], ['Tuvid', 320]],
    features: weights('auth:1 video:1.8 profile:0.8 recs:1.6 search:1.1 comments:0.8 chat:0.9 mobile:1.4 subs:1.3 ads:1 notif:0.8 darkmode:0.8 offline:1.2 i18n:1.2 a11y:1 aigen:1 vr:0.9 analytics:0.8 security:0.8 gamification:0.5 voice:0.8 landing:0.4'),
    desc: 'Enorme, pero los servidores cuestan caros.',
  },
  game: {
    name: 'Videojuego online', icon: '🕹️', market: 30e6, load: 1.5, core: ['auth', 'multiplayer'], research: 'gamedev',
    monet: { ads: 0.6, subs: 0.6, tx: 1.1, api: 0.2 },
    rivals: [['Fortnait', 140], ['Minecrafteo', 200], ['LoL-ito', 280]],
    features: weights('auth:0.8 multiplayer:1.8 gamification:1.5 chat:1.2 profile:1 mobile:1.3 payments:1 subs:0.7 ads:0.6 vr:1.3 aigen:1 darkmode:0.4 notif:0.7 i18n:1.1 a11y:0.8 video:0.6 recs:0.6 analytics:0.6 security:0.7 crypto:0.8 voice:0.7 landing:0.5'),
    desc: 'Micropagos dentro del juego. Los jugadores son exigentes.',
  },
  search: {
    name: 'Buscador web', icon: '🔍', market: 150e6, load: 1.2, core: ['landing', 'search'], research: 'searchEngine',
    monet: { ads: 2, subs: 0.2, tx: 0, api: 1 },
    rivals: [['Gooble', 1500], ['Bingo', 600], ['PatoPato', 350]],
    features: weights('landing:0.8 search:2 ads:1.5 recs:1.2 i18n:1.3 mobile:1.2 darkmode:0.6 a11y:1 voice:1.2 chatbot:1.5 aigen:1 analytics:1 api:1.2 security:0.8 offline:0.3 auth:0.5 profile:0.3 notif:0.3'),
    desc: 'El negocio publicitario más grande del mundo. Hay un gigante que vencer.',
  },
  fintech: {
    name: 'Neobanco', icon: '🏦', market: 20e6, load: 0.8, core: ['auth', 'bank'], research: 'fintech',
    monet: { ads: 0.2, subs: 1, tx: 2, api: 1 },
    rivals: [['Revolución', 200], ['N28', 280], ['MonederoX', 360]],
    features: weights('auth:1 bank:1.8 security:1.8 mobile:1.6 payments:1.3 notif:1 analytics:1 i18n:1.1 a11y:1 darkmode:0.7 chatbot:1 voice:0.6 crypto:1 api:1.2 subs:1 gamification:0.5 offline:0.5 profile:0.6 recs:0.6 landing:0.4'),
    desc: 'Comisiones por cada pago. La seguridad es obligatoria.',
  },
  assistant: {
    name: 'Asistente de IA', icon: '🤖', market: 120e6, load: 4, core: ['auth', 'chatbot'], research: 'llm',
    monet: { ads: 0.3, subs: 1.8, tx: 0.2, api: 1.8 },
    rivals: [['Oráculo AI', 500], ['Mente.ai', 800], ['Gemelo', 1100]],
    features: weights('auth:0.8 chatbot:2 voice:1.5 aigen:1.6 recs:1 collab:1 api:1.5 mobile:1.3 subs:1.5 security:1 darkmode:0.6 a11y:1 i18n:1.3 analytics:0.7 offline:0.6 notif:0.5 search:1 vr:0.6 landing:0.5'),
    desc: 'La fiebre del oro de la IA. Consume muchísimos servidores.',
  },
  metaverse: {
    name: 'Metaverso', icon: '🥽', market: 50e6, load: 2.5, core: ['auth', 'vr'], research: 'vr',
    monet: { ads: 0.8, subs: 0.8, tx: 1.2, api: 0.3 },
    rivals: [['MetaVerso', 600], ['Roblocks', 900], ['Segunda Vida', 1200]],
    features: weights('auth:0.8 vr:2 multiplayer:1.5 chat:1.2 profile:1.2 payments:1 crypto:1.2 gamification:1.1 aigen:1.3 voice:1 video:0.8 subs:0.8 ads:0.6 mobile:0.7 i18n:1 a11y:0.8 security:0.8 notif:0.5'),
    desc: 'La apuesta más arriesgada... o la más visionaria.',
  },
};

export const PREMIUM_PRICES = [0, 3, 5, 10, 20, 50];

// Árbol de investigación. cost en puntos de investigación (PI).
export const RESEARCH = [
  { id: 'monetization', name: 'Modelos de negocio', icon: '💰', cost: 30, tier: 1, desc: 'Publicidad y Plan Premium para tus productos.' },
  { id: 'frameworks', name: 'Frameworks modernos', icon: '⚛️', cost: 45, tier: 1, desc: '+10% producción de código.' },
  { id: 'designsystem', name: 'Design system', icon: '🎨', cost: 45, tier: 1, desc: '+10% producción de diseño.' },
  { id: 'cloud', name: 'Infraestructura cloud', icon: '☁️', cost: 38, tier: 1, desc: 'Contrata DevOps y compra servidores propios.' },
  { id: 'agile', name: 'Metodología ágil', icon: '🧭', cost: 60, tier: 1, desc: 'Contrata Product Managers.' },
  { id: 'websockets', name: 'Tiempo real', icon: '⚡', cost: 150, tier: 2, req: ['frameworks'], desc: 'Chat y colaboración en vivo.' },
  { id: 'payments', name: 'Pagos online', icon: '💳', cost: 150, tier: 2, req: ['monetization'], desc: 'Pagos integrados y la categoría Tienda online.' },
  { id: 'sales101', name: 'Ventas B2B', icon: '🤝', cost: 135, tier: 2, req: ['monetization'], desc: 'Contrata comerciales y crea SaaS.' },
  { id: 'people', name: 'People Ops', icon: '🫶', cost: 135, tier: 2, req: ['agile'], desc: 'RR.HH. y políticas de empresa.' },
  { id: 'growth', name: 'Growth hacking', icon: '🚀', cost: 210, tier: 2, req: ['monetization'], desc: '+25% efectividad del marketing.' },
  { id: 'social', name: 'Efectos de red', icon: '🕸️', cost: 240, tier: 2, req: ['websockets'], desc: 'Red social, App de citas y matching.' },
  { id: 'mobile', name: 'Desarrollo móvil', icon: '📱', cost: 270, tier: 2, req: ['frameworks', 'designsystem'], desc: 'App móvil y modo offline.' },
  { id: 'containers', name: 'Kubernetes', icon: '📦', cost: 240, tier: 2, req: ['cloud'], desc: '-20% carga de servidores.' },
  { id: 'remote', name: 'Trabajo remoto', icon: '🏠', cost: 180, tier: 3, req: ['people'], desc: 'Aparecen candidatos remotos que no ocupan escritorio.' },
  { id: 'api', name: 'Plataforma API', icon: '🔌', cost: 270, tier: 3, req: ['sales101'], desc: 'API pública con ingresos B2B.' },
  { id: 'video', name: 'Streaming de vídeo', icon: '🎬', cost: 420, tier: 3, req: ['containers'], desc: 'Vídeo y la categoría Streaming.' },
  { id: 'ml', name: 'Machine learning', icon: '🧠', cost: 450, tier: 3, req: ['frameworks'], desc: 'Ingenieros de IA y recomendaciones.' },
  { id: 'gamedev', name: 'Motores de juego', icon: '🕹️', cost: 480, tier: 3, req: ['websockets', 'designsystem'], desc: 'Multijugador y la categoría Videojuego.' },
  { id: 'blockchain', name: 'Blockchain', icon: '🪙', cost: 450, tier: 3, req: ['payments'], desc: 'Integración cripto. Mucho hype... y riesgo.' },
  { id: 'searchEngine', name: 'Indexación web', icon: '🔍', cost: 660, tier: 4, req: ['ml', 'containers'], desc: 'La categoría Buscador web.' },
  { id: 'fintech', name: 'Licencia bancaria', icon: '🏦', cost: 780, tier: 4, req: ['payments', 'sales101'], desc: 'La categoría Neobanco.' },
  { id: 'llm', name: 'Modelos de lenguaje', icon: '💬', cost: 960, tier: 4, req: ['ml'], desc: 'Asistente LLM, voz, copilotos y la categoría Asistente de IA.' },
  { id: 'edge', name: 'Edge computing', icon: '🌐', cost: 780, tier: 4, req: ['containers'], desc: '-20% carga y -30% coste de la nube.' },
  { id: 'genai', name: 'IA generativa', icon: '🪄', cost: 1260, tier: 5, req: ['llm'], desc: 'Generación con IA.' },
  { id: 'vr', name: 'Realidad virtual', icon: '🥽', cost: 1560, tier: 5, req: ['gamedev', 'mobile'], desc: 'Experiencia VR y la categoría Metaverso.' },
  { id: 'robots', name: 'Robótica', icon: '🦾', cost: 1800, tier: 5, req: ['genai'], desc: 'Robot barista IA para la oficina.' },
  { id: 'quantum', name: 'Computación cuántica', icon: '⚛️', cost: 2700, tier: 6, req: ['edge', 'genai'], desc: '-40% carga de servidores.' },
  { id: 'space', name: 'Programa espacial', icon: '🛰️', cost: 4500, tier: 6, req: ['quantum'], desc: 'Desbloquea la Estación orbital.' },
  { id: 'agi', name: 'AGI', icon: '🌌', cost: 9000, tier: 7, req: ['quantum', 'genai'], desc: '+50% producción de todo el equipo. ¿El final... o el principio?' },
];
export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));

export const CAMPAIGNS = [
  { id: 'posts', name: 'Posts en redes', icon: '📱', cost: 300, days: 7, hype: 3, desc: 'Barato y modesto.' },
  { id: 'launchhunt', name: 'Lanzamiento en LaunchHunt', icon: '🐱', cost: 0, instant: 60, once: true, desc: 'Una vez por producto. Mejor si el producto es bueno.' },
  { id: 'influencers', name: 'Influencers', icon: '🤳', cost: 6000, days: 14, hype: 10, desc: 'Llega a audiencias jóvenes.' },
  { id: 'searchads', name: 'Anuncios en buscadores', icon: '🔎', cost: 20000, days: 30, hype: 12 },
  { id: 'podcasts', name: 'Patrocinio de podcasts', icon: '🎧', cost: 45000, days: 30, hype: 22 },
  { id: 'billboard', name: 'Vallas publicitarias', icon: '🪧', cost: 120000, days: 45, hype: 35 },
  { id: 'tv', name: 'Anuncio en TV', icon: '📺', cost: 250000, days: 30, hype: 80 },
  { id: 'esports', name: 'Patrocinio de eSports', icon: '🏟️', cost: 600000, days: 60, hype: 110 },
  { id: 'final', name: 'Anuncio en la Gran Final', icon: '🏈', cost: 5000000, instant: 2500, desc: 'El anuncio más caro del mundo.' },
];

// Rondas de inversión en orden.
export const ROUNDS = [
  { id: 'angel', name: 'Business angel', dil: [8, 12], reqText: 'Lanzar un producto' },
  { id: 'seed', name: 'Ronda semilla', dil: [10, 15], users: 5000, mrr: 5000, reqText: '5.000 usuarios o $5k/mes' },
  { id: 'a', name: 'Serie A', dil: [12, 20], users: 100000, mrr: 50000, reqText: '100k usuarios o $50k/mes' },
  { id: 'b', name: 'Serie B', dil: [10, 18], users: 1e6, mrr: 300000, reqText: '1M usuarios o $300k/mes' },
  { id: 'c', name: 'Serie C', dil: [8, 15], users: 10e6, mrr: 2e6, reqText: '10M usuarios o $2M/mes' },
  { id: 'ipo', name: 'Salida a bolsa (IPO)', dil: [15, 25], valuation: 1e9, reqText: 'Valoración de $1B' },
];

export const CLIENTS = [
  'Panadería Lola', 'Bufete Martínez', 'Club de pádel Smash', 'Clínica Sonrisas', 'Ferretería El Tornillo',
  'Ayuntamiento de Villarriba', 'Hotel Brisa Marina', 'Gimnasio Titán', 'Pizzería Da Nonna', 'Academia Aprende+',
  'Cervecera Lúpulo', 'Inmobiliaria Tejado', 'ONG Mar Limpio', 'Banco Regional', 'Aerolínea Nubes',
  'Supermercados Fresco', 'Festival SonidoSur', 'Museo del Futuro', 'Startup rival', 'Cadena de cafeterías Grano',
];
export const JOBS = [
  { title: 'Web corporativa', mix: { code: 0.5, design: 0.5 } },
  { title: 'App de reservas', mix: { code: 0.65, design: 0.35 } },
  { title: 'Tienda online', mix: { code: 0.6, design: 0.4 } },
  { title: 'Rediseño de marca', mix: { code: 0.15, design: 0.85 } },
  { title: 'Migración a la nube', mix: { code: 1 } },
  { title: 'Panel de gestión interno', mix: { code: 0.75, design: 0.25 } },
  { title: 'Landing de campaña', mix: { code: 0.35, design: 0.65 } },
  { title: 'Integración de pagos', mix: { code: 0.9, design: 0.1 } },
  { title: 'Chatbot de atención', mix: { code: 0.3, ai: 0.7 }, research: 'ml' },
  { title: 'Motor de recomendaciones', mix: { code: 0.35, ai: 0.65 }, research: 'ml' },
  { title: 'App móvil a medida', mix: { code: 0.55, design: 0.45 }, research: 'mobile' },
];

export const FIRST_NAMES = [
  'Lucía', 'Mateo', 'Sofía', 'Hugo', 'Valentina', 'Diego', 'Camila', 'Leo', 'Martina', 'Pablo', 'Daniela', 'Álvaro',
  'Paula', 'Javi', 'Carla', 'Nico', 'Elena', 'Bruno', 'Sara', 'Iker', 'Aitana', 'Marco', 'Noa', 'Thiago', 'Julia',
  'Emma', 'Omar', 'Aisha', 'Kenji', 'Priya', 'Chen', 'Olga', 'Tomás', 'Irene', 'Rocío', 'Gael', 'Ximena', 'Santi',
  'Renata', 'Joaquín', 'Lola', 'Andrés', 'Fátima', 'Yuki', 'Arjun', 'Inés', 'Raúl', 'Nerea', 'Marcos', 'Alba',
];
export const LAST_NAMES = [
  'García', 'López', 'Martín', 'Rodríguez', 'Sánchez', 'Pérez', 'Gómez', 'Fernández', 'Ruiz', 'Díaz', 'Torres',
  'Ramos', 'Vega', 'Castro', 'Ortiz', 'Molina', 'Silva', 'Rojas', 'Navarro', 'Iglesias', 'Nakamura', 'Kim', 'Patel',
  'Rossi', 'Müller', 'Dubois', 'Novak', 'Okafor', 'Chen', 'Singh', 'Herrera', 'Cruz', 'Medina', 'Flores',
];
export const PRODUCT_NAMES = [
  'Pixelio', 'Nubo', 'Zumbo', 'Kiwi', 'Lumen', 'Trixi', 'Brota', 'Okapi', 'Nimbo', 'Faro', 'Kobu', 'Vuela',
  'Chispa', 'Ondo', 'Pipo', 'Quanta', 'Rumbo', 'Sazón', 'Tuki', 'Yuyu', 'Zeta', 'Mango', 'Cometa', 'Bambú',
];
export const STARTUP_SUFFIX = ['ly', 'io', 'ify', 'hub', 'go', 'app', 'fy', 'lab'];

export const LOOKS = {
  skin: ['#f6d2b5', '#e8b48f', '#c98a60', '#9a5f3c', '#6b3f26'],
  hair: ['#1a1c2c', '#4a2f1f', '#7a4a2a', '#d9a441', '#b13e53', '#94b0c2', '#f4f4f4', '#5d275d', '#41a6f6'],
  pants: ['#29366f', '#333c57', '#1a1c2c', '#566c86', '#257179'],
};

export const QUESTS = [
  { id: 'contract', text: 'Acepta tu primer contrato (pestaña Contratos)', reward: 0 },
  { id: 'contractDone', text: 'Entrega un contrato a tiempo', reward: 1000 },
  { id: 'hire', text: 'Contrata a tu primer empleado', reward: 500 },
  { id: 'research', text: 'Investiga "Modelos de negocio" (asigna a alguien a I+D)', reward: 1000 },
  { id: 'product', text: 'Crea tu primer producto', reward: 0 },
  { id: 'launch', text: 'Termina sus funciones básicas y lánzalo', reward: 2000 },
  { id: 'users1k', text: 'Consigue 1.000 usuarios', reward: 3000 },
  { id: 'monetize', text: 'Activa publicidad o un Plan Premium', reward: 3000 },
  { id: 'move', text: 'Múdate a un coworking', reward: 5000 },
  { id: 'funding', text: 'Cierra una ronda de inversión', reward: 0 },
  { id: 'users100k', text: 'Llega a 100.000 usuarios', reward: 25000 },
  { id: 'mrr100k', text: 'Ingresa $100k al mes', reward: 50000 },
  { id: 'unicorn', text: 'Alcanza una valoración de $1B: ¡unicornio!', reward: 500000 },
  { id: 'ipo', text: 'Sal a bolsa', reward: 0 },
  { id: 'agi', text: 'Investiga la AGI', reward: 0 },
];

export const ACHIEVEMENTS = [
  { id: 'firstHire', name: 'Ya no estás solo', icon: '🤝', desc: 'Contrata a tu primer empleado.' },
  { id: 'team10', name: 'Equipo de fútbol', icon: '⚽', desc: 'Llega a 10 empleados.' },
  { id: 'team50', name: 'Scale-up', icon: '🏢', desc: 'Llega a 50 empleados.' },
  { id: 'team100', name: 'Corporación', icon: '🏙️', desc: 'Llega a 100 empleados.' },
  { id: 'launch', name: 'Hola, mundo', icon: '🚀', desc: 'Lanza tu primer producto.' },
  { id: 'portfolio', name: 'Portafolio', icon: '🗂️', desc: 'Ten 3 productos lanzados a la vez.' },
  { id: 'users1m', name: 'Un millón', icon: '👥', desc: '1 millón de usuarios.' },
  { id: 'users100m', name: 'Masa crítica', icon: '🌍', desc: '100 millones de usuarios.' },
  { id: 'users1b', name: 'Medio planeta', icon: '🪐', desc: '1.000 millones de usuarios.' },
  { id: 'millionaire', name: 'Millonario', icon: '💵', desc: 'Ten $1M en caja.' },
  { id: 'unicorn', name: 'Unicornio', icon: '🦄', desc: 'Valoración de $1B.' },
  { id: 'decacorn', name: 'Decacornio', icon: '🐉', desc: 'Valoración de $10B.' },
  { id: 'ipo', name: 'Toque de campana', icon: '🔔', desc: 'Sal a bolsa.' },
  { id: 'contracts10', name: 'Agencia de confianza', icon: '📝', desc: 'Entrega 10 contratos.' },
  { id: 'maxFeature', name: 'Obsesivo', icon: '💎', desc: 'Sube una función al nivel 10.' },
  { id: 'allResearch', name: 'Ciencia total', icon: '🔬', desc: 'Completa todo el árbol de investigación.' },
  { id: 'acquire', name: 'Tiburón', icon: '🦈', desc: 'Compra a un competidor.' },
  { id: 'leader', name: 'Número uno', icon: '🥇', desc: 'Lidera una categoría con más del 50% del mercado.' },
  { id: 'orbital', name: 'Oficina con vistas', icon: '🛰️', desc: 'Múdate a la estación orbital.' },
  { id: 'happy', name: 'Mejor lugar para trabajar', icon: '😊', desc: 'Ánimo medio superior a 85 con 20+ empleados.' },
  { id: 'crunchSurvivor', name: 'Superviviente', icon: '🧯', desc: 'Sobrevive a un incidente de seguridad.' },
  { id: 'bootstrapped', name: 'Sin inversores', icon: '🥾', desc: 'Llega a $100k/mes sin vender acciones.' },
  { id: 'agi', name: 'Singularidad', icon: '🌌', desc: 'Investiga la AGI.' },
];
