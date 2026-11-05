// Utilidades generales
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function vibrate(p) {
  try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* sin vibración */ }
}

export const store = {
  get(k, d = null) {
    try { const v = localStorage.getItem('zp_' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) { try { localStorage.setItem('zp_' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem('zp_' + k); } catch { /* nada */ } },
};

export function uid(n = 12) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
export function distM(a, b) {
  if (!a || !b) return Infinity;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
export function bearingDeg(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
export function offsetLatLng(p, eastM, northM) {
  return {
    lat: p.lat + northM / 111320,
    lng: p.lng + eastM / (111320 * Math.cos(toRad(p.lat))),
  };
}

export function fmtTime(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function dirName(deg) {
  const n = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
  return n[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

// Detecta cuando se agita el móvil
export function onShake(cb, threshold = 24) {
  let last = null, lastFire = 0;
  const hnd = (e) => {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x == null) return;
    if (last) {
      const d = Math.abs(a.x - last.x) + Math.abs(a.y - last.y) + Math.abs(a.z - last.z);
      if (d > threshold && Date.now() - lastFire > 400) { lastFire = Date.now(); cb(d); }
    }
    last = { x: a.x, y: a.y, z: a.z };
  };
  addEventListener('devicemotion', hnd);
  return () => removeEventListener('devicemotion', hnd);
}

// Mide cuánto se mueve el móvil (para "¡Quietos!")
export function motionMeter() {
  let last = null, total = 0, samples = 0;
  const hnd = (e) => {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x == null) return;
    samples++;
    if (last) total += Math.abs(a.x - last.x) + Math.abs(a.y - last.y) + Math.abs(a.z - last.z);
    last = { x: a.x, y: a.y, z: a.z };
  };
  addEventListener('devicemotion', hnd);
  return {
    get average() { return samples > 1 ? total / samples : 0; },
    get samples() { return samples; },
    stop() { removeEventListener('devicemotion', hnd); },
  };
}

export function abortError() {
  const e = new Error('abort');
  e.name = 'AbortError';
  return e;
}

// Espera a que se pulse un elemento (o se cancele)
export function waitClick(el, signal) {
  return new Promise((res, rej) => {
    if (signal?.aborted) return rej(abortError());
    const onAbort = () => { el.removeEventListener('click', on); rej(abortError()); };
    const on = (e) => { signal?.removeEventListener('abort', onAbort); res(e); };
    el.addEventListener('click', on, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
