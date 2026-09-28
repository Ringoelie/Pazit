// Contenido HTML de cada pestaña. Solo lee el estado; las acciones viajan
// por atributos data-act que main.js enruta a la simulación.
import {
  ROLES, TRAITS, OFFICES, PERKS, POLICIES, FEATURES, CATEGORIES, RESEARCH, RESEARCH_BY_ID, CAMPAIGNS, ROUNDS,
  QUESTS, ACHIEVEMENTS, POINT_TYPES, PREMIUM_PRICES, MAX_FEATURE_LEVEL, LEVELS,
} from './data.js';
import * as G from './sim.js';
import { perkStats } from './core.js';
import { esc, fmtMoney, fmtNum, fmtPct, fmtDays, fmtDate, MONTHS } from './util.js';
import { bar, btn, avatar } from './ui.js';

export const TABS = [
  { id: 'office', icon: '🏢', name: 'Oficina' },
  { id: 'team', icon: '👥', name: 'Equipo' },
  { id: 'products', icon: '📦', name: 'Productos' },
  { id: 'contracts', icon: '📝', name: 'Contratos' },
  { id: 'research', icon: '🔬', name: 'I+D' },
  { id: 'marketing', icon: '📣', name: 'Marketing' },
  { id: 'infra', icon: '🖥️', name: 'Servidores' },
  { id: 'finance', icon: '💰', name: 'Finanzas' },
  { id: 'investors', icon: '📈', name: 'Inversores' },
  { id: 'market', icon: '🌐', name: 'Mercado' },
  { id: 'goals', icon: '🏆', name: 'Logros' },
];

const INC_LABEL = { contracts: 'Contratos', ads: 'Publicidad', subs: 'Suscripciones', tx: 'Comisiones', api: 'API', funding: 'Inversión', loans: 'Préstamos', other: 'Otros' };
const EXP_LABEL = {
  salaries: 'Nóminas', rent: 'Alquiler', perks: 'Mantenimiento', cloud: 'Nube', servers: 'Servidores', marketing: 'Marketing',
  hiring: 'Contratación', office: 'Oficina y mejoras', policies: 'Políticas', interest: 'Intereses', loans: 'Devolución de préstamos',
  acquisitions: 'Adquisiciones', training: 'Formación', other: 'Otros',
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
    case 'office': return officePanel(s);
    case 'team': return teamPanel(s, U);
    case 'products': return U.pid && G.findProduct(s, U.pid) ? productDetail(s, G.findProduct(s, U.pid)) : productsPanel(s);
    case 'contracts': return contractsPanel(s);
    case 'research': return researchPanel(s);
    case 'marketing': return marketingPanel(s, U);
    case 'infra': return infraPanel(s);
    case 'finance': return financePanel(s);
    case 'investors': return investorsPanel(s);
    case 'market': return marketPanel(s, U);
    case 'goals': return goalsPanel(s);
    default: return '';
  }
}

// ---------------------------------------------------------------- oficina

