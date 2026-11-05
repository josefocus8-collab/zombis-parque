// La Niebla del Parque — programa principal
import { $, $$, h, store, uid, sleep, vibrate, fmtTime, distM, bearingDeg, offsetLatLng, esc, rand, pick, dirName, motionMeter, clamp } from './util.js';
import { audio } from './audio.js';
import { geo } from './geo.js';
import { net } from './net.js';
import * as story from './story.js';
import { STATIONS, ROLES, FEAR_NAMES, NAV_HINTS, N_ING, FINAL } from './story.js';
import { AR } from './ar.js';
import * as CH from './challenges.js';
import { preloadZombies } from './models.js';
import qrcode from 'https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.mjs';

const GAME_MS = 20 * 60000;
const ARRIVE_M = 12;
const MIN_SEP = 25;
const app = $('#app');
const ar = new AR();
const params = new URLSearchParams(location.search);
if (params.has('noxr')) ar.noXR = true;
// Modo diagnóstico: ?diag=1 lo activa (se recuerda), ?diag=0 lo quita
if (params.has('diag')) store.set('diag', params.get('diag') !== '0');
ar.diagOn = !!store.get('diag', false);

const S = { me: null, link: null, g: null, view: null, local: null, cleanup: [], abort: null, hints: [], hintIdx: 0, timers: [] };
S.me = store.get('me');
if (!S.me || !/^[a-z0-9]{12}$/.test(S.me.id)) { S.me = { id: uid(12), nick: story.randomNick() }; store.set('me', S.me); }

// ---------- utilidades de pantalla ----------
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* no disponible */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.link) keepAwake(); });
document.addEventListener('click', () => { audio.unlock(); if (S.link) keepAwake(); }, true);

function host() { return document.body.classList.contains('ar-open') ? $('#ar-ui') : $('#overlay'); }

function modal(html, { buttons = [{ label: 'Cerrar' }], cls = '' } = {}) {
  const m = h(`<div class="modal ${cls}"><div class="modal-box noxr">${html}<div class="modal-btns">${buttons.map((b, i) => `<button data-i="${i}" class="${b.cls || ''}">${b.label}</button>`).join('')}</div></div></div>`);
  host().append(m);
  return new Promise((res) => {
    m.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) { m.remove(); res(+b.dataset.i); }
    });
  });
}

function toast(t, ms = 3500) {
  if (ar.active) { ar.toast(t, ms); return; }
  let el = $('#toast');
  if (!el) { el = h('<div id="toast"></div>'); $('#overlay').append(el); }
  el.innerHTML = t;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

function setHints(list) { S.hints = list || []; S.hintIdx = 0; }
function showHint() {
  audio.unlock();
  const hs = S.hints;
  if (!hs.length) { toast('Aquí no hay pistas. ¡Leed bien el mensaje!'); return; }
  const item = hs[Math.min(S.hintIdx, hs.length - 1)];
  S.hintIdx++;
  const text = typeof item === 'string' ? item : typeof item.text === 'function' ? item.text() : item.text;
  if (item.action) item.action();
  audio.tone(660, 0.12, 'sine', 0.2);
  const n = Math.min(S.hintIdx, hs.length);
  if (ar.active) ar.toast('💡 ' + text, 7000);
  else modal(`<div class="center"><div class="ch-icon">💡</div><p class="big">${text}</p><p class="muted">Pista ${n} de ${hs.length}</p></div>`, { buttons: [{ label: '¡Entendido!', cls: 'green' }] });
}
$('#ar-hint').addEventListener('click', showHint);

function qrSVG(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}
const joinUrl = (code) => location.origin + location.pathname + '?p=' + code;

function typeText(el, text, signal) {
  return new Promise((res) => {
    let i = 0;
    el.textContent = '';
    const iv = setInterval(() => {
      if (signal && signal.aborted) { clearInterval(iv); return res(); }
      i += 2;
      el.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(iv); res(); }
    }, 35);
    el.onclick = () => { i = text.length; };
  });
}

function setFearClass(f) {
  document.body.classList.remove('fear1', 'fear2', 'fear3');
  if (f) document.body.classList.add('fear' + f);
}

