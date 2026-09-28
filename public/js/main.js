// Punto de entrada: bucle del juego, HUD, enrutado de acciones y modales.
import * as G from './sim.js';
import { ROLES, RESEARCH } from './data.js';
import { makeLooks } from './core.js';
import { fmtMoney, fmtNum, fmtDate, esc } from './util.js';
import { save, load, clearSave, exportSave, importSave } from './state.js';
import { OfficeView } from './office.js';
import { sfx, setSound } from './audio.js';
import {
  patch, openModal, closeModal, closeAllModals, topModal, modalOpen, refreshModals, confirmModal, toast, avatar, pixIcon, btn,
} from './ui.js';
import { TABS, renderPanel, hireModal, employeeModal, newProductModal, editBar, perkCards } from './panels.js';

const DAYS_PER_SEC = [0, 0.625, 1.6, 4];
const UI_KEY = 'pixel-unicorn:ui';

let s = null;
let office = null;
let acc = 0;
let last = performance.now();
let dirty = true;
let uiTimer = 0;
let lastSaveDay = 0;
let eventModal = null;
let overModal = null;
let lastSfx = 0;
let tickerIdx = 0;
let tickerTime = 0;
let lastNewsDay = -1;

const U = { tab: 'office', pid: null, mktPid: null, cat: null, hireRole: 'all', newCat: 'blog', newName: '', empModal: null, edit: false, editSel: null, prevSpeed: 1 };
try {
  Object.assign(U, JSON.parse(localStorage.getItem(UI_KEY) || '{}'), { pid: null, empModal: null });
} catch {
  // Preferencias no disponibles.
}
const saveUI = () => {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ tab: U.tab }));
  } catch {
    // Sin almacenamiento: da igual.
  }
};

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- arranque

function start(state) {
  s = state;
  setSound(s.settings.sound);
  acc = 0;
  lastSaveDay = s.day;
  eventModal = null;
  overModal = null;
  closeAllModals();
  if (U.edit) setEdit(false);
  office.tier = -1;
  office.selected = null;
  dirty = true;
}

// Modo edición de la oficina: pausa el juego mientras recolocas.
function setEdit(on) {
  U.edit = on;
  U.editSel = null;
  if (on) {
    U.prevSpeed = s.speed || 1;
    s.speed = 0;
    office.selected = null;
    $('#tip').hidden = true;
  } else if (s.speed === 0) s.speed = U.prevSpeed;
  office.setEdit(on);
  document.body.classList.toggle('editing', on);
  $('#editBar').hidden = !on;
  dirty = true;
}

function selectEdit(ref) {
  U.editSel = ref;
  office.editSel = ref;
  dirty = true;
}

function boot() {
  buildTabs();
  office = new OfficeView($('#office'), {
    onPick: (id) => {
      office.selected = id;
      if (id != null) openEmployee(id);
    },
    onHover: showTip,
    onEditPick: (ref) => {
      selectEdit(ref);
      if (ref) sfx('click');
    },
    onEditDrop: (ref, x, y, valid) => {
      if (!valid) {
        toast('No cabe ahí.', 'bad');
        sfx('error');
        return;
      }
      const r = G.moveObject(s, ref, x, y);
      if (!r.ok) result(r);
      else sfx('click');
      selectEdit(ref);
    },
  });
  window.addEventListener('resize', () => office.resize());
  new ResizeObserver(() => office.resize()).observe($('#officeWrap'));
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && s) save(s);
  });
  window.addEventListener('pagehide', () => s && save(s));

  const saved = load();
  if (saved) {
    start(saved);
    toast(`Partida cargada: ${saved.company}, ${fmtDate(saved.day)}.`);
  } else {
    start(G.newGame({ company: 'Pixel Startup', founder: 'Alex' }));
    s.speed = 0;
    newGameModal(false);
  }
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- bucle

