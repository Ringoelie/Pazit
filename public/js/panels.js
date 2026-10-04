// Contenido HTML de cada pestaña. Solo lee el estado; las acciones viajan
// por atributos data-act que main.js enruta a la simulación.
import {
  ROLES, TRAITS, OFFICES, PERKS, FIXTURES, POLICIES, FEATURES, CATEGORIES, RESEARCH, RESEARCH_BY_ID, CAMPAIGNS, ROUNDS,
  QUESTS, ACHIEVEMENTS, POINT_TYPES, PREMIUM_PRICES, MAX_FEATURE_LEVEL, LEVELS, HW_PRICES, UNIVERSAL_WEIGHT,
  REGIONS, LAWS, RIVAL_STYLES, STYLES, STYLE_MOOD, PACES, KEYNOTES, B2B_SIZES, AWARDS, SHOP_CATS,
} from './data.js';
import { pendingMail, defaultChoice } from './mail.js';
import { seasonOf, seasonDemand, regionMarket, langReach, regionStaff, complianceIssues, lawActive } from './world.js';
import { warFx, poachCost, smearCost, rivalCooldown } from './rivals.js';
import { isHW, unitCost, hwPrice, leadTime } from './hw.js';
import { secLevel, yearlyAttacks, BOUNTY_COST, BACKUP_COST, AUDIT_COST, AUDIT_DAYS } from './security.js';
import { STORES, CLOUD_NAME, onMobile, storeFee, storeMonthly, cloudMult, adsHit } from './platforms.js';
import { REL_KINDS, relationsOf, relSummary } from './relations.js';
import { keynoteOdds, tierOf, KEYNOTE_TIERS } from './keynote.js';
import { winChance, missingReqs, reqHint, b2bDaily } from './b2b.js';
import { nominations, winChance as awardChance } from './awards.js';
import { GUIDANCE, GUIDANCE_ORDER, WARN_COST, quarterName, quarterStatus, sharePrice, canWarn, nextQuarterDay } from './stock.js';
import * as G from './sim.js';
import { perkStats, birthdayOf, isBirthday } from './core.js';
import { esc, fmtMoney, fmtNum, fmtPct, fmtDays, fmtDate, dateOf, MONTHS } from './util.js';
import { bar, btn, avatar } from './ui.js';

export const TABS = [
  { id: 'office', icon: '🏢', name: 'Oficina' },
  { id: 'mail', icon: '📬', name: 'Correo' },
  { id: 'team', icon: '👥', name: 'Equipo' },
  { id: 'products', icon: '📦', name: 'Productos' },
  { id: 'contracts', icon: '📝', name: 'Contratos' },
  { id: 'research', icon: '🔬', name: 'I+D' },
  { id: 'marketing', icon: '📣', name: 'Marketing' },
  { id: 'infra', icon: '🖥️', name: 'Servidores' },
  { id: 'finance', icon: '💰', name: 'Finanzas' },
  { id: 'investors', icon: '📈', name: 'Inversores' },
  { id: 'market', icon: '🌐', name: 'Mercado' },
  { id: 'world', icon: '🗺️', name: 'Mundo' },
  { id: 'goals', icon: '🏆', name: 'Logros' },
];

const INC_LABEL = {
  contracts: 'Contratos', ads: 'Publicidad', subs: 'Suscripciones', tx: 'Comisiones', api: 'API', hardware: 'Venta de dispositivos',
  store: 'Tienda de apps', b2b: 'Clientes empresa', funding: 'Inversión', loans: 'Préstamos', other: 'Otros',
};
const EXP_LABEL = {
  salaries: 'Nóminas', rent: 'Alquiler', perks: 'Mantenimiento', cloud: 'Nube', servers: 'Servidores', marketing: 'Marketing',
  hiring: 'Contratación', office: 'Oficina y mejoras', policies: 'Políticas', interest: 'Intereses', loans: 'Devolución de préstamos',
  acquisitions: 'Adquisiciones', training: 'Formación', manufacturing: 'Fabricación', storage: 'Almacenaje', fines: 'Multas y juicios',
  taxes: 'Impuestos', regions: 'Sedes internacionales', security: 'Ciberseguridad', b2b: 'Penalizaciones a clientes', other: 'Otros',
};

const kpi = (label, value, sub = '', cls = '') =>
  `<div class="kpi ${cls}"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
const costStr = (c) =>
  Object.entries(c)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `<span class="pt ${k}">${POINT_TYPES[k].icon}${fmtNum(v)}</span>`)
    .join(' ');
const levelName = (skill) => LEVELS[G.levelOf(skill)].name;
const moodColor = (v) => (v >= 60 ? 'var(--green)' : v >= 35 ? 'var(--yellow)' : 'var(--red)');

export function renderPanel(s, U) {
  switch (U.tab) {
    case 'office': return officePanel(s, U);
    case 'team': return teamPanel(s, U);
    case 'products': return U.pid && G.findProduct(s, U.pid) ? productDetail(s, G.findProduct(s, U.pid)) : productsPanel(s);
    case 'contracts': return contractsPanel(s);
    case 'research': return researchPanel(s);
    case 'marketing': return marketingPanel(s, U);
    case 'infra': return infraPanel(s);
    case 'finance': return financePanel(s);
    case 'investors': return investorsPanel(s);
    case 'market': return marketPanel(s, U);
    case 'mail': return mailPanel(s);
    case 'world': return worldPanel(s);
    case 'goals': return goalsPanel(s);
    default: return '';
  }
}

// ---------------------------------------------------------------- oficina

// Tienda de mejoras por secciones; `act` cambia si se compra desde el editor.
export function perkShop(s, U, act = 'buyPerk', sell = true) {
  const cat = SHOP_CATS[U.shopCat] ? U.shopCat : 'all';
  const chips = Object.entries(SHOP_CATS)
    .map(([id, name]) => `<button class="chip ${id === cat ? 'on' : ''}" data-act="shopCat" data-cat="${id}">${name}</button>`)
    .join('');
  return `<div class="chips scroll shop-cats">${chips}</div><div class="cards">${perkCards(s, act, sell, cat)}</div>`;
}

export function perkCards(s, act = 'buyPerk', sell = true, cat = 'all') {
  return Object.entries(PERKS)
    .filter(([, p]) => cat === 'all' || p.cat === cat)
    .map(([id, p]) => {
      const n = s.office.perks[id] || 0;
      const st = G.perkState(s, id);
      const locked = !st.ok && n === 0;
      return `<div class="card perk ${n ? 'owned' : ''} ${locked ? 'locked' : ''}" data-key="perk-${id}">
        <div class="card-icon">${p.icon}</div>
        <div class="grow"><b>${p.name}${n ? ` <span class="tag">x${n}</span>` : ''}</b><small>${p.desc}</small>
        <small class="muted">${fmtMoney(p.cost)}${p.upkeep ? ` · ${fmtMoney(p.upkeep)}/mes` : ''}</small></div>
        <div class="col-btns">${btn(st.ok ? 'Comprar' : st.why, act, { id }, { kind: st.ok ? 'primary' : '', disabled: !st.ok || s.money < p.cost })}
        ${n && sell ? btn('Vender', 'sellPerk', { id }, { kind: 'ghost' }) : ''}</div></div>`;
    })
    .join('');
}

function officePanel(s, U) {
  const o = G.officeOf(s);
  const ps = perkStats(s);
  const items = s.office.layout.items.length;
  const policies = Object.entries(POLICIES)
    .map(([id, p]) => {
      const locked = p.research && !G.has(s, p.research);
      const on = !!s.policies[id];
      return `<label class="card policy ${on ? 'owned' : ''} ${locked ? 'locked' : ''}" data-key="pol-${id}">
        <div class="card-icon">${p.icon}</div><div class="grow"><b>${p.name}</b><small>${locked ? '🔒 Requiere ' + RESEARCH_BY_ID[p.research].name : p.desc}</small></div>
        <button class="switch ${on ? 'on' : ''}" data-act="policy" data-id="${id}" ${locked ? 'disabled' : ''} aria-pressed="${on}"><i></i></button></label>`;
    })
    .join('');
  const moves = OFFICES.map((x, i) => ({ x, i }))
    .filter(({ i }) => i > s.office.tier)
    .slice(0, 3)
    .map(({ x, i }) => {
      const locked = x.research && !G.has(s, x.research);
      return `<div class="card" data-key="move-${i}"><div class="card-icon">🚚</div><div class="grow"><b>${x.name}</b>
        <small>${x.desks} escritorios · ${x.w}×${x.h} px de planta · alquiler ${fmtMoney(x.rent)}/mes · ánimo ${x.mood >= 0 ? '+' : ''}${x.mood}</small>
        ${locked ? `<small class="muted">🔒 Requiere ${RESEARCH_BY_ID[x.research].name}</small>` : ''}</div>
        ${btn(`Mudarse · ${fmtMoney(x.move)}`, 'moveOffice', { tier: i }, { kind: 'primary', disabled: locked || s.money < x.move })}</div>`;
    })
    .join('');
  return `<div class="kpis">
      ${kpi('Oficina', o.name)}
      ${kpi('Escritorios', `${G.onsite(s)}/${o.desks}`, G.freeDesks(s) <= 0 ? '¡Llena!' : `${G.freeDesks(s)} libres`, G.freeDesks(s) <= 0 ? 'warn' : '')}
      ${kpi('Alquiler', fmtMoney(o.rent) + '/mes')}
      ${kpi('Muebles', items, `+${ps.mood} ánimo · +${ps.energy} energía`)}
    </div>
    <div class="banner"><span>🛠️ Coloca mesas y muebles donde quieras. La decoración cerca de las mesas sube el ánimo y los juegos hacen ruido.</span>
      ${btn('✏️ Editar la oficina', 'editToggle', {}, { kind: 'primary' })}</div>
    <h3>Mejoras y decoración</h3>${perkShop(s, U)}
    <h3>Estilo de la oficina</h3>
    <p class="muted">Cambia suelo, paredes y muebles en cualquier oficina. Con un estilo puesto, el equipo gana +${STYLE_MOOD} de ánimo.</p>
    <div class="cards">${styleCards(s)}</div>
    <h3>Políticas de empresa</h3><div class="cards">${policies}</div>
    <h3>Mudanza</h3>${moves ? '<p class="muted">Al mudarte te llevas las mejoras, pero el coche y las cajas se quedan en el garaje.</p>' : ''}
    <div class="cards">${moves || '<p class="muted">Ya estás en la mejor oficina del sistema solar.</p>'}</div>`;
}

function styleCards(s) {
  const owned = s.office.styles || [];
  return Object.entries(STYLES)
    .map(([id, st]) => {
      const on = s.office.style === id;
      const has = owned.includes(id);
      const action = on
        ? btn('Quitar', 'clearStyle', {}, { kind: 'small ghost' })
        : btn(has ? 'Poner' : `Comprar · ${fmtMoney(st.cost)}`, 'buyStyle', { id }, { kind: has ? 'small' : 'small primary', disabled: !has && s.money < st.cost });
      return `<div class="card ${on ? 'owned' : ''}" data-key="style-${id}"><div class="card-icon">${st.icon}</div>
        <div class="grow"><b>${st.name}</b><small>${st.desc}</small></div>${action}</div>`;
    })
    .join('');
}

// ---------------------------------------------------------------- equipo

function assignSelect(s, e) {
  if (!G.isAssignable(e)) return '<small class="muted">Trabajo global</small>';
  const opts = G.assignTargets(s, e);
  const cur = e.assign || '';
  return `<select data-change="assign" data-emp="${e.id}" aria-label="Asignación de ${esc(e.name)}">
    <option value="" ${cur ? '' : 'selected'}>— Sin tarea —</option>
    ${opts.map((o) => `<option value="${o.v}" ${o.v === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
}

function empRow(s, e) {
  const exp = G.expectedSalary(e, s);
  const underpaid = e.role !== 'founder' && e.salary < exp * 0.95;
  return `<div class="emp" data-key="emp-${e.id}">
    <button class="emp-main" data-act="empOpen" data-id="${e.id}">${avatar(e)}
      <div class="emp-name"><b>${esc(e.name)}${e.region ? ` <span title="${REGIONS[e.region].name}">${REGIONS[e.region].flag}</span>` : ''}</b><small>${ROLES[e.role].icon} ${ROLES[e.role].name} · ${levelName(e.skill)}
      ${e.traits.map((t) => `<span title="${TRAITS[t].name}">${TRAITS[t].icon}</span>`).join('')}</small></div></button>
    <div class="emp-stats">
      <div title="Habilidad ${Math.round(e.skill)}"><span>HAB</span>${bar(e.skill / 100, 'var(--sky)')}</div>
      <div title="Ánimo ${Math.round(e.mood)}"><span>ÁNI</span>${bar(e.mood / 100, moodColor(e.mood))}</div>
      <div title="Energía ${Math.round(e.energy)}"><span>ENE</span>${bar(e.energy / 100, e.energy > 30 ? 'var(--cyan)' : 'var(--red)')}</div>
    </div>
    <div class="emp-assign">${e.off > 0 ? `<span class="tag">${e.offReason === 'Formación' ? '🎓' : '🌴'} ${e.offReason} (${fmtDays(e.off)})</span>` : assignSelect(s, e)}
      <small class="${underpaid ? 'warn-text' : 'muted'}">${e.role === 'founder' ? 'Sin sueldo' : fmtMoney(e.salary) + '/mes'}${underpaid ? ' · quiere más' : ''}</small></div>
  </div>`;
}

function teamPanel(s, U) {
  const tp = G.teamPowers(s);
  const isIdle = (e) => G.isAssignable(e) && !e.assign && e.off <= 0;
  const idle = s.employees.filter(isIdle).length;
  const order = Object.keys(ROLES);
  const f = U.teamFilter || 'all';
  const counts = {};
  for (const e of s.employees) counts[e.role] = (counts[e.role] || 0) + 1;
  const all = [...s.employees]
    .filter((e) => f === 'all' || (f === 'idle' ? isIdle(e) : e.role === f))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || b.skill - a.skill);
  const limit = U.teamLimit || 40;
  const list = all.slice(0, limit);
  const chips = [['all', `Todos (${s.employees.length})`], ['idle', `Sin tarea (${idle})`]]
    .concat(order.filter((r) => counts[r]).map((r) => [r, `${ROLES[r].icon} ${counts[r]}`]))
    .map(([k, label]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="teamFilter" data-f="${k}">${label}</button>`)
    .join('');
  const o = G.officeOf(s);
  return `<div class="kpis">
      ${kpi('Plantilla', s.employees.length, `${G.onsite(s)}/${o.desks} escritorios`)}
      ${kpi('Nóminas', fmtMoney(G.payroll(s)) + '/mes')}
      ${kpi('Ánimo medio', Math.round(s.employees.reduce((a, e) => a + e.mood, 0) / Math.max(1, s.employees.length)), '', '')}
      ${kpi('Sin tarea', idle, idle ? 'Asígnales algo' : 'Todo el mundo ocupado', idle ? 'warn' : '')}
    </div>
    <div class="row gap wrap">${btn('➕ Contratar', 'hireOpen', {}, { kind: 'primary big' })}
      <small class="muted">DevOps ${tp.ops.toFixed(1)} · Ventas ${tp.sales.toFixed(1)} · RR.HH. ${tp.people.toFixed(1)}${tp.sec ? ` · Seguridad ${tp.sec.toFixed(1)}` : ''}</small></div>
    ${relLine(s)}
    ${teamsBox(s, U)}
    <div class="chips">${chips}</div>
    <div class="emps">${list.map((e) => empRow(s, e)).join('') || '<p class="muted">Nadie en este grupo.</p>'}</div>
    ${all.length > limit ? `<div class="row end">${btn(`Mostrar más (${all.length - limit} restantes)`, 'teamMore')}</div>` : ''}`;
}