// ---------- estado de la partida ----------
const saveLocal = () => store.set('local_' + S.link.code, S.local);
const now = () => (S.link && !S.link.local ? net.now() : Date.now());
const station = (g) => { for (let s = 1; s <= FINAL; s++) if (!(g.solved && g.solved[s])) return s; return FINAL + 1; };
const penalties = (g) => Object.values(g.penalties || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const remaining = (g) => (g.startedAt ? g.startedAt + GAME_MS - penalties(g) - (g.finished || now()) : GAME_MS);
const ING = Array.from({ length: N_ING }, (_, i) => i + 1);
const solvedCount = (g) => ING.filter((s) => g.solved && g.solved[s]).length;

function players(g, onlyActive) {
  const t = now();
  return Object.entries(g.players || {})
    .map(([id, p]) => ({ id, ...p }))
    .filter((p) => !onlyActive || p.id === S.me.id || t - (p.seen || 0) < 90000)
    .sort((a, b) => (a.joined || 0) - (b.joined || 0) || a.id.localeCompare(b.id));
}
function roleOf(g, id) {
  const i = players(g).findIndex((p) => p.id === id);
  return ROLES[(i < 0 ? 0 : i) % ROLES.length];
}
const offlineSolo = () => S.link && !S.link.local && Date.now() - net.lastConnected > 60000;
function digitOwner(g, i) {
  const act = players(g, true);
  if (act.length <= 1 || offlineSolo()) return { id: S.me.id, nick: S.me.nick };
  return act[i % act.length];
}

function genTestPoints(base) {
  const pts = [];
  for (let i = 0; i < FINAL; i++) {
    const a = (i / FINAL) * Math.PI * 2;
    pts.push(offsetLatLng(base, Math.sin(a) * 60, Math.cos(a) * 60));
  }
  return pts;
}
function centroid(pts) {
  return { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length };
}

// ---------- pantallas fuera de la partida ----------
function showHome() {
  setFearClass(0);
  const cur = store.get('current');
  // Botón rápido: último parque usado (o el único que haya)
  const parks = store.get('parks', []).filter((p) => p.points.length >= FINAL);
  const quick = parks.find((p) => p.id === store.get('parkSel')) || (parks.length === 1 ? parks[0] : null);
  app.innerHTML = `
    <div class="title-wrap">
      <div class="title-zombie">🧟</div>
      <h1 class="blood drip">La Niebla<br>del Parque</h1>
      <p class="center muted">Escape room de zombis para el parque</p>
    </div>
    ${cur ? `<button class="green" id="b-resume">↩️ Volver a la partida ${esc(cur.code)}</button>` : ''}
    ${quick ? `<button class="primary big-play" id="b-play">▶️ Jugar<small>${esc(quick.name)} · nivel ${FEAR_NAMES[store.get('fear', 3)]}</small></button>` : ''}
    <button class="${quick ? '' : 'primary'}" id="b-create">🧟 ${quick ? 'Otra partida (cambiar parque o miedo)' : 'Crear partida'}</button>
    <button id="b-join">📲 Unirme a una partida</button>
    <div class="spacer"></div>
    <div class="panel">
      <p class="muted">Para el adulto</p>
      <div class="row"><button id="b-prep" class="small">📍 Modo preparar</button><button id="b-test" class="small">🏠 Prueba en casa</button></div>
      <button id="b-help" class="small wide">❓ Cómo se juega</button>
    </div>`;
  if (cur) $('#b-resume').onclick = () => enterGame(net.link(cur.code, cur.local));
  $('#b-create').onclick = () => showCreate(false);
  if (quick) $('#b-play').onclick = async () => { $('#b-play').disabled = true; $('#b-play').firstChild.textContent = '⏳ Creando…'; await createAndEnter(false, quick, store.get('fear', 3)); };
  $('#b-join').onclick = () => showJoin('');
  $('#b-prep').onclick = showPrep;
  $('#b-test').onclick = () => showCreate(true);
  $('#b-help').onclick = showHelp;
}

function showHelp() {
  app.innerHTML = `
    <h2>❓ Cómo se juega</h2>
    <div class="panel">
      <p><b>1.</b> Un adulto prepara el parque con el <b>Modo preparar</b>: camina y guarda 4 puntos separados al menos 25 m.</p>
      <p><b>2.</b> Ese móvil pulsa <b>Crear partida</b>. Los demás escanean el QR o escriben el código de 4 letras.</p>
      <p><b>3.</b> Cuando estéis todos, pulsad <b>Empezar la historia</b>. Tenéis 20 minutos.</p>
      <p><b>4.</b> Usad el radar o la brújula para llegar a cada punto y superad la prueba.</p>
      <p><b>5.</b> Al final, en la mesa del laboratorio, tocad los 3 ingredientes para echarlos en el caldero y crear el antídoto.</p>
      <p>💡 Si os atascáis, pulsad <b>Pista</b>.</p>
    </div>
    <button id="b-sheet" class="small wide">📄 Hoja de instrucciones para el adulto</button>
    <button id="b-back">⬅️ Volver</button>`;
  $('#b-sheet').onclick = () => { location.href = 'instrucciones.html'; };
  $('#b-back').onclick = showHome;
}

function showJoin(prefill, auto) {
  app.innerHTML = `
    <h2>📲 Unirme a una partida</h2>
    <p>Escanea el QR del móvil que creó la partida con la cámara, o escribe aquí el código de 4 letras:</p>
    <input class="code-input" id="j-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(prefill || '')}">
    <button class="primary" id="j-go">Entrar ➡️</button>
    <p id="j-msg" class="center big"></p>
    <div class="spacer"></div>
    <button id="b-back" class="small">⬅️ Volver</button>`;
  const inp = $('#j-code');
  inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z]/g, ''); };
  $('#b-back').onclick = showHome;
  const go = async () => {
    const code = inp.value.toUpperCase();
    const msg = $('#j-msg');
    if (!/^[A-Z]{4}$/.test(code)) { msg.textContent = 'El código tiene 4 letras.'; return; }
    const lg = store.get('localGame');
    if (lg && lg.code === code) { enterGame(net.link(code, true)); return; }
    if (!net.enabled) { msg.textContent = 'Este juego todavía no tiene conexión entre móviles.'; return; }
    msg.textContent = 'Buscando la partida…';
    $('#j-go').disabled = true;
    const ok = await net.exists(code);
    $('#j-go').disabled = false;
    if (ok === null) msg.textContent = '📡 No hay internet. Comprueba los datos móviles y prueba otra vez.';
    else if (!ok) msg.textContent = '❌ No existe ninguna partida con ese código.';
    else enterGame(net.link(code, false));
  };
  $('#j-go').onclick = go;
  if (auto && prefill) go();
}

function quickPos(ms) {
  geo.startReal();
  return new Promise((res) => {
    if (geo.realPos) return res(geo.realPos);
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (geo.realPos || Date.now() - t0 > ms) { clearInterval(iv); res(geo.realPos || null); }
    }, 200);
  });
}

function showCreate(test) {
  const parks = store.get('parks', []).filter((p) => p.points.length >= FINAL);
  let fear = store.get('fear', 3);
  let parkId = store.get('parkSel');
  if (!parks.find((p) => p.id === parkId)) parkId = parks[0] && parks[0].id;
  app.innerHTML = `
    <h2>${test ? '🏠 Prueba en casa' : '🧟 Nueva partida'}</h2>
    ${test ? '<div class="panel"><p>Los 4 puntos se inventan alrededor de ti y podrás «caminar» con botones. Otros móviles también pueden unirse para probar.</p></div>'
      : parks.length ? `<div class="panel"><p class="muted">Parque</p>${parks.map((p) => `<button class="opt park ${p.id === parkId ? 'sel' : ''}" data-id="${p.id}">🌳 ${esc(p.name)}</button>`).join('')}</div>`
      : '<div class="panel"><p class="big">No hay ningún parque preparado.</p><p>Un adulto tiene que ir antes al parque con el <b>Modo preparar</b> y guardar 4 puntos.</p><button id="c-prep">📍 Ir al Modo preparar</button></div>'}
    <div class="panel">
      <p class="muted">Nivel de miedo</p>
      <div class="fear-opts">
        <button class="opt fear" data-f="1">😊<br>Suave<small>sin sangre, solo suspense</small></button>
        <button class="opt fear" data-f="2">😨<br>Miedo<small>heridas y sustos medidos</small></button>
        <button class="opt fear" data-f="3">😱<br>Terror<small>sangre, sustos y mordiscos</small></button>
      </div>
    </div>
    <button class="primary" id="c-go" ${!test && !parks.length ? 'disabled' : ''}>Crear partida ➡️</button>
    <p id="c-msg" class="center"></p>
    <button id="b-back" class="small">⬅️ Volver</button>`;
  const selFear = () => $$('.fear').forEach((b) => b.classList.toggle('sel', +b.dataset.f === fear));
  selFear();
  $$('.fear').forEach((b) => { b.onclick = () => { fear = +b.dataset.f; store.set('fear', fear); selFear(); }; });
  $$('.park').forEach((b) => { b.onclick = () => { parkId = b.dataset.id; store.set('parkSel', parkId); $$('.park').forEach((x) => x.classList.toggle('sel', x === b)); }; });
  if ($('#c-prep')) $('#c-prep').onclick = showPrep;
  $('#b-back').onclick = showHome;
  $('#c-go').onclick = async () => {
    $('#c-go').disabled = true;
    $('#c-msg').textContent = 'Creando la partida…';
    await createAndEnter(test, parks.find((p) => p.id === parkId), fear);
  };
}