function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const blocked = !!s.event || !!s.gameOver;
  let ticked = false;
  if (!blocked && s.speed > 0) {
    acc += dt * DAYS_PER_SEC[s.speed];
    let n = 0;
    while (acc >= 1 && n < 4) {
      acc -= 1;
      G.stepDay(s);
      office.onDay(s);
      ticked = true;
      n++;
      if (s.event || s.gameOver) break;
    }
    if (n >= 4) acc = 0;
  }
  flushNotes();
  if (s.event && !eventModal) showEvent();
  if (s.gameOver && !overModal) showGameOver();
  office.frame(s, dt, blocked ? 0 : s.speed);
  uiTimer -= dt;
  if (dirty || (ticked && uiTimer <= 0)) {
    render();
    uiTimer = 0.25;
    dirty = false;
  }
  tickerTime -= dt;
  if (tickerTime <= 0) rotateTicker();
  if (s.day - lastSaveDay >= 7) {
    lastSaveDay = s.day;
    if (save(s)) flashSaved();
  }
  requestAnimationFrame(loop);
}

function flushNotes() {
  if (!s.notes.length) return;
  const now = performance.now();
  for (const n of s.notes) {
    toast(n.text, n.kind);
    if (n.kind === 'achievement' || n.text.startsWith('🚀') || n.text.startsWith('🎯')) office.burst(n.kind === 'achievement' ? 60 : 30);
    if (now - lastSfx > 250) {
      sfx(n.kind === 'achievement' ? 'achievement' : n.kind === 'bad' ? 'bad' : n.kind === 'good' ? 'coin' : 'click');
      lastSfx = now;
    }
  }
  s.notes.length = 0;
  dirty = true;
}

// ---------------------------------------------------------------- render

function buildTabs() {
  $('#tabs').innerHTML = TABS.map(
    (t) => `<button class="tab" data-act="tab" data-tab="${t.id}" role="tab"><span class="ti">${t.icon}</span><span class="tn">${t.name}</span><i class="badge"></i></button>`,
  ).join('');
}

function badges() {
  const idle = s.employees.filter((e) => G.isAssignable(e) && !e.assign && e.off <= 0).length;
  const res = RESEARCH.filter((r) => G.researchState(s, r) === 'available' && s.rp >= r.cost).length;
  return {
    team: idle || '',
    contracts: s.contracts.offers.length && s.contracts.active.length < 3 ? s.contracts.offers.length : '',
    research: res || '',
    investors: s.funding.offer ? '!' : '',
    products: s.products.some((p) => !p.launched && G.coreDone(p)) ? '!' : '',
    finance: s.money < 0 ? '!' : '',
  };
}

function render() {
  const sm = G.summary(s);
  $('#company').textContent = s.company;
  $('#money').textContent = fmtMoney(s.money);
  $('#money').classList.toggle('neg', s.money < 0);
  const net = $('#net');
  net.textContent = (sm.net >= 0 ? '+' : '') + fmtMoney(sm.net) + '/mes';
  net.className = sm.net >= 0 ? 'pos' : 'neg';
  $('#users').textContent = fmtNum(sm.users);
  $('#rp').textContent = fmtNum(Math.floor(s.rp));
  $('#date').textContent = fmtDate(s.day);
  $('#val').textContent = fmtMoney(sm.val);
  for (const b of document.querySelectorAll('[data-act=speed]')) b.classList.toggle('on', +b.dataset.n === s.speed);
  const q = G.currentQuest(s);
  $('#quest').innerHTML = q ? `🎯 <b>Objetivo:</b> ${esc(q.text)}${q.reward ? ` <small>(+${fmtMoney(q.reward)})</small>` : ''}` : '🦄 ¡Has cumplido todos los objetivos! Sigue creciendo.';
  const bd = badges();
  for (const t of document.querySelectorAll('.tab')) {
    t.classList.toggle('on', t.dataset.tab === U.tab);
    t.setAttribute('aria-selected', t.dataset.tab === U.tab);
    t.querySelector('.badge').textContent = bd[t.dataset.tab] ?? '';
  }
  if (s.news[0] && s.news[0].day !== lastNewsDay) {
    lastNewsDay = s.news[0].day;
    tickerIdx = 0;
    tickerTime = 0;
  }
  patch($('#panel'), renderPanel(s, U));
  if (U.edit) patch($('#editBar'), editBar(s, U));
  refreshModals();
}