// Equipos: la gente de cada producto o contrato, con su jefe/a y un
// formulario para mover a varias personas de golpe.
const MOVE_N = [['1', '1'], ['5', '5'], ['10', '10'], ['25', '25'], ['all', 'todas']];

function teamsBox(s, U) {
  const list = G.teams(s);
  const auto = s.settings.autoAssign !== false;
  const open = U.teamsOpen !== false;
  const dest = [
    ...s.products.map((p) => ['p:' + p.id, `📦 ${p.name}`]),
    ...s.contracts.active.map((c) => ['c:' + c.id, `📝 ${c.title}`]),
    ['brand', '✨ Marca de empresa'],
  ];
  const cards = list.map((g) => teamCard(s, U, g, dest)).join('');
  return `<details class="teams-box" data-key="teams" ${open ? 'open' : ''}>
    <summary data-act="teamsToggle"><b>👥 Equipos por tarea (${list.filter((g) => g.target).length})</b></summary>
    <p class="muted small">Cada producto o contrato es un equipo. Con un jefe o jefa, el resto rinde más (su propia producción baja a la mitad). Mueve a varias personas de golpe en vez de una a una.</p>
    <label class="card policy ${auto ? 'owned' : ''}" data-key="auto-assign"><div class="card-icon">🔁</div>
      <div class="grow"><b>Reasignar automáticamente</b><small>Quien se queda sin tarea (al acabar un contrato, al llegar) pasa al producto con más trabajo pendiente.</small></div>
      <button class="switch ${auto ? 'on' : ''}" data-act="autoAssign" aria-pressed="${auto}"><i></i></button></label>
    <div class="cards">${cards || '<p class="muted">Todavía no hay equipos.</p>'}</div></details>`;
}

