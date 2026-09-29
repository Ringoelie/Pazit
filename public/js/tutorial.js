// Tutorial guiado: un anillo señala el botón que toca pulsar y un bocadillo
// explica por qué. Cada paso avanza solo cuando la persona hace lo que se le
// pide (o pulsa "Entendido" en los pasos que solo explican algo).
const tab = (t) => `[data-act=tab][data-tab=${t}]`;
const inModal = (sel) => document.querySelector(`#modals .modal-back:last-child ${sel}`);

export const STEPS = [
  {
    text: 'Primero, dinero. Abre Contratos y acepta un encargo: al principio lo haces tú.',
    target: (U) => (U.tab !== 'contracts' ? tab('contracts') : '[data-act=acceptContract]:not([disabled])'),
    done: (s) => s.contracts.active.length > 0,
  },
  {
    text: 'El tiempo corre solo. Acelera con ▶▶ (o con las teclas 1, 2 y 3; Espacio pausa).',
    target: () => '[data-act=speed][data-n="2"]',
    done: (s) => s.speed >= 2,
  },
  {
    text: 'Necesitas equipo. En Equipo, pulsa Contratar y elige a alguien.',
    target: (U) => (inModal('[data-act=hire]') ? '#modals .modal-back:last-child [data-act=hire]' : U.tab !== 'team' ? tab('team') : '[data-act=hireOpen]'),
    done: (s) => s.employees.length > 1,
  },
  {
    text: 'Ahora, tu primer producto. En Productos, pulsa Nuevo producto, elige qué quieres crear y créalo.',
    target: (U) => (inModal('[data-act=createProduct]') ? '#modals .modal-back:last-child [data-act=createProduct]' : U.tab !== 'products' ? tab('products') : '[data-act=newProduct]'),
    done: (s) => s.products.length > 0,
  },
  {
    text: 'Pon a tu gente a trabajar en él: pulsa «Asignar a quien esté libre» o, en Equipo, elige el producto en la tarea de cada persona.',
    target: (U) => (U.tab === 'products' && document.querySelector('[data-act=assignIdle]') ? '[data-act=assignIdle]' : U.tab !== 'team' ? tab('team') : '[data-change=assign]'),
    done: (s) => s.employees.some((e) => e.assign?.startsWith('p:')),
  },
  {
    text: 'En I+D se investigan tecnologías con puntos (PI). La primera, Modelos de negocio, te deja ganar dinero con tus productos.',
    target: () => tab('research'),
    next: 'Entendido',
  },
  {
    text: 'Tu oficina: pulsa ✏️ para mover mesas y muebles. La decoración cerca de las mesas sube el ánimo.',
    target: () => '[data-act=editToggle]',
    done: (s, U) => U.tutEdited,
  },
  {
    text: '¡Listo! Sigue los objetivos de arriba y lanza tu producto cuando tenga sus funciones básicas. ¡A por el unicornio!',
    next: '¡A jugar!',
  },
];

let ring = null;
let tip = null;
let shown = '';
let lastTarget = null;
let scrollAt = 0;

function hide() {
  if (ring) ring.hidden = true;
  if (tip) tip.hidden = true;
  shown = '';
}

function ensureDom() {
  if (ring) return;
  ring = document.createElement('div');
  ring.className = 'tut-ring';
  tip = document.createElement('div');
  tip.className = 'tut-tip px-box';
  tip.setAttribute('role', 'status');
  document.body.append(ring, tip);
}

// Se llama en cada fotograma: coloca el anillo y el bocadillo.
export function renderTutorial(s, U) {
  if (s.tutorial == null || s.tutorial < 0) return hide();
  while (s.tutorial < STEPS.length && STEPS[s.tutorial].done?.(s, U)) s.tutorial++;
  if (s.tutorial >= STEPS.length) {
    s.tutorial = -1;
    return hide();
  }
  ensureDom();
  const i = s.tutorial;
  const st = STEPS[i];
  const sel = st.target?.(U);
  let el = sel ? document.querySelector(sel) : null;
  if (el && !el.getClientRects().length) el = null;
  // Si una ventana tapa lo que toca pulsar, se señala su ✕. Si no se puede
  // cerrar (un evento), el tutorial espera detrás.
  const top = document.querySelector('#modals .modal-back:last-child');
  let text = st.text;
  let key = String(i);
  if (top && !(el && top.contains(el))) {
    el = top.querySelector('header [data-close]');
    if (!el) {
      ring.hidden = true;
      tip.hidden = true;
      return;
    }
    text = 'Cierra esta ventana con la ✕ para seguir con el tutorial.';
    key += 'x';
  }
  if (shown !== key) {
    shown = key;
    tip.innerHTML = `<div class="tut-step">Tutorial · ${i + 1}/${STEPS.length}</div><p></p>
      <p class="tut-hint" hidden>↕ Desliza para verlo.</p>
      <div class="row end gap"><button class="btn small" data-act="tutSkip">Saltar</button>${st.next && key === String(i) ? `<button class="btn primary small" data-act="tutNext">${st.next}</button>` : ''}</div>`;
    tip.querySelector('p').textContent = text;
  }
  // Se lleva a la vista al cambiar de objetivo y otra vez un momento después,
  // porque al abrir una ventana el foco del primer campo mueve el scroll.
  if (el !== lastTarget) {
    lastTarget = el;
    scrollAt = performance.now() + 350;
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  } else if (scrollAt && performance.now() > scrollAt) {
    scrollAt = 0;
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  tip.hidden = false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const t = tip.getBoundingClientRect();
  if (!el) {
    tip.querySelector('.tut-hint').hidden = true;
    ring.hidden = true;
    tip.style.left = Math.round((vw - t.width) / 2) + 'px';
    tip.style.top = Math.round(vh - t.height - 24) + 'px';
    return;
  }
  const r = el.getBoundingClientRect();
  const off = r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw;
  tip.querySelector('.tut-hint').hidden = !off;
  if (off) {
    ring.hidden = true;
    tip.style.left = Math.round((vw - t.width) / 2) + 'px';
    tip.style.top = Math.round(r.top > vh ? vh - t.height - 16 : 16) + 'px';
    return;
  }
  ring.hidden = false;
  Object.assign(ring.style, { left: r.left - 6 + 'px', top: r.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' });
  const below = r.bottom + 14 + t.height < vh;
  const x = Math.max(12, Math.min(vw - t.width - 12, r.left + r.width / 2 - t.width / 2));
  const y = below ? r.bottom + 14 : Math.max(12, r.top - t.height - 14);
  tip.style.left = Math.round(x) + 'px';
  tip.style.top = Math.round(y) + 'px';
}