function officePanel(s) {
  const o = G.officeOf(s);
  const ps = perkStats(s);
  const used = G.perkCount(s);
  const perks = Object.entries(PERKS)
    .map(([id, p]) => {
      const n = s.office.perks[id] || 0;
      const st = G.perkState(s, id);
      const locked = !st.ok && n === 0 && st.why !== 'Sin espacio libre';
      return `<div class="card perk ${n ? 'owned' : ''} ${locked ? 'locked' : ''}" data-key="perk-${id}">
        <div class="card-icon">${p.icon}</div>
        <div class="grow"><b>${p.name}${n ? ` <span class="tag">x${n}</span>` : ''}</b><small>${p.desc}</small>
        <small class="muted">${fmtMoney(p.cost)}${p.upkeep ? ` · ${fmtMoney(p.upkeep)}/mes` : ''}</small></div>
        <div class="col-btns">${btn(st.ok ? 'Comprar' : st.why, 'buyPerk', { id }, { kind: st.ok ? 'primary' : '', disabled: !st.ok || s.money < p.cost })}
        ${n ? btn('Vender', 'sellPerk', { id }, { kind: 'ghost' }) : ''}</div></div>`;
    })
    .join('');
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
        <small>${x.desks} escritorios · ${x.slots} huecos para mejoras · alquiler ${fmtMoney(x.rent)}/mes · ánimo ${x.mood >= 0 ? '+' : ''}${x.mood}</small>
        ${locked ? `<small class="muted">🔒 Requiere ${RESEARCH_BY_ID[x.research].name}</small>` : ''}</div>
        ${btn(`Mudarse · ${fmtMoney(x.move)}`, 'moveOffice', { tier: i }, { kind: 'primary', disabled: locked || s.money < x.move })}</div>`;
    })
    .join('');
  return `<div class="kpis">
      ${kpi('Oficina', o.name)}
      ${kpi('Escritorios', `${G.onsite(s)}/${o.desks}`, G.freeDesks(s) <= 0 ? '¡Llena!' : `${G.freeDesks(s)} libres`, G.freeDesks(s) <= 0 ? 'warn' : '')}
      ${kpi('Alquiler', fmtMoney(o.rent) + '/mes')}
      ${kpi('Mejoras', `${used}/${o.slots}`, `+${ps.mood} ánimo · +${ps.energy} energía`)}
    </div>
    <h3>Mejoras de oficina</h3><div class="cards">${perks}</div>
    <h3>Políticas de empresa</h3><div class="cards">${policies}</div>
    <h3>Mudanza</h3><div class="cards">${moves || '<p class="muted">Ya estás en la mejor oficina del sistema solar.</p>'}</div>`;
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
      <div class="emp-name"><b>${esc(e.name)}</b><small>${ROLES[e.role].icon} ${ROLES[e.role].name} · ${levelName(e.skill)}
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
      ${kpi('Ánimo medio', Math.round(s.employees.reduce((a, e) => a + e.mood, 0) / s.employees.length), '', '')}
      ${kpi('Sin tarea', idle, idle ? 'Asígnales algo' : 'Todo el mundo ocupado', idle ? 'warn' : '')}
    </div>
    <div class="row gap wrap">${btn('➕ Contratar', 'hireOpen', {}, { kind: 'primary big' })}
      <small class="muted">DevOps ${tp.ops.toFixed(1)} · Ventas ${tp.sales.toFixed(1)} · RR.HH. ${tp.people.toFixed(1)}</small></div>
    <div class="chips">${chips}</div>
    <div class="emps">${list.map((e) => empRow(s, e)).join('') || '<p class="muted">Nadie en este grupo.</p>'}</div>
    ${all.length > limit ? `<div class="row end">${btn(`Mostrar más (${all.length - limit} restantes)`, 'teamMore')}</div>` : ''}`;
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
          const blocked = (!remote && free <= 0) || s.money < fee;
          return `<div class="card cand" data-key="cand-${c.id}">${avatar(c)}
          <div class="grow"><b>${esc(c.name)}</b><small>${ROLES[c.role].icon} ${ROLES[c.role].name} · ${levelName(c.skill)} (${Math.round(c.skill)})</small>
          ${bar(c.skill / 100, 'var(--sky)')}
          <small>${c.traits.map((t) => `${TRAITS[t].icon} ${TRAITS[t].name}`).join(' · ') || '<span class="muted">Sin rasgos especiales</span>'}</small></div>
          <div class="col-btns"><b>${fmtMoney(c.salary)}/mes</b>${btn(`Contratar · ${fmtMoney(fee)}`, 'hire', { id: c.id }, { kind: 'primary', disabled: blocked, title: !remote && free <= 0 ? 'Sin escritorios libres' : '' })}</div></div>`;
        })
        .join('') || '<p class="muted">No hay candidatos de este perfil ahora mismo.</p>'
    }</div>
    <div class="row end">${btn(`🔎 Headhunter · ${fmtMoney(G.headhunterCost(s))}`, 'refreshCands', {}, { disabled: s.money < G.headhunterCost(s) })}</div>`;
}

export function employeeModal(s, id) {
  const e = G.findEmp(s, id);
  if (!e) return '<p>Esta persona ya no trabaja aquí.</p>';
  const exp = G.expectedSalary(e, s);
  const out = G.output(s, e);
  const role = ROLES[e.role];
  const need = 25 + e.skill * 2.5;
  return `<div class="row gap">${avatar(e).replace('class="avatar"', 'class="avatar big"')}
    <div class="grow"><b class="lg">${esc(e.name)}</b><div>${role.icon} ${role.name} · ${levelName(e.skill)} · habilidad ${Math.round(e.skill)}</div>
    <small class="muted">En la empresa desde el ${fmtDate(e.hired)}</small></div></div>
    <div class="kpis">
      ${kpi('Producción', out.toFixed(1) + '/día', role.produces === 'flex' ? 'Cubre lo que falte' : '')}
      ${kpi('Ánimo', Math.round(e.mood), '', e.mood < 30 ? 'warn' : '')}
      ${kpi('Energía', Math.round(e.energy), '', e.energy < 25 ? 'warn' : '')}
      ${kpi('Sueldo', e.role === 'founder' ? '—' : fmtMoney(e.salary), e.role === 'founder' ? '' : `Mercado: ${fmtMoney(exp)}`, e.salary < exp * 0.95 ? 'warn' : '')}
    </div>
    <div class="xp"><small>Experiencia hasta el siguiente punto de habilidad</small>${bar(e.xp / need, 'var(--lime)')}</div>
    ${e.traits.length ? `<h4>Rasgos</h4><ul class="traits">${e.traits.map((t) => `<li>${TRAITS[t].icon} <b>${TRAITS[t].name}:</b> ${TRAITS[t].desc}</li>`).join('')}</ul>` : ''}
    ${G.isAssignable(e) && e.off <= 0 ? `<h4>Asignación</h4>${assignSelect(s, e)}` : ''}
    ${
      e.role === 'founder'
        ? '<p class="muted">Eres el alma de la empresa. Puedes trabajar en productos, contratos o investigación.</p>'
        : `<div class="row gap wrap">${btn(`💸 Subir sueldo → ${fmtMoney(Math.max(Math.round((e.salary * 1.08) / 50) * 50, exp))}`, 'raise', { id: e.id })}
      ${btn(`🎓 Formación · ${fmtMoney(G.trainCost(e))}`, 'train', { id: e.id }, { disabled: e.off > 0 || s.money < G.trainCost(e) })}
      ${btn('Despedir', 'fire', { id: e.id }, { kind: 'danger' })}</div>`
    }`;
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
        <div class="prod-nums"><b>${fmtNum(p.users)}</b><small>usuarios</small><b>${fmtMoney(rev * 30)}</b><small>/mes</small></div></button>`;
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
      return `<button class="card cat ${sel === id ? 'on' : ''} ${locked ? 'locked' : ''}" data-act="pickCat" data-cat="${id}" ${locked ? 'disabled' : ''}>
        <div class="card-icon">${c.icon}</div><div class="grow"><b>${c.name}</b>
        <small>${locked ? '🔒 Requiere ' + RESEARCH_BY_ID[c.research].name : c.desc}</small>
        <small class="muted">Mercado: ${fmtNum(c.market)} personas</small></div></button>`;
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
  const feats = Object.entries(cat.features)
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
          ? `<b>¡Listo para lanzar!</b>${btn('🚀 Lanzar', 'launch', { pid: p.id }, { kind: 'primary big' })}`
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
  return `<div class="row gap wrap">${btn('← Productos', 'backProducts', {}, { kind: 'ghost' })}
      <h3 class="grow nomargin">${cat.icon} ${esc(p.name)} ${statusTag(p)}</h3>${btn('✏️', 'renameProduct', { pid: p.id }, { kind: 'ghost', title: 'Renombrar' })}</div>
    ${launchBtn}
    <div class="kpis">
      ${kpi('Usuarios', fmtNum(p.users), p.launched ? `pico ${fmtNum(p.peak)}` : 'sin lanzar')}
      ${kpi('Ingresos', fmtMoney(rev.total * 30) + '/mes')}
      ${kpi('Satisfacción', fmtPct(sat), '', sat < 0.45 ? 'warn' : '')}
      ${kpi('Calidad', fmtPct(q), `${Math.round(p.bugs)} bugs`, q < 0.7 ? 'warn' : '')}
      ${kpi('Cuota', fmtPct(sh, 1), `atractivo ${Math.round(G.productAppeal(s, p))}`)}
      ${kpi('Conocimiento', fmtPct(p.awareness), `hype ${Math.round(p.hype)}`)}
    </div>
    <h3>Equipo del producto</h3>
    <div class="row gap wrap"><span class="pt code">💻 ${team.code.toFixed(1)}/día</span><span class="pt design">🎨 ${team.design.toFixed(1)}/día</span>
      <span class="pt ai">🧠 ${team.ai.toFixed(1)}/día</span>${team.flex ? `<span class="pt flex">👑 ${team.flex.toFixed(1)}/día</span>` : ''}
      <small class="muted">${team.marketers} marketing · ${team.pms} PM</small>${btn('Asignar a quien esté libre', 'assignIdle', { target: 'p:' + p.id }, { kind: 'small' })}</div>
    ${missing.length ? `<div class="banner warn">⚠️ Nadie produce ${missing.map((k) => POINT_TYPES[k].name).join(' ni ')} en este producto. Contrata o asigna a alguien.</div>` : ''}
    <h3>Cola de desarrollo <small class="muted">${p.queue.length}/8</small></h3>
    <div class="queue">${queue || '<p class="muted">Cola vacía. Añade funciones abajo; mientras tanto, el equipo arregla bugs.</p>'}</div>
    <h3>Funciones</h3><div class="feats">${feats}</div>
    <h3>Monetización</h3><div class="monet">${monet.join('') || '<p class="muted">Investiga "Modelos de negocio" y desarrolla Publicidad o Plan Premium para ganar dinero.</p>'}
      ${p.launched ? `<small class="muted">Publicidad ${fmtMoney(rev.ads * 30)} · Premium ${fmtMoney(rev.subs * 30)} · Comisiones ${fmtMoney(rev.tx * 30)} · API ${fmtMoney(rev.api * 30)} (al mes)</small>` : ''}</div>
    <div class="row end">${btn('Retirar producto', 'retireProduct', { pid: p.id }, { kind: 'danger small' })}</div>`;
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
    <h3>Ofertas</h3><div class="cards">${offers || '<p class="muted">No hay ofertas ahora mismo. Llegarán más en unos días.</p>'}</div>`;
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
    <h3>Carga por producto</h3>${rows ? `<table class="tbl"><tr><th>Producto</th><th>Usuarios</th><th>Carga</th></tr>${rows}</table>` : '<p class="muted">Sin productos en línea.</p>'}`;
}