function teamCard(s, U, g, dest) {
  const key = g.target || 'idle';
  const mv = U.move?.[key] || {};
  const comp = Object.entries(g.roles).map(([r, n]) => `${ROLES[r].icon} ${n}`).join(' · ');
  const roles = Object.keys(g.roles).filter((r) => r !== 'founder');
  const opt = (v, label, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  let lead = '';
  // En I+D solo está la persona fundadora: dirigirse a sí misma no tiene sentido.
  if (g.target && g.target !== 'rd') {
    const cands = [...g.members].sort((a, b) => b.skill - a.skill).slice(0, 15);
    if (g.lead && !cands.includes(g.lead)) cands.push(g.lead);
    const cur = g.lead?.id ?? '';
    lead = `<div class="team-row"><label>🎖️ Jefe/a <select data-change="lead" data-target="${g.target}" aria-label="Jefe o jefa de ${esc(g.label)}">
        ${opt('', '— Nadie —', cur)}${cands.map((e) => opt(e.id, `${e.name.split(' ')[0]} · ${ROLES[e.role].short} ${levelName(e.skill)}`, cur)).join('')}</select></label>
      <small class="muted">${g.lead ? `+${Math.round(G.leadBonus(g.lead) * 100)}% al resto del equipo` : g.members.length >= 4 ? 'Nombra a alguien: el resto rendirá más' : ''}</small></div>`;
  }
  const to = dest.filter(([v]) => v !== g.target);
  const move = roles.length && to.length
    ? `<div class="team-row">Mover <select data-change="move" data-target="${key}" data-f="n" aria-label="Cuántas personas">${MOVE_N.map(([v, l]) => opt(v, l, mv.n ?? '5')).join('')}</select>
      <select data-change="move" data-target="${key}" data-f="role" aria-label="Qué perfil">${opt('all', 'de cualquier perfil', mv.role ?? 'all')}${roles.map((r) => opt(r, `${ROLES[r].icon} ${ROLES[r].short}`, mv.role)).join('')}</select>
      a <select data-change="move" data-target="${key}" data-f="to" aria-label="Destino">${to.map(([v, l]) => opt(v, l, mv.to ?? to[0][0])).join('')}</select>
      ${btn('Mover', 'moveGroup', { from: key }, { kind: 'small primary' })}</div>`
    : '';
  return `<div class="card team" data-key="team-${key}"><div class="grow">
    <b>${esc(g.label)}</b> <small class="muted">${g.members.length} ${g.members.length === 1 ? 'persona' : 'personas'} · ${comp}</small>
    ${lead}${move}</div></div>`;
}

function relLine(s) {
  const r = relSummary(s);
  const parts = [
    r.friend && `🤝 ${r.friend} amistad${r.friend > 1 ? 'es' : ''}`,
    r.couple && `💕 ${r.couple} pareja${r.couple > 1 ? 's' : ''}`,
    r.rival && `😤 ${r.rival} roce${r.rival > 1 ? 's' : ''}`,
    r.mentor && `🎓 ${r.mentor} mentoría${r.mentor > 1 ? 's' : ''}`,
    r.burnout && `😵 ${r.burnout} de baja por agotamiento`,
  ].filter(Boolean);
  return parts.length ? `<p class="muted small">${parts.join(' · ')}</p>` : '';
}

export function hireModal(s, U) {
  const roles = ['all', ...Object.keys(ROLES).filter((r) => r !== 'founder')];
  const f = U.hireRole || 'all';
  const cands = s.candidates.filter((c) => f === 'all' || c.role === f);
  const next = 14 - (s.day - s.candidatesDay);
  const free = G.freeDesks(s);
  return `<p class="muted">Escritorios libres: <b>${free}</b> · Nuevos candidatos en ${fmtDays(next)} · Coste de contratación: medio sueldo.</p>
    <div class="chips">${roles
      .map((r) => {
        const locked = r !== 'all' && !G.roleUnlocked(s, r);
        return `<button class="chip ${f === r ? 'on' : ''}" data-act="hireRole" data-role="${r}" ${locked ? 'disabled title="Requiere investigación"' : ''}>${r === 'all' ? 'Todos' : ROLES[r].icon + ' ' + ROLES[r].short}${locked ? ' 🔒' : ''}</button>`;
      })
      .join('')}</div>
    <div class="cands">${
      cands
        .map((c) => {
          const fee = Math.round(c.salary * 0.5);
          const remote = c.traits.includes('remote');
          const R = c.region && REGIONS[c.region];
          const full = R ? regionStaff(s, c.region) >= R.cap : !remote && free <= 0;
          const blocked = full || s.money < fee;
          return `<div class="card cand" data-key="cand-${c.id}">${avatar(c)}
          <div class="grow"><b>${esc(c.name)}${R ? ` <span class="tag">${R.flag} ${R.name}</span>` : ''}</b><small>${ROLES[c.role].icon} ${ROLES[c.role].name} · ${levelName(c.skill)} (${Math.round(c.skill)})</small>
          ${bar(c.skill / 100, 'var(--sky)')}
          <small>${c.traits.map((t) => `${TRAITS[t].icon} ${TRAITS[t].name}`).join(' · ') || '<span class="muted">Sin rasgos especiales</span>'}</small></div>
          <div class="col-btns"><b>${fmtMoney(c.salary)}/mes</b>${btn(`Contratar · ${fmtMoney(fee)}`, 'hire', { id: c.id }, { kind: 'primary', disabled: blocked, title: full ? (R ? `Sede de ${R.name} llena` : 'Sin escritorios libres') : '' })}</div></div>`;
        })
        .join('') || '<p class="muted">No hay candidatos de este perfil ahora mismo.</p>'
    }</div>
    <div class="row end">${btn(`🔎 Headhunter · ${fmtMoney(G.headhunterCost(s))}`, 'refreshCands', {}, { disabled: s.money < G.headhunterCost(s) })}</div>`;
}

// Barra inferior del modo edición: qué hay seleccionado y qué se puede hacer.
export function editBar(s, U) {
  const L = s.office.layout;
  const ref = U.editSel;
  const done = btn('➕', 'editAdd', {}, { kind: 'small', title: 'Añadir muebles' }) + btn('✔ Listo', 'editToggle', {}, { kind: 'primary small' });
  if (!ref) {
    return `<div class="eb-info"><b>🛠️ Modo edición</b><small>Arrastra mesas y muebles. Verde: cabe · rojo: no cabe.</small></div>
      <div class="eb-btns">${done}</div>`;
  }
  const [k, v] = ref.split(':');
  if (k === 'd') {
    const i = +v;
    const e = s.employees.find((x) => x.desk === i && !x.traits.includes('remote'));
    const fx = G.deskFx(s, e || { desk: i, traits: [] });
    const env = [fx.comfort ? `+${fx.comfort} ánimo` : '', fx.noise ? `-${Math.round(fx.noise * 100)}% por ruido` : ''].filter(Boolean).join(' · ');
    return `<div class="eb-info"><b>🪑 Mesa ${i + 1}</b><small>${e ? esc(e.name) : 'Libre'}${env ? ' · ' + env : ' · sin decoración cerca'}</small></div>
      <div class="eb-btns">${btn('✕', 'editDeselect', {}, { kind: 'small ghost', title: 'Deseleccionar' })}${done}</div>`;
  }
  const it = L.items.find((x) => x.uid === +v);
  if (!it) return `<div class="eb-info"><b>🛠️ Modo edición</b></div><div class="eb-btns">${done}</div>`;
  const def = PERKS[it.id] || FIXTURES[it.id];
  const val = G.sellValue(it.id);
  return `<div class="eb-info"><b>${def.icon} ${def.name}</b><small>${def.desc}</small></div>
    <div class="eb-btns">${btn(val ? `Vender · +${fmtMoney(val)}` : 'Quitar', 'editSell', { uid: it.uid }, { kind: 'small danger' })}
    ${btn('✕', 'editDeselect', {}, { kind: 'small ghost', title: 'Deseleccionar' })}${done}</div>`;
}

export function employeeModal(s, id) {
  const e = G.findEmp(s, id);
  if (!e) return '<p>Esta persona ya no trabaja aquí.</p>';
  const fx = G.deskFx(s, e);
  const env = e.region
    ? `${REGIONS[e.region].flag} Trabaja en la sede de ${REGIONS[e.region].name}.`
    : e.traits.includes('remote')
    ? '🏠 Trabaja desde casa.'
    : [`🪑 Mesa ${e.desk + 1}`, fx.comfort ? `+${fx.comfort} ánimo por la decoración cercana` : 'sin decoración cerca', fx.noise ? `-${Math.round(fx.noise * 100)}% productividad por ruido` : ''].filter(Boolean).join(' · ');
  const exp = G.expectedSalary(e, s);
  const out = G.output(s, e);
  const role = ROLES[e.role];
  const need = 25 + e.skill * 2.5;
  return `<div class="row gap">${avatar(e).replace('class="avatar"', 'class="avatar big"')}
    <div class="grow"><b class="lg">${esc(e.name)}</b><div>${role.icon} ${role.name} · ${levelName(e.skill)} · habilidad ${Math.round(e.skill)}</div>
    <small class="muted">En la empresa desde el ${fmtDate(e.hired)} · 🎂 ${birthdayOf(e).d} ${MONTHS[birthdayOf(e).m]}${isBirthday(s, e) ? ' (¡hoy!)' : ''}</small></div></div>
    <div class="kpis">
      ${kpi('Producción', out.toFixed(1) + '/día', role.produces === 'flex' ? 'Cubre lo que falte' : '')}
      ${kpi('Ánimo', Math.round(e.mood), '', e.mood < 30 ? 'warn' : '')}
      ${kpi('Energía', Math.round(e.energy), '', e.energy < 25 ? 'warn' : '')}
      ${kpi('Sueldo', e.role === 'founder' ? '—' : fmtMoney(e.salary), e.role === 'founder' ? '' : `Mercado: ${fmtMoney(exp)}`, e.salary < exp * 0.95 ? 'warn' : '')}
    </div>
    <div class="xp"><small>Experiencia hasta el siguiente punto de habilidad</small>${bar(e.xp / need, 'var(--lime)')}</div>
    <p class="muted">${env}</p>
    ${e.traits.length ? `<h4>Rasgos</h4><ul class="traits">${e.traits.map((t) => `<li>${TRAITS[t].icon} <b>${TRAITS[t].name}:</b> ${TRAITS[t].desc}</li>`).join('')}</ul>` : ''}
    ${relList(s, e)}
    ${G.isAssignable(e) && e.off <= 0 ? `<h4>Asignación</h4>${assignSelect(s, e)}` : ''}
    ${e.assign && G.teamLead(s, e.assign) === e ? `<p>🎖️ Dirige ${esc(G.targetLabel(s, e.assign))}: el resto del equipo rinde un ${Math.round(G.leadBonus(e) * 100)}% más; su propia producción baja a la mitad.</p>` : ''}
    ${
      e.role === 'founder'
        ? '<p class="muted">Eres el alma de la empresa. Puedes trabajar en productos, contratos o investigación.</p>'
        : `<div class="row gap wrap">${btn(`💸 Subir sueldo → ${fmtMoney(Math.max(Math.round((e.salary * 1.08) / 50) * 50, exp))}`, 'raise', { id: e.id })}
      ${btn(`🎓 Formación · ${fmtMoney(G.trainCost(e))}`, 'train', { id: e.id }, { disabled: e.off > 0 || s.money < G.trainCost(e) })}
      ${btn('Despedir', 'fire', { id: e.id }, { kind: 'danger' })}</div>`
    }`;
}

// Amistades, parejas, roces y mentorías de una persona.
function relList(s, e) {
  const name = (id) => esc(G.findEmp(s, id)?.name || 'alguien que ya no está');
  const items = relationsOf(s, e.id).map((r) => {
    const k = REL_KINDS[r.kind];
    const who = name(r.a === e.id ? r.b : r.a);
    const fx = r.kind === 'rival' ? 'menos ánimo y rinde un 4% menos' : r.kind === 'couple' ? '+4 de ánimo' : '+1,5 de ánimo';
    return `<li>${k.icon} <b>${k.name}</b> con ${who} <small class="muted">(${fx})</small></li>`;
  });
  if (e.mentor) items.push(`<li>🎓 Aprende de ${name(e.mentor)} <small class="muted">(+50% de experiencia)</small></li>`);
  for (const j of s.employees) if (j.mentor === e.id) items.push(`<li>🎓 Mentor/a de ${esc(j.name)}</li>`);
  if (e.off > 0 && e.offReason) items.push(`<li>🗓️ ${esc(e.offReason)}: vuelve en ${fmtDays(e.off)}</li>`);
  return items.length ? `<h4>Relaciones</h4><ul class="traits">${items.join('')}</ul>` : '';
}

// ---------------------------------------------------------------- productos

function productTeam(s, p) {
  const out = { code: 0, design: 0, ai: 0, flex: 0, people: 0, marketers: 0, pms: 0 };
  const key = 'p:' + p.id;
  for (const e of s.employees) {
    if (e.assign !== key || e.off > 0) continue;
    const produces = ROLES[e.role].produces;
    if (['code', 'design', 'ai', 'flex'].includes(produces)) {
      out[produces] += G.output(s, e);
      out.people += 1;
    } else if (produces === 'hype') out.marketers += 1;
    else if (produces === 'lead') out.pms += 1;
  }
  return out;
}

function etas(p, team) {
  const cum = { code: 0, design: 0, ai: 0 };
  return p.queue.map((t) => {
    let worst = 0;
    let sum = 0;
    for (const k of ['code', 'design', 'ai']) {
      cum[k] += Math.max(0, (t.need[k] || 0) - t.done[k]);
      sum += cum[k];
      if (cum[k] > 0) {
        const rate = team[k] + team.flex;
        worst = Math.max(worst, rate > 0 ? cum[k] / rate : Infinity);
      }
    }
    const total = team.code + team.design + team.ai + team.flex;
    return Math.max(worst, total > 0 ? sum / total : Infinity);
  });
}

const statusTag = (p) =>
  !p.launched ? '<span class="tag dev">En desarrollo</span>' : p.down > 0 ? '<span class="tag bad">Caído</span>' : '<span class="tag live">En línea</span>';

function productsPanel(s) {
  const cards = s.products
    .map((p) => {
      const cat = CATEGORIES[p.cat];
      const rev = p.rev?.total || 0;
      const team = productTeam(s, p);
      const eta = etas(p, team);
      const next = p.queue[0];
      return `<button class="card product" data-act="openProduct" data-id="${p.id}" data-key="prod-${p.id}">
        <div class="card-icon">${cat.icon}</div>
        <div class="grow"><b>${esc(p.name)} ${statusTag(p)}</b><small>${cat.name} · ${team.people} ${team.people === 1 ? 'persona' : 'personas'}</small>
        ${next ? `<small>Siguiente: ${FEATURES[next.f].icon} ${FEATURES[next.f].name} ${next.lvl > 1 ? 'nv ' + next.lvl : ''} · ${Number.isFinite(eta[0]) ? fmtDays(eta[0]) : 'sin equipo'}</small>` : '<small class="muted">Cola vacía: el equipo arregla bugs</small>'}</div>
        <div class="prod-nums"><b>${fmtNum(p.users)}</b><small>${isHW(p) ? 'en uso' : 'usuarios'}</small><b>${fmtMoney(rev * 30)}</b><small>/mes</small></div></button>`;
    })
    .join('');
  const canCreate = s.products.length < 5;
  return `<div class="row gap wrap">${btn('➕ Nuevo producto', 'newProduct', {}, { kind: 'primary big', disabled: !canCreate })}
    <small class="muted">${s.products.length}/5 productos</small></div>
    <div class="cards">${cards || '<div class="empty">📦<p>Aún no tienes productos. Crea uno: los contratos pagan las facturas, pero los productos te harán rico.</p></div>'}</div>`;
}

export function newProductModal(s, U) {
  const sel = U.newCat || 'blog';
  const cats = Object.entries(CATEGORIES)
    .map(([id, c]) => {
      const locked = !G.categoryUnlocked(s, id);
      const hw = c.kind === 'hw';
      return `<button class="card cat ${sel === id ? 'on' : ''} ${locked ? 'locked' : ''}" data-act="pickCat" data-cat="${id}" ${locked ? 'disabled' : ''}>
        <div class="card-icon">${c.icon}</div><div class="grow"><b>${c.name}${hw ? ' <span class="tag core">hardware</span>' : ''}</b>
        <small>${locked ? '🔒 Requiere ' + RESEARCH_BY_ID[c.research].name : c.desc}</small>
        <small class="muted">${hw ? `${fmtNum(c.market)} compradores al año · se vende a ~$${c.ref}` : `Mercado: ${fmtNum(c.market)} personas`}</small></div></button>`;
    })
    .join('');
  return `<label class="field">Nombre<div class="row gap"><input id="pname" maxlength="24" value="${esc(U.newName || '')}" placeholder="Nombre del producto">
    ${btn('🎲', 'randomName', {}, { title: 'Nombre aleatorio' })}</div></label>
    <div class="cards two">${cats}</div>
    <div class="row end gap"><button class="btn" data-close>Cancelar</button>${btn('Crear producto', 'createProduct', {}, { kind: 'primary' })}</div>`;
}

function productDetail(s, p) {
  const cat = CATEGORIES[p.cat];
  const team = productTeam(s, p);
  const eta = etas(p, team);
  const tp = G.teamPowers(s);
  const rev = G.productRevenue(s, p, tp);
  const sat = G.satisfaction(s, p);
  const q = G.quality(p);
  const sh = G.share(s, p);
  const needTypes = new Set();
  for (const t of p.queue) for (const k of ['code', 'design', 'ai']) if ((t.need[k] || 0) > t.done[k]) needTypes.add(k);
  const missing = [...needTypes].filter((k) => team[k] + team.flex <= 0);
  const queue = p.queue
    .map((t, i) => {
      const F = FEATURES[t.f];
      const bars = ['code', 'design', 'ai']
        .filter((k) => t.need[k])
        .map((k) => `<div class="mini" title="${POINT_TYPES[k].name}: ${Math.floor(t.done[k])}/${t.need[k]}">${POINT_TYPES[k].icon}${bar(t.done[k] / t.need[k], POINT_TYPES[k].color)}</div>`)
        .join('');
      return `<div class="task" data-key="task-${t.f}-${t.lvl}"><div class="grow"><b>${F.icon} ${F.name}${t.lvl > 1 ? ` <span class="tag">nv ${t.lvl}</span>` : ''}</b>
        <div class="minis">${bars}</div></div><small class="eta">${Number.isFinite(eta[i]) ? fmtDays(eta[i]) : '∞'}</small>
        <div class="task-btns"><button class="icon-btn" data-act="moveTask" data-pid="${p.id}" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">▲</button>
        <button class="icon-btn" data-act="moveTask" data-pid="${p.id}" data-i="${i}" data-dir="1" ${i === p.queue.length - 1 ? 'disabled' : ''} aria-label="Bajar">▼</button>
        <button class="icon-btn" data-act="dequeue" data-pid="${p.id}" data-i="${i}" aria-label="Quitar">✕</button></div></div>`;
    })
    .join('');
  const hw = isHW(p);
  const entries = Object.entries(cat.features);
  if (!hw) for (const [f, F] of Object.entries(FEATURES)) if (F.universal && cat.features[f] == null) entries.push([f, UNIVERSAL_WEIGHT]);
  const feats = entries
    .map(([f, w]) => ({ f, w, F: FEATURES[f], unlocked: G.featureUnlocked(s, f) }))
    .sort((a, b) => (b.unlocked - a.unlocked) || (b.w - a.w))
    .map(({ f, w, F, unlocked }) => {
      const lvl = p.features[f] || 0;
      const ql = G.queuedLevel(p, f);
      const next = ql + 1;
      const maxed = ql >= MAX_FEATURE_LEVEL;
      const stars = w >= 1.5 ? '★★★' : w >= 1 ? '★★☆' : '★☆☆';
      const core = cat.core.includes(f);
      return `<div class="feat ${lvl ? 'has' : ''} ${unlocked ? '' : 'locked'}" data-key="feat-${f}">
        <div class="feat-top"><span class="feat-icon">${F.icon}</span><b>${F.name}</b>${core ? '<span class="tag core">básica</span>' : ''}</div>
        <small class="muted">${stars} relevancia · nivel ${lvl}${ql > lvl ? ` → ${ql}` : ''}/${MAX_FEATURE_LEVEL}${F.monet ? ' · 💰' : ''}${F.market ? ' · 🌍' : ''}${F.retention ? ' · ❤️' : ''}</small>
        ${
          !unlocked
            ? `<small>🔒 ${RESEARCH_BY_ID[F.research].name}</small>`
            : maxed
              ? '<small class="good-text">Nivel máximo</small>'
              : `<div class="row between"><small>${costStr(G.featureCost(f, next))}</small>${btn(lvl || ql ? '⬆' : '+', 'queue', { pid: p.id, f }, { kind: 'small primary', disabled: p.queue.length >= 8, title: 'Añadir a la cola' })}</div>`
        }</div>`;
    })
    .join('');
  const launchBtn = !p.launched
    ? `<div class="banner ${G.coreDone(p) ? 'ok' : ''}">${
        G.coreDone(p)
          ? `<b>¡Listo para lanzar!</b>${btn(p.keynote ? '🚀 Lanzar ya (cancela la presentación)' : '🚀 Lanzar', 'launch', { pid: p.id }, { kind: p.keynote ? 'big' : 'primary big', title: p.keynote ? 'El dinero de la presentación no se recupera' : '' })}`
          : `<span>Para lanzar necesitas: ${cat.core.map((f) => `${FEATURES[f].icon} ${FEATURES[f].name}${p.features[f] ? ' ✅' : ''}`).join(', ')}</span>`
      }</div>`
    : '';
  const monet = [];
  if (p.features.ads) {
    monet.push(`<div class="row between"><span>📢 Publicidad <small class="muted">(molesta un poco)</small></span>
      <button class="switch ${p.ads ? 'on' : ''}" data-act="toggleAds" data-pid="${p.id}" aria-pressed="${p.ads}"><i></i></button></div>`);
  }
  if (p.features.subs) {
    monet.push(`<div><span>⭐ Plan Premium: conversión ${fmtPct(G.premiumConversion(s, p), 1)} · ${fmtNum(rev.premium)} de pago</span>
      <div class="chips">${PREMIUM_PRICES.map((pr) => `<button class="chip ${p.price === pr ? 'on' : ''}" data-act="setPrice" data-pid="${p.id}" data-price="${pr}">${pr ? '$' + pr + '/mes' : 'Gratis'}</button>`).join('')}</div></div>`);
  }
  if (p.features.payments || p.features.bank) monet.push('<div>💳 Comisiones por transacción activas</div>');
  if (p.features.api) monet.push('<div>🔌 API de pago activa</div>');
  const alerts = productAlerts(s, p);
  return `<div class="row gap wrap">${btn('← Productos', 'backProducts', {}, { kind: 'ghost' })}
      <h3 class="grow nomargin">${cat.icon} ${esc(p.name)} ${statusTag(p)}</h3>${btn('✏️', 'renameProduct', { pid: p.id }, { kind: 'ghost', title: 'Renombrar' })}</div>
    ${launchBtn}${keynoteSection(s, p)}${alerts}
    <div class="kpis">
      ${hw ? hwKpis(s, p) : kpi('Usuarios', fmtNum(p.users), p.launched ? `pico ${fmtNum(p.peak)}` : 'sin lanzar')}
      ${kpi('Ingresos', fmtMoney(rev.total * 30) + '/mes')}
      ${kpi('Satisfacción', fmtPct(sat), '', sat < 0.45 ? 'warn' : '')}
      ${kpi('Calidad', fmtPct(q), `${Math.round(p.bugs)} bugs`, q < 0.7 ? 'warn' : '')}
      ${hw ? '' : kpi('Deuda técnica', fmtPct(G.debtLevel(p)), G.debtLevel(p) > 0.05 ? `desarrollo ${Math.round((1 - G.debtSpeed(p)) * 100)}% más lento` : 'código limpio', G.debtLevel(p) > 0.6 ? 'warn' : '')}
      ${kpi('Cuota', fmtPct(sh, 1), `atractivo ${Math.round(G.productAppeal(s, p))}`)}
      ${kpi('Conocimiento', fmtPct(p.awareness), `hype ${Math.round(p.hype)}`)}
      ${kpi('Mercado', fmtNum(G.potential(s, p)), regionMarket(s, p) > 1.001 ? `×${regionMarket(s, p).toFixed(2)} por sedes` : 'solo tu región')}
    </div>
    <h3>Equipo del producto</h3>
    <div class="row gap wrap"><span class="pt code">💻 ${team.code.toFixed(1)}/día</span><span class="pt design">🎨 ${team.design.toFixed(1)}/día</span>
      <span class="pt ai">🧠 ${team.ai.toFixed(1)}/día</span>${team.flex ? `<span class="pt flex">👑 ${team.flex.toFixed(1)}/día</span>` : ''}
      <small class="muted">${team.marketers} marketing · ${team.pms} PM</small>${btn('Asignar a quien esté libre', 'assignIdle', { target: 'p:' + p.id }, { kind: 'small' })}</div>
    ${missing.length ? `<div class="banner warn">⚠️ Nadie produce ${missing.map((k) => POINT_TYPES[k].name).join(' ni ')} en este producto. Contrata o asigna a alguien.</div>` : ''}
    ${paceSection(s, p)}
    <h3>Cola de desarrollo <small class="muted">${p.queue.length}/8</small></h3>
    <div class="queue">${queue || '<p class="muted">Cola vacía. Añade funciones abajo; mientras tanto, el equipo arregla bugs.</p>'}</div>
    <h3>Funciones</h3><div class="feats">${feats}</div>
    ${hw ? hwSection(s, p) : `<h3>Monetización</h3><div class="monet">${monet.join('') || '<p class="muted">Investiga "Modelos de negocio" y desarrolla Publicidad o Plan Premium para ganar dinero.</p>'}
      ${p.launched ? `<small class="muted">Publicidad ${fmtMoney(rev.ads * 30)} · Premium ${fmtMoney(rev.subs * 30)} · Comisiones ${fmtMoney(rev.tx * 30)} · API ${fmtMoney(rev.api * 30)} (al mes)</small>` : ''}</div>`}
    <div class="row end">${btn('Retirar producto', 'retireProduct', { pid: p.id }, { kind: 'danger small' })}</div>`;
}

// Presentación de lanzamiento: programar, seguir la campaña y el pronóstico.
function keynoteSection(s, p) {
  if (p.launched) return '';
  const k = p.keynote;
  if (k) {
    const K = KEYNOTES[k.size];
    const odds = keynoteOdds(s, p);
    const T = KEYNOTE_TIERS[tierOf(odds.score)];
    const ready = G.coreDone(p);
    return `<div class="banner ${ready ? 'ok' : 'warn'}"><div class="grow">
      <b>${K.icon} Presentación ${K.name.toLowerCase()} · ${fmtDate(k.day)} (${k.day - s.day > 0 ? 'en ' + fmtDays(k.day - s.day) : 'hoy'})</b>
      <small>${ready ? '✅ Funciones básicas listas' : '❌ Faltan funciones básicas: si no llegan, la demo fallará en directo'} · hype ${fmtNum(Math.round(p.hype))} (+${K.hype}/día)</small>
      <small>Pronóstico: ${T.icon} ${T.name} · producto completo ${fmtPct(odds.comp)} · calidad ${fmtPct(odds.quality)} · presenta ${odds.host.e ? esc(odds.host.e.name.split(' ')[0]) : 'nadie'}</small></div>
      ${btn('Cancelar', 'cancelKeynote', { pid: p.id }, { kind: 'small ghost', title: 'No se devuelve el dinero y cuesta 1 de reputación' })}</div>`;
  }
  const cards = Object.entries(KEYNOTES)
    .map(([id, K]) => `<div class="card" data-key="kn-${id}"><div class="card-icon">${K.icon}</div><div class="grow"><b>${K.name}</b><small>${esc(K.desc)}</small>
      <small class="muted">${fmtMoney(K.cost)} · en ${K.days} días · +${K.hype} hype al día · alcance ×${K.reach}</small></div>
      ${btn('Programar', 'keynote', { pid: p.id, size: id }, { kind: 'small primary', disabled: s.money < K.cost })}</div>`)
    .join('');
  return `<details class="keynote-box" data-key="keynote"><summary><b>🎤 Presentación de lanzamiento</b> <small class="muted">en vez de lanzar sin más</small></summary>
    <p class="muted small">La campaña previa sube el hype cada día y, si la presentación sale bien, el primer día llega mucha más gente. Sale mejor cuanto más completo y pulido está el producto y cuanto mejor presenta quien sube al escenario. Si ese día faltan las funciones básicas, la demo fallará en directo.</p>
    <div class="cards">${cards}</div></details>`;
}

// Ritmo de desarrollo y deuda técnica.
function paceSection(s, p) {
  if (isHW(p)) return '';
  const lvl = G.debtLevel(p);
  const queued = p.queue.some((t) => t.f === 'refactor');
  const chips = Object.entries(PACES)
    .map(([id, P]) => `<button class="chip ${G.paceOf(p) === P ? 'on' : ''}" data-act="setPace" data-pid="${p.id}" data-pace="${id}" title="${esc(P.desc)}">${P.icon} ${P.name}</button>`)
    .join('');
  const effect = lvl > 0.05
    ? `el desarrollo va un ${Math.round((1 - G.debtSpeed(p)) * 100)}% más lento y salen ×${G.debtBugs(p).toFixed(1)} bugs`
    : 'el código está limpio';
  return `<h3>Ritmo de desarrollo</h3>
    <div class="chips">${chips}</div>
    <p class="muted small">${esc(G.paceOf(p).desc)}</p>
    <div class="row between wrap gap"><span>🧱 Deuda técnica <b class="${lvl > 0.6 ? 'warn-text' : ''}">${fmtPct(lvl)}</b>: ${effect}.</span>
      ${btn(queued ? '🧹 En la cola' : '🧹 Refactorizar', 'refactor', { pid: p.id }, { kind: 'small', disabled: queued || lvl < 0.05 || p.queue.length >= 8, title: 'Añade a la cola una tarea de código que paga la deuda acumulada' })}</div>`;
}

// Avisos de un producto: leyes, guerra de precios, antimonopolio, temporada.
function productAlerts(s, p) {
  const out = [];
  for (const law of complianceIssues(s, p)) {
    const F = FEATURES[law.require];
    out.push(`<div class="banner warn">${law.icon} Incumple la ${law.name}: añade ${F.icon} ${F.name}${G.has(s, 'compliance') ? '' : ' (investiga Cumplimiento normativo)'} o te multarán.</div>`);
  }
  if (p.war?.until > s.day) {
    const c = s.competitors.find((x) => x.id === p.war.rival);
    const how = p.war.response === 'match' ? 'has igualado precios (-20% ingresos)' : 'aguantas (-30% conversión)';
    out.push(`<div class="banner warn">⚔️ Guerra de precios con ${esc(c?.name || 'un rival')}: ${how}. Quedan ${fmtDays(p.war.until - s.day)}.</div>`);
  }
  if (p.antitrust > s.day) out.push(`<div class="banner warn">🏛️ Bajo vigilancia antimonopolio: crecimiento limitado ${fmtDays(p.antitrust - s.day)} más.</div>`);
  if (p.storeBan > s.day) out.push(`<div class="banner warn">⛔ Fuera de las tiendas de apps ${fmtDays(p.storeBan - s.day)} más: casi nadie puede instalar la app.</div>`);
  if (adsHit(s, p)) out.push('<div class="banner warn">🙈 Nueva política de rastreo: los anuncios rinden menos en el móvil.</div>');
  if (p.down > 0) out.push(`<div class="banner warn">🔥 Caído ${fmtDays(p.down)} más: sin ingresos y perdiendo usuarios.</div>`);
  const m = seasonDemand(s, p.cat);
  if (m !== 1) {
    const se = seasonOf(s);
    out.push(`<div class="banner ${m > 1 ? 'ok' : ''}">${se.icon} ${se.name}: demanda ×${m.toFixed(2)} en ${CATEGORIES[p.cat].name}.</div>`);
  }
  return out.join('');
}

function hwKpis(s, p) {
  const cover = p.demand > 0 ? p.stock / p.demand : Infinity;
  return `${kpi('Dispositivos en uso', fmtNum(p.users), `${fmtNum(p.sold)} vendidos`)}
    ${kpi('Stock', fmtNum(p.stock), Number.isFinite(cover) ? `para ${fmtDays(cover)}` : 'sin demanda aún', p.launched && cover < 10 ? 'warn' : '')}
    ${kpi('Demanda', fmtNum(p.demand || 0) + '/día', p.lost > 1 ? `perdiendo ${fmtNum(p.lost)}/día` : '', p.lost > 1 ? 'warn' : '')}
    ${kpi('Margen', fmtMoney(hwPrice(p) - unitCost(s, p)) + '/ud', `precio ${fmtMoney(hwPrice(p))} · coste ${fmtMoney(unitCost(s, p))}`)}`;
}

function hwSection(s, p) {
  const cat = CATEGORIES[p.cat];
  const cost = unitCost(s, p);
  const ready = G.coreDone(p);
  const orders = (p.orders || [])
    .map((o, i) => `<div data-key="ord-${i}-${o.arrive}">🚚 ${fmtNum(o.qty)} unidades · llegan en ${fmtDays(o.arrive - s.day)}</div>`)
    .join('');
  const rev = p.rev || {};
  return `<h3>Fabricación y ventas</h3><div class="monet">
    <div><span>💲 Precio de venta</span>
      <div class="chips">${HW_PRICES.map((m) => `<button class="chip ${(p.priceMult ?? 1) === m ? 'on' : ''}" data-act="hwPrice" data-pid="${p.id}" data-m="${m}">$${fmtNum(Math.round(cat.ref * m))}</button>`).join('')}</div>
      <small class="muted">Más caro: más margen por unidad pero menos ventas.</small></div>
    <div><span>🏭 Fabricar · ${fmtMoney(cost)}/unidad · llegan en ${leadTime(s)} días</span>
      <div class="chips">${[1000, 10000, 100000, 1000000]
        .map((q) => btn(`+${fmtNum(q)} · ${fmtMoney(q * cost)}`, 'orderUnits', { pid: p.id, q }, { kind: 'small', disabled: !ready || s.money < q * cost }))
        .join('')}</div>
      ${ready ? '' : '<small class="warn-text">Termina el diseño básico antes de fabricar.</small>'}</div>
    ${orders ? `<div class="orders">${orders}</div>` : '<small class="muted">No hay pedidos en camino.</small>'}
    <small class="muted">Almacenaje: 1% del coste al mes · devoluciones: ${fmtPct((1 - G.quality(p)) * 0.15, 1)} de las ventas${p.features.appstore ? ` · tienda de apps: ${fmtMoney((rev.store || 0) * 30)}/mes` : ''}. Consejo: ten stock antes de Black Friday y Navidades.</small>
  </div>`;
}

// ---------------------------------------------------------------- contratos

function contractsPanel(s) {
  const C = s.contracts;
  const active = C.active
    .map((c) => {
      const n = s.employees.filter((e) => e.assign === 'c:' + c.id && e.off <= 0).length;
      const left = c.deadline - s.day;
      const bars = ['code', 'design', 'ai']
        .filter((k) => c.need[k])
        .map((k) => `<div class="mini" title="${Math.floor(c.done[k])}/${c.need[k]}">${POINT_TYPES[k].icon}${bar(c.done[k] / c.need[k], POINT_TYPES[k].color)}</div>`)
        .join('');
      return `<div class="card contract" data-key="ca-${c.id}"><div class="card-icon">📝</div>
        <div class="grow"><b>${esc(c.title)}</b><small>${esc(c.client)} · ${n} ${n === 1 ? 'persona' : 'personas'} · <span class="${left < 5 ? 'warn-text' : ''}">quedan ${fmtDays(left)}</span></small>
        <div class="minis">${bars}</div></div>
        <div class="col-btns"><b>${fmtMoney(c.pay)}</b>${btn('Asignar libres', 'assignIdle', { target: 'c:' + c.id }, { kind: 'small' })}${btn('Abandonar', 'abandonContract', { id: c.id }, { kind: 'small ghost' })}</div></div>`;
    })
    .join('');
  const offers = C.offers
    .map(
      (c) => `<div class="card contract" data-key="co-${c.id}"><div class="card-icon">📨</div>
      <div class="grow"><b>${esc(c.title)}</b><small>${esc(c.client)} · plazo ${fmtDays(c.days)} · +${c.rep} reputación</small><small>${costStr(c.need)}</small>
      <small class="muted">La oferta caduca en ${fmtDays(c.expires - s.day)}</small></div>
      <div class="col-btns"><b>${fmtMoney(c.pay)}</b>${btn('Aceptar', 'acceptContract', { id: c.id }, { kind: 'primary', disabled: C.active.length >= 3 })}</div></div>`,
    )
    .join('');
  return `<p class="muted">Los contratos son trabajos para clientes: dinero rápido y reputación mientras tus productos crecen. Asigna gente en la pestaña Equipo o con "Asignar libres".</p>
    <div class="kpis">${kpi('Entregados', s.stats.contractsDone)}${kpi('Fallidos', C.failed || 0)}${kpi('Reputación', Math.round(s.reputation), 'más reputación, mejores contratos')}</div>
    <h3>En curso <small class="muted">${C.active.length}/3</small></h3><div class="cards">${active || '<p class="muted">Ningún contrato en marcha.</p>'}</div>
    <h3>Ofertas</h3><div class="cards">${offers || '<p class="muted">No hay ofertas ahora mismo. Llegarán más en unos días.</p>'}</div>
    ${b2bSection(s)}`;
}

// Clientes empresa: oportunidades, negociaciones y contratos anuales.
function b2bSection(s) {
  if (!G.has(s, 'sales101')) {
    return `<h3>🏢 Clientes empresa</h3><p class="muted">🔒 Investiga ${RESEARCH_BY_ID.sales101.name} para conseguir clientes empresa: pagan una cuota anual por usar tus productos.</p>`;
  }
  const B = s.b2b || { leads: [], deals: [], won: 0, lost: 0 };
  const leads = B.leads
    .map((l) => {
      const p = G.findProduct(s, l.pid);
      if (!p) return '';
      const Z = B2B_SIZES[l.size];
      const miss = missingReqs(s, l);
      const reqs = l.reqs.map((f) => `${FEATURES[f].icon} ${FEATURES[f].name} ${reqHint(s, p, f)}`).join(' · ');
      const action = l.state === 'talks'
        ? `<small class="muted">Negociando: responden en ${fmtDays(Math.max(0, l.resolve - s.day))}</small>`
        : `${btn(`Enviar propuesta · ${fmtPct(winChance(s, l))}`, 'b2bPitch', { id: l.id }, { kind: 'small primary', disabled: miss.length > 0, title: miss.length ? 'Primero desarrolla las funciones que piden' : '' })}${btn('Descartar', 'b2bDrop', { id: l.id }, { kind: 'small ghost' })}`;
      return `<div class="card" data-key="lead-${l.id}"><div class="card-icon">${Z.icon}</div><div class="grow">
        <b>${esc(l.client)}</b><small>${Z.name} · ${esc(p.name)} · <b>${fmtMoney(l.value)}/año</b> · máx. ${l.sla} días caído al año</small>
        <small>Piden: ${reqs}</small>${l.state === 'open' ? `<small class="muted">La oportunidad caduca en ${fmtDays(l.expires - s.day)}</small>` : ''}</div>
        <div class="col-btns">${action}</div></div>`;
    })
    .join('');
  const deals = B.deals
    .map((d) => {
      const Z = B2B_SIZES[d.size];
      return `<div class="card owned" data-key="deal-${d.id}"><div class="card-icon">${Z.icon}</div><div class="grow">
        <b>${esc(d.client)}</b><small>${esc(G.findProduct(s, d.pid)?.name ?? d.product)} · ${fmtMoney(d.value)}/año · renueva en ${fmtDays(Math.max(0, d.end - s.day))}</small>
        <small class="${d.breaches ? 'warn-text' : 'muted'}">Días caído: ${d.down}/${d.sla}${d.breaches ? ' · ⚠️ ya hubo una penalización: a la próxima se van' : ''}</small></div></div>`;
    })
    .join('');
  return `<h3>🏢 Clientes empresa</h3>
    <p class="muted small">Algunas empresas se interesan por tus productos (sobre todo SaaS y asistentes de IA). Piden funciones concretas y un máximo de días caído al año: si te pasas, hay penalización y, a la segunda, se van. Los comerciales traen más clientes y cierran más ventas.</p>
    <div class="kpis">${kpi('Clientes', B.deals.length)}${kpi('Ingresos B2B', fmtMoney(b2bDaily(s) * 365) + '/año')}${kpi('Ventas', `${B.won} cerradas`, `${B.lost} perdidas`)}</div>
    <div class="cards">${leads || '<p class="muted">Ninguna oportunidad ahora mismo. Llegan más a menudo con más comerciales y mejores productos.</p>'}</div>
    ${deals ? `<h4>Contratos anuales</h4><div class="cards">${deals}</div>` : ''}`;
}

// ---------------------------------------------------------------- investigación

function researchPanel(s) {
  const rate = s.employees.reduce((a, e) => {
    if (e.off > 0) return a;
    if (e.role === 'research') return a + G.output(s, e);
    if (e.role === 'founder' && e.assign === 'rd') return a + G.output(s, e) * 0.8;
    return a;
  }, 0);
  const tiers = [...new Set(RESEARCH.map((r) => r.tier))];
  const done = Object.keys(s.research).length;
  const html = tiers
    .map((t) => {
      const items = RESEARCH.filter((r) => r.tier === t)
        .map((r) => {
          const st = G.researchState(s, r);
          const reqs = (r.req || []).filter((q) => !G.has(s, q)).map((q) => RESEARCH_BY_ID[q].name);
          return `<div class="card res ${st}" data-key="res-${r.id}"><div class="card-icon">${r.icon}</div>
            <div class="grow"><b>${r.name}</b><small>${r.desc}</small>${st === 'locked' ? `<small class="muted">🔒 Antes: ${reqs.join(', ')}</small>` : ''}</div>
            ${st === 'done' ? '<span class="tag live">✔</span>' : btn(`${fmtNum(r.cost)} PI`, 'research', { id: r.id }, { kind: st === 'available' && s.rp >= r.cost ? 'primary' : '', disabled: st !== 'available' || s.rp < r.cost })}</div>`;
        })
        .join('');
      return `<h3>Nivel ${t}</h3><div class="cards">${items}</div>`;
    })
    .join('');
  return `<div class="kpis">${kpi('Puntos de investigación', fmtNum(Math.floor(s.rp)) + ' PI')}${kpi('Producción', rate.toFixed(1) + ' PI/día', rate ? '' : 'Contrata investigadores o asígnate a I+D', rate ? '' : 'warn')}
    ${kpi('Completado', `${done}/${RESEARCH.length}`)}</div>${html}`;
}

// ---------------------------------------------------------------- marketing

function marketingPanel(s, U) {
  if (!s.products.length) return '<div class="empty">📣<p>Crea un producto para poder promocionarlo.</p></div>';
  const p = G.findProduct(s, U.mktPid) || s.products[0];
  const chips = s.products
    .map((x) => `<button class="chip ${x.id === p.id ? 'on' : ''}" data-act="mktPick" data-id="${x.id}">${CATEGORIES[x.cat].icon} ${esc(x.name)}</button>`)
    .join('');
  const running = s.campaigns.filter((c) => c.pid === p.id);
  const camps = CAMPAIGNS.map((c) => {
    const st = G.campaignState(s, p, c);
    const run = running.find((r) => r.id === c.id);
    return `<div class="card" data-key="camp-${c.id}"><div class="card-icon">${c.icon}</div><div class="grow"><b>${c.name}</b>
      <small>${c.instant ? `+${fmtNum(c.instant)} hype al instante` : `+${c.hype} hype/día durante ${c.days} días`}${c.desc ? ' · ' + c.desc : ''}</small>
      ${run ? `<small class="good-text">En curso: quedan ${fmtDays(run.left)}</small>` : ''}</div>
      ${btn(c.cost ? fmtMoney(c.cost) : 'Gratis', 'campaign', { pid: p.id, cid: c.id }, { kind: st.ok ? 'primary' : '', disabled: !st.ok, title: st.ok ? '' : st.why })}</div>`;
  }).join('');
  const marketers = s.employees.filter((e) => e.role === 'marketer' && e.assign === 'p:' + p.id).length;
  return `<div class="chips">${chips}</div>
    <div class="kpis">${kpi('Hype', Math.round(p.hype), 'baja un 6% al día')}${kpi('Conocimiento', fmtPct(p.awareness), 'quién te conoce')}
    ${kpi('Marketing asignado', marketers)}${kpi('Reputación', Math.round(s.reputation))}</div>
    <p class="muted">El hype hace que más gente conozca tu producto. El conocimiento de marca crece con rendimientos decrecientes: mejor constante que a golpes.</p>
    <h3>Campañas</h3><div class="cards">${camps}</div>`;
}

// ---------------------------------------------------------------- servidores

function infraPanel(s) {
  const tp = G.teamPowers(s);
  const st = G.infraStatus(s, tp);
  const hasCloud = G.has(s, 'cloud');
  const rows = s.products
    .filter((p) => p.launched)
    .map((p) => `<tr data-key="load-${p.id}"><td>${CATEGORIES[p.cat].icon} ${esc(p.name)}</td><td>${fmtNum(p.users)}</td><td>${fmtNum(G.productLoad(s, p, tp))} u</td></tr>`)
    .join('');
  const over = Math.max(0, s.infra.racks - st.coverage);
  const unit = G.rackUnits(s);
  return `<div class="kpis">
      ${kpi('Carga', fmtNum(st.load) + ' u', '1 u ≈ 1.000 usuarios normales')}
      ${kpi('Racks propios', s.infra.racks, `${fmtNum(st.cap)} u de capacidad`)}
      ${kpi('Nube', fmtNum(st.cloudUnits) + ' u', fmtMoney(st.cloudMonthly) + '/mes')}
      ${kpi('Caídas', s.infra.outages, over ? `${over} racks sin DevOps` : 'Todo vigilado', over ? 'warn' : '')}
    </div>
    <div class="loadbar">${bar(st.load ? Math.min(1, st.cap / st.load) : 0, 'var(--green)')}<small>${st.load ? fmtPct(Math.min(1, st.cap / st.load)) : '0%'} de la carga en racks propios · el resto ${s.infra.cloud ? 'en la nube' : '<b class="warn-text">SIN SERVIR</b>'}</small></div>
    ${st.overload > 0 ? `<div class="banner warn">⚠️ ${fmtPct(st.overload)} de la carga no se atiende: los usuarios se van. Activa la nube o compra racks.</div>` : ''}
    <h3>Nube con autoescalado</h3>
    <div class="card"><div class="card-icon">☁️</div><div class="grow"><b>Autoescalado en la nube</b>
      <small>Absorbe la carga que no cubren tus racks. Cómodo pero caro: ${fmtMoney(G.cloudPrice(s))} por unidad al mes.</small></div>
      <button class="switch ${s.infra.cloud ? 'on' : ''}" data-act="cloud" ${hasCloud ? '' : 'disabled'} aria-pressed="${s.infra.cloud}"><i></i></button></div>
    <h3>Servidores propios</h3>
    ${
      hasCloud
        ? `<div class="card"><div class="card-icon">🗄️</div><div class="grow"><b>Rack de servidores</b>
      <small>${fmtNum(unit)} u de capacidad · ${fmtMoney(G.RACK_COST)} + ${fmtMoney(G.RACK_UPKEEP)}/mes. Cada DevOps vigila unos 20 racks (${st.coverage} cubiertos).</small></div>
      <div class="col-btns">${[1, 5, 25].map((n) => btn(`+${n} · ${fmtMoney(G.RACK_COST * n)}`, 'buyRacks', { n }, { kind: 'small', disabled: s.money < G.RACK_COST * n })).join('')}
      ${s.infra.racks ? btn('Vender 1', 'sellRacks', { n: 1 }, { kind: 'small ghost' }) : ''}</div></div>`
        : '<p class="muted">🔒 Investiga "Infraestructura cloud" para comprar racks y contratar DevOps.</p>'
    }
    <h3>Carga por producto</h3>${rows ? `<table class="tbl"><tr><th>Producto</th><th>Usuarios</th><th>Carga</th></tr>${rows}</table>` : '<p class="muted">Sin productos en línea.</p>'}
    ${securitySection(s, tp)}`;
}

function securitySection(s, tp) {
  const lvl = secLevel(s, tp);
  const risk = yearlyAttacks(s, tp);
  const hasSec = G.has(s, 'infosec');
  const staff = s.employees.filter((e) => e.role === 'security').length;
  const audit = s.day - s.sec.audit < AUDIT_DAYS;
  const sw = (act, on, disabled) => `<button class="switch ${on ? 'on' : ''}" data-act="${act}" ${disabled ? 'disabled' : ''} aria-pressed="${on}"><i></i></button>`;
  return `<h3>Ciberseguridad</h3>
    <div class="kpis">
      ${kpi('Nivel de seguridad', `${lvl}/85`, lvl < 35 ? 'Muy expuesto' : lvl < 60 ? 'Aceptable' : 'Blindado', lvl < 35 ? 'warn' : '')}
      ${kpi('Ataques previstos', risk < 0.05 ? 'Casi ninguno' : `≈ ${risk.toFixed(1)} al año`, `${fmtNum(G.totalUsers(s))} usuarios a proteger`)}
      ${kpi('Incidentes', s.sec.incidents)}
      ${kpi('Especialistas', staff, hasSec ? 'Contrátalos en Equipo' : '🔒 Investiga Ciberseguridad')}
    </div>
    <div class="loadbar">${bar(lvl / 85, lvl < 35 ? 'var(--red)' : lvl < 60 ? 'var(--yellow)' : 'var(--green)')}</div>
    <div class="cards">
      <div class="card ${s.sec.backups ? 'owned' : ''}" data-key="sec-backups"><div class="card-icon">💾</div><div class="grow"><b>Copias de seguridad diarias</b>
        <small>Tras un ransomware vuelves en 1 día en vez de 6. ${fmtMoney(BACKUP_COST)}/mes.</small></div>${sw('secBackups', s.sec.backups, false)}</div>
      <div class="card ${s.sec.bounty ? 'owned' : ''} ${hasSec ? '' : 'locked'}" data-key="sec-bounty"><div class="card-icon">🐞</div><div class="grow"><b>Programa de bug bounty</b>
        <small>${hasSec ? `+8 de seguridad y hackers éticos que te avisan de fallos. ${fmtMoney(BOUNTY_COST)}/mes.` : '🔒 Requiere Ciberseguridad'}</small></div>${sw('secBounty', s.sec.bounty, !hasSec)}</div>
      <div class="card ${audit ? 'owned' : ''}" data-key="sec-audit"><div class="card-icon">🔍</div><div class="grow"><b>Auditoría externa</b>
        <small>${audit ? `Activa hasta el ${fmtDate(s.sec.audit + AUDIT_DAYS)}: +10 de seguridad.` : 'Una empresa revisa tus sistemas: +10 de seguridad durante 3 meses.'}</small></div>
        ${btn(`Contratar · ${fmtMoney(AUDIT_COST)}`, 'secAudit', {}, { kind: 'small', disabled: audit || s.money < AUDIT_COST })}</div>
    </div>
    <p class="muted">Cuantos más usuarios tienes, más te atacan. La función ${FEATURES.security.icon} ${FEATURES.security.name} de cada producto lo hace un objetivo más difícil, y Seguridad avanzada o Edge computing paran los DDoS.</p>`;
}

// ---------------------------------------------------------------- finanzas

function chart(hist, series, h = 70, fit = false) {
  const pts = hist.slice(-104);
  if (pts.length < 2) return '<p class="muted">Los gráficos aparecen tras unas semanas de juego.</p>';
  const W = 300;
  // fit: el eje empieza cerca del mínimo para que se vean bien las subidas y bajadas.
  let max = fit ? -Infinity : 1;
  let min = fit ? Infinity : 0;
  for (const p of pts) for (const s of series) {
    max = Math.max(max, p[s.k]);
    min = Math.min(min, p[s.k]);
  }
  const y = (v) => (h - 4 - ((v - min) / (max - min || 1)) * (h - 8)).toFixed(1);
  const x = (i) => ((i / (pts.length - 1)) * W).toFixed(1);
  const lines = series
    .map((s) => `<polyline fill="none" stroke="${s.c}" stroke-width="2" vector-effect="non-scaling-stroke" points="${pts.map((p, i) => `${x(i)},${y(p[s.k])}`).join(' ')}"/>`)
    .join('');
  const zero = min < 0 ? `<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="var(--slate)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges">${zero}${lines}</svg>
    <div class="legend">${series.map((s) => `<span><i style="background:${s.c}"></i>${s.label}</span>`).join('')}<small class="muted">máx ${s0(series, max)}</small></div>`;
}
const s0 = (series, max) => (series[0].money ? fmtMoney(max) : fmtNum(max));

function ledgerList(obj, labels) {
  const rows = Object.entries(obj)
    .filter(([, v]) => v > 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${labels[k] || k}</td><td>${fmtMoney(v)}</td></tr>`)
    .join('');
  return rows ? `<table class="tbl">${rows}</table>` : '<p class="muted">—</p>';
}

function financePanel(s) {
  const tp = G.teamPowers(s);
  const m = G.mrr(s, tp);
  const c = G.monthlyCosts(s, tp);
  const net = m - c.total;
  const runway = net < 0 ? s.money / -net : Infinity;
  const L = s.ledger;
  const limit = G.loanLimit(s);
  const loans = s.loans
    .map((l) => `<div class="card" data-key="loan-${l.id}"><div class="card-icon">🏦</div><div class="grow"><b>${fmtMoney(l.left)}</b>
      <small>Desde el ${fmtDate(l.day)} · intereses ${fmtMoney(l.left * 0.012)}/mes</small></div>${btn('Devolver', 'repay', { id: l.id }, { disabled: s.money < l.left })}</div>`)
    .join('');
  const costRows = Object.entries(c)
    .filter(([k, v]) => k !== 'total' && v > 0.5)
    .map(([k, v]) => `<tr><td>${EXP_LABEL[k] || k}</td><td>${fmtMoney(v)}</td></tr>`)
    .join('');
  return `<div class="kpis">
      ${kpi('Caja', fmtMoney(s.money), '', s.money < 0 ? 'warn' : '')}
      ${kpi('Ingresos recurrentes', fmtMoney(m) + '/mes', 'media de 30 días')}
      ${kpi('Costes fijos', fmtMoney(c.total) + '/mes')}
      ${kpi('Resultado', (net >= 0 ? '+' : '') + fmtMoney(net) + '/mes', Number.isFinite(runway) ? `Caja para ${runway < 1 ? '<1' : Math.floor(runway)} meses` : 'Rentable 🎉', net < 0 ? 'warn' : 'good')}
    </div>
    ${s.redDays > 0 ? `<div class="banner warn">⚠️ Números rojos: bancarrota en ${fmtDays(45 - s.redDays)} si no recuperas la caja.</div>` : ''}
    <h3>Evolución</h3>
    ${chart(s.history, [{ k: 'cash', c: 'var(--yellow)', label: 'Caja', money: true }])}
    ${chart(s.history, [{ k: 'mrr', c: 'var(--green)', label: 'Ingresos/mes', money: true }, { k: 'cost', c: 'var(--red)', label: 'Costes/mes' }])}
    <div class="two-col">
      <div><h3>Costes fijos al mes</h3>${costRows ? `<table class="tbl">${costRows}</table>` : '<p class="muted">—</p>'}</div>
      <div><h3>Este mes</h3><h4>Ingresos</h4>${ledgerList(L.month.inc, INC_LABEL)}<h4>Gastos</h4>${ledgerList(L.month.exp, EXP_LABEL)}</div>
    </div>
    ${L.last ? `<details><summary>Mes anterior (${MONTHS[L.last.m]})</summary><div class="two-col"><div><h4>Ingresos</h4>${ledgerList(L.last.inc, INC_LABEL)}</div><div><h4>Gastos</h4>${ledgerList(L.last.exp, EXP_LABEL)}</div></div></details>` : ''}
    <h3>Banco</h3>
    <p class="muted">Préstamos al 1,2% mensual. Límite actual: <b>${fmtMoney(limit)}</b> (crece con tus ingresos y reputación).</p>
    <div class="row gap wrap">${[0.25, 0.5, 1]
      .map((f) => Math.floor((limit * f) / 1000) * 1000)
      .filter((a, i, arr) => a > 0 && arr.indexOf(a) === i)
      .map((a) => btn(`Pedir ${fmtMoney(a)}`, 'loan', { amount: a }, { disabled: s.loans.length >= 3 }))
      .join('')}</div>
    <div class="cards">${loans}</div>`;
}

// ---------------------------------------------------------------- inversores

function investorsPanel(s) {
  const tp = G.teamPowers(s);
  const v = G.valuation(s, tp);
  const F = s.funding;
  const o = F.offer;
  const ladder = ROUNDS.map((r, i) => {
    const state = i < F.round ? 'done' : i === F.round ? 'current' : 'locked';
    return `<div class="round ${state}" data-key="round-${r.id}"><b>${state === 'done' ? '✔' : i + 1}</b><div><b>${r.name}</b><small>${r.reqText}</small></div></div>`;
  }).join('');
  const offer = o
    ? `<div class="card offer"><div class="card-icon">💼</div><div class="grow"><b>${esc(o.investor)} · ${ROUNDS[o.round].name}</b>
      <small>Ofrecen <b>${fmtMoney(o.amount)}</b> por el <b>${o.dil}%</b> de la empresa (valoración ${fmtMoney(o.val)}).</small>
      <small class="muted">Tu participación pasaría del ${s.equity.toFixed(1)}% al ${(s.equity * (1 - o.dil / 100)).toFixed(1)}%. Caduca en ${fmtDays(o.expires - s.day)}.</small></div>
      <div class="col-btns">${btn('Aceptar', 'acceptOffer', {}, { kind: 'primary' })}${btn('Rechazar', 'rejectOffer', {}, { kind: 'ghost' })}</div></div>`
    : `<p class="muted">${F.round >= ROUNDS.length ? 'Ya cotizas en bolsa.' : G.roundReady(s) ? 'Los inversores están estudiando tu empresa...' : `Siguiente ronda: ${ROUNDS[F.round].name} (${ROUNDS[F.round].reqText}).`}</p>`;
  const ipo = F.ipo ? stockSection(s, v) : '';
  return `<div class="kpis">
      ${kpi('Valoración', fmtMoney(v))}
      ${kpi('Tu participación', s.equity.toFixed(1) + '%')}
      ${kpi('Tu patrimonio', fmtMoney(G.netWorth(s, v)))}
      ${kpi('Captado', fmtMoney(F.raised))}
    </div>
    <p class="muted">Valoración ≈ ingresos anuales × 8 + usuarios × $4 + caja + activos${F.ipo ? ', por el sentimiento del mercado' : ''}. Vender acciones da caja para crecer, pero tu parte del pastel se reduce.</p>
    ${F.ipo ? `${ipo}<h3>Rondas</h3><div class="rounds">${ladder}</div>` : `<h3>Oferta actual</h3>${offer}<h3>Rondas</h3><div class="rounds">${ladder}</div>`}`;
}

// Bolsa: cotización, previsión del trimestre y resultados anteriores.
function stockSection(s, v) {
  const F = s.funding;
  const St = s.stock;
  const price = sharePrice(s, v);
  const hist = St?.hist || [];
  const prev = hist.length ? hist[Math.max(0, hist.length - 13)].p : price;
  const change = prev ? price / prev - 1 : 0;
  const up = change >= 0;
  const head = `<h3>Bolsa</h3><div class="kpis">
      ${kpi('Precio por acción', '$' + price.toFixed(2), `${up ? '▲' : '▼'} ${fmtPct(Math.abs(change), 1)} en 3 meses`, up ? 'good' : 'warn')}
      ${kpi('Sentimiento', fmtPct(F.sentiment), F.sentiment < 0.9 ? 'El mercado desconfía' : F.sentiment > 1.1 ? 'El mercado te adora' : 'Normal', F.sentiment < 0.9 ? 'warn' : 'good')}
      ${kpi('Credibilidad', `${Math.round(St?.cred ?? 60)}/100`, 'Sube si cumples lo que prometes', (St?.cred ?? 60) < 35 ? 'warn' : '')}
      ${kpi('Racha', `${St?.streak || 0} trimestres`, 'cumpliendo la previsión')}
    </div>
    ${hist.length >= 2 ? chart(hist, [{ k: 'p', c: up ? 'var(--green)' : 'var(--red)', label: 'Precio por acción', money: true }], 70, true) : ''}`;
  const qs = quarterStatus(s);
  let quarter;
  if (!qs) {
    quarter = `<p class="muted">Tu primer trimestre como empresa cotizada empieza el ${fmtDate(nextQuarterDay(s.day))}. Ese día anunciarás qué ingresos prometes.</p>`;
  } else if (!qs.q.level) {
    const choices = GUIDANCE_ORDER.map((k) => {
      const G = GUIDANCE[k];
      return btn(`${G.icon} ${G.name} · ${fmtMoney(qs.q.exp * G.mult)}`, 'guidance', { level: k }, { kind: k === 'mid' ? 'primary' : '', title: G.hint });
    }).join('');
    quarter = `<div class="card stock-q"><div class="card-icon">📊</div><div class="grow">
      <b>Previsión del ${quarterName(qs.q)}</b>
      <small>Los analistas esperan unos <b>${fmtMoney(qs.q.exp)}</b> de ingresos hasta el ${fmtDate(qs.q.end - 1)}. ¿Qué prometes?</small>
      <small class="muted">🐢 Prudente: fácil de cumplir, pero la acción baja un poco hoy. 🎯 Realista: lo esperado. 🚀 Ambiciosa: sube hoy y, si no cumples, se hunde.</small>
      <div class="row wrap">${choices}</div></div></div>`;
  } else {
    const G = GUIDANCE[qs.q.level];
    const okNow = qs.proj >= qs.target;
    const gap = qs.target - qs.proj;
    quarter = `<div class="card stock-q ${okNow ? 'good' : 'warn'}"><div class="card-icon">${G.icon}</div><div class="grow">
      <b>${quarterName(qs.q)} · previsión ${G.name.toLowerCase()}${qs.q.warned ? ' (rebajada)' : ''}: ${fmtMoney(qs.target)}</b>
      <small>Llevas <b>${fmtMoney(qs.rev)}</b> · quedan ${fmtDays(qs.left)}.</small>
      ${bar(qs.rev / qs.target, okNow ? 'var(--green)' : 'var(--orange)')}
      <small>Al ritmo actual acabarías con <b>${fmtMoney(qs.proj)}</b>: ${okNow ? '✔ cumplirías.' : `✖ te faltarían ${fmtMoney(gap)}.`}</small>
      ${okNow ? '' : '<small class="muted">Para llegar: campañas de marketing, lanzar productos, subir precios o cerrar ventas a empresas.</small>'}</div>
      ${canWarn(s) ? `<div class="col-btns">${btn('⚠️ Rebajar previsión', 'lowerGuidance', {}, { kind: 'small', title: `La acción cae un ${Math.round(WARN_COST * 100)}% hoy, pero el objetivo baja a ${fmtMoney(qs.q.exp * GUIDANCE.low.mult)}` })}</div>` : ''}</div>`;
  }
  const log = (St?.log || [])
    .map((l) => {
      const beat = l.rev >= l.target;
      return `<tr><td>${quarterName(l)}</td><td>${GUIDANCE[l.level].icon} ${fmtMoney(l.target)}${l.warned ? ' ⚠️' : ''}</td><td>${fmtMoney(l.rev)} ${beat ? '✔' : '✖'}</td>
        <td class="${l.jump >= 0 ? 'up' : 'down'}">${l.jump >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(l.jump))}</td></tr>`;
    })
    .join('');
  return `${head}
    <h3>Trimestre actual</h3>${quarter}
    ${log ? `<h3>Resultados anteriores</h3><table class="tbl stock-log"><tr><th>Trimestre</th><th>Prometido</th><th>Ingresos</th><th>Acción</th></tr>${log}</table>` : ''}
    <div class="row">${btn('Emitir acciones (5%)', 'issueShares', {}, { disabled: s.day - F.lastIssue < 180 })}<small class="muted">Consigue caja a cambio de diluirte. Una vez cada 180 días.</small></div>`;
}

// ---------------------------------------------------------------- mercado

function marketPanel(s, U) {
  const catId = U.cat || s.products[0]?.cat || 'blog';
  const cat = CATEGORIES[catId];
  const chips = Object.entries(CATEGORIES)
    .map(([id, c]) => `<button class="chip ${id === catId ? 'on' : ''}" data-act="catPick" data-cat="${id}">${c.icon} ${c.name}${G.categoryUnlocked(s, id) ? '' : ' 🔒'}</button>`)
    .join('');
  const pot = cat.market * G.marketGrowth(s);
  const entries = [
    ...s.competitors.filter((c) => c.alive && c.cat === catId).map((c) => ({ c, name: c.name, appeal: c.appeal, users: c.users, mine: false })),
    ...s.products.filter((p) => p.launched && p.cat === catId).map((p) => ({ p, name: p.name, appeal: G.productAppeal(s, p), users: p.users, mine: true })),
  ].sort((a, b) => b.users - a.users);
  const total = entries.reduce((a, e) => a + e.appeal, 0) || 1;
  const rows = entries
    .map((e) => {
      if (e.mine) {
        return `<div class="card mine" data-key="mk-p${e.p.id}"><div class="card-icon">⭐</div>
        <div class="grow"><b>${esc(e.name)} <span class="tag live">tú</span></b>
        <small>${fmtNum(e.users)} usuarios · atractivo ${Math.round(e.appeal)}</small>${bar(e.appeal / total, 'var(--yellow)')}</div></div>`;
      }
      const c = e.c;
      const st = RIVAL_STYLES[c.style] || RIVAL_STYLES.dormido;
      const price = G.competitorPrice(c);
      const pc = poachCost(c);
      const sc = smearCost(s, c);
      const pw = rivalCooldown(s, c, 'poachDay', 60);
      const sw = rivalCooldown(s, c, 'smearDay', 45);
      const mine = s.products.some((p) => p.launched && p.cat === c.cat);
      return `<div class="card rival" data-key="mk-${c.id}"><div class="card-icon">${st.icon}</div>
        <div class="grow"><b>${esc(c.name)}</b><small>CEO: ${esc(c.ceo || '—')} · <span title="${st.desc}">${st.name}</span></small>
        <small>${fmtNum(e.users)} usuarios · atractivo ${Math.round(e.appeal)}</small>${bar(e.appeal / total, 'var(--slate)')}
        <div class="rivalry"><span>Rivalidad</span>${bar((c.rivalry || 0) / 100, 'var(--red)')}</div>
        ${c.last ? `<small class="muted">Último movimiento (${fmtDate(c.lastDay)}): ${esc(c.last)}</small>` : ''}</div>
        <div class="col-btns">${btn(`🧲 Fichar talento · ${fmtMoney(pc)}`, 'rivalPoach', { id: c.id }, { kind: 'small', disabled: !!pw || s.money < pc, title: pw ? `Espera ${pw} días` : 'Consigue un candidato muy bueno de su equipo' })}
        ${btn(`📣 Campaña comparativa · ${fmtMoney(sc)}`, 'rivalSmear', { id: c.id }, { kind: 'small', disabled: !mine || !!sw || s.money < sc, title: !mine ? 'Necesitas un producto lanzado aquí' : sw ? `Espera ${sw} días` : 'Hype para ti, atractivo menos para ellos' })}
        ${btn(`Comprar · ${fmtMoney(price)}`, 'acquire', { id: c.id }, { kind: 'small', disabled: s.money < price })}</div></div>`;
    })
    .join('');
  return `<div class="chips scroll">${chips}</div>
    <div class="kpis">${kpi('Mercado potencial', fmtNum(pot) + ' personas')}${kpi('Competidores', entries.filter((e) => !e.mine).length)}
    ${kpi('Tu cuota', fmtPct(entries.filter((e) => e.mine).reduce((a, e) => a + e.appeal, 0) / total, 1))}</div>
    <p class="muted">${cat.desc}${G.categoryUnlocked(s, catId) ? '' : ` 🔒 Requiere ${RESEARCH_BY_ID[cat.research].name}.`} Cada rival tiene su estilo: la rivalidad sube cuanto más les quitas mercado.</p>
    <div class="cards">${rows || '<p class="muted">Mercado vacío.</p>'}</div>`;
}

// ---------------------------------------------------------------- correo

function mailPanel(s) {
  const pending = pendingMail(s).length;
  const items = s.mail
    .map((m) => {
      const open = m.choices && m.done == null;
      const choices = open
        ? `<div class="mail-choices">${m.choices
            .map((c, i) => `<button class="btn choice ${i === 0 ? 'primary' : ''}" data-act="answerMail" data-id="${m.id}" data-i="${i}"><b>${esc(c.label)}</b>${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</button>`)
            .join('')}</div><small class="muted">Caduca en ${fmtDays(m.expires - s.day)}. Si no contestas: "${esc(m.choices[defaultChoice(m)].label)}".</small>`
        : m.choices
          ? `<p class="mail-out">➡️ ${esc(m.choices[m.done]?.label || '')}${m.outcome ? ` — ${esc(m.outcome)}` : ''}</p>`
          : '';
      return `<article class="mail ${m.read ? '' : 'unread'} ${open ? 'open' : ''}" data-key="mail-${m.id}">
        <header><span class="mail-icon">${m.icon}</span><div class="grow"><b>${esc(m.subject)}</b><small>${esc(m.from)} · ${fmtDate(m.day)}</small></div>${open ? '<span class="tag bad">Decide</span>' : ''}</header>
        <p>${esc(m.body)}</p>${choices}</article>`;
    })
    .join('');
  return `<div class="row between"><p class="muted nomargin">${pending ? `Tienes ${pending} ${pending === 1 ? 'decisión pendiente' : 'decisiones pendientes'}.` : 'Nada pendiente. Buen trabajo.'}</p></div>
    <div class="mails">${items || '<div class="empty">📭<p>Bandeja vacía.</p></div>'}</div>`;
}

// ---------------------------------------------------------------- mundo

function worldPanel(s) {
  const se = seasonOf(s);
  const effects = se
    ? Object.entries(se.demand)
        .map(([c, m]) => `<span class="tag ${m >= 1 ? 'live' : 'bad'}">${CATEGORIES[c].icon} ${CATEGORIES[c].name} ×${m}</span>`)
        .join(' ')
    : '';
  const i18n = Math.max(0, ...s.products.map((p) => p.features.i18n || 0));
  const regions = Object.entries(REGIONS)
    .map(([id, r]) => {
      const open = s.regions[id] != null;
      const reach = s.products.length ? Math.max(...s.products.map((p) => langReach(p, id))) : r.lang === 'es' ? 1 : 0.25;
      return `<div class="card region ${open ? 'owned' : ''}" data-key="reg-${id}"><div class="card-icon">${r.flag}</div>
        <div class="grow"><b>${r.name}${open ? ' <span class="tag live">sede abierta</span>' : ''}</b><small>${r.desc}</small>
        <small class="muted">+${fmtPct(r.market)} de mercado · usuarios que pagan ×${r.arpu} · sueldos ×${r.salary} · talento ${r.skill >= 0 ? '+' : ''}${r.skill}</small>
        <small>${open ? `👥 ${regionStaff(s, id)}/${r.cap} personas · alquiler ${fmtMoney(r.rent)}/mes` : `Abrir: ${fmtMoney(r.open)} + ${fmtMoney(r.rent)}/mes`} · alcance de tus productos: ${fmtPct(reach)}</small></div>
        ${open ? '' : btn(`Abrir sede · ${fmtMoney(r.open)}`, 'openRegion', { id }, { kind: 'primary', disabled: s.money < r.open })}</div>`;
    })
    .join('');
  const laws = LAWS.map((law) => {
    const active = lawActive(s, law.id);
    const bad = active ? s.products.filter((p) => complianceIssues(s, p).some((l) => l.id === law.id)).map((p) => esc(p.name)) : [];
    const status = !active
      ? `<small class="muted">Entra en vigor el ${fmtDate(law.day)}.</small>`
      : bad.length
        ? `<small class="warn-text">Incumplen: ${bad.join(', ')}</small>`
        : '<small class="good-text">Cumples.</small>';
    return `<div class="card ${active ? '' : 'locked'}" data-key="law-${law.id}"><div class="card-icon">${law.icon}</div>
      <div class="grow"><b>${law.name}</b><small>${law.desc}</small>${status}</div></div>`;
  }).join('');
  const legal = s.employees.filter((e) => e.role === 'legal').length;
  return `<h3>Temporada</h3>
    ${se ? `<div class="card owned"><div class="card-icon">${se.icon}</div><div class="grow"><b>${se.name}</b><small>${se.desc}</small><div>${effects}</div></div></div>` : '<p class="muted">Temporada tranquila: sin efectos especiales este mes.</p>'}
    <h3>Expansión internacional</h3>
    <p class="muted">Cada sede suma mercado a todos tus productos y te deja contratar allí. Para los países que no hablan tu idioma necesitas la función Multi-idioma (tu mejor nivel ahora: ${i18n}).</p>
    <div class="cards">${regions}</div>
    <h3>Leyes y reguladores</h3>
    <p class="muted">Abogados en plantilla: ${legal}. Cada uno reduce la probabilidad de auditoría y mejora tus opciones en los juicios.</p>
    <div class="cards">${laws}</div>
    ${platformsSection(s)}`;
}

function platformsSection(s) {
  const mobile = s.products.filter((p) => p.launched && onMobile(p));
  const fee = storeFee(s);
  const banned = mobile.filter((p) => p.storeBan > s.day);
  const hasWeb = G.has(s, 'webpay');
  return `<h3>Plataformas</h3>
    <div class="cards">
      <div class="card" data-key="plat-store"><div class="card-icon">📱</div><div class="grow"><b>Tiendas de apps</b>
        <small>${STORES} se quedan el ${fmtPct(fee)} de lo que pagan tus usuarios desde la app${fee < s.plat.fee ? ' (programa para pequeños desarrolladores: facturas menos de 1 millón al año)' : ''}.</small>
        <small class="muted">${mobile.length ? `${mobile.length} producto${mobile.length > 1 ? 's' : ''} con App móvil · comisiones: unos ${fmtMoney(storeMonthly(s, G.productRevenue))}/mes` : 'Ninguno de tus productos tiene App móvil todavía.'}</small>
        ${banned.length ? `<small class="warn-text">⛔ Fuera de la tienda: ${banned.map((p) => `${esc(p.name)} hasta el ${fmtDate(p.storeBan)}`).join(', ')}</small>` : ''}
        ${s.plat.adsHit > s.day ? `<small class="warn-text">🙈 Los anuncios del móvil rinden un 35% menos hasta el ${fmtDate(s.plat.adsHit)}.</small>` : ''}</div></div>
      <div class="card ${s.plat.webpay ? 'owned' : ''} ${hasWeb ? '' : 'locked'}" data-key="plat-web"><div class="card-icon">🌐</div><div class="grow"><b>Pagos por la web</b>
        <small>${hasWeb ? `La mitad de tus usuarios del móvil paga por la web y te ahorras su comisión. ${s.plat.webpayFree ? 'Tras ganar la denuncia, las tiendas no pueden castigarte.' : 'Riesgo: las tiendas pueden expulsar tu app.'}` : '🔒 Requiere Pagos directos'}</small></div>
        <button class="switch ${s.plat.webpay ? 'on' : ''}" data-act="webpay" ${hasWeb ? '' : 'disabled'} aria-pressed="${s.plat.webpay}"><i></i></button></div>
      <div class="card" data-key="plat-cloud"><div class="card-icon">☁️</div><div class="grow"><b>${CLOUD_NAME}</b>
        <small>Precio de la nube ×${cloudMult(s).toFixed(2)}${s.plat.commit > s.day ? ` · compromiso anual hasta el ${fmtDate(s.plat.commit)} (-20%)` : ''}. Tus servidores propios no dependen de sus subidas.</small></div></div>
    </div>`;
}

// ---------------------------------------------------------------- logros

// Premios Pixel: palmarés, nominaciones del año y cómo vas para la próxima gala.
function awardsSection(s) {
  const A = s.awards || { won: [], noms: null, base: null };
  const year = dateOf(s.day).y;
  const N = A.noms?.year === year ? A.noms : null;
  const won = [...A.won].reverse().map((w) => `<li>${AWARDS[w.id].icon} <b>${AWARDS[w.id].name}</b> ${w.year} <small class="muted">(${esc(w.why)})</small></li>`).join('');
  let now = '';
  if (N && !N.done) {
    now = N.list.length
      ? `<p>Nominaciones ${year}: ${N.list.map((n) => `${AWARDS[n.id].icon} ${AWARDS[n.id].name} (${fmtPct(awardChance(s, n, N.gala))})`).join(' · ')}. Gala el 20 de noviembre.</p>`
      : `<p class="muted">Este año no hay nominaciones.</p>`;
  } else if (A.base) {
    const cands = nominations(s, G.teamPowers(s));
    now = `<p class="muted">Las nominaciones salen el 1 de noviembre. Ahora mismo optarías a: ${cands.length ? cands.map((n) => `${AWARDS[n.id].icon} ${AWARDS[n.id].name}`).join(', ') : 'nada todavía'}.</p>`;
  }
  const how = Object.values(AWARDS).map((a) => `${a.icon} <b>${a.name}</b>: ${a.desc}`).join('<br>');
  return `<h3>🏆 Premios Pixel <small class="muted">${A.won.length} ${A.won.length === 1 ? 'premio' : 'premios'}</small></h3>
    ${now}${won ? `<ul class="quests">${won}</ul>` : ''}
    <details data-key="awards-how"><summary class="muted small">¿Cómo se gana?</summary><p class="small">${how}</p></details>`;
}

function goalsPanel(s) {
  const quests = QUESTS.map((q) => {
    const done = s.quests[q.id] != null;
    return `<li class="${done ? 'done' : ''}">${done ? '✅' : '⬜'} ${q.text}${q.reward ? ` <small class="muted">(+${fmtMoney(q.reward)})</small>` : ''}</li>`;
  }).join('');
  const ach = ACHIEVEMENTS.map((a) => {
    const d = s.achievements[a.id];
    return `<div class="ach ${d != null ? 'on' : ''}" title="${esc(a.desc)}"><span>${d != null ? a.icon : '🔒'}</span><b>${a.name}</b><small>${a.desc}</small></div>`;
  }).join('');
  const got = Object.keys(s.achievements).length;
  return `<h3>Objetivos</h3><ul class="quests">${quests}</ul>
    <h3>Logros <small class="muted">${got}/${ACHIEVEMENTS.length}</small></h3><div class="achs">${ach}</div>
    ${awardsSection(s)}
    <h3>Estadísticas</h3><div class="kpis">
      ${kpi('Días', s.day)}${kpi('Ingresos totales', fmtMoney(s.stats.revenue))}${kpi('Récord de usuarios', fmtNum(s.stats.peakUsers))}
      ${kpi('Funciones lanzadas', s.stats.shipped)}${kpi('Contratos', s.stats.contractsDone)}${kpi('Compras', s.stats.acquired)}</div>`;
}
