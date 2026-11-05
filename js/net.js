// Comunicación entre móviles con Firebase Realtime Database.
// Si no hay Firebase configurado o no hay internet al crear, funciona en un solo móvil (modo local).
import { FIREBASE_CONFIG } from './config.js';
import { store, uid, sleep } from './util.js';

const FB = 'https://www.gstatic.com/firebasejs/13.1.0/';
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ'; // sin I, O, Q para no confundir
let db = null, api = null, offset = 0;

export const net = {
  enabled: !!(FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL),
  connected: false,
  lastConnected: Date.now(),
  onConn: null,

  async init() {
    if (!this.enabled) return false;
    if (db) return true;
    try {
      const [appM, dbM] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-database.js')]);
      const app = appM.initializeApp(FIREBASE_CONFIG);
      db = dbM.getDatabase(app);
      api = dbM;
      api.onValue(api.ref(db, '.info/connected'), (s) => {
        this.connected = !!s.val();
        if (this.connected) this.lastConnected = Date.now();
        this.onConn && this.onConn(this.connected);
      });
      api.onValue(api.ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
      setTimeout(() => this.cleanupOld(), 5000);
      setInterval(() => { if (this.connected) this.lastConnected = Date.now(); }, 5000);
      return true;
    } catch (e) {
      console.warn('Firebase no disponible', e);
      this.enabled = false;
      return false;
    }
  },

  now() { return Date.now() + offset; },
  // Marca de tiempo del servidor (o local)
  ts(local) { return !local && api ? api.serverTimestamp() : Date.now(); },

  async waitConnected(ms = 8000) {
    const t0 = Date.now();
    while (!this.connected && Date.now() - t0 < ms) await sleep(200);
    return this.connected;
  },

  randomCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    return c;
  },

  // Crea la partida. Devuelve un GameLink (en red o local).
  async createGame(game) {
    if ((await this.init()) && (await this.waitConnected())) {
      for (let i = 0; i < 12; i++) {
        const code = this.randomCode();
        try {
          const s = await api.get(api.ref(db, 'games/' + code));
          if (s.exists()) continue;
        } catch { /* sin permiso = no existe */ }
        try {
          const g = { ...game, created: api.serverTimestamp() };
          await api.set(api.ref(db, 'games/' + code), g);
          return new RemoteLink(code);
        } catch (e) { console.warn('crear', e); }
      }
    }
    const code = this.randomCode();
    store.set('localGame', { code, game: { ...game, created: Date.now() } });
    return new LocalLink(code);
  },

  // ¿Existe la partida?
  async exists(code) {
    if (!(await this.init())) return null;
    if (!(await this.waitConnected(6000))) return null;
    try {
      const s = await api.get(api.ref(db, 'games/' + code));
      return s.exists();
    } catch { return false; }
  },

  link(code, local) {
    return local ? new LocalLink(code) : new RemoteLink(code);
  },

  // Cada móvil apunta las partidas en las que ha estado
  remember(code) {
    const h = store.get('history', []).filter((x) => x.code !== code);
    h.push({ code, t: Date.now() });
    store.set('history', h.slice(-30));
  },

  // Borra las partidas de hace más de un día en las que estuvo este móvil
  // (las reglas de seguridad solo permiten borrar partidas de más de 24 h)
  async cleanupOld() {
    if (!db) return;
    const old = Date.now() - 26 * 3600000;
    const h = store.get('history', []);
    const keep = [];
    for (const x of h) {
      if (x.t > old) { keep.push(x); continue; }
      try {
        await api.remove(api.ref(db, 'games/' + x.code));
      } catch {
        // ya no existe, o es una partida nueva con el mismo código: se olvida
      }
    }
    store.set('history', keep);
  },
};

class RemoteLink {
  constructor(code) { this.code = code; this.local = false; this.unsub = null; }
  subscribe(cb) {
    net.remember(this.code);
    const cached = store.get('cache_' + this.code);
    if (cached) setTimeout(() => cb(cached, true), 0);
    net.init().then(() => {
      if (!db) return;
      this.unsub = api.onValue(
        api.ref(db, 'games/' + this.code),
        (s) => {
          const v = s.val();
          if (v) store.set('cache_' + this.code, v);
          cb(v, false);
        },
        () => cb(null, false)
      );
    });
  }
  set(path, val) {
    if (!db) return;
    api.set(api.ref(db, `games/${this.code}/${path}`), val).catch((e) => console.warn('set', path, e));
  }
  push(path, val) {
    if (!db) return;
    api.push(api.ref(db, `games/${this.code}/${path}`), val).catch((e) => console.warn('push', path, e));
  }
  close() { if (this.unsub) this.unsub(); this.unsub = null; }
}

class LocalLink {
  constructor(code) { this.code = code; this.local = true; this.cb = null; }
  get data() { const d = store.get('localGame'); return d && d.code === this.code ? d.game : null; }
  subscribe(cb) { this.cb = cb; setTimeout(() => cb(this.data, false), 0); }
  _write(path, val) {
    const d = store.get('localGame');
    if (!d || d.code !== this.code) return;
    const parts = path.split('/');
    let o = d.game;
    for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = val;
    store.set('localGame', d);
    if (this.cb) { const cb = this.cb; setTimeout(() => cb(this.data, false), 0); }
  }
  set(path, val) { this._write(path, val); }
  push(path, val) { this._write(path + '/' + uid(10), val); }
  close() { this.cb = null; }
}