function rotateTicker() {
  tickerTime = 6;
  const items = s.news.slice(0, 6);
  if (!items.length) return;
  const n = items[tickerIdx % items.length];
  tickerIdx++;
  const el = $('#ticker');
  el.innerHTML = `<span class="tick ${n.kind}"><small>${fmtDate(n.day)}</small> ${esc(n.text)}</span>`;
}

function flashSaved() {
  const el = $('#saved');
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), 1200);
}

function showTip(id, x, y) {
  const tip = $('#tip');
  const e = id != null && G.findEmp(s, id);
  if (!e) {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
  const target = e.assign?.startsWith('p:') ? G.findProduct(s, +e.assign.slice(2))?.name : e.assign?.startsWith('c:') ? 'Contrato' : e.assign === 'rd' ? 'I+D' : e.assign === 'brand' ? 'Marca' : null;
  tip.innerHTML = `<b>${esc(e.name)}</b><br>${ROLES[e.role].icon} ${ROLES[e.role].name}${target ? ` · ${esc(target)}` : ''}<br>
    ánimo ${Math.round(e.mood)} · energía ${Math.round(e.energy)}${e.off > 0 ? `<br>${e.offReason}` : ''}`;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(window.innerWidth - r.width - 8, x + 14) + 'px';
  tip.style.top = Math.max(8, y - r.height - 10) + 'px';
}

// ---------------------------------------------------------------- acciones

function result(r, okSound = 'click') {
  if (!r) return;
  if (r.msg) toast(r.msg, r.ok ? 'good' : 'bad');
  sfx(r.ok ? okSound : 'error');
  dirty = true;
}

function setSpeed(n) {
  s.speed = n;
  dirty = true;
}

const ACTIONS = {
  tab: (d) => {
    U.tab = d.tab;
    if (d.tab !== 'products') U.pid = null;
    saveUI();
    $('#panel').scrollTop = 0;
    sfx('click');
  },
  speed: (d) => {
    setSpeed(+d.n);
    sfx('click');
  },
  togglePause: () => setSpeed(s.speed ? 0 : 1),
  menu: () => settingsModal(),
  help: () => helpModal(),
  zoomIn: () => office.zoomBy(1),
  zoomOut: () => office.zoomBy(-1),
  zoomFit: () => office.fit(),
  editToggle: () => {
    closeAllModals();
    setEdit(!U.edit);
    sfx('click');
  },
  editDeselect: () => selectEdit(null),
  editAdd: () => {
    openModal({ title: '➕ Añadir a la oficina', wide: true, render: () => `<p class="muted">Se coloca en el primer hueco libre; después arrástralo donde quieras.</p><div class="cards">${perkCards(s, 'editBuy', false)}</div>` });
  },
  editBuy: (d) => {
    const r = G.buyPerk(s, d.id);
    result(r, 'coin');
    if (r.ok) {
      closeAllModals();
      if (!U.edit) setEdit(true);
      selectEdit(r.ref);
    }
  },
  editSell: (d) => {
    result(G.sellItem(s, +d.uid), 'coin');
    selectEdit(null);
  },

  hireOpen: () => {
    openModal({ title: 'Contratar talento', wide: true, render: () => hireModal(s, U) });
  },
  teamFilter: (d) => {
    U.teamFilter = d.f;
    U.teamLimit = 40;
  },
  teamMore: () => {
    U.teamLimit = (U.teamLimit || 40) + 40;
  },
  hireRole: (d) => {
    U.hireRole = d.role;
    refreshModals();
  },
  hire: (d) => result(G.hire(s, +d.id), 'coin'),
  refreshCands: () => result(G.paidRefresh(s)),
  empOpen: (d) => openEmployee(+d.id),
  raise: (d) => result(G.raise(s, +d.id), 'coin'),
  train: (d) => result(G.train(s, +d.id)),
  fire: (d) => {
    const e = G.findEmp(s, +d.id);
    if (!e) return;
    confirmModal('Despedir', `¿Seguro que quieres despedir a ${e.name}? Pagarás un mes de indemnización (${fmtMoney(e.salary)}).`, 'Despedir', () => {
      result(G.fire(s, e.id), 'bad');
      closeModal();
    }, true);
  },

  acceptContract: (d) => result(G.acceptContract(s, +d.id), 'coin'),
  abandonContract: (d) =>
    confirmModal('Abandonar contrato', 'Perderás 3 puntos de reputación y todo el trabajo hecho.', 'Abandonar', () => result(G.abandonContract(s, +d.id), 'bad'), true),
  assignIdle: (d) => result(G.assignIdle(s, d.target)),

  newProduct: () => {
    U.newName = G.suggestProductName(s);
    openModal({ title: 'Nuevo producto', wide: true, render: () => newProductModal(s, U) });
  },
  pickCat: (d) => {
    U.newName = $('#pname')?.value ?? U.newName;
    U.newCat = d.cat;
    refreshModals();
  },
  randomName: () => {
    U.newName = G.suggestProductName(s);
    const input = $('#pname');
    if (input) input.value = U.newName;
  },
  createProduct: () => {
    const name = $('#pname')?.value || U.newName;
    const r = G.createProduct(s, name, U.newCat);
    result(r, 'good');
    if (r.ok) {
      closeModal();
      U.tab = 'products';
      U.pid = s.products[s.products.length - 1].id;
    }
  },
  openProduct: (d) => {
    U.pid = +d.id;
    $('#panel').scrollTop = 0;
  },
  backProducts: () => {
    U.pid = null;
  },
  queue: (d) => result(G.queueFeature(s, +d.pid, d.f)),
  dequeue: (d) => result(G.dequeue(s, +d.pid, +d.i)),
  moveTask: (d) => result(G.moveTask(s, +d.pid, +d.i, +d.dir)),
  launch: (d) => {
    const r = G.launch(s, +d.pid);
    if (r.ok) {
      sfx('launch');
      office.burst(80);
      toast(r.msg, 'good');
      dirty = true;
    } else result(r);
  },
  setPrice: (d) => result(G.setPrice(s, +d.pid, +d.price)),
  toggleAds: (d) => result(G.toggleAds(s, +d.pid)),
  renameProduct: (d) => {
    const p = G.findProduct(s, +d.pid);
    if (!p) return;
    const m = openModal({
      title: 'Renombrar producto',
      body: `<label class="field">Nombre<input id="rename" maxlength="24" value="${esc(p.name)}"></label>
        <div class="row end gap"><button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>Guardar</button></div>`,
    });
    m.body.querySelector('[data-ok]').addEventListener('click', () => {
      result(G.renameProduct(s, p.id, $('#rename').value));
      closeModal(m);
    });
  },
  retireProduct: (d) => {
    const p = G.findProduct(s, +d.pid);
    if (!p) return;
    confirmModal('Retirar producto', `¿Cerrar ${p.name} para siempre? Perderás sus ${fmtNum(p.users)} usuarios.`, 'Retirar', () => {
      result(G.retireProduct(s, p.id), 'bad');
      U.pid = null;
    }, true);
  },

  research: (d) => result(G.doResearch(s, d.id), 'good'),
  buyPerk: (d) => result(G.buyPerk(s, d.id), 'coin'),
  sellPerk: (d) => result(G.sellPerk(s, d.id)),
  moveOffice: (d) => {
    const r = G.moveOffice(s, +d.tier);
    result(r, 'good');
    if (r.ok) office.burst(60);
  },
  policy: (d) => result(G.togglePolicy(s, d.id)),
  cloud: () => result(G.setCloud(s, !s.infra.cloud)),
  buyRacks: (d) => result(G.buyRacks(s, +d.n), 'coin'),
  sellRacks: (d) => result(G.sellRacks(s, +d.n)),
  mktPick: (d) => {
    U.mktPid = +d.id;
  },
  campaign: (d) => result(G.runCampaign(s, +d.pid, d.cid), 'good'),
  acceptOffer: () => {
    const r = G.acceptOffer(s);
    result(r, 'achievement');
    if (r.ok) office.burst(80);
  },
  rejectOffer: () => result(G.rejectOffer(s)),
  issueShares: () => result(G.issueShares(s), 'coin'),
  loan: (d) => result(G.takeLoan(s, +d.amount), 'coin'),
  repay: (d) => result(G.repayLoan(s, +d.id)),
  catPick: (d) => {
    U.cat = d.cat;
  },
  acquire: (d) => {
    const c = s.competitors.find((x) => x.id === +d.id);
    if (!c) return;
    confirmModal('Comprar competidor', `¿Comprar ${c.name} por ${fmtMoney(G.competitorPrice(c))}? Desaparece del mercado y parte de sus usuarios se pasan a tu producto.`, 'Comprar', () => {
      const r = G.acquire(s, c.id);
      result(r, 'achievement');
      if (r.ok) office.burst(60);
    });
  },
  eventChoice: (d) => {
    const r = G.resolveEvent(s, +d.i);
    if (eventModal) closeModal(eventModal);
    eventModal = null;
    if (r.msg) toast(r.msg, 'info');
    sfx('click');
    dirty = true;
  },
};

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el.dataset);
  dirty = true;
}

