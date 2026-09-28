// Guardado en localStorage, exportación/importación y migraciones.
import { newGame, ensureLayout } from './sim.js';
import { ensureRivals } from './rivals.js';

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
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
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
  ensureLayout(s);
  ensureRivals(s);
  return s;
}
