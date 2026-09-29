// Efectos de sonido chiptune sintetizados con WebAudio (sin archivos).
let ctx = null;
let enabled = true;

export function setSound(on) {
  enabled = on;
}

// Contexto de audio compartido con la música. Solo se crea tras un gesto.
export function audioCtx() {
  return ac();
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, type = 'square', vol = 0.06) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const SFX = {
  click: () => tone(660, 0, 0.05, 'square', 0.03),
  coin: () => {
    tone(988, 0, 0.07);
    tone(1319, 0.07, 0.18);
  },
  good: () => {
    tone(523, 0, 0.08);
    tone(659, 0.08, 0.08);
    tone(784, 0.16, 0.16);
  },
  bad: () => {
    tone(330, 0, 0.12, 'sawtooth', 0.05);
    tone(247, 0.12, 0.22, 'sawtooth', 0.05);
  },
  error: () => tone(160, 0, 0.12, 'square', 0.05),
  achievement: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.14, 'triangle', 0.08));
    tone(1319, 0.34, 0.3, 'square', 0.04);
  },
  launch: () => {
    for (let i = 0; i < 8; i++) tone(300 + i * 90, i * 0.04, 0.08, 'square', 0.04);
    tone(1175, 0.34, 0.3, 'triangle', 0.08);
  },
  event: () => {
    tone(784, 0, 0.1, 'triangle', 0.07);
    tone(988, 0.12, 0.16, 'triangle', 0.07);
  },
};

export function sfx(name) {
  if (!enabled || !SFX[name]) return;
  try {
    SFX[name]();
  } catch {
    // Sin audio disponible: el juego sigue igual.
  }
}