// Crea la partida y entra (lo usan «Crear partida» y el botón rápido «Jugar»)
async function createAndEnter(test, park, fear) {
  audio.unlock();
  let points;
  if (test) {
    const base = (await quickPos(3000)) || { lat: 40.4168, lng: -3.7038 };
    points = genTestPoints(base);
  } else {
    points = park.points.slice(0, FINAL).map((p) => ({ lat: p.lat, lng: p.lng }));
  }
  const code = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('');
  const link = await net.createGame({ startedAt: 0, fear, test: !!test, code, points });
  store.del('local_' + link.code);
  enterGame(link, { creator: true });
  if (link.local && net.enabled) toast('📡 No hay internet: la partida será solo en este móvil.', 6000);
}

// ---------- Modo preparar ----------
function showPrep() {
  geo.stopSim();
  geo.startReal();
  let draft = store.get('prepDraft', { name: '', points: [] });
  const save = () => store.set('prepDraft', draft);
  const draw = () => {
    const parks = store.get('parks', []);
    app.innerHTML = `
      <h2>📍 Modo preparar</h2>
      <div class="panel">
        <p>Camina por el parque y pulsa <b>Guardar este punto</b> en cada sitio donde quieras una prueba. Hacen falta <b>4 puntos</b>, separados al menos <b>25 m</b>. Mejor si forman un recorrido en círculo y lejos de calles.</p>
        <p id="p-gps" class="big center">📡 Buscando GPS…</p>
      </div>
      <button class="primary" id="p-save" ${draft.points.length >= FINAL ? 'disabled' : ''}>📍 Guardar este punto (${draft.points.length}/${FINAL})</button>
      <div class="panel"><ol class="pts">${draft.points.map((p, i) => `<li>Punto ${i + 1} <span class="muted">(±${Math.round(p.acc)} m)</span> <span class="pd" data-i="${i}"></span> <button class="small" data-del="${i}">🗑️</button></li>`).join('') || '<p class="muted">Aún no hay puntos.</p>'}</ol></div>
      <input id="p-name" placeholder="Nombre del parque" value="${esc(draft.name)}" maxlength="30">
      <button class="green" id="p-park" ${draft.points.length < FINAL ? 'disabled' : ''}>💾 Guardar parque</button>
      ${parks.length ? `<div class="panel"><p class="muted">Parques guardados</p>${parks.map((p) => `<div class="park-row"><span>🌳 ${esc(p.name)} (${p.points.length})</span><button class="small" data-redo="${p.id}">✏️ Rehacer</button><button class="small" data-rm="${p.id}">🗑️</button></div>`).join('')}</div>` : ''}
      <button id="b-back" class="small">⬅️ Volver</button>`;
    $('#b-back').onclick = () => { off(); showHome(); };
    $('#p-name').oninput = (e) => { draft.name = e.target.value; save(); };
    $('#p-save').onclick = async () => {
      audio.unlock();
      const b = geo.best() || (geo.realPos && { ...geo.realPos, acc: geo.realAcc });
      if (!b) { toast('📡 Todavía no hay señal GPS. Espera unos segundos al aire libre.'); return; }
      const close = draft.points.map((p, i) => [i, distM(p, b)]).find(([, d]) => d < MIN_SEP);
      if (close) {
        const r = await modal(`<p class="big">⚠️ Este sitio está a ${Math.round(close[1])} m del punto ${close[0] + 1}.</p><p>Los puntos deben estar a 25 m o más para que el GPS no los confunda. Aléjate un poco más.</p>`, { buttons: [{ label: 'Vale, me alejo', cls: 'green' }, { label: 'Guardar igualmente', cls: 'small' }] });
        if (r !== 1) return;
      }
      if (b.acc > 20) toast(`Guardado, pero el GPS no es muy preciso ahora (±${Math.round(b.acc)} m).`, 5000);
      draft.points.push({ lat: b.lat, lng: b.lng, acc: b.acc });
      save();
      audio.chime();
      vibrate(150);
      draw();
    };
    $$('[data-del]').forEach((x) => { x.onclick = () => { draft.points.splice(+x.dataset.del, 1); save(); draw(); }; });
    $('#p-park').onclick = () => {
      const parks2 = store.get('parks', []);
      const name = (draft.name || '').trim() || `Parque ${parks2.length + 1}`;
      const id = draft.id || uid(8);
      const park = { id, name, points: draft.points.slice(0, FINAL) };
      const idx = parks2.findIndex((p) => p.id === id);
      if (idx >= 0) parks2[idx] = park; else parks2.push(park);
      store.set('parks', parks2);
      store.set('parkSel', id);
      draft = { name: '', points: [] };
      save();
      toast(`✅ Parque «${esc(name)}» guardado.`);
      draw();
    };
    $$('[data-redo]').forEach((x) => {
      x.onclick = () => {
        const p = store.get('parks', []).find((q) => q.id === x.dataset.redo);
        draft = { id: p.id, name: p.name, points: [] };
        save();
        toast('Vuelve a guardar los 4 puntos de este parque.');
        draw();
      };
    });
    $$('[data-rm]').forEach((x) => {
      x.onclick = async () => {
        if ((await modal('<p class="big">¿Borrar este parque?</p>', { buttons: [{ label: 'Sí, borrar', cls: 'primary' }, { label: 'No' }] })) !== 0) return;
        store.set('parks', store.get('parks', []).filter((p) => p.id !== x.dataset.rm));
        draw();
      };
    });
    upd(geo);
  };
  const upd = (gg) => {
    const el = $('#p-gps');
    if (!el) return;
    if (gg.error === 'denied') el.innerHTML = '⚠️ Has bloqueado la ubicación. Actívala en los ajustes de Chrome para esta web.';
    else if (!gg.realPos) el.textContent = '📡 Buscando GPS…';
    else el.innerHTML = gg.realAcc <= 10 ? `✅ GPS bueno (±${Math.round(gg.realAcc)} m)` : gg.realAcc <= 20 ? `🙂 GPS aceptable (±${Math.round(gg.realAcc)} m)` : `⏳ GPS poco preciso (±${Math.round(gg.realAcc)} m). Espera un poco…`;
    $$('.pd').forEach((s) => { if (gg.realPos) s.textContent = `· a ${Math.round(distM(gg.realPos, draft.points[+s.dataset.i]))} m`; });
  };
  const off = geo.on(upd);
  draw();
}

