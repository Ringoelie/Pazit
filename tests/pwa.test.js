// El service worker guarda todos los archivos del juego y el manifest apunta
// a iconos que existen. Uso: node tests/pwa.test.js
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const pub = (f) => new URL('../public/' + f, import.meta.url);
const sw = readFileSync(pub('sw.js'), 'utf8');
for (const f of readdirSync(pub('js/'))) assert.ok(sw.includes(`'js/${f}'`), `sw.js no guarda js/${f}`);
const files = [...sw.matchAll(/^ {2}'([^']+)',$/gm)].map((m) => m[1]).filter((f) => f !== './');
for (const f of files) assert.ok(existsSync(pub(f)), `sw.js guarda ${f}, que no existe`);
const man = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8'));
assert.ok(man.icons.some((i) => i.sizes === '192x192') && man.icons.some((i) => i.sizes === '512x512'), 'iconos de 192 y 512');
for (const i of man.icons) assert.ok(existsSync(pub(i.src)), `falta el icono ${i.src}`);
console.log('OK');
