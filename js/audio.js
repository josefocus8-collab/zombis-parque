// Sonidos generados por el propio móvil (sin archivos): música de tensión, latidos, gruñidos, gritos...
import { voiceKey, voiceClean } from './voice.js';
let ctx = null, master = null, noiseBuf = null;
let droneNodes = null, hbTimer = null, hbRate = 0;
let enabled = true;
let speakId = 0, currentVoice = null;
const voiceCache = new Map();

function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

function env(g, t, a, peak, dur, rel = 0.15) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.setValueAtTime(Math.max(peak, 0.0002), t + Math.max(a, dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function panner(pan) {
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    return p;
  }
  return ctx.createGain();
}

function distortion(amount = 30) {
  const ws = ctx.createWaveShaper();
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  ws.curve = curve;
  return ws;
}

export const audio = {
  unlock() {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.9;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch { /* sin audio */ }
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
  },
  get ok() { return !!ctx && enabled; },
  get enabled() { return enabled; },
  setEnabled(v) {
    enabled = v;
    if (master) master.gain.value = v ? 0.9 : 0;
    if (!v && 'speechSynthesis' in window) speechSynthesis.cancel();
  },

  tone(freq, dur = 0.15, type = 'sine', vol = 0.3, glideTo = null, delay = 0) {
    if (!this.ok) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    env(g, t, 0.01, vol, dur, Math.min(0.1, dur / 2));
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  beep(freq = 880, vol = 0.25) { this.tone(freq, 0.09, 'square', vol); },
  click() { this.tone(1200, 0.04, 'triangle', 0.15); },
  chime() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.25, null, i * 0.11));
  },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.3, null, i * 0.15));
  },
  wrong() { this.tone(180, 0.35, 'sawtooth', 0.25, 90); },

  thump(vol = 0.7) {
    if (!this.ok) return;
    const t = ctx.currentTime;
    [[0, vol], [0.22, vol * 0.6]].forEach(([d, v]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(70, t + d);
      o.frequency.exponentialRampToValueAtTime(35, t + d + 0.18);
      env(g, t + d, 0.01, v, 0.2, 0.15);
      o.connect(g).connect(master);
      o.start(t + d);
      o.stop(t + d + 0.25);
    });
  },
  // Latidos: bpm 0 para parar
  heartbeat(bpm) {
    if (bpm === hbRate) return;
    hbRate = bpm;
    clearTimeout(hbTimer);
    if (!bpm) return;
    const loop = () => {
      this.thump(0.5 + Math.min(0.4, (bpm - 60) / 200));
      hbTimer = setTimeout(loop, 60000 / bpm);
    };
    loop();
  },

  // Música de tensión de fondo. level 0..1
  drone(level = 0.4) {
    if (!this.ok) return;
    if (!droneNodes) {
      const out = ctx.createGain();
      out.gain.value = 0.0001;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      lp.Q.value = 6;
      const oscs = [55, 55.6, 82.4, 110.3].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 3 ? 'sine' : 'sawtooth';
        o.frequency.value = f;
        o.connect(lp);
        o.start();
        return o;
      });
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
      lfo.frequency.value = 0.13;
      lfoG.gain.value = 120;
      lfo.connect(lfoG).connect(lp.frequency);
      lfo.start();
      // viento / respiración
      const n = noise(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
      bp.type = 'bandpass';
      bp.frequency.value = 500;
      bp.Q.value = 0.7;
      ng.gain.value = 0.15;
      const lfo2 = ctx.createOscillator(), lfo2G = ctx.createGain();
      lfo2.frequency.value = 0.07;
      lfo2G.gain.value = 300;
      lfo2.connect(lfo2G).connect(bp.frequency);
      lfo2.start();
      n.connect(bp).connect(ng).connect(lp);
      n.start();
      lp.connect(out).connect(master);
      droneNodes = { out, lp, oscs, lfo, n, lfo2 };
    }
    const t = ctx.currentTime;
    droneNodes.out.gain.cancelScheduledValues(t);
    droneNodes.out.gain.setTargetAtTime(level <= 0 ? 0.0001 : 0.05 + level * 0.18, t, 0.8);
    droneNodes.lp.frequency.setTargetAtTime(250 + level * 900, t, 0.8);
    droneNodes.oscs[0].frequency.setTargetAtTime(55 + level * 4, t, 1);
  },
  stopDrone() { this.drone(0); },

  growl(vol = 0.6, pan = 0, dur = 1.4) {
    if (!this.ok) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    env(out, t, 0.12, vol, dur, 0.4);
    const p = panner(pan);
    out.connect(p).connect(master);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = 60 + Math.random() * 30;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 0.75, t + dur);
    const vib = ctx.createOscillator(), vibG = ctx.createGain();
    vib.frequency.value = 9 + Math.random() * 6;
    vibG.gain.value = 18;
    vib.connect(vibG).connect(o.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 2.5;
    const am = ctx.createGain();
    am.gain.value = 0.6;
    const amL = ctx.createOscillator(), amLG = ctx.createGain();
    amL.frequency.value = 13;
    amLG.gain.value = 0.4;
    amL.connect(amLG).connect(am.gain);
    o.connect(bp).connect(am).connect(out);
    const n = noise(), nb = ctx.createBiquadFilter(), ng = ctx.createGain();
    nb.type = 'bandpass';
    nb.frequency.value = 900;
    nb.Q.value = 1.5;
    ng.gain.value = 0.5;
    n.connect(nb).connect(ng).connect(am);
    [o, vib, amL, n].forEach((x) => { x.start(t); x.stop(t + dur + 0.1); });
  },

  scream(vol = 0.8) {
    if (!this.ok) return;
    const t = ctx.currentTime, dur = 1.1;
    const out = ctx.createGain();
    env(out, t, 0.03, vol, dur, 0.5);
    const d = distortion(60);
    d.connect(out).connect(master);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(500, t);
    o.frequency.exponentialRampToValueAtTime(1300, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(700, t + dur);
    const vib = ctx.createOscillator(), vg = ctx.createGain();
    vib.frequency.value = 28;
    vg.gain.value = 60;
    vib.connect(vg).connect(o.frequency);
    o.connect(d);
    const n = noise(), hp = ctx.createBiquadFilter(), ng = ctx.createGain();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    ng.gain.value = 0.35;
    n.connect(hp).connect(ng).connect(out);
    [o, vib, n].forEach((x) => { x.start(t); x.stop(t + dur + 0.1); });
  },

  bite() {
    if (!this.ok) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const n = noise(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass';
      bp.frequency.value = 1500 + i * 400;
      bp.Q.value = 1;
      env(g, t + i * 0.07, 0.005, 0.8, 0.09, 0.06);
      n.connect(bp).connect(g).connect(master);
      n.start(t + i * 0.07);
      n.stop(t + i * 0.07 + 0.12);
    }
    this.tone(90, 0.4, 'sawtooth', 0.4, 50, 0.05);
  },

  whisper() {
    if (!this.ok) return;
    const t = ctx.currentTime, dur = 2.2;
    const n = noise(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass';
    bp.frequency.value = 2800;
    bp.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t);
    let tt = t;
    while (tt < t + dur) {
      const len = 0.08 + Math.random() * 0.2;
      g.gain.linearRampToValueAtTime(0.25 + Math.random() * 0.3, tt + len * 0.3);
      g.gain.linearRampToValueAtTime(0.02, tt + len);
      bp.frequency.setValueAtTime(2000 + Math.random() * 2500, tt);
      tt += len + Math.random() * 0.08;
    }
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
    const p = panner(Math.random() * 2 - 1);
    n.connect(bp).connect(g).connect(p).connect(master);
    n.start(t);
    n.stop(t + dur + 0.2);
  },

  radio(dur = 1.2, vol = 0.25) {
    if (!this.ok) return;
    const t = ctx.currentTime;
    const n = noise(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    env(g, t, 0.02, vol, dur, 0.2);
    n.connect(bp).connect(g).connect(master);
    n.start(t);
    n.stop(t + dur + 0.1);
  },

  sparkle() {
    for (let i = 0; i < 6; i++) this.tone(1500 + Math.random() * 1500, 0.12, 'sine', 0.12, null, i * 0.05);
  },

  // Chillido de murciélago (varios pitidos agudos muy rápidos)
  screech(vol = 0.35, pan = 0) {
    if (!this.ok) return;
    const t = ctx.currentTime;
    const p = panner(pan);
    p.connect(master);
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      const st = t + i * 0.06;
      o.frequency.setValueAtTime(3200 + Math.random() * 1500, st);
      o.frequency.exponentialRampToValueAtTime(1800, st + 0.05);
      env(g, st, 0.005, vol * (1 - i * 0.15), 0.06, 0.03);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      o.connect(hp).connect(g).connect(p);
      o.start(st); o.stop(st + 0.08);
    }
  },
  // Disparo (de broma: un «¡pum!» de luz)
  shot() {
    if (!this.ok) return;
    const t = ctx.currentTime;
    const n = noise(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    env(g, t, 0.002, 0.9, 0.3, 0.25);
    n.connect(lp).connect(g).connect(master);
    n.start(t); n.stop(t + 0.35);
    this.tone(120, 0.25, 'sine', 0.6, 40);
  },
  creak() {
    if (!this.ok) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, t); o.frequency.linearRampToValueAtTime(140, t + 0.6); o.frequency.linearRampToValueAtTime(70, t + 1);
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 4;
    env(g, t, 0.05, 0.4, 1, 0.3);
    o.connect(bp).connect(g).connect(master);
    o.start(t); o.stop(t + 1.05);
  },
  splash() {
    if (!this.ok) return;
    for (let i = 0; i < 6; i++) this.tone(300 + Math.random() * 500, 0.08, 'sine', 0.2, 900 + Math.random() * 600, i * 0.05);
    this.radio(0.3, 0.2);
  },

  // Voz del Doctor: audio grabado con voz natural (Piper) con efecto de walkie-talkie.
  // creepy = el Doctor se está convirtiendo: voz más grave, lenta y distorsionada.
  // Si no hay grabación (o no carga), usa la voz del móvil sin modificar el tono.
  async speak(text, { creepy = false } = {}) {
    this.stopSpeak();
    if (!enabled) return;
    const my = ++speakId;
    try {
      if (!ctx) throw new Error('sin audio');
      const key = voiceKey(text);
      let buf = voiceCache.get(key);
      if (!buf) {
        const r = await fetch(`audio/voz/${key}.mp3`);
        if (!r.ok) throw new Error('sin grabación');
        buf = await ctx.decodeAudioData(await r.arrayBuffer());
        voiceCache.set(key, buf);
      }
      if (my !== speakId) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = creepy ? 0.86 : 1;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = creepy ? 3000 : 3800;
      const g = ctx.createGain(); g.gain.value = 1.15;
      let node = src.connect(hp).connect(lp);
      if (creepy) node = node.connect(distortion(25));
      node.connect(g).connect(master);
      // ruido de radio de fondo
      const n = noise(), nb = ctx.createBiquadFilter(), ng = ctx.createGain();
      nb.type = 'bandpass'; nb.frequency.value = 2000; nb.Q.value = 0.6;
      ng.gain.value = 0.025;
      n.connect(nb).connect(ng).connect(master);
      const dur = buf.duration / src.playbackRate.value;
      src.start(t + 0.05);
      n.start(t);
      n.stop(t + dur + 0.3);
      currentVoice = { src, n };
      await new Promise((res) => { src.onended = res; setTimeout(res, dur * 1000 + 1500); });
      currentVoice = null;
      return;
    } catch { /* uso la voz del móvil */ }
    if (my !== speakId || !('speechSynthesis' in window)) return;
    await new Promise((res) => {
      try {
        const clean = voiceClean(text.replace(/<[^>]+>/g, ' '));
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = 'es-ES';
        const voices = speechSynthesis.getVoices();
        const v = voices.find((x) => x.lang === 'es-ES' && /google/i.test(x.name)) || voices.find((x) => x.lang === 'es-ES') || voices.find((x) => x.lang && x.lang.startsWith('es'));
        if (v) u.voice = v;
        u.pitch = 1;
        u.rate = creepy ? 0.9 : 1;
        let done = false;
        const fin = () => { if (!done) { done = true; res(); } };
        u.onend = fin;
        u.onerror = fin;
        speechSynthesis.speak(u);
        setTimeout(fin, clean.length * 95 + 4000);
      } catch { res(); }
    });
  },
  stopSpeak() {
    speakId++;
    if (currentVoice) { try { currentVoice.src.stop(); currentVoice.n.stop(); } catch { /* ya parado */ } currentVoice = null; }
    try { speechSynthesis.cancel(); } catch { /* nada */ }
  },
  stopAll() { this.heartbeat(0); this.stopDrone(); this.stopSpeak(); },
};