// ---------- dentro de la partida ----------
function enterGame(link, opts = {}) {
  exitGameQuiet();
  S.link = link;
  store.set('current', { code: link.code, local: link.local });
  S.local = store.get('local_' + link.code) || { intro: false, story: {}, reward: {}, ch: {}, joinedLate: false, finalScare: false };
  if (opts.creator) S.local.creator = true;
  saveLocal();
  S.view = null;
  S.g = null;
  S.registered = false;
  buildShell();
  history.replaceState(null, '', location.pathname);
  link.subscribe((g, cached) => onGame(g, cached));
  S.timers.push(setInterval(tick, 1000));
  S.timers.push(setInterval(() => { if (S.registered && S.link) S.link.set(`players/${S.me.id}/seen`, net.ts(S.link.local)); }, 20000));
  net.onConn = () => updateHud();
}

function exitGameQuiet() {
  leaveView();
  if (S.link) S.link.close();
  S.timers.forEach(clearInterval);
  S.timers = [];
  S.link = null;
  S.g = null;
  S.view = null;
  audio.stopAll();
  ar.close();
  $('#overlay').innerHTML = '';
}
function exitGame() {
  exitGameQuiet();
  store.del('current');
  geo.stopSim();
  showHome();
}

function onGame(g, cached) {
  if (!S.link) return;
  if (!g) {
    if (cached) return;
    if (!S.link.local && !net.connected && S.g) return;
    exitGame();
    toast('Esa partida ya no existe.');
    return;
  }
  const first = !S.g;
  S.g = g;
  if (first) {
    setFearClass(g.fear);
    if (g.test) { if (!geo.sim) geo.startSim(S.local.simPos || centroid(g.points)); } else { geo.stopSim(); geo.startReal(); }
  }
  if (!S.registered && !cached) {
    S.registered = true;
    const mine = g.players && g.players[S.me.id];
    if (!mine) {
      // Primero marcar la llegada tardía: al escribir, Firebase avisa al instante y se vuelve a dibujar
      if (g.startedAt) {
        S.local.joinedLate = true;
        for (let s = 1; s <= FINAL; s++) if (g.solved && g.solved[s]) { S.local.story[s] = true; S.local.reward[s] = true; }
        saveLocal();
      }
      S.link.set(`players/${S.me.id}`, { nick: S.me.nick, joined: net.ts(S.link.local), seen: net.ts(S.link.local) });
    } else S.link.set(`players/${S.me.id}/seen`, net.ts(S.link.local));
  }
  render();
}

function buildShell() {
  app.innerHTML = `
    <header id="hud" class="hud">
      <div class="timer" id="h-timer">45:00</div>
      <div class="ings" id="h-ings">${ING.map((s) => `<span data-s="${s}">${STATIONS[s].ing.icon}</span>`).join('')}</div>
      <div class="dot" id="h-dot"></div>
      <button class="small icon" id="h-menu" aria-label="Menú">⚙️</button>
    </header>
    <section id="stage" class="stage"></section>
    <footer id="foot" class="foot">
      <button id="f-hint" class="hintbtn">💡 Pista</button>
    </footer>`;
  $('#h-menu').onclick = openMenu;
  $('#f-hint').onclick = showHint;
}

function viewKey(g) {
  const st = station(g);
  if (!g.startedAt) return 'lobby';
  if (g.finished || st > FINAL) return 'win';
  if (remaining(g) <= 0) return 'lose';
  if (!S.local.intro) return 'intro';
  for (let s = 1; s <= N_ING; s++) if (g.solved && g.solved[s] && !S.local.reward[s]) return 'reward-' + s;
  // nav 'none': la propia prueba guía con la cámara (huellas, radar con zombis)
  if (STATIONS[st].nav !== 'none' && !(g.arrived && g.arrived[st])) return 'nav-' + st;
  return 'ch-' + st + '-' + (S.local.ch[st] || 0);
}

function render() {
  const g = S.g;
  if (!g || !S.link) return;
  const key = viewKey(g);
  if (key !== S.view) {
    leaveView();
    S.view = key;
    enterView(key);
  } else if (S.update) S.update();
  updateHud();
}

function leaveView() {
  if (S.abort) S.abort.abort();
  S.abort = null;
  S.cleanup.forEach((f) => { try { f(); } catch { /* nada */ } });
  S.cleanup = [];
  S.update = null;
  audio.stopSpeak();
  audio.heartbeat(0);
}

function enterView(key) {
  const [name, a, b] = key.split('-');
  S.abort = new AbortController();
  setHints([]);
  const st = $('#stage');
  st.innerHTML = '';
  st.className = 'stage view-' + name;
  $('#foot').hidden = ['lobby', 'intro', 'win', 'lose', 'reward'].includes(name);
  $('#app').scrollTop = 0;
  const views = { lobby: viewLobby, intro: viewIntro, story: viewStory, nav: viewNav, ch: viewChallenge, reward: viewReward, final: viewFinal, win: viewWin, lose: viewLose };
  views[name](st, +a, +b);
}

function updateHud() {
  const g = S.g;
  if (!g || !$('#hud')) return;
  const r = remaining(g);
  const t = $('#h-timer');
  t.textContent = g.startedAt ? fmtTime(r) : '45:00';
  t.classList.toggle('low', g.startedAt && r < 3 * 60000);
  document.body.classList.toggle('fog-heavy', !!g.startedAt && r < 3 * 60000 && !g.finished);
  $$('#h-ings span').forEach((s) => s.classList.toggle('got', !!(g.solved && g.solved[s.dataset.s])));
  const dot = $('#h-dot');
  dot.hidden = S.link.local;
  dot.className = 'dot ' + (net.connected ? 'on' : 'off');
  dot.title = net.connected ? 'Conectado' : 'Sin conexión (sigues jugando)';
  if (ar.active) $('#ar-timer').textContent = g.startedAt ? '⏳ ' + fmtTime(r) : '';
}

function tick() {
  if (!S.g) return;
  updateHud();
  const k = viewKey(S.g);
  if (k !== S.view && (k === 'lose' || S.view === 'lose')) render();
  if (S.update) S.update();
}

