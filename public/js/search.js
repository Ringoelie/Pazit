// Buscador: cualquier pestaña, sección, mueble, tecnología, producto, persona,
// política, rival o acción, a un toque. Busca sin tildes y por palabras sueltas.
import { PERKS, RESEARCH, POLICIES, ROLES, CATEGORIES, REGIONS, STYLES, CAMPAIGNS, SHOP_CATS } from './data.js';
import { TABS, TAB_BY_ID, groupOf } from './panels.js';
import { slug } from './util.js';

export const norm = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Palabras extra para encontrar cada pestaña aunque no uses su nombre exacto.
const TAB_WORDS = {
  home: 'resumen pendiente atencion avisos',
  mail: 'mensajes decisiones bandeja',
  team: 'empleados personas plantilla contratar despedir sueldos jefe jefa equipos asignar',
  office: 'muebles decoracion tienda mudanza mudarse estilo editor escritorios',
  policies: 'horario comida crunch stock options semana 4 dias formacion copilotos animo energia',
  infra: 'servidores nube racks caida ddos seguridad ciberseguridad hackers auditoria copias',
  products: 'lanzar funciones precio deuda tecnica presentacion keynote hardware fabricar',
  contracts: 'encargos clientes empresa b2b ventas',
  marketing: 'campanas publicidad hype anuncios influencers',
  research: 'investigacion tecnologias pi puntos',
  finance: 'dinero caja prestamos banco gastos ingresos costes graficos',
  investors: 'bolsa acciones ipo rondas inversion prevision trimestre valoracion emitir',
  market: 'rivales competencia competidores comprar empresa cuota',
  world: 'paises regiones expansion leyes reguladores plataformas tiendas apps temporada',
  goals: 'objetivos logros premios pixel estadisticas',
};

// Secciones con título de cada pestaña (el ancla es el título sin tildes).
export const SECTIONS = [
  ['office', 'Mejoras y decoración', 'comprar muebles tienda'],
  ['office', 'Estilo de la oficina', 'cyberpunk zen retro playa'],
  ['office', 'Mudanza', 'oficina nueva mudarse'],
  ['contracts', 'Ofertas', 'encargos'],
  ['contracts', 'Clientes empresa', 'b2b ventas'],
  ['infra', 'Nube con autoescalado', 'cloud'],
  ['infra', 'Servidores propios', 'racks'],
  ['infra', 'Ciberseguridad', 'hackers ataques auditoria copias de seguridad recompensas'],
  ['finance', 'Evolución', 'graficos'],
  ['finance', 'Banco', 'prestamos credito'],
  ['investors', 'Bolsa', 'acciones cotizacion'],
  ['investors', 'Trimestre actual', 'prevision resultados'],
  ['investors', 'Rondas', 'inversion ipo'],
  ['world', 'Temporada', 'navidad verano black friday'],
  ['world', 'Expansión internacional', 'paises regiones'],
  ['world', 'Leyes y reguladores', 'multas privacidad'],
  ['world', 'Plataformas', 'tiendas de apps comision nube'],
  ['goals', 'Objetivos', 'misiones'],
  ['goals', 'Logros', 'trofeos'],
  ['goals', 'Premios Pixel', 'gala'],
  ['goals', 'Estadísticas', 'records'],
];

export function searchItems(s) {
  const items = [];
  const add = (icon, label, sub, go, words = '') => items.push({ icon, label, sub, go, hay: norm(`${label} ${sub} ${words}`), name: norm(label) });
  for (const t of TABS) add(t.icon, t.name, `Pestaña · ${groupOf(t.id).name}`, { tab: t.id }, TAB_WORDS[t.id]);
  for (const [tab, name, words] of SECTIONS) add(TAB_BY_ID[tab].icon, name, `Sección de ${TAB_BY_ID[tab].name}`, { tab, sec: slug(name) }, words);
  add('➕', 'Contratar', 'Acción · candidatos disponibles', { run: 'hireOpen' }, 'fichar empleado candidatos');
  add('📦', 'Nuevo producto', 'Acción', { run: 'newProduct' }, 'crear app');
  add('✏️', 'Editar la oficina', 'Acción · mover mesas y muebles', { run: 'editToggle' }, 'editor mover colocar');
  add('☰', 'Menú', 'Guardar, sonido, música, exportar...', { run: 'menu' }, 'ajustes opciones guardar sonido musica exportar importar nueva partida instalar');
  add('❓', 'Cómo jugar', 'Ayuda', { run: 'help' }, 'ayuda instrucciones');
  add('🧭', 'Tutorial guiado', 'Ayuda', { run: 'tutStart' }, 'ayuda');
  for (const p of s.products) add(CATEGORIES[p.cat].icon, p.name, `Producto · ${CATEGORIES[p.cat].name}`, { pid: p.id });
  for (const e of s.employees) add(ROLES[e.role].icon, e.name, `Persona · ${ROLES[e.role].name}`, { emp: e.id });
  for (const [id, p] of Object.entries(PERKS)) add(p.icon, p.name, `Mueble · ${SHOP_CATS[p.cat]}`, { tab: 'office', cat: p.cat, key: `perk-${id}` }, p.desc);
  for (const st of Object.values(STYLES)) add(st.icon, `Estilo ${st.name}`, 'Estilo de la oficina', { tab: 'office', sec: 'estilo-de-la-oficina' }, st.desc);
  for (const [id, p] of Object.entries(POLICIES)) add(p.icon, p.name, 'Política de empresa', { tab: 'policies', key: `pol-${id}` }, p.desc);
  for (const r of RESEARCH) add(r.icon, r.name, `Tecnología · nivel ${r.tier}`, { tab: 'research', rf: 'all', key: `res-${r.id}` }, r.desc);
  for (const c of CAMPAIGNS) add(c.icon, c.name, 'Campaña de marketing', { tab: 'marketing' }, c.desc);
  for (const r of Object.values(REGIONS)) add(r.flag, r.name, 'Expansión internacional', { tab: 'world', sec: 'expansion-internacional' });
  for (const c of s.competitors) if (c.alive) add('🏁', c.name, `Rival · ${CATEGORIES[c.cat].name}`, { tab: 'market', mcat: c.cat, key: `mk-${c.id}` });
  return items;
}

// Todas las palabras tienen que aparecer; primero lo que empieza por ellas.
export function searchFilter(items, q, limit = 40) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const rank = (it) => (it.name.startsWith(words[0]) ? 0 : it.name.includes(words[0]) ? 1 : 2);
  return items
    .filter((it) => words.every((w) => it.hay.includes(w)))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit);
}