// ---------------------------------------------------------------- finanzas

function chart(hist, series, h = 70) {
  const pts = hist.slice(-104);
  if (pts.length < 2) return '<p class="muted">Los gráficos aparecen tras unas semanas de juego.</p>';
  const W = 300;
  let max = 1;
  let min = 0;
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
  const ipo = F.ipo
    ? `<h3>Bolsa</h3><div class="kpis">${kpi('Precio por acción', '$' + (v / 1e8).toFixed(2))}${kpi('Sentimiento', fmtPct(F.sentiment), '', F.sentiment < 0.9 ? 'warn' : 'good')}</div>
      <div class="row">${btn('Emitir acciones (5%)', 'issueShares', {}, { disabled: s.day - F.lastIssue < 180 })}<small class="muted">Consigue caja a cambio de diluirte. Una vez cada 180 días.</small></div>`
    : '';
  return `<div class="kpis">
      ${kpi('Valoración', fmtMoney(v))}
      ${kpi('Tu participación', s.equity.toFixed(1) + '%')}
      ${kpi('Tu patrimonio', fmtMoney(G.netWorth(s, v)))}
      ${kpi('Captado', fmtMoney(F.raised))}
    </div>
    <p class="muted">Valoración ≈ ingresos anuales × 8 + usuarios × $4 + caja + activos. Vender acciones da caja para crecer, pero tu parte del pastel se reduce.</p>
    <h3>Oferta actual</h3>${offer}
    <h3>Rondas</h3><div class="rounds">${ladder}</div>${ipo}`;
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
      const price = e.mine ? 0 : G.competitorPrice(e.c);
      return `<div class="card ${e.mine ? 'mine' : ''}" data-key="mk-${e.mine ? 'p' + e.p.id : e.c.id}"><div class="card-icon">${e.mine ? '⭐' : '🏢'}</div>
        <div class="grow"><b>${esc(e.name)}${e.mine ? ' <span class="tag live">tú</span>' : ''}</b>
        <small>${fmtNum(e.users)} usuarios · atractivo ${Math.round(e.appeal)}</small>${bar(e.appeal / total, e.mine ? 'var(--yellow)' : 'var(--slate)')}</div>
        ${e.mine ? '' : btn(`Comprar · ${fmtMoney(price)}`, 'acquire', { id: e.c.id }, { kind: 'small', disabled: s.money < price })}</div>`;
    })
    .join('');
  return `<div class="chips scroll">${chips}</div>
    <div class="kpis">${kpi('Mercado potencial', fmtNum(pot) + ' personas')}${kpi('Competidores', entries.filter((e) => !e.mine).length)}
    ${kpi('Tu cuota', fmtPct(entries.filter((e) => e.mine).reduce((a, e) => a + e.appeal, 0) / total, 1))}</div>
    <p class="muted">${cat.desc}${G.categoryUnlocked(s, catId) ? '' : ` 🔒 Requiere ${RESEARCH_BY_ID[cat.research].name}.`}</p>
    <div class="cards">${rows || '<p class="muted">Mercado vacío.</p>'}</div>`;
}

// ---------------------------------------------------------------- logros

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
    <h3>Estadísticas</h3><div class="kpis">
      ${kpi('Días', s.day)}${kpi('Ingresos totales', fmtMoney(s.stats.revenue))}${kpi('Récord de usuarios', fmtNum(s.stats.peakUsers))}
      ${kpi('Funciones lanzadas', s.stats.shipped)}${kpi('Contratos', s.stats.contractsDone)}${kpi('Compras', s.stats.acquired)}</div>`;
}