// ---------- vistas ----------
function viewLobby(st) {
  const g = S.g, code = S.link.code;
  st.innerHTML = `
    <div class="panel center">
      <p class="muted">Código de la partida</p>
      <div class="code-big">${code}</div>
      ${S.link.local
        ? `<p class="warn">⚠️ Partida de un solo móvil (${net.enabled ? 'no había internet al crearla' : 'falta conectar la base de datos'}).</p>`
        : `<div class="qr">${qrSVG(joinUrl(code))}</div><p>Los demás: escanead este QR con la cámara del móvil o escribid el código.</p>`}
    </div>
    <div class="panel"><h3>Patrulla Antídoto (<span id="l-n">1</span>)</h3><ul class="players" id="l-players"></ul></div>
    <p class="center">Nivel de miedo: <b>${FEAR_NAMES[g.fear]}</b>${g.test ? ' · 🏠 Prueba en casa' : ''}</p>
    <button class="primary" id="l-start">▶️ ¡Empezar la historia!</button>
    <p class="muted center">Pulsadlo cuando estéis todos. Después también se puede entrar.</p>`;
  $('#l-start').onclick = () => { audio.unlock(); keepAwake(); S.link.set('startedAt', net.ts(S.link.local)); };
  S.update = () => {
    const ps = players(S.g);
    $('#l-n').textContent = ps.length;
    $('#l-players').innerHTML = ps.map((p) => `<li>${p.id === S.me.id ? '⭐' : '🧒'} <b>${esc(p.nick)}</b> <span class="muted">· ${roleOf(S.g, p.id)}</span>${p.id === S.me.id ? ' <span class="muted">(tú)</span>' : ''}</li>`).join('');
  };
  S.update();
}

function radioView(st, title, text, { onDone, btnLabel, creepy } = {}) {
  st.innerHTML = `
    <div class="panel radio">
      <div class="ch-icon">📻</div>
      <h2>${title}</h2>
      <p class="big typed"></p>
    </div>
    <button class="primary" id="i-play">🔊 Escuchar el mensaje</button>
    <button id="i-next" class="green" hidden>${btnLabel || 'Continuar ➡️'}</button>`;
  const signal = S.abort.signal;
  const play = async () => {
    audio.unlock();
    keepAwake();
    $('#i-play').hidden = true;
    audio.radio(0.8);
    audio.drone(0.35);
    setTimeout(() => { if (!signal.aborted) $('#i-next').hidden = false; }, 2500);
    const typed = typeText($('.typed', st), text, signal);
    await sleep(500);
    if (signal.aborted) return;
    await Promise.all([typed, audio.speak(text, { creepy: !!creepy && S.g.fear >= 2 })]);
    if (signal.aborted) return;
    if (creepy && S.g.fear >= 3) audio.growl(0.5);
    $('#i-play').hidden = false;
    $('#i-play').textContent = '🔁 Repetir';
  };
  $('#i-play').onclick = play;
  $('#i-next').onclick = () => { audio.stopSpeak(); audio.click(); onDone(); };
  if (navigator.userActivation && navigator.userActivation.hasBeenActive) play();
  else $('.typed', st).textContent = text;
}

function viewIntro(st) {
  const g = S.g;
  const late = S.local.joinedLate;
  const text = late ? story.lateText(g.fear, solvedCount(g), Math.ceil(remaining(g) / 60000)) : story.introText(g.fear);
  radioView(st, late ? '¡Bienvenido a la Patrulla!' : 'Mensaje del Doctor Moho', text, {
    btnLabel: '¡Vamos! ➡️',
    onDone: () => { S.local.intro = true; S.local.story[1] = !late; saveLocal(); render(); },
  });
  st.insertAdjacentHTML('beforeend', `<div class="panel center"><p>Tu nombre en clave: <b>${esc(S.me.nick)}</b></p><p>Tu rol: <b>${roleOf(g, S.me.id)}</b></p></div>`);
}

function viewStory(st, s) {
  const g = S.g;
  radioView(st, s === 7 ? '¡Todos los ingredientes!' : `Pista ${s}: mensaje del Doctor`, story.stationText(s, g.fear), {
    btnLabel: s === 7 ? '🧪 ¡Al laboratorio!' : '🗺️ ¡En marcha!',
    creepy: s >= 4,
    onDone: () => { S.local.story[s] = true; saveLocal(); render(); },
  });
}

const TEMPS = [
  [80, '🧊 Congelado', '#5ab0ff'],
  [50, '❄️ Frío', '#8fd3ff'],
  [30, '🌤️ Templado', '#ffd23f'],
  [15, '🔥 Caliente', '#ff8a3d'],
  [0, '🌋 ¡ARDIENDO!', '#ff2d2d'],
];

