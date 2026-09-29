// Piezas base de la interfaz: parcheo del DOM, modales, toasts y avatares.
import { drawPortrait } from './sprites.js';
import { ROLES } from './data.js';
import { esc } from './util.js';

// ---------------------------------------------------------------- morph

// Actualiza el contenido de `el` con `html` tocando solo lo que cambia, para
// no perder el foco, el scroll ni los clics a medias al refrescar cada día.
export function patch(el, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  morphChildren(el, tpl.content);
}

function sameKind(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
  if (a.nodeType === 1 && (a.getAttribute('data-key') || '') !== (b.getAttribute('data-key') || '')) return false;
  return true;
}

function morphChildren(a, b) {
  const an = [...a.childNodes];
  const bn = [...b.childNodes];
  for (let i = 0; i < bn.length; i++) {
    const x = an[i];
    const y = bn[i];
    if (!x) a.appendChild(y);
    else if (!sameKind(x, y)) a.replaceChild(y, x);
    else morphNode(x, y);
  }
  for (let i = an.length - 1; i >= bn.length; i--) an[i].remove();
}

function morphNode(x, y) {
  if (x.nodeType === 3 || x.nodeType === 8) {
    if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue;
    return;
  }
  const focused = document.activeElement === x;
  if (x.tagName === 'SELECT' && focused) return;
  for (const { name } of [...x.attributes]) {
    // Un <details> abierto por el usuario debe seguir abierto tras refrescar.
    if (!y.hasAttribute(name) && !(name === 'open' && x.tagName === 'DETAILS')) x.removeAttribute(name);
  }
  for (const { name, value } of [...y.attributes]) if (x.getAttribute(name) !== value) x.setAttribute(name, value);
  if (x.tagName === 'INPUT' || x.tagName === 'TEXTAREA') {
    if (!focused && x.type !== 'checkbox' && x.value !== (y.getAttribute('value') ?? '')) x.value = y.getAttribute('value') ?? '';
    if (x.type === 'checkbox') x.checked = y.hasAttribute('checked');
    return;
  }
  morphChildren(x, y);
  if (x.tagName === 'SELECT') {
    const sel = y.querySelector('option[selected]');
    x.value = sel ? sel.value : x.options[0]?.value ?? '';
  }
}

// ---------------------------------------------------------------- modales

const stack = [];

export function openModal({ title, body, render, wide = false, closable = true, onClose, cls = '' }) {
  const root = document.getElementById('modals');
  const wrap = document.createElement('div');
  wrap.className = 'modal-back';
  wrap.innerHTML = `<div class="modal px-box ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true">
    <header><h2></h2>${closable ? '<button class="icon-btn" data-close aria-label="Cerrar">✕</button>' : ''}</header>
    <div class="modal-body"></div></div>`;
  wrap.querySelector('h2').textContent = title;
  const m = { wrap, render, onClose, closable, body: wrap.querySelector('.modal-body') };
  if (render) patch(m.body, render());
  else m.body.innerHTML = body;
  wrap.addEventListener('click', (e) => {
    if ((e.target === wrap && closable) || e.target.closest('[data-close]')) closeModal(m);
  });
  root.appendChild(wrap);
  stack.push(m);
  syncInert();
  setTimeout(() => wrap.querySelector('input, [autofocus]')?.focus(), 30);
  return m;
}

// Con un modal abierto, el resto de la página no recibe foco ni teclas: así
// Intro o Espacio no pulsan botones que hay detrás.
function syncInert() {
  const app = document.getElementById('app');
  if (app) app.inert = stack.length > 0;
}

export function closeModal(m = stack[stack.length - 1]) {
  if (!m) return;
  const i = stack.indexOf(m);
  if (i >= 0) stack.splice(i, 1);
  m.wrap.remove();
  syncInert();
  m.onClose?.();
}

// Cierra los modales que se pueden cerrar. `force` cierra también los que
// esperan una decisión (eventos, fin de partida): solo al cambiar de partida.
export function closeAllModals(force = false) {
  for (const m of [...stack].reverse()) if (force || m.closable) closeModal(m);
}

export const topModal = () => stack[stack.length - 1] || null;
export const modalOpen = () => stack.length > 0;

export function refreshModals() {
  for (const m of stack) if (m.render) patch(m.body, m.render());
}

export function confirmModal(title, text, okLabel, onOk, danger = false) {
  const m = openModal({
    title,
    body: `<p>${esc(text)}</p><div class="row end gap"><button class="btn" data-close>Cancelar</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button></div>`,
  });
  m.body.querySelector('[data-ok]').addEventListener('click', () => {
    closeModal(m);
    onOk();
  });
}

// ---------------------------------------------------------------- toasts

export function toast(text, kind = 'info') {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  // Los avisos de correo llevan a la bandeja al tocarlos.
  if (kind === 'mail') Object.assign(el.dataset, { act: 'tab', tab: 'mail' });
  root.appendChild(el);
  const max = window.matchMedia('(max-width: 640px)').matches ? 2 : 4;
  while (root.children.length > max) root.firstChild.remove();
  setTimeout(() => el.classList.add('out'), kind === 'achievement' ? 5200 : 3800);
  setTimeout(() => el.remove(), kind === 'achievement' ? 5600 : 4200);
}

// ---------------------------------------------------------------- avatares

const avatarCache = new Map();
export function avatar(e) {
  const key = e.role + JSON.stringify(e.looks);
  let url = avatarCache.get(key);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    drawPortrait(c.getContext('2d'), e.looks, ROLES[e.role].color, e.role);
    url = c.toDataURL();
    avatarCache.set(key, url);
  }
  return `<img class="avatar" src="${url}" alt="">`;
}

// ---------------------------------------------------------------- iconos pixel

const ICONS = {
  coin: ['..####..', '.#yyyy#.', '#yy##yy#', '#y#yy#y#', '#y#yy#y#', '#yy##yy#', '.#yyyy#.', '..####..'],
  user: ['..####..', '.#cccc#.', '.#cccc#.', '..####..', '.######.', '#cccccc#', '#cccccc#', '########'],
  flask: ['..####..', '...##...', '...##...', '..#gg#..', '.#gggg#.', '#gggggg#', '#gggggg#', '.######.'],
  cal: ['.#....#.', '########', '#wwwwww#', '#w#w#ww#', '#wwwwww#', '#w#w#ww#', '#wwwwww#', '########'],
  chart: ['.......#', '......##', '.....#.#', '#...#...', '##.#....', '#.#.....', '#.......', '########'],
  star: ['...#....', '...##...', '..#yy#..', '########', '.#yyyy#.', '..#yy#..', '.#.##.#.', '#......#'],
};
const ICON_COLORS = { '#': '#1a1c2c', y: '#ffcd75', c: '#73eff7', g: '#a7f070', w: '#f4f4f4' };

export function pixIcon(name, size = 16) {
  const rows = ICONS[name];
  let rects = '';
  rows.forEach((r, y) => {
    [...r].forEach((ch, x) => {
      if (ch !== '.') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${ICON_COLORS[ch]}"/>`;
    });
  });
  return `<svg class="pix" width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

// ---------------------------------------------------------------- piezas

export function bar(v, color, cls = '') {
  const pct = Math.max(0, Math.min(100, v * 100));
  return `<div class="bar ${cls}"><i style="width:${pct.toFixed(1)}%;background:${color}"></i></div>`;
}

export function btn(label, act, data = {}, { kind = '', disabled = false, title = '' } = {}) {
  const attrs = Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
  return `<button class="btn ${kind}" data-act="${act}"${attrs}${disabled ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
}
