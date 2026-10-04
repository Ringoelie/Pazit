// Utilidades compartidas: RNG con estado serializable, formato y fechas.

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// mulberry32 con el estado guardado en s.rng para que las partidas se puedan guardar.
export function rnd(s) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rint = (s, a, b) => a + Math.floor(rnd(s) * (b - a + 1));
export const rfloat = (s, a, b) => a + rnd(s) * (b - a);
export const pick = (s, arr) => arr[Math.floor(rnd(s) * arr.length)];
export const chance = (s, p) => rnd(s) < p;
export function gauss(s, mean, sd) {
  const u = 1 - rnd(s), v = rnd(s);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function weightedPick(s, items, weight) {
  const total = items.reduce((a, it) => a + Math.max(0, weight(it)), 0);
  if (total <= 0) return null;
  let r = rnd(s) * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

const SUFFIX = [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
export function fmtNum(n) {
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  for (const [v, suf] of SUFFIX) {
    // 999.999 se redondea a "1M" en vez de "1000k".
    if (n >= v * 0.9995) {
      const x = n / v;
      const str = x >= 100 ? String(Math.round(x)) : x.toFixed(x >= 10 ? 1 : 2).replace(/\.?0+$/, '');
      return sign + str + suf;
    }
  }
  if (n >= 100 || Number.isInteger(n)) return sign + Math.round(n);
  return sign + n.toFixed(1).replace(/\.0$/, '');
}
export const fmtMoney = (n) => (n < 0 ? '-$' : '$') + fmtNum(Math.abs(n));
export const fmtPct = (x, d = 0) => (x * 100).toFixed(d) + '%';

const START = Date.UTC(2026, 0, 1);
export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function dateOf(day) {
  const d = new Date(START + day * 86400000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}
export function fmtDate(day) {
  const t = dateOf(day);
  return `${t.d} ${MONTHS[t.m]} ${t.y}`;
}
export function fmtDays(n) {
  n = Math.max(0, Math.ceil(n));
  return n === 1 ? '1 día' : `${n} días`;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (str) => String(str).replace(/[&<>"']/g, (c) => ESC[c]);

// Identificador sin tildes ni emojis: 'Políticas de empresa' → 'politicas-de-empresa'.
export const slug = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