function viewNav(st, s) {
  const g = S.g;
  const target = g.points[s - 1];
  const type = STATIONS[s].nav;
  const act = players(g, true);
  const leader = act[(s - 1) % act.length] || { id: S.me.id, nick: S.me.nick };
  const leadTxt = act.length <= 1 ? '' : leader.id === S.me.id ? `👑 ¡Te toca dirigir! Lleva al equipo con ${type === 'radar' ? 'el radar' : 'la brújula'}.` : `👑 Dirige <b>${esc(leader.nick)}</b>. ¡Seguidle y ayudadle!`;
  let showDirUntil = 0;
  const msg = story.stationText(s, g.fear);
  st.innerHTML = `
    <div class="nav-head center">
      <h2>${s === FINAL ? '🧪 Al laboratorio' : `Ingrediente ${s} de ${N_ING}`}</h2>
      ${leadTxt ? `<p class="lead">${leadTxt}</p>` : ''}
    </div>
    <div class="panel radio nav-msg" id="n-msg" role="button" tabindex="0">📻 <span>${esc(msg.replace(/…?\s*ksshh\s*…?/gi, '').trim())}</span> <small class="muted">🔁</small></div>
    ${type === 'radar'
      ? `<div class="radar" id="n-radar"><div class="sweep"></div><div class="rings"></div><div class="blip"></div><div class="target" hidden></div><div class="dir-arrow" hidden>⬆</div></div>`
      : `<div class="compass" id="n-compass"><div class="rose"><span class="n">N</span></div><div class="needle">⬆</div></div>`}
    <p class="nav-status center" id="n-status">…</p>
    <p class="muted center" id="n-gps"></p>
    ${g.test ? `
    <div class="panel test-ctl">
      <p class="muted center">🏠 Simulador de paseo</p>
      <div class="dpad">
        <button data-m="n">⬆️</button><button data-m="w">⬅️</button><button data-m="e">➡️</button><button data-m="s">⬇️</button>
      </div>
      <div class="row"><button class="small" data-m="tl">↺ Girar</button><button class="small" data-m="jump">⏩ Ir al punto</button><button class="small" data-m="tr">Girar ↻</button></div>
    </div>` : ''}`;
  // El Doctor habla aquí mismo (sin pantalla aparte). Tocar el mensaje lo repite.
  const sayIt = () => { audio.unlock(); audio.radio(0.5); audio.speak(msg, { creepy: s >= 3 && g.fear >= 2 }); };
  $('#n-msg', st).onclick = sayIt;
  if (!S.local.story[s]) {
    S.local.story[s] = true;
    saveLocal();
    if (s !== 1 || S.local.joinedLate) setTimeout(() => { if (S.view === 'nav-' + s) sayIt(); }, 400);
  }
  setHints([
    ...NAV_HINTS[type],
    {
      text: () => geo.pos ? `El punto está a unos ${Math.max(5, Math.round(distM(geo.pos, target) / 5) * 5)} metros, hacia el ${dirName(bearingDeg(geo.pos, target))}.${type === 'radar' ? ' La flecha del radar os lo enseña un momento.' : ''}` : 'Esperad a que el GPS encuentre la señal.',
      action: () => { showDirUntil = Date.now() + 15000; },
    },
  ]);
  if (g.test) {
    $$('.test-ctl [data-m]', st).forEach((b) => {
      b.onclick = () => {
        const m = b.dataset.m;
        if (m === 'n') geo.move(0, 5);
        if (m === 's') geo.move(0, -5);
        if (m === 'e') geo.move(5, 0);
        if (m === 'w') geo.move(-5, 0);
        if (m === 'tl') geo.turn(-30);
        if (m === 'tr') geo.turn(30);
        if (m === 'jump') geo.teleport(offsetLatLng(target, 2, 2));
        S.local.simPos = geo.pos;
        saveLocal();
      };
    });
  }
  let arrived = false, lastPulse = 0, d = Infinity, dotAngle = null, lastSweep = 0;
  const update = () => {
    const status = $('#n-status', st), gps = $('#n-gps', st);
    if (!status) return;
    if (!geo.pos) {
      status.innerHTML = geo.error === 'denied' ? '⚠️ Hay que permitir la ubicación' : '📡 Buscando GPS…';
      gps.textContent = geo.error === 'denied' ? 'Pulsa el candado 🔒 junto a la dirección web y activa «Ubicación».' : 'Sal al aire libre y espera unos segundos.';
      return;
    }
    d = distM(geo.pos, target);
    const brg = bearingDeg(geo.pos, target);
    gps.textContent = geo.acc > 25 ? `📡 Señal GPS débil (±${Math.round(geo.acc)} m)` : '';
    if (type === 'radar') {
      const [, label, color] = TEMPS.find(([lim]) => d > lim) || TEMPS[TEMPS.length - 1];
      status.innerHTML = `<span style="color:${color}">${label}</span>`;
      const rad = $('#n-radar', st);
      rad.style.setProperty('--heat', color);
      rad.style.setProperty('--speed', clamp(d / 30, 0.5, 3) + 's');
      const arr = $('.dir-arrow', rad);
      arr.hidden = Date.now() > showDirUntil;
      arr.style.transform = `rotate(${brg - (geo.heading || 0)}deg)`;
      // punto del objetivo: dirección real y, cuanto más lejos, más hacia el borde
      dotAngle = ((brg - (geo.heading || 0)) % 360 + 360) % 360;
      const r = clamp(d / 100, 0.15, 0.9) * 50;
      const dot = $('.target', rad);
      dot.hidden = false;
      dot.style.left = 50 + Math.sin((dotAngle * Math.PI) / 180) * r + '%';
      dot.style.top = 50 - Math.cos((dotAngle * Math.PI) / 180) * r + '%';
    } else {
      const rel = brg - (geo.heading || 0);
      $('.needle', st).style.transform = `rotate(${rel}deg)`;
      $('.rose', st).style.transform = `rotate(${-(geo.heading || 0)}deg)`;
      status.innerHTML = `<b>${Math.round(d)} m</b>${geo.heading == null ? '<br><small>Mueve el móvil haciendo un 8 para que funcione la brújula</small>' : ''}`;
    }
    const radius = Math.max(ARRIVE_M, Math.min(geo.acc || 0, 20));
    if (!arrived && d <= radius) {
      arrived = true;
      audio.chime();
      vibrate([200, 100, 200]);
      S.link.set(`arrived/${s}`, true);
    }
  };
  S.cleanup.push(geo.on(update));
  update();
  // pitidos y vibración del radar
  const pulse = setInterval(() => {
    if (!geo.pos || arrived || type !== 'radar') return;
    const every = clamp(d * 45, 450, 4000);
    if (Date.now() - lastPulse < every) return;
    lastPulse = Date.now();
    audio.beep(clamp(1200 - d * 8, 300, 1200), 0.18);
    vibrate(d < 15 ? [90, 60, 90] : d < 30 ? 70 : 40);
  }, 150);
  S.cleanup.push(() => clearInterval(pulse));
  // barrido del radar: al pasar por encima del objetivo, el punto se enciende y se va apagando
  if (type === 'radar') {
    const sw = setInterval(() => {
      const rad = $('#n-radar', st);
      if (!rad) return;
      const ang = ((performance.now() / 2400) * 360) % 360;
      $('.sweep', rad).style.transform = `rotate(${ang}deg)`;
      if (dotAngle == null) return;
      const diff = (ang - dotAngle + 360) % 360;
      $('.target', rad).style.opacity = Math.max(0.35, 1 - diff / 300);
      $('.target', rad).style.transform = `scale(${diff < 40 ? 1.5 - diff / 80 : 1})`;
      if (diff < lastSweep && !arrived) audio.tone(1500, 0.05, 'sine', 0.08);
      lastSweep = diff;
    }, 40);
    S.cleanup.push(() => clearInterval(sw));
  }
  audio.drone(0.4);
  scheduleScares(s);
  preloadZombies(g.fear); // los zombis se descargan mientras caminan
}

// Sustos mientras se camina
function scheduleScares(s) {
  const g = S.g;
  let t;
  const next = () => {
    const wait = g.fear >= 3 ? rand(55000, 100000) : g.fear >= 2 ? rand(80000, 140000) : rand(90000, 160000);
    t = setTimeout(async () => { if (!S.abort || S.abort.signal.aborted) return; await doScare(); next(); }, wait);
  };
  next();
  S.cleanup.push(() => clearTimeout(t));
}

async function doScare() {
  const f = S.g.fear;
  const opts = f >= 3 ? ['quieto', 'face', 'whisper', 'growl', 'quieto'] : f >= 2 ? ['quieto', 'whisper', 'growl'] : ['growl', 'whisper'];
  const k = pick(opts);
  if (k === 'growl') { audio.growl(0.8, rand(-1, 1), 1.8); toast(f >= 2 ? '🧟 Se oye un gruñido muy cerca…' : '🌫️ Algo se mueve entre los árboles…'); vibrate(200); }
  else if (k === 'whisper') { audio.whisper(); setTimeout(() => audio.whisper(), 1200); toast(f >= 3 ? '👂 «Os… vemos…»' : '👂 ¿Has oído eso?'); }
  else if (k === 'face') await jumpScare();
  else if (k === 'quieto') await freezeEvent();
}

