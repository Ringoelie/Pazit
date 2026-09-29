// Música chiptune generada al vuelo con WebAudio: bajo, arpegio, melodía y
// percusión. Cambia de tono y ritmo según vaya la empresa (normal, éxito o
// crisis) y de tonalidad con cada oficina, así que no hay dos partidas iguales.
import { audioCtx } from './audio.js';

// Acordes en semitonos sobre la tónica; escala para la melodía.
const MOODS = {
  normal: { bpm: 100, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14], rest: 0.35 },
  success: { bpm: 124, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [9, 12, 16]], kick: [0, 6, 8], snare: [4, 12], hat: [1, 3, 5, 7, 9, 11, 13, 15], rest: 0.2 },
  crisis: { bpm: 84, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], kick: [0, 10], snare: [12], hat: [4, 12], rest: 0.5 },
};
const KEYS = [0, 2, 4, 5, 7, 9, -2];
const ROOT = 45; // La 2

let enabled = true;
let unlocked = false;
let timer = null;
let out = null;
let noise = null;
let mood = 'normal';
let pending = 'normal';
let key = 0;
let nextTime = 0;
let step = 0;
let bar = 0;
let melody = [];
let seed = 1;

const freq = (m) => 440 * 2 ** ((m - 69) / 12);
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

function note(a, type, midi, t, dur, vol) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq(midi), t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function drum(a, kind, t) {
  if (kind === 'kick') {
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.16);
    return;
  }
  const src = a.createBufferSource();
  src.buffer = noise;
  const f = a.createBiquadFilter();
  f.type = kind === 'snare' ? 'bandpass' : 'highpass';
  f.frequency.value = kind === 'snare' ? 1800 : 7000;
  const g = a.createGain();
  const len = kind === 'snare' ? 0.11 : 0.035;
  g.gain.setValueAtTime(kind === 'snare' ? 0.16 : 0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + len + 0.02);
}

// Melodía de 4 compases (corcheas) con paseo aleatorio por la escala.
function compose() {
  const M = MOODS[mood];
  let deg = 2;
  melody = [];
  for (let i = 0; i < 32; i++) {
    if (i % 8 === 0) {
      melody.push(M.chords[(i / 8) % 4][0] + 24);
      continue;
    }
    if (rand() < M.rest) {
      melody.push(null);
      continue;
    }
    deg = Math.max(0, Math.min(9, deg + Math.round((rand() - 0.5) * 4)));
    melody.push(M.scale[deg % 5] + 12 * Math.floor(deg / 5) + 24);
  }
}

function playStep(a, t) {
  const M = MOODS[mood];
  const spb = 60 / M.bpm / 4;
  const chord = M.chords[bar % 4];
  const base = ROOT + key;
  if ([0, 3, 8, 11].includes(step)) note(a, 'triangle', base + chord[0], t, spb * 2.5, 0.16);
  if (step === 14) note(a, 'triangle', base + chord[2] - 12, t, spb * 1.5, 0.12);
  if (step % 2 === 0) note(a, 'square', base + 24 + chord[[0, 1, 2, 1][(step / 2) % 4]], t, spb * 1.4, 0.022);
  if (step % 2 === 0) {
    const m = melody[(bar % 4) * 8 + step / 2];
    if (m != null) note(a, 'square', base + m, t, spb * 1.8, 0.035);
  }
  if (M.kick.includes(step)) drum(a, 'kick', t);
  if (M.snare.includes(step)) drum(a, 'snare', t);
  if (M.hat.includes(step)) drum(a, 'hat', t);
}

function tick() {
  const a = audioCtx();
  if (!a || a.state !== 'running') return;
  while (nextTime < a.currentTime + 0.15) {
    if (step === 0) {
      // Los cambios de ánimo entran al empezar compás; la melodía se renueva cada 8.
      if (pending !== mood) {
        mood = pending;
        compose();
      } else if (bar % 8 === 0) compose();
    }
    playStep(a, nextTime);
    nextTime += 60 / MOODS[mood].bpm / 4;
    step = (step + 1) % 16;
    if (step === 0) bar++;
  }
}

function start() {
  if (timer || !enabled || document.hidden) return;
  const a = audioCtx();
  if (!a) return;
  if (!out) {
    out = a.createGain();
    out.gain.value = 0.3;
    out.connect(a.destination);
    noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  seed = (Date.now() & 0xffff) + 1;
  compose();
  nextTime = a.currentTime + 0.1;
  step = 0;
  bar = 0;
  timer = setInterval(tick, 40);
}

function stop() {
  clearInterval(timer);
  timer = null;
}

// Hay que llamarlo tras un toque o una tecla: los navegadores no dejan sonar
// nada antes.
export function unlockMusic() {
  unlocked = true;
  if (enabled && !timer) start();
}

export function setMusic(on) {
  enabled = on;
  if (on && unlocked) start();
  else if (!on) stop();
}

export function setMusicMood(next, tier = 0) {
  pending = MOODS[next] ? next : 'normal';
  key = KEYS[tier] ?? 0;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
  else if (enabled && out) start();
});

// Estado para depurar y para las pruebas.
export const musicState = () => ({ playing: !!timer, mood, bar });
