// Prueba de humo del motor: un bot juega varias partidas y comprobamos que
// la economía no se rompe (sin NaN, progreso razonable, sin excepciones).
// Uso: node tests/sim.test.js [días] [semillas] [--verbose]
import assert from 'node:assert/strict';
import * as G from '../public/js/sim.js';
import { RESEARCH } from '../public/js/data.js';
import { botDay } from './bot.js';
import { fmtMoney, fmtNum } from '../public/js/util.js';

const DAYS = Number(process.argv[2]) || 365 * 6;
const SEEDS = Number(process.argv[3]) || 5;
const VERBOSE = process.argv.includes('--verbose');

function checkFinite(s) {
  const bad = [];
  const walk = (o, path) => {
    if (typeof o === 'number' && !Number.isFinite(o)) bad.push(path);
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, path + '.' + k);
  };
  walk(s, 's');
  assert.deepEqual(bad, [], 'valores no finitos: ' + bad.slice(0, 5).join(', '));
}

const results = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const s = G.newGame({ company: 'BotCorp', founder: 'Bot', seed: seed * 7919 });
  for (let d = 0; d < DAYS; d++) {
    botDay(s);
    G.stepDay(s);
    s.notes.length = 0;
    if (s.gameOver) break;
    if (VERBOSE && (s.day % 180 === 0 || (s.day < 365 && s.day % 60 === 0))) {
      const sm = G.summary(s);
      console.log(
        `  [${seed}] año ${(s.day / 365).toFixed(1)} caja ${fmtMoney(s.money)} equipo ${s.employees.length} usuarios ${fmtNum(sm.users)} ` +
          `mrr ${fmtMoney(sm.mrr)} costes ${fmtMoney(sm.costs)} val ${fmtMoney(sm.val)} I+D ${Object.keys(s.research).length} ` +
          `oficina ${s.office.tier} prods ${s.products.map((p) => p.cat + (p.launched ? '' : '*')).join(',')} ronda ${s.funding.round}`,
      );
    }
  }
  checkFinite(s);
  JSON.parse(JSON.stringify(s));
  const sm = G.summary(s);
  results.push({ seed, day: s.day, over: s.gameOver?.reason, team: s.employees.length, users: sm.users, mrr: sm.mrr, val: sm.val, research: Object.keys(s.research).length, quest: Object.keys(s.quests).length, ach: Object.keys(s.achievements).length });
}

for (const r of results) {
  console.log(
    `semilla ${r.seed}: día ${r.day}${r.over ? ' (' + r.over + ')' : ''} · equipo ${r.team} · usuarios ${fmtNum(r.users)} · MRR ${fmtMoney(r.mrr)} · ` +
      `valoración ${fmtMoney(r.val)} · I+D ${r.research}/${RESEARCH.length} · objetivo ${r.quest} · logros ${r.ach}`,
  );
}
const survivors = results.filter((r) => !r.over || r.over === 'sold');
assert.ok(survivors.length >= Math.ceil(SEEDS * 0.6), 'el bot quiebra demasiado a menudo');
assert.ok(results.some((r) => r.users > 1e5), 'ninguna partida pasa de 100k usuarios');
console.log('OK');