async function jumpScare(text) {
  const el = h(`<div class="scare">${CH.scareFaceSVG(S.g.fear)}${text ? `<p class="big">${text}</p>` : ''}</div>`);
  host().append(el);
  audio.scream(0.9);
  vibrate([300, 80, 400]);
  await sleep(text ? 2600 : 1300);
  el.remove();
  if (!text) toast('😱 ¡Corred!');
}

async function freezeEvent() {
  const f = S.g.fear;
  const el = h(`<div class="freeze"><div class="freeze-box"><div class="ch-icon">🧟</div><h2>¡QUIETOS!</h2><p class="big">${f >= 3 ? 'Un zombi os ha olido. Está justo detrás. NO OS MOVÁIS…' : 'Un zombi os ha oído. ¡No os mováis!'}</p><div class="count">6</div></div></div>`);
  host().append(el);
  vibrate(300);
  audio.heartbeat(130);
  const meter = motionMeter();
  for (let i = 6; i > 0; i--) {
    $('.count', el).textContent = i;
    if (i % 2 === 0) audio.growl(0.4 + (6 - i) * 0.1, rand(-1, 1));
    await sleep(1000);
  }
  meter.stop();
  audio.heartbeat(0);
  const moved = meter.samples > 10 && meter.average > 1.8;
  if (moved) {
    const ms = f >= 3 ? 20000 : 10000;
    S.link.push('penalties', ms);
    audio.bite();
    vibrate([500, 100, 300]);
    el.classList.add('bitten');
    el.querySelector('.freeze-box').innerHTML = `<div class="ch-icon">🩸</div><h2>¡Te ha mordido!</h2><p class="big">Te has movido… Perdéis ${ms / 1000} segundos.</p>`;
  } else {
    el.querySelector('.freeze-box').innerHTML = '<div class="ch-icon">😮‍💨</div><h2>Uff…</h2><p class="big">Se ha ido. ¡Seguid!</p>';
  }
  await sleep(2500);
  el.remove();
}

function viewChallenge(st, s, i) {
  const g = S.g;
  const list = STATIONS[s].ch;
  const name = list[i];
  const signal = S.abort.signal;
  const wrap = h('<div class="ch-wrap"></div>');
  st.append(wrap);
  if (g.test) {
    const sk = h('<button class="small skip">⏭️ Saltar prueba (solo en prueba en casa)</button>');
    sk.onclick = () => finish();
    st.append(sk);
  }
  const ctx = {
    fear: g.fear, ar, audio, signal, test: g.test, toast,
    setHints,
    get players() { return players(S.g, true).length; },
    penalty: (ms) => S.link.push('penalties', ms),
    hordeAdd: () => { const cur = (S.g.horde && S.g.horde[S.me.id]) || 0; S.link.set(`horde/${S.me.id}`, Math.min(100, cur + 1)); },
    hordeTeam: () => Object.values(S.g.horde || {}).reduce((a, b) => a + (Number(b) || 0), 0),
    target: g.points[s - 1],
    arrive: () => { if (!(S.g.arrived && S.g.arrived[s])) S.link.set(`arrived/${s}`, true); },
    isArrived: () => !!(S.g.arrived && S.g.arrived[s]),
  };
  // En los puntos que se buscan con la cámara, el Doctor da el aviso aquí
  if (STATIONS[s].nav === 'none' && !S.local.story[s] && i === 0) {
    S.local.story[s] = true;
    saveLocal();
    setTimeout(() => { if (!signal.aborted) { audio.radio(0.5); audio.speak(story.stationText(s, g.fear), { creepy: s >= 3 && g.fear >= 2 }); } }, 500);
  }
  const finish = () => {
    if (signal.aborted) return;
    if (i + 1 < list.length) { S.local.ch[s] = i + 1; saveLocal(); render(); return; }
    S.link.set(`solved/${s}`, true);
    if (s === FINAL) S.link.set('finished', net.ts(S.link.local));
  };
  audio.drone(0.4);
  Promise.resolve(CH[name](wrap, ctx)).then(finish).catch((e) => { if (e.name !== 'AbortError') console.warn(e); });
}

function myDigitsHtml(g) {
  const out = [];
  for (let i = 0; i < N_ING; i++) {
    const got = g.solved && g.solved[i + 1];
    const o = digitOwner(g, i);
    out.push(`<div class="nd ${got && o.id === S.me.id ? 'mine' : ''}"><small>${i + 1}</small><b>${!got ? '❓' : o.id === S.me.id ? g.code[i] : '👤'}</b><small>${!got ? 'falta' : o.id === S.me.id ? 'tuyo' : esc(o.nick)}</small></div>`);
  }
  return `<div class="nums">${out.join('')}</div>`;
}

function viewReward(st, s) {
  const g = S.g;
  const ing = STATIONS[s].ing;
  st.innerHTML = `
    <div class="panel reward center">
      <div class="ing-big">${ing.icon}</div>
      <h2>¡${ing.name}!</h2>
      <p class="big">${story.rewardText(s, g.fear)}</p>
    </div>
    <button class="primary" id="r-next">Continuar ➡️</button>`;
  audio.chime();
  vibrate([100, 50, 100, 50, 200]);
  setTimeout(() => { if (S.view === 'reward-' + s) audio.speak(story.rewardText(s, g.fear)); }, 900);
  $('#r-next').onclick = () => { S.local.reward[s] = true; saveLocal(); render(); };
}

async function viewFinal(st) {
  const g = S.g;
  const signal = S.abort.signal;
  setHints([
    'Cada móvil tiene algunos números. Pulsad «🔢 Mis números» en todos los móviles y decidlos en voz alta.',
    'El número 1 salió con la seta, el 2 con la pluma, el 3 con la piedra y el 4 con el diente.',
    { text: () => `El primer número del código es ${S.g.code[0]}.` },
  ]);
  st.innerHTML = `
    <div class="panel center">
      <div class="ch-icon">🧳</div>
      <h2>El maletín del antídoto</h2>
      <p>Juntaos todos. Cada uno dice sus números en voz alta. Escribidlos en orden: 1, 2, 3 y 4.</p>
      ${myDigitsHtml(g)}
    </div>
    <div class="kp"></div>`;
  S.update = () => { const n = $('.nums', st); if (n) n.outerHTML = myDigitsHtml(S.g); };
  if (!S.local.finalScare) {
    S.local.finalScare = true;
    saveLocal();
    setTimeout(() => audio.speak(story.finalScareText(g.fear), { creepy: g.fear >= 2 }), 1300);
    await jumpScare(story.finalScareText(g.fear));
    if (signal.aborted) return;
  }
  const kpEl = $('.kp', st);
  kpEl.innerHTML = '';
  let tries = 0;
  const kp = makeCodePad(kpEl, (v) => {
    if (v === S.g.code.slice(0, N_ING)) {
      audio.win();
      S.link.set('solved/7', true);
      S.link.set('finished', net.ts(S.link.local));
    } else {
      tries++;
      audio.wrong();
      if (S.g.fear >= 2) audio.growl(0.8);
      vibrate([200, 80, 200]);
      kp.shake();
      kp.clear();
      toast(tries < 2 ? '❌ ¡Código incorrecto! El Doctor zombi se acerca…' : '❌ Revisad el orden de los números. ¡Rápido!');
    }
  });
}

