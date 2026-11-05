// GPS y brújula (reales o simulados para el modo prueba en casa)
import { offsetLatLng } from './util.js';

export const geo = {
  pos: null,
  acc: null,
  heading: null,
  headingSrc: null,
  sim: false,
  error: null,
  watchId: null,
  history: [],
  listeners: new Set(),
  _pending: false,
  _compassOn: false,

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() {
    if (this._pending) return;
    this._pending = true;
    setTimeout(() => {
      this._pending = false;
      for (const f of this.listeners) { try { f(this); } catch (e) { console.warn(e); } }
    }, 60);
  },

  startReal() {
    this.startCompass();
    if (this.watchId != null || !navigator.geolocation) {
      if (!navigator.geolocation) { this.error = 'nogps'; this.emit(); }
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (p) => {
        this.error = null;
        const real = { lat: p.coords.latitude, lng: p.coords.longitude };
        this.realPos = real;
        this.realAcc = p.coords.accuracy;
        this.history.push({ ...real, acc: p.coords.accuracy, t: Date.now() });
        if (this.history.length > 40) this.history.shift();
        if (this.sim) return;
        this.pos = real;
        this.acc = p.coords.accuracy;
        if (this.headingSrc !== 'compass' && p.coords.heading != null && !isNaN(p.coords.heading) && p.coords.speed > 0.7) {
          this.heading = p.coords.heading;
          this.headingSrc = 'gps';
        }
        this.emit();
      },
      (err) => { this.error = err.code === 1 ? 'denied' : 'unavailable'; this.emit(); },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 25000 }
    );
  },

  startCompass() {
    if (this._compassOn) return;
    this._compassOn = true;
    const handler = (e) => {
      let hd = null;
      if (e.webkitCompassHeading != null) hd = e.webkitCompassHeading;
      else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null) hd = (360 - e.alpha) % 360;
      else return;
      const so = (screen.orientation && screen.orientation.angle) || 0;
      this.heading = (hd + so + 360) % 360;
      this.headingSrc = 'compass';
      this.emit();
    };
    if ('ondeviceorientationabsolute' in window) addEventListener('deviceorientationabsolute', handler);
    else addEventListener('deviceorientation', handler);
  },

  startSim(base) {
    this.sim = true;
    this.pos = { ...base };
    this.acc = 4;
    if (this.heading == null) this.heading = 0;
    this.startCompass();
    this.emit();
  },
  stopSim() {
    this.sim = false;
    this.pos = this.realPos || null;
    this.acc = this.realAcc || null;
    this.emit();
  },
  move(east, north) {
    if (!this.pos) return;
    this.pos = offsetLatLng(this.pos, east, north);
    this.emit();
  },
  // mover hacia donde se mira
  walk(meters) {
    const hd = ((this.heading || 0) * Math.PI) / 180;
    this.move(Math.sin(hd) * meters, Math.cos(hd) * meters);
  },
  turn(deg) {
    if (this.headingSrc === 'compass') return;
    this.heading = ((this.heading || 0) + deg + 360) % 360;
    this.headingSrc = 'sim';
    this.emit();
  },
  teleport(p) { this.pos = { ...p }; this.emit(); },

  // Mejor lectura de los últimos segundos (para guardar puntos)
  // Usa la lectura más reciente, salvo que otra de hace muy poco sea bastante más precisa
  best(ms = 4000) {
    const now = Date.now();
    const recent = this.history.filter((x) => now - x.t < ms);
    if (!recent.length) return null;
    const last = recent[recent.length - 1];
    const better = recent.reduce((a, b) => (b.acc <= a.acc ? b : a));
    return better.acc < last.acc - 5 ? better : last;
  },
};
