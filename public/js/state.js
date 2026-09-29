// Guardado en localStorage, exportación/importación y migraciones.
import { newGame, ensureLayout, stepDay, summary } from './sim.js';
import { ensureRivals } from './rivals.js';
import { ROLES } from './data.js';

const KEY = 'pixel-unicorn:save';

export function save(s) {
  try {
    const copy = { ...s, notes: [] };
    localStorage.setItem(KEY, JSON.stringify(copy));
    return true;
  } catch {
    return false;
  }
}

export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = migrate(JSON.parse(raw));
    if (s) return s;
  } catch {
    // Partida ilegible: se guarda aparte más abajo.
  }
  // No se pudo cargar: se aparta una copia para no perderla al empezar otra.
  try {
    if (raw) localStorage.setItem(KEY + ':rota', raw);
  } catch {
    // Sin almacenamiento.
  }
  return null;
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Almacenamiento bloqueado: nada que borrar.
  }
}

export function exportSave(s) {
  const json = JSON.stringify({ ...s, notes: [] });
  return btoa(unescape(encodeURIComponent(json)));
}

export function importSave(text) {
  const json = decodeURIComponent(escape(atob(text.trim())));
  const s = migrate(JSON.parse(json));
  if (!s) throw new Error('Partida no válida');
  return s;
}

// Completa campos que falten con los valores de una partida nueva para que
// las partidas antiguas sigan cargando cuando el juego añade cosas.
function migrate(s) {
  if (!s || typeof s !== 'object' || !s.v || !Array.isArray(s.employees)) return null;
  const base = newGame({ company: s.company, seed: 1 });
  for (const [k, v] of Object.entries(base)) if (s[k] === undefined) s[k] = v;
  for (const k of ['stats', 'funding', 'infra', 'contracts', 'settings']) {
    for (const [kk, vv] of Object.entries(base[k])) if (s[k][kk] === undefined) s[k][kk] = vv;
  }
  s.notes = [];
  if (!Array.isArray(s.products) || !Array.isArray(s.competitors)) return null;
  s.employees = s.employees.filter((e) => e && typeof e === 'object' && ROLES[e.role]);
  const founder = base.employees[0];
  for (const e of s.employees) {
    if (!Array.isArray(e.traits)) e.traits = [];
    if (!e.looks || typeof e.looks !== 'object') e.looks = { ...founder.looks };
  }
  try {
    ensureLayout(s);
    ensureRivals(s);
  } catch {
    return null;
  }
  return playable(s) ? s : null;
}

// Prueba la partida en una copia: si no aguanta un día de juego, no se carga.
function playable(s) {
  try {
    const c = structuredClone(s);
    stepDay(c);
    summary(c);
    return true;
  } catch {
    return false;
  }
}