function makeCodePad(el, onSubmit) {
  let val = '';
  el.innerHTML = `<div class="code-slots">${'<span></span>'.repeat(N_ING)}</div><div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✔'].map((k) => `<button data-k="${k}" class="${k === '✔' ? 'green' : ''}">${k}</button>`).join('')}</div>`;
  const slots = $$('.code-slots span', el);
  const show = () => slots.forEach((s, i) => { s.textContent = val[i] || ''; });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    audio.click();
    const k = b.dataset.k;
    if (k === '⌫') val = val.slice(0, -1);
    else if (k === '✔') { if (val.length === N_ING) onSubmit(val); else toast(`Faltan números: son ${N_ING}.`); return; }
    else if (val.length < N_ING) val += k;
    show();
  });
  return { clear() { val = ''; show(); }, shake() { const c = $('.code-slots', el); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); } };
}

function viewWin(st) {
  const g = S.g;
  const left = g.finished ? g.startedAt + GAME_MS - penalties(g) - g.finished : remaining(g);
  audio.stopAll();
  audio.win();
  setTimeout(() => { if (S.view === 'win') audio.speak(story.winText(g.fear)); }, 1500);
  vibrate([100, 50, 100, 50, 100, 50, 400]);
  document.body.classList.remove('fog-heavy');
  st.innerHTML = `
    <div class="confetti">${Array.from({ length: 40 }, () => `<i style="left:${rand(0, 100)}%;animation-delay:${rand(0, 3)}s;background:hsl(${rand(0, 360)},90%,60%)"></i>`).join('')}</div>
    <div class="panel center win">
      <div class="ing-big">🧪✨</div>
      <h1>¡ANTÍDOTO LISTO!</h1>
      <p class="big">${story.winText(g.fear)}</p>
      ${left > 0 ? `<p>Os han sobrado <b>${fmtTime(left)}</b> minutos.</p>` : ''}
      <p>🏅 Patrulla: ${players(g).map((p) => esc(p.nick)).join(', ')}</p>
    </div>
    <button class="green" id="w-home">🏠 Terminar</button>`;
  $('#w-home').onclick = exitGame;
}

function viewLose(st) {
  const g = S.g;
  audio.drone(0.9);
  audio.growl(0.9);
  setTimeout(() => { if (S.view === 'lose') audio.speak(story.loseText(g.fear)); }, 1200);
  st.innerHTML = `
    <div class="panel center lose">
      <div class="ch-icon">🌫️</div>
      <h1 class="blood">¡La niebla os ha alcanzado!</h1>
      <p class="big">${story.loseText(g.fear)}</p>
    </div>
    <button class="primary" id="l-more">🧪 Usar el frasco de emergencia (+3 minutos)</button>
    <button class="small" id="l-home">🏠 Terminar la partida</button>`;
  $('#l-more').onclick = () => { $('#l-more').disabled = true; S.link.push('penalties', -3 * 60000); audio.sparkle(); };
  $('#l-home').onclick = exitGame;
}

// ---------- menús ----------
async function openMenu() {
  const g = S.g;
  if (!g) return;
  const ps = players(g);
  const t = now();
  const inNav = S.view && S.view.startsWith('nav-');
  const btns = [
    { label: audio.enabled ? '🔇 Quitar sonido' : '🔊 Poner sonido', k: 'snd' },
    ...(inNav ? [{ label: '⏭️ Adulto: ya estamos en el punto', k: 'arrive', cls: 'small' }] : []),
    { label: '🚪 Salir de la partida', k: 'exit', cls: 'small' },
    { label: 'Cerrar', k: 'close', cls: 'green' },
  ];
  const r = await modal(`
    <div class="center">
      <p class="muted">Código para unirse</p>
      <div class="code-big">${S.link.code}</div>
      ${S.link.local ? '<p class="warn">Partida de un solo móvil</p>' : `<div class="qr small-qr">${qrSVG(joinUrl(S.link.code))}</div>`}
      <p>Miedo: <b>${FEAR_NAMES[g.fear]}</b></p>
    </div>
    <ul class="players">${ps.map((p) => `<li>${p.id === S.me.id || t - p.seen < 90000 ? '🟢' : '⚪'} <b>${esc(p.nick)}</b> · ${roleOf(g, p.id)}${p.id === S.me.id ? ' (tú)' : ''}</li>`).join('')}</ul>`, { buttons: btns });
  const k = btns[r] && btns[r].k;
  if (k === 'snd') { audio.setEnabled(!audio.enabled); toast(audio.enabled ? '🔊 Sonido activado' : '🔇 Sonido quitado'); }
  if (k === 'arrive') {
    const ok = await modal('<p class="big">¿Seguro que ya estáis en el punto?</p><p>Úsalo solo si el GPS falla.</p>', { buttons: [{ label: 'Sí, estamos aquí', cls: 'green' }, { label: 'No' }] });
    if (ok === 0 && S.view && S.view.startsWith('nav-')) S.link.set(`arrived/${S.view.split('-')[1]}`, true);
  }
  if (k === 'exit') {
    const ok = await modal('<p class="big">¿Salir de la partida?</p><p>Podrás volver a entrar con el mismo código.</p>', { buttons: [{ label: 'Sí, salir', cls: 'primary' }, { label: 'No' }] });
    if (ok === 0) exitGame();
  }
}

function openNumbers() {
  const g = S.g;
  if (!g) return;
  modal(`<div class="center"><h2>🔢 Números del código</h2><p>Cada ingrediente da un número. Los tuyos salen aquí; los demás los guardan tus compañeros.</p>${myDigitsHtml(g)}</div>`, { buttons: [{ label: 'Cerrar', cls: 'green' }] });
}

// ---------- arranque ----------
function boot() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // Si hay una versión nueva del juego, se instala y la página se recarga sola una vez
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded && !ar.active) { reloaded = true; location.reload(); } });
  }
  const p = (params.get('p') || '').toUpperCase();
  const cur = store.get('current');
  if (/^[A-Z]{4}$/.test(p) && (!cur || cur.code !== p)) { showJoin(p, true); return; }
  if (cur) { enterGame(net.link(cur.code, cur.local)); return; }
  showHome();
}
if (net.enabled) net.init();
boot();

// Para pruebas desde la consola
window.__zp = { S, geo, ar, audio, net, render };