function onChange(e) {
  const el = e.target;
  if (el.dataset.change === 'assign') {
    result(G.assign(s, +el.dataset.emp, el.value || null));
    el.blur();
  }
}

function onInput(e) {
  if (e.target.id === 'pname') U.newName = e.target.value;
}

function onKey(e) {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'Escape') {
    const m = topModal();
    if (m && m.closable) closeModal(m);
    else if (!m && U.edit) setEdit(false);
    return;
  }
  if (modalOpen()) return;
  if (e.key === 'e' || e.key === 'E') {
    setEdit(!U.edit);
    return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    setSpeed(s.speed ? 0 : 1);
  } else if (['0', '1', '2', '3'].includes(e.key)) setSpeed(+e.key);
}

// ---------------------------------------------------------------- modales

function openEmployee(id) {
  const e = G.findEmp(s, id);
  if (!e) return;
  openModal({
    title: e.name,
    render: () => employeeModal(s, id),
    onClose: () => {
      office.selected = null;
    },
  });
}

function showEvent() {
  const v = G.currentEvent(s);
  if (!v) return;
  sfx('event');
  eventModal = openModal({
    title: `${v.icon} ${v.title}`,
    closable: false,
    cls: 'event',
    body: `<p class="lg">${esc(v.text)}</p><div class="choices">${v.choices
      .map((c, i) => `<button class="btn choice ${i === 0 ? 'primary' : ''}" data-act="eventChoice" data-i="${i}"><b>${esc(c.label)}</b>${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</button>`)
      .join('')}</div>`,
  });
}

function showGameOver() {
  const o = s.gameOver;
  const sold = o.reason === 'sold';
  sfx(sold ? 'achievement' : 'bad');
  if (sold) office.burst(120);
  overModal = openModal({
    title: sold ? '🤑 ¡Empresa vendida!' : '💀 Bancarrota',
    closable: false,
    body: sold
      ? `<p class="lg">Has vendido ${esc(s.company)} por <b>${fmtMoney(o.amount)}</b>. Tu parte: <b>${fmtMoney(o.mine)}</b>.</p>
        <p>Del garaje a la gloria en ${fmtNum(s.day)} días. ¡Leyenda!</p>${summaryStats()}`
      : `<p class="lg">${esc(s.company)} se ha quedado sin dinero tras ${fmtNum(s.day)} días.</p><p>Toda gran historia tiene un primer fracaso. ¿Otra vez?</p>${summaryStats()}`,
  });
  overModal.body.insertAdjacentHTML('beforeend', `<div class="row end gap">${btn('Nueva partida', 'newGame', {}, { kind: 'primary big' })}</div>`);
  ACTIONS.newGame = () => {
    clearSave();
    closeAllModals();
    start(G.newGame({ company: s.company, founder: s.employees.find((e) => e.role === 'founder')?.name || 'Alex' }));
    s.speed = 0;
    newGameModal(false);
  };
}

function summaryStats() {
  return `<div class="kpis">
    <div class="kpi"><span>Récord de usuarios</span><b>${fmtNum(s.stats.peakUsers)}</b></div>
    <div class="kpi"><span>Ingresos totales</span><b>${fmtMoney(s.stats.revenue)}</b></div>
    <div class="kpi"><span>Logros</span><b>${Object.keys(s.achievements).length}</b></div>
    <div class="kpi"><span>Equipo</span><b>${s.employees.length}</b></div></div>`;
}

function newGameModal(closable) {
  let looks = makeLooks({ rng: (Math.random() * 2 ** 31) | 0 });
  let previewId = 0;
  const m = openModal({
    title: '🦄 Pixel Unicorn',
    closable,
    body: `<p class="lg">De garaje a unicornio. Funda tu startup, contrata talento, lanza productos y conquista el mercado.</p>
      <div class="row gap"><div id="look"></div>
      <div class="grow"><label class="field">Tu startup<input id="ng-company" maxlength="18" value="${esc(s.company)}"></label>
      <label class="field">Tu nombre<input id="ng-founder" maxlength="18" value="Alex"></label></div></div>
      <div class="row gap wrap"><button class="btn" id="ng-look">🎲 Cambiar aspecto</button></div>
      <div class="row end gap">${closable ? '<button class="btn" data-close>Cancelar</button>' : ''}<button class="btn primary big" id="ng-go">¡Empezar!</button></div>`,
  });
  const paint = () => {
    previewId += 1;
    m.body.querySelector('#look').innerHTML = avatar({ id: 'preview' + previewId, role: 'founder', looks }).replace('class="avatar"', 'class="avatar huge"');
  };
  paint();
  m.body.querySelector('#ng-look').addEventListener('click', () => {
    looks = makeLooks({ rng: (Math.random() * 2 ** 31) | 0 });
    paint();
    sfx('click');
  });
  m.body.querySelector('#ng-go').addEventListener('click', () => {
    const company = m.body.querySelector('#ng-company').value.trim() || 'Pixel Startup';
    const founder = m.body.querySelector('#ng-founder').value.trim() || 'Alex';
    clearSave();
    closeModal(m);
    start(G.newGame({ company, founder, looks }));
    s.speed = 1;
    save(s);
    sfx('good');
    helpModal(true);
  });
}

function helpModal(first = false) {
  openModal({
    title: first ? '¡Bienvenido/a a tu garaje!' : 'Cómo jugar',
    body: `<ol class="help">
      <li>📝 <b>Contratos:</b> acepta trabajos de clientes para ganar tus primeros dólares. Tú mismo puedes hacerlos.</li>
      <li>👥 <b>Equipo:</b> contrata desarrolladores (💻), diseñadores (🎨) e investigadores (🔬). Asigna a cada persona a un producto o contrato.</li>
      <li>📦 <b>Productos:</b> elige una categoría, completa sus funciones básicas y lánzalo. Después, añade funciones y súbelas de nivel para ganar a la competencia.</li>
      <li>🔬 <b>I+D:</b> investiga "Modelos de negocio" para poder ganar dinero con publicidad o suscripciones. Luego desbloquea móviles, IA, streaming...</li>
      <li>📣 <b>Marketing, 🖥️ servidores y 📈 inversores:</b> haz crecer tu producto, mantenlo en pie y busca financiación.</li>
      <li>🏢 <b>Oficina:</b> compra mejoras para que el equipo esté feliz y con energía, y múdate cuando te falte espacio.</li>
      </ol>
      <p class="muted">Controles: <b>Espacio</b> pausa · <b>1-3</b> velocidad · <b>E</b> o ✏️ editar la oficina · arrastra la oficina para moverte · rueda o pellizco para zoom · toca a alguien para ver su ficha.</p>
      <p class="muted">Si te quedas sin dinero durante 45 días, quiebras. ¡Vigila tus finanzas!</p>
      <div class="row end"><button class="btn primary" data-close>¡A por ello!</button></div>`,
  });
}

function settingsModal() {
  const m = openModal({
    title: '☰ Menú',
    body: `<div class="menu">
      <button class="btn" data-m="save">💾 Guardar ahora</button>
      <button class="btn" data-act="help">❓ Cómo jugar</button>
      <button class="btn" data-m="sound">${s.settings.sound ? '🔊 Sonido: activado' : '🔇 Sonido: desactivado'}</button>
      <button class="btn" data-m="export">📤 Exportar partida</button>
      <button class="btn" data-m="import">📥 Importar partida</button>
      <button class="btn danger" data-m="new">🆕 Nueva partida</button></div>
      <div id="menu-extra"></div>
      <p class="muted small">Pixel Unicorn · se guarda solo en este navegador cada semana de juego.</p>`,
  });
  const extra = m.body.querySelector('#menu-extra');
  m.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const k = b.dataset.m;
    if (k === 'save') {
      toast(save(s) ? 'Partida guardada.' : 'No se pudo guardar (almacenamiento bloqueado).', 'good');
    } else if (k === 'sound') {
      s.settings.sound = !s.settings.sound;
      setSound(s.settings.sound);
      b.textContent = s.settings.sound ? '🔊 Sonido: activado' : '🔇 Sonido: desactivado';
    } else if (k === 'export') {
      extra.innerHTML = `<label class="field">Copia este código y guárdalo<textarea readonly rows="4">${exportSave(s)}</textarea></label>
        <button class="btn" id="copy">📋 Copiar</button>`;
      const ta = extra.querySelector('textarea');
      ta.select();
      extra.querySelector('#copy').addEventListener('click', () => {
        navigator.clipboard?.writeText(ta.value).then(() => toast('Copiado.', 'good'), () => toast('Selecciona y copia a mano.', 'bad'));
      });
    } else if (k === 'import') {
      extra.innerHTML = `<label class="field">Pega el código de tu partida<textarea rows="4" id="imp"></textarea></label>
        <button class="btn primary" id="doimp">Cargar</button>`;
      extra.querySelector('#doimp').addEventListener('click', () => {
        try {
          const st = importSave(extra.querySelector('#imp').value);
          start(st);
          save(s);
          toast('Partida importada.', 'good');
        } catch {
          toast('Ese código no es válido.', 'bad');
        }
      });
    } else if (k === 'new') {
      confirmModal('Nueva partida', 'Se borrará la partida actual de este navegador.', 'Empezar de cero', () => {
        closeAllModals();
        newGameModal(true);
      }, true);
    }
  });
}

// Iconos pixel del HUD declarados en index.html con data-icon.
function hudIcons() {
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = pixIcon(el.dataset.icon, 18);
}

hudIcons();
boot();

// Exponer el estado ayuda a depurar desde la consola.
window.__pixelUnicorn = { get state() { return s; }, get office() { return office; }, G };
