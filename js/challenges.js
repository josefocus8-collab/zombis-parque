// Las pruebas del juego
import * as THREE from 'three';
import { $, $$, h, rand, randInt, pick, shuffle, sleep, vibrate, onShake, waitClick, abortError, clamp, distM, bearingDeg } from './util.js';
import { makeZombie, makeBackpack, makeHandprint, makeGlowRing, preloadZombies, makeChest, makeBat, makeFootprint, makeIngredient, makeLabTable, preloadDoctor, makeDoctor } from './models.js';
import { geo } from './geo.js';
import * as story from './story.js';

const F = (fear, a, b, c) => (fear >= 3 ? c : fear >= 2 ? b : a);
const biteMs = (fear) => (fear >= 3 ? 20000 : fear >= 2 ? 10000 : 0);

// ---------- Pruebas con cámara ----------
async function arChallenge(el, ctx, info, run) {
  const models = preloadZombies(ctx.fear); // se descargan mientras leen la tarjeta
  for (;;) {
    // Toda la tarjeta es el botón: un solo toque en cualquier parte abre la cámara
    // (el navegador no deja abrirla sin que el usuario toque la pantalla)
    el.innerHTML = `
      <div class="panel challenge tap-cam" id="open-cam" role="button" tabindex="0">
        <div class="ch-icon">${info.icon}</div>
        <h2>${info.title}</h2>
        <p class="big">${info.text}</p>
        <div class="cam-big">📷</div>
        <p class="big"><b>¡Toca aquí para abrir la cámara!</b></p>
      </div>
      <p class="muted center">Si el móvil pide permiso para la cámara o la realidad aumentada, pulsa «Permitir».</p>`;
    vibrate([150, 80, 150]);
    await waitClick($('#open-cam', el), ctx.signal);
    ctx.audio.unlock();
    const cl = [];
    let result = 'exit';
    try {
      $('#open-cam', el).style.pointerEvents = 'none';
      await ctx.ar.open();
      ctx.ar.setMsg('⏳ Despertando a los zombis…');
      await Promise.race([models, sleep(8000)]);
      ctx.ar.setMsg('');
      result = await new Promise((res, rej) => {
        cl.push(ctx.ar.onExit(() => rej(new Error('exit'))));
        const ab = () => rej(abortError());
        ctx.signal.addEventListener('abort', ab);
        cl.push(() => ctx.signal.removeEventListener('abort', ab));
        run(ctx, cl).then(res, rej);
      });
    } catch (e) {
      result = e.name === 'AbortError' ? 'abort' : 'exit';
      if (e.message !== 'exit' && e.name !== 'AbortError') console.warn(e);
    } finally {
      cl.forEach((f) => { try { f(); } catch { /* nada */ } });
      ctx.audio.heartbeat(0);
      ctx.audio.drone(0.35);
      await ctx.ar.close();
    }
    if (result === 'done') return;
    if (ctx.signal.aborted) throw abortError();
  }
}

function anchorAt(ar, rel, dist) {
  const g = new THREE.Group();
  g.position.copy(ar.posAt(rel, dist));
  return g;
}

// 1. Buscar la mochila con la cámara
export async function find(el, ctx) {
  const { fear } = ctx;
  let arrowUntil = 0;
  ctx.setHints([
    'Gira despacio sobre ti mismo con el móvil delante. ¡Mira también detrás de ti!',
    { text: 'Sigue la flecha que sale en la pantalla.', action: () => { arrowUntil = Date.now() + 15000; } },
    'Cuando veas la mochila, tócala en la pantalla.',
  ]);
  await arChallenge(el, ctx, {
    icon: '🎒',
    title: 'La mochila del Doctor',
    text: F(fear, 'La mochila está en el suelo, muy cerca. Abre la cámara, gira despacio y tócala cuando la veas.',
      'La mochila está tirada en el suelo, cerca. Abre la cámara y búscala… con cuidado.',
      'La mochila está en el suelo, cerca. Hay huellas de manos ensangrentadas alrededor. Abre la cámara… y no te asustes.'),
  }, async ({ ar, audio }, cl) => {
    await ar.waitFloor();
    ar.setMsg('🔎 Busca la mochila en el suelo… ¡gira a tu alrededor!');
    audio.drone(0.55);
    const anchor = anchorAt(ar, (Math.random() < 0.5 ? 1 : -1) * rand(1.7, 2.8), rand(1.5, 2.1));
    const bag = makeBackpack(fear);
    bag.scale.setScalar(1.7);
    anchor.add(bag);
    const ring = makeGlowRing();
    ring.scale.setScalar(1.5);
    anchor.add(ring);
    if (fear >= 2) for (let i = 0; i < (fear >= 3 ? 7 : 3); i++) {
      const hp = makeHandprint();
      hp.position.set(rand(-1, 1), 0.015, rand(-1, 1));
      anchor.add(hp);
    }
    anchor.userData.center = new THREE.Vector3(0, 0.4, 0);
    anchor.userData.radius = 0.7;
    ar.faceCamera(anchor);
    let zombie = null, seen = false, nextGrowl = 0;
    return new Promise((res) => {
      ar.add(anchor, {
        floor: true,
        tap: () => {
          if (zombie && !zombie.userData.asleep) { ar.toast('¡Primero duerme al zombi! <b>Tócalo</b>.'); audio.growl(0.5); return; }
          ar.untap(anchor);
          anchor.visible = false;
          audio.chime();
          vibrate(200);
          ar.flash('gold');
          ar.setMsg('🎒 ¡Tienes la mochila!');
          setTimeout(() => res('done'), 1600);
        },
      });
      cl.push(ar.onUpdate((dt) => {
        ring.userData.animate(dt);
        ar.arrow(Date.now() < arrowUntil && anchor.visible ? ar.relYaw(anchor) : null);
        if (!seen && ar.angleTo(anchor) < 0.35) {
          seen = true;
          ar.setMsg('¡Ahí está! ¡Tócala!');
          if (fear >= 2) {
            zombie = makeZombie(fear);
            // El zombi sale a un lado de la mochila (vista desde el móvil), a 1,4 m, para que no se tapen
            const p = ar.camPos();
            const dir = new THREE.Vector3(anchor.position.x - p.x, 0, anchor.position.z - p.z).normalize();
            const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.random() < 0.5 ? 1.4 : -1.4);
            zombie.position.copy(anchor.position).add(perp);
            // Mientras el zombi esté despierto, la mochila no se puede coger: el toque solo duerme al zombi
            ar.untap(anchor);
            ar.add(zombie, {
              floor: true,
              tap: (z) => {
                z.userData.sleep();
                ar.untap(z);
                ar.tappables.add(anchor);
                audio.growl(0.35, 0, 0.8);
                vibrate(120);
                ar.setMsg('💤 ¡Dormido! Ahora, ¡coge la mochila!');
              },
            });
            if (zombie.userData.special) zombie.userData.special(Math.random() < 0.5 ? 'rise' : 'scream');
            audio.scream(fear >= 3 ? 0.9 : 0.6);
            vibrate([250, 80, 350]);
            ar.flash('red');
            ar.setMsg('😱 ¡UN ZOMBI! ¡Tócalo para lanzarle polvo de dormir!');
          }
        }
        if (zombie && !zombie.userData.asleep) {
          ar.faceCamera(zombie);
          const d = ar.flatDist(zombie);
          const busy = zombie.userData.st.busyUntil > zombie.userData.st.t;
          zombie.userData.st.walk = d > 1.8 ? 1 : 0;
          if (d > 1.8 && !busy) {
            const p = ar.camPos();
            const dir = new THREE.Vector3(p.x - zombie.position.x, 0, p.z - zombie.position.z).normalize();
            zombie.position.addScaledVector(dir, dt * 0.9);
          }
          if (performance.now() > nextGrowl) { nextGrowl = performance.now() + rand(1800, 3200); audio.growl(0.6, -Math.sin(ar.relYaw(zombie))); }
        }
      }));
    });
  });
}

// 2. Linterna: agitar para encender y alumbrar zombis en la oscuridad
export async function flashlight(el, ctx) {
  const { fear } = ctx;
  const HOLE = 40; // radio del círculo de luz, en % del lado largo de la pantalla (casi toda)
  let arrowUntil = 0;
  ctx.setHints([
    'Agita el móvil con fuerza, como un bote de ketchup. Si no funciona, espera y saldrá un botón.',
    'Mueve la luz despacio a tu alrededor. Los zombis se esconden en la oscuridad, ¡también detrás de ti!',
    { text: 'Sigue la flecha hacia el zombi más cercano.', action: () => { arrowUntil = Date.now() + 15000; } },
  ]);
  await arChallenge(el, ctx, {
    icon: '🔦',
    title: 'La oscuridad',
    text: F(fear, 'Cuando abras la cámara se hará de noche. Agita el móvil para encender la linterna y alumbra a los zombis hasta que se duerman.',
      'Cuando abras la cámara todo se volverá negro. Agita el móvil para encender la linterna. Hay zombis escondidos: ¡alúmbralos hasta que caigan!',
      'Al abrir la cámara se apagará el sol. Oirás respiraciones. Agita el móvil para encender la linterna y alumbra a cada zombi hasta que caiga. No dejes que se acerquen…'),
  }, async ({ ar, audio }, cl) => {
    await ar.waitFloor(2000);
    ar.dark(true, 0);
    ar.setMsg('🌑 ¡Se ha apagado el sol! <b>Agita el móvil</b> para encender la linterna.');
    audio.drone(0.75);
    audio.heartbeat(85);
    audio.whisper();
    let on = false;
    const zombies = [];
    const n = F(fear, 1, 2, 3);
    const btn = $('#ar-action');
    const spawn = () => {
      const base = rand(0.9, 2.6) * (Math.random() < 0.5 ? 1 : -1);
      for (let i = 0; i < n; i++) {
        const z = makeZombie(fear);
        z.position.copy(ar.posAt(base + (i * 2 * Math.PI) / Math.max(n, 2) + rand(-0.3, 0.3), rand(2.0, 2.8)));
        z.userData.lit = 0;
        ar.add(z, { floor: true });
        ar.faceCamera(z);
        zombies.push(z);
      }
    };
    const turnOn = () => {
      if (on) return;
      on = true;
      btn.hidden = true;
      ar.dark(true, HOLE);
      ar.torch(true);
      audio.click();
      vibrate(80);
      ar.setMsg(`🔦 ¡Linterna encendida! Busca ${n === 1 ? 'al zombi' : `a los ${n} zombis`} y alúmbralos.`);
      spawn();
    };
    cl.push(onShake(turnOn));
    const tBtn = setTimeout(() => {
      if (on) return;
      btn.hidden = false;
      btn.textContent = '🔦 Encender linterna';
      btn.onclick = turnOn;
    }, 7000);
    cl.push(() => { clearTimeout(tBtn); btn.hidden = true; btn.onclick = null; ar.torch(false); });
    let flickerAt = performance.now() + rand(9000, 15000), flickerEnd = 0, nextGrowl = 0, done = false;
    return new Promise((res) => {
      cl.push(ar.onUpdate((dt) => {
        if (!on || done) return;
        const now = performance.now();
        if (fear >= 3 && now > flickerAt) { flickerEnd = now + 450; flickerAt = now + rand(9000, 16000); audio.whisper(); }
        const flicker = now < flickerEnd;
        const holePx = (HOLE / 100) * Math.max(innerWidth, innerHeight);
        ar.dark(true, flicker ? (Math.random() < 0.5 ? 0 : HOLE / 3) : HOLE);
        let awake = 0, nearest = null, nd = Infinity;
        for (const z of zombies) {
          if (z.userData.asleep) continue;
          awake++;
          ar.faceCamera(z);
          const a = ar.angleTo(z);
          const sp = ar.toScreen(ar.centerOf(z));
          const inLight = !!sp && Math.hypot(sp.x - innerWidth / 2, sp.y - innerHeight / 2) < holePx * 0.85;
          if (a < nd) { nd = a; nearest = z; }
          if (inLight && !flicker) {
            if (z.userData.lit === 0) { audio.growl(0.7, -Math.sin(ar.relYaw(z))); vibrate(60); if (z.userData.special) z.userData.special('scream'); }
            z.userData.lit += dt;
            z.userData.st.lunge = Math.min(1, z.userData.lit);
            if (z.userData.lit > 1.1) {
              z.userData.sleep();
              if (fear >= 2) audio.scream(0.5); else audio.growl(0.4);
              vibrate([100, 50, 100]);
              awake--;
            }
          } else z.userData.lit = Math.max(0, z.userData.lit - dt * 0.5);
        }
        ar.setCount(`💤 ${n - awake} / ${n}`);
        ar.arrow(Date.now() < arrowUntil && nearest ? ar.relYaw(nearest) : null);
        if (now > nextGrowl && awake) { nextGrowl = now + rand(2500, 4500); if (nearest) audio.growl(0.45, -Math.sin(ar.relYaw(nearest))); }
        if (awake === 0) {
          done = true;
          ar.dark(false);
          ar.torch(false);
          ar.arrow(null);
          audio.heartbeat(0);
          audio.chime();
          ar.flash('gold');
          ar.setMsg('☀️ ¡Todos dormidos! Vuelve la luz…');
          setTimeout(() => res('done'), 2000);
        }
      }));
    });
  });
}

// 5. La horda: tocar zombis que se acercan
export async function horde(el, ctx) {
  const { fear } = ctx;
  const target = ctx.players > 1 ? Math.min(20, 4 * ctx.players) : 6;
  const myGoal = 6;
  ctx.setHints([
    'Gira sobre ti mismo: vienen de todas partes. La flecha te dice dónde está el más cercano.',
    'Toca a cada zombi en la pantalla antes de que llegue hasta ti.',
    'Si sois varios, poneos espalda con espalda: así cada uno vigila un lado.',
  ]);
  await arChallenge(el, ctx, {
    icon: '🧟',
    title: '¡La horda!',
    text: F(fear, `Vienen muchos zombis lentos. Gira y tócalos para lanzarles polvo de dormir. ${ctx.players > 1 ? `Entre todo el equipo hay que dormir ${target}.` : `Duerme a ${myGoal}.`}`,
      `¡Una horda viene hacia vosotros! Gira y toca a cada zombi antes de que te muerda. ${ctx.players > 1 ? `Entre todo el equipo: ${target} zombis.` : `Duerme a ${myGoal}.`}`,
      `¡LA HORDA! Vienen arrastrándose, con la boca abierta. Si uno te alcanza, te muerde y perdéis tiempo. ${ctx.players > 1 ? `Entre todo el equipo: ${target} zombis.` : `Duerme a ${myGoal}.`}`),
  }, async ({ ar, audio }, cl) => {
    await ar.waitFloor(2000);
    ar.setMsg('🧟 ¡Toca a los zombis antes de que lleguen!');
    audio.drone(0.9);
    let mine = 0, alive = [], spawned = 0, nextSpawn = 0, done = false;
    const speed = F(fear, [0.35, 0.5], [0.45, 0.65], [0.55, 0.85]);
    const interval = F(fear, 2800, 2200, 1700);
    const spawn = () => {
      const z = makeZombie(fear);
      const rel = spawned < 2 ? rand(-0.5, 0.5) : rand(-Math.PI, Math.PI);
      z.position.copy(ar.posAt(rel, rand(4, 5)));
      z.userData.speed = rand(...speed);
      z.userData.nextGrowl = performance.now() + rand(500, 2500);
      z.userData.st.walk = 1;
      ar.add(z, {
        floor: true,
        tap: (zz) => {
          if (zz.userData.asleep || done) return;
          zz.userData.sleep();
          ar.untap(zz);
          mine++;
          ctx.hordeAdd(mine);
          audio.growl(0.3, 0, 0.6);
          audio.sparkle();
          vibrate(60);
          setTimeout(() => { ar.remove(zz); alive = alive.filter((x) => x !== zz); }, 2500);
        },
      });
      ar.faceCamera(z);
      alive.push(z);
      spawned++;
    };
    return new Promise((res) => {
      cl.push(ar.onUpdate((dt) => {
        if (done) return;
        const now = performance.now();
        const awake = alive.filter((z) => !z.userData.asleep);
        if (now > nextSpawn && awake.length < 4) { spawn(); nextSpawn = now + interval; }
        let nearest = null, nd = Infinity;
        const p = ar.camPos();
        for (const z of awake) {
          ar.faceCamera(z);
          const d = ar.flatDist(z);
          if (d < nd) { nd = d; nearest = z; }
          const dir = new THREE.Vector3(p.x - z.position.x, 0, p.z - z.position.z).normalize();
          z.position.addScaledVector(dir, dt * z.userData.speed);
          z.userData.st.lunge = d < 2 ? 1 : 0;
          if (now > z.userData.nextGrowl) { z.userData.nextGrowl = now + rand(2000, 4000); audio.growl(Math.min(0.9, 1.6 / d), -Math.sin(ar.relYaw(z))); }
          if (d < 0.9) {
            // ¡mordisco!
            ar.remove(z);
            alive = alive.filter((x) => x !== z);
            audio.bite();
            vibrate([400, 100, 200]);
            ar.flash('bite');
            const ms = biteMs(fear);
            if (ms) { ctx.penalty(ms); ar.toast(`🩸 ¡Te ha mordido! Perdéis ${ms / 1000} segundos.`); } else ar.toast('¡Uy! Te ha alcanzado. ¡Sigue!');
          }
        }
        audio.heartbeat(nd < 2 ? 140 : nd < 4 ? 105 : 75);
        ar.arrow(nearest && ar.angleTo(nearest) > 0.5 ? ar.relYaw(nearest) : null);
        const team = ctx.hordeTeam();
        ar.setCount(ctx.players > 1 ? `💤 Tú: ${mine} · Equipo: ${team}/${target}` : `💤 ${mine}/${myGoal}`);
        if (mine >= myGoal || (ctx.players > 1 && team >= target)) {
          done = true;
          for (const z of alive) z.userData.sleep();
          ar.arrow(null);
          audio.heartbeat(0);
          audio.chime();
          ar.flash('gold');
          ar.setMsg('💤 ¡Toda la horda duerme!');
          setTimeout(() => res('done'), 2200);
        }
      }));
    });
  });
}

// ---------- Pruebas en pantalla ----------
function keypad(el, onSubmit, maxLen = 3) {
  let val = '';
  el.innerHTML = `<div class="kp-display">&nbsp;</div><div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✔'].map((k) => `<button data-k="${k}" class="${k === '✔' ? 'green' : ''}">${k}</button>`).join('')}</div>`;
  const disp = $('.kp-display', el);
  const show = () => { disp.innerHTML = val || '&nbsp;'; };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    const k = b.dataset.k;
    if (k === '⌫') val = val.slice(0, -1);
    else if (k === '✔') { if (val) onSubmit(val); return; }
    else if (val.length < maxLen) val += k;
    show();
  });
  return { clear() { val = ''; show(); }, shake() { disp.classList.remove('shake'); void disp.offsetWidth; disp.classList.add('shake'); } };
}

function waitDone(ctx, setup) {
  return new Promise((res, rej) => {
    if (ctx.signal.aborted) return rej(abortError());
    ctx.signal.addEventListener('abort', () => rej(abortError()), { once: true });
    setup(res);
  });
}

function mathChallenge(el, ctx, { icon, title, text, problems, opSign }) {
  let i = 0;
  ctx.setHints([
    'Puedes contar con los dedos o pedir ayuda a un compañero. ¡En equipo es más fácil!',
    opSign === '+' ? 'Con números grandes: suma primero las decenas y luego las unidades.' : 'Multiplicar es sumar varias veces: 4 × 3 es 4 + 4 + 4.',
    { text: () => { const [a, b] = problems[Math.min(i, problems.length - 1)]; const r = opSign === '+' ? a + b : a * b; return `La respuesta de «${a} ${opSign} ${b}» está entre ${Math.max(0, r - 3)} y ${r + 3}.`; } },
  ]);
  el.innerHTML = `
    <div class="panel challenge">
      <div class="ch-icon">${icon}</div><h2>${title}</h2><p>${text}</p>
      <div class="locks">${problems.map(() => '<span class="lock">🔒</span>').join('')}</div>
      <div class="problem"></div>
    </div>
    <div class="kp"></div>`;
  const prob = $('.problem', el);
  const showP = () => { const [a, b] = problems[i]; prob.textContent = `${a} ${opSign} ${b} = ?`; };
  showP();
  return waitDone(ctx, (res) => {
    const kp = keypad($('.kp', el), (v) => {
      const [a, b] = problems[i];
      const r = opSign === '+' ? a + b : a * b;
      if (Number(v) === r) {
        ctx.audio.chime();
        vibrate(80);
        $$('.lock', el)[i].textContent = '🔓';
        i++;
        kp.clear();
        if (i >= problems.length) { prob.textContent = '¡Abierto!'; setTimeout(() => res(), 1200); } else showP();
      } else {
        ctx.audio.wrong();
        vibrate([80, 60, 80]);
        kp.shake();
        kp.clear();
        if (ctx.fear >= 2 && Math.random() < 0.6) { ctx.audio.growl(0.5, rand(-1, 1)); ctx.toast(pick(['¡Shhh! Un zombi te ha oído…', 'Algo gruñe detrás de ti…', '¡Prueba otra vez, rápido!'])); }
      }
    });
  });
}

export function sums(el, ctx) {
  const problems = [[randInt(3, 9), randInt(3, 9)], [randInt(12, 39), randInt(3, 9)]];
  return mathChallenge(el, ctx, {
    icon: '🧰', title: 'El cofre cerrado', opSign: '+', problems,
    text: F(ctx.fear, 'El cofre tiene 2 candados. Resuelve las sumas para abrirlos.',
      'El cofre tiene arañazos por todas partes. Tiene 2 candados: resuelve las sumas para abrirlos.',
      'El cofre está lleno de arañazos y huellas de manos rojas. Tiene 2 candados: resuelve las sumas, rápido.'),
  });
}

export function mult(el, ctx) {
  const tables = [2, 3, 4, 5, 10];
  const problems = [[pick(tables), randInt(2, 9)], [pick(tables), randInt(2, 9)]];
  return mathChallenge(el, ctx, {
    icon: '🦉', title: 'El nido de los búhos', opSign: '×', problems,
    text: 'La puerta del nido tiene un candado de multiplicaciones. ¡Ábrelo!',
  });
}

export function words(el, ctx) {
  const list = F(ctx.fear, ['NIEBLA', 'LUNA', 'BUHO', 'ZOMBI'], ['ZOMBI', 'NIEBLA', 'MIEDO', 'GRITO'], ['SANGRE', 'ZOMBI', 'GRITO', 'MIEDO']);
  const word = pick(list);
  let letters;
  do { letters = shuffle(word.split('')); } while (letters.join('') === word);
  ctx.setHints([
    'Es una palabra de nuestra historia.',
    `Empieza por la letra «${word[0]}».`,
    `Empieza por «${word.slice(0, 2)}» y tiene ${word.length} letras.`,
  ]);
  el.innerHTML = `
    <div class="panel challenge">
      <div class="ch-icon">🔤</div><h2>La palabra secreta</h2>
      <p>${F(ctx.fear, 'Las letras se han mezclado. Tócalas en orden para formar la palabra secreta.', 'Alguien ha escrito unas letras en el árbol. Ordénalas para descubrir la palabra secreta.', 'Hay letras escritas con sangre en el tronco del árbol. Ordénalas para descubrir la palabra secreta.')}</p>
      <div class="slots">${word.split('').map(() => '<span class="slot"></span>').join('')}</div>
      <div class="tiles">${letters.map((l, i) => `<button class="tile" data-i="${i}">${l}</button>`).join('')}</div>
    </div>
    <button class="small" id="w-clear">↩️ Borrar</button>`;
  let ans = [];
  const slots = $$('.slot', el), tiles = $$('.tile', el);
  const reset = () => { ans = []; slots.forEach((s) => { s.textContent = ''; }); tiles.forEach((t) => { t.disabled = false; }); };
  return waitDone(ctx, (res) => {
    $('#w-clear', el).onclick = reset;
    tiles.forEach((t) => {
      t.onclick = () => {
        ctx.audio.click();
        t.disabled = true;
        ans.push(t.textContent);
        slots[ans.length - 1].textContent = t.textContent;
        if (ans.length === word.length) {
          if (ans.join('') === word) {
            ctx.audio.chime();
            $('.slots', el).classList.add('ok');
            setTimeout(() => res(), 1300);
          } else {
            ctx.audio.wrong();
            vibrate([80, 60, 80]);
            $('.slots', el).classList.add('shake');
            setTimeout(() => { $('.slots', el).classList.remove('shake'); reset(); }, 600);
          }
        }
      };
    });
  });
}

// 4a. Frotar para limpiar el moho
export function rub(el, ctx) {
  const { fear } = ctx;
  ctx.setHints(['Frota con el dedo por toda la imagen, como limpiando un cristal sucio.', 'No te olvides de las esquinas y los bordes.']);
  el.innerHTML = `
    <div class="panel challenge">
      <h2>🧪 El frasco sucio</h2>
      <p>${F(fear, 'El frasco está cubierto de moho. ¡Frota la pantalla para limpiarlo!', 'El frasco está cubierto de moho y barro. ¡Frota para limpiarlo!', 'El frasco está cubierto de moho y sangre seca. ¡Frota fuerte para limpiarlo!')}</p>
      <div class="rub-wrap"><div class="rub-under">🧪<span>Agua de luna</span></div><canvas class="rub"></canvas></div>
      <div class="bar"><div></div></div>
    </div>`;
  const wrap = $('.rub-wrap', el), cv = $('canvas', el);
  const size = Math.min(wrap.clientWidth || 300, 360);
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = '#3d4a2c';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = pick(['#56663a', '#2f3a22', '#6b7a45', '#4a5532', '#7c8a50']);
    g.beginPath();
    g.arc(rand(0, size), rand(0, size), rand(4, 18), 0, 7);
    g.fill();
  }
  if (fear >= 2) {
    for (let i = 0; i < (fear >= 3 ? 12 : 5); i++) {
      g.fillStyle = pick(['#5c0a10', '#7a0b14', '#3a0306']);
      g.beginPath();
      g.arc(rand(0, size), rand(0, size), rand(8, 26), 0, 7);
      g.fill();
    }
  }
  if (fear >= 3) {
    g.fillStyle = '#8a0c16';
    g.font = `bold ${size / 6}px sans-serif`;
    g.textAlign = 'center';
    g.fillText('AYUDA', size / 2, size / 2);
    for (let i = 0; i < 5; i++) g.fillRect(size * 0.25 + i * size * 0.12, size / 2 + 4, 4, rand(15, 50));
  }
  g.globalCompositeOperation = 'destination-out';
  let last = null, lastSound = 0;
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * size, y: ((e.clientY - r.top) / r.height) * size }; };
  const draw = (p) => {
    g.lineWidth = size / 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo((last || p).x, (last || p).y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last = p;
    if (performance.now() - lastSound > 120) { lastSound = performance.now(); ctx.audio.tone(rand(200, 400), 0.05, 'triangle', 0.05); }
  };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); last = null; draw(pt(e)); });
  cv.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') { if (last || e.buttons) draw(pt(e)); } });
  cv.addEventListener('pointerup', () => { last = null; });
  return waitDone(ctx, (res) => {
    const iv = setInterval(() => {
      const d = g.getImageData(0, 0, size, size).data;
      let clear = 0, tot = 0;
      for (let y = 4; y < size; y += 12) for (let x = 4; x < size; x += 12) { tot++; if (d[(y * size + x) * 4 + 3] < 40) clear++; }
      const f = clear / tot;
      $('.bar div', el).style.width = Math.min(100, (f / 0.85) * 100) + '%';
      if (f > 0.85) {
        clearInterval(iv);
        g.clearRect(0, 0, size, size);
        ctx.audio.chime();
        $('.rub-under', el).classList.add('glow');
        setTimeout(() => res(), 1300);
      }
    }, 350);
    ctx.signal.addEventListener('abort', () => clearInterval(iv));
  });
}

// 4b. Unir cables del mismo color
export function wires(el, ctx) {
  const cols = [['rojo', '#e53935'], ['azul', '#1e88e5'], ['amarillo', '#fdd835'], ['verde', '#43a047']];
  const right = shuffle(cols.map((c, i) => i));
  ctx.setHints(['Toca un cable de la izquierda y después el del mismo color a la derecha.', 'Si sale un chispazo, es que los colores no coinciden. ¡Prueba otro!']);
  el.innerHTML = `
    <div class="panel challenge">
      <h2>⚙️ La máquina rota</h2>
      <p>${F(ctx.fear, 'Une cada cable con el de su mismo color para arreglar la máquina del Doctor.', 'Los zombis han arrancado los cables. Une cada uno con el de su color.', 'Los zombis han arrancado los cables a mordiscos. Une cada uno con el de su color… rápido.')}</p>
      <div class="wires">
        <svg class="wire-svg"></svg>
        <div class="wcol left">${cols.map((c, i) => `<button class="wnode" data-side="L" data-i="${i}" style="--c:${c[1]}"></button>`).join('')}</div>
        <div class="wcol right">${right.map((i) => `<button class="wnode" data-side="R" data-i="${i}" style="--c:${cols[i][1]}"></button>`).join('')}</div>
      </div>
    </div>`;
  const svg = $('.wire-svg', el), box = $('.wires', el);
  let sel = null, done = 0;
  const center = (b) => { const r = b.getBoundingClientRect(), br = box.getBoundingClientRect(); return [r.left - br.left + r.width / 2, r.top - br.top + r.height / 2]; };
  const line = (a, b, c) => {
    const [x1, y1] = center(a), [x2, y2] = center(b);
    svg.insertAdjacentHTML('beforeend', `<path d="M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round"/>`);
  };
  return waitDone(ctx, (res) => {
    $$('.wnode', el).forEach((b) => {
      b.onclick = () => {
        if (b.classList.contains('done')) return;
        if (b.dataset.side === 'L') {
          $$('.wnode.sel', el).forEach((x) => x.classList.remove('sel'));
          sel = b;
          b.classList.add('sel');
          ctx.audio.click();
          return;
        }
        if (!sel) { ctx.toast('Primero toca un cable de la izquierda.'); return; }
        if (sel.dataset.i === b.dataset.i) {
          line(sel, b, cols[b.dataset.i][1]);
          sel.classList.remove('sel');
          sel.classList.add('done');
          b.classList.add('done');
          sel = null;
          done++;
          ctx.audio.sparkle();
          vibrate(50);
          if (done === 4) { ctx.audio.chime(); setTimeout(() => res(), 1200); }
        } else {
          ctx.audio.wrong();
          vibrate([60, 40, 60]);
          b.classList.add('spark');
          setTimeout(() => b.classList.remove('spark'), 500);
          if (ctx.fear >= 2) ctx.toast('⚡ ¡Chispazo! Ese no es.');
        }
      };
    });
  });
}

// =====================================================================
//  PRUEBAS DE LA PARTIDA DE 4 PUNTOS
// =====================================================================
const DEG = Math.PI / 180;
const TEMPS = [
  [80, '🧊 Congelado', '#5ab0ff'],
  [50, '❄️ Frío', '#8fd3ff'],
  [30, '🌤️ Templado', '#ffd23f'],
  [15, '🔥 Caliente', '#ff8a3d'],
  [0, '🌋 ¡Ardiendo!', '#ff2d2d'],
];

// Margen de llegada: si el punto estaba cerca al empezar (d0), hay que acercarse más,
// para que siempre haya un tramo que recorrer
function arrivedAt(target, maxR = 20, d0 = Infinity) {
  if (!geo.pos) return false;
  const r = Math.min(Math.max(8, Math.min(Math.max(12, geo.acc || 0), maxR)), Math.max(5, d0 * 0.45));
  return distM(geo.pos, target) <= r;
}

// Botones para la prueba en casa dentro de la cámara (andar sin moverse del sofá)
function testWalkButtons(ctx, cl) {
  if (!ctx.test) return;
  const box = h('<div id="ar-test" class="noxr"><button class="small" data-w="5">👣 Andar 5 m</button><button class="small" data-w="arrive">⏩ Llegar</button></div>');
  $('#ar-ui').append(box);
  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || !geo.pos) return;
    const t = ctx.target;
    if (b.dataset.w === 'arrive') geo.teleport({ lat: t.lat + 0.00001, lng: t.lng });
    else { const br = bearingDeg(geo.pos, t) * DEG; geo.move(Math.sin(br) * 5, Math.cos(br) * 5); }
  };
  cl.push(() => box.remove());
}

// Rumbo de brújula → dirección dentro de la escena 3D (se suaviza para que no baile)
function bearingToYaw(ar, st, bearing, heading) {
  const off = ar.camYaw() + heading * DEG;
  if (st.ox == null) { st.ox = Math.cos(off); st.oy = Math.sin(off); }
  st.ox = st.ox * 0.9 + Math.cos(off) * 0.1;
  st.oy = st.oy * 0.9 + Math.sin(off) * 0.1;
  return Math.atan2(st.oy, st.ox) - bearing * DEG;
}

// Ingrediente flotando delante: hay que tocarlo para cogerlo
function collectItem({ ar, audio }, cl, kind, msg) {
  return new Promise((res) => {
    const it = makeIngredient(kind);
    it.scale.setScalar(2.4);
    const pos = ar.posAt(0, 1.3);
    it.position.set(pos.x, ar.floorY + 1.0, pos.z);
    it.userData.radius = 0.35;
    let t = 0, got = false;
    ar.add(it, {
      tap: () => {
        if (got) return;
        got = true;
        ar.untap(it);
        audio.chime();
        ar.flash('gold');
        vibrate(150);
        ar.setMsg('✨ ¡Conseguido!');
        setTimeout(res, 1200);
      },
    });
    ar.setMsg(msg || '✨ ¡Toca el ingrediente para cogerlo!');
    audio.sparkle();
    cl.push(ar.onUpdate((dt) => {
      t += dt;
      it.rotation.y += dt * 1.5;
      it.position.y = ar.floorY + 1.0 + Math.sin(t * 2) * 0.06;
    }));
  });
}

// ---------- 1. El cofre (con un zombi a 2 m) ----------
export async function chest(el, ctx) {
  const { fear } = ctx;
  let arrowUntil = 0;
  ctx.setHints([
    'Gira despacio sobre ti mismo con el móvil delante: el cofre está en el suelo.',
    { text: 'Sigue la flecha que sale en la pantalla.', action: () => { arrowUntil = Date.now() + 15000; } },
    'Primero toca al zombi para dormirlo. Después toca el cofre para abrirlo.',
  ]);
  await arChallenge(el, ctx, {
    icon: '🧰',
    title: 'El cofre',
    text: F(fear, 'El cofre está aquí, en el suelo. Pero un zombi lo vigila… Abre la cámara y búscalo.',
      'El cofre está aquí. Un zombi lo vigila, gruñendo. Abre la cámara… con cuidado.',
      'El cofre está aquí. Hay huellas de manos ensangrentadas… y un zombi vigilándolo. Abre la cámara… y no grites.'),
  }, async ({ ar, audio }, cl) => {
    await ar.waitFloor();
    ar.setMsg('🔎 Busca el cofre… ¡gira a tu alrededor!');
    audio.drone(0.55);
    const anchor = anchorAt(ar, (Math.random() < 0.5 ? 1 : -1) * rand(1.0, 2.4), rand(1.8, 2.3));
    const box = makeChest(fear);
    box.scale.setScalar(1.3);
    anchor.add(box);
    const ring = makeGlowRing();
    ring.scale.setScalar(1.8);
    anchor.add(ring);
    if (fear >= 2) for (let i = 0; i < (fear >= 3 ? 7 : 3); i++) {
      const hp = makeHandprint();
      hp.position.set(rand(-1, 1), 0.015, rand(-1, 1));
      anchor.add(hp);
    }
    anchor.userData.center = new THREE.Vector3(0, 0.35, 0);
    anchor.userData.radius = 0.7;
    ar.faceCamera(anchor);
    // zombi a 2 m del cofre, a un lado (visto desde el móvil) para que no se tapen
    const p = ar.camPos();
    const dir = new THREE.Vector3(anchor.position.x - p.x, 0, anchor.position.z - p.z).normalize();
    const zombie = makeZombie(fear);
    zombie.position.copy(anchor.position).add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.random() < 0.5 ? 2 : -2));
    let awake = true, seen = false, opened = false, nextGrowl = 0;
    let ing = null, ingT = 0;
    return new Promise((res) => {
      ar.add(anchor, { floor: true });
      anchor.userData.onTap = () => {
        if (opened) return;
        opened = true;
        ar.untap(anchor);
        box.userData.open();
        audio.creak();
        vibrate(200);
        ing = makeIngredient(1);
        ing.position.set(0, 0.3, 0);
        anchor.add(ing);
        setTimeout(() => { audio.chime(); ar.flash('gold'); ar.setMsg('🍄 ¡Una seta mágica!'); }, 900);
        setTimeout(() => res('done'), 2800);
      };
      ar.add(zombie, {
        floor: true,
        tap: (z) => {
          if (!awake) return;
          awake = false;
          z.userData.sleep();
          ar.untap(z);
          ar.tappables.add(anchor); // ahora ya se puede abrir el cofre
          audio.growl(0.35, 0, 0.8);
          vibrate(120);
          ar.setMsg('💤 ¡Dormido! Ahora, <b>toca el cofre</b> para abrirlo.');
        },
      });
      cl.push(ar.onUpdate((dt) => {
        ring.userData.animate(dt);
        box.userData.animate(dt);
        if (ing) { ingT += dt; ing.position.y = Math.min(0.75, 0.3 + ingT * 0.5); ing.rotation.y += dt * 2; }
        const goal = awake ? zombie : anchor;
        ar.arrow(Date.now() < arrowUntil && !opened ? ar.relYaw(goal) : null);
        if (!seen && (ar.angleTo(anchor) < 0.45 || ar.angleTo(zombie) < 0.45)) {
          seen = true;
          if (zombie.userData.special) zombie.userData.special(Math.random() < 0.5 ? 'rise' : 'scream');
          audio.scream(fear >= 3 ? 0.9 : fear >= 2 ? 0.6 : 0.35);
          vibrate([250, 80, 350]);
          ar.flash('red');
          ar.setMsg('😱 ¡Un zombi vigila el cofre! <b>Tócalo</b> para dormirlo.');
        }
        if (awake) {
          ar.faceCamera(zombie);
          const d = ar.flatDist(zombie);
          const busy = zombie.userData.st.busyUntil > zombie.userData.st.t;
          zombie.userData.st.walk = seen && d > 1.8 ? 1 : 0;
          if (seen && d > 1.8 && !busy) {
            const c = ar.camPos();
            const v = new THREE.Vector3(c.x - zombie.position.x, 0, c.z - zombie.position.z).normalize();
            zombie.position.addScaledVector(v, dt * 0.6);
          }
          if (performance.now() > nextGrowl) { nextGrowl = performance.now() + rand(2000, 3500); audio.growl(0.6, -Math.sin(ar.relYaw(zombie))); }
        }
      }));
    });
  });
}

// ---------- 2. Huellas de sangre + 5 murciélagos ----------
export async function bats(el, ctx) {
  const { fear } = ctx;
  ctx.setHints([
    'Mira al suelo con la cámara: las huellas rojas apuntan hacia el sitio. ¡Síguelas andando!',
    'Si no salen huellas, mueve el móvil haciendo un 8 para que funcione la brújula.',
    'Toca a cada murciélago en la pantalla para dispararle. La flecha te dice dónde hay uno.',
  ]);
  await arChallenge(el, ctx, {
    icon: '👣',
    title: 'Huellas de sangre',
    text: story.stationText(2, fear),
  }, async (c, cl) => {
    const { ar, audio } = c;
    await ar.waitFloor();
    testWalkButtons(ctx, cl);
    audio.drone(0.5);
    if (!ctx.isArrived()) await followFootprints(c, cl, ctx.target);
    ctx.arrive();
    const tb = $('#ar-test');
    if (tb) tb.remove();
    await batsPhase(c, cl);
    await collectItem(c, cl, 2, '🦷 ¡Un colmillo de murciélago! Tócalo para cogerlo.');
    return 'done';
  });
}

function followFootprints({ ar }, cl, target) {
  return new Promise((res) => {
    const prints = new THREE.Group();
    prints.userData.fitted = true; // el grupo no se mueve por las paredes
    ar.add(prints, { floor: true });
    const steps = [];
    for (let i = 0; i < 8; i++) {
      const w = new THREE.Group();
      w.add(makeFootprint(i % 2 === 0));
      prints.add(w);
      steps.push(w);
    }
    const yst = {};
    let t = 0, done = false, d0 = null;
    cl.push(ar.onUpdate((dt) => {
      if (done) return;
      t += dt;
      if (!geo.pos) { ar.setMsg('📡 Buscando GPS…'); prints.visible = false; return; }
      const d = distM(geo.pos, target);
      if (d0 == null) d0 = d;
      ar.setCount(`👣 ${Math.round(d)} m`);
      if (arrivedAt(target, 12, d0)) { done = true; prints.visible = false; ar.setCount(''); ar.arrow(null); ar.diagExtra = ''; res(); return; }
      // en el ordenador (arrastrando) no hay brújula: el norte es hacia donde se miraba al empezar
      const heading = ar.mode === 'drag' ? (((-ar.camYaw() / DEG) % 360) + 360) % 360 : geo.heading;
      if (heading == null) { ar.setMsg('🧭 Mueve el móvil haciendo un 8 para que aparezcan las huellas', 0); prints.visible = false; ar.diagExtra = `huellas: sin brújula · ${Math.round(d)} m`; return; }
      prints.visible = true;
      const yaw = bearingToYaw(ar, yst, bearingDeg(geo.pos, target), heading);
      // si las huellas no están delante, una flecha indica hacia dónde girar
      let rel = yaw - ar.camYaw();
      while (rel > Math.PI) rel -= 2 * Math.PI;
      while (rel < -Math.PI) rel += 2 * Math.PI;
      ar.arrow(Math.abs(rel) > 0.6 ? rel : null);
      ar.setMsg(Math.abs(rel) > 0.6 ? '👣 ¡Las huellas van por ahí! Gira' : '👣 Sigue las huellas de sangre…');
      ar.diagExtra = `huellas: brújula ${Math.round(heading)}° · rumbo ${Math.round(bearingDeg(geo.pos, target))}° · ${Math.round(d)} m · giro ${Math.round(rel / DEG)}°`;
      const p = ar.camPos();
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), px = -fz, pz = fx;
      steps.forEach((w, i) => {
        const dist = 0.8 + i * 0.55, side = (i % 2 ? 1 : -1) * 0.12;
        w.position.set(p.x + fx * dist + px * side, 0, p.z + fz * dist + pz * side);
        w.rotation.y = yaw;
        const wave = (((t * 1.5 - i * 0.25) % 2) + 2) % 2;
        w.children[0].material.opacity = 0.5 + 0.5 * Math.max(0, 1 - wave);
      });
    }));
  });
}

function batsPhase({ ar, audio }, cl) {
  const TOTAL = 5;
  ar.setMsg('🦇 ¡Murciélagos! <b>Tócalos</b> en la pantalla para dispararles');
  audio.heartbeat(95);
  let shot = 0, spawned = 0, alive = [], nextSpawn = 0, done = false;
  const place = (b) => {
    const st = b.userData.bst, c = ar.camPos();
    const r = st.r - ((Math.sin(st.t * 0.7) + 1) / 2) * 1.0; // a veces se acercan en picado
    const x = c.x - Math.sin(st.a) * r, z = c.z - Math.cos(st.a) * r;
    const y = ar.floorY + st.h + Math.sin(st.t * 2.3) * 0.25;
    const dx = x - b.position.x, dz = z - b.position.z;
    if (dx * dx + dz * dz > 1e-8) b.rotation.y = Math.atan2(dx, dz);
    b.position.set(x, y, z);
  };
  const hit = (b) => {
    const st = b.userData.bst;
    if (st.falling) return;
    st.falling = true;
    ar.untap(b);
    audio.shot();
    ar.flash('gold');
    vibrate(80);
    shot++;
    ar.setCount(`🦇 ${shot} / ${TOTAL}`);
  };
  const spawn = () => {
    const b = makeBat();
    b.userData.bst = { r: rand(2, 3.3), a: ar.camYaw() + rand(-1.0, 1.0), w: rand(0.45, 0.85) * (Math.random() < 0.5 ? 1 : -1), h: rand(1.2, 2.2), t: Math.random() * 5, nextScreech: 0, falling: false, vy: 0 };
    place(b);
    ar.add(b, { tap: hit });
    alive.push(b);
    spawned++;
    audio.screech(0.45, rand(-1, 1));
  };
  ar.setCount(`🦇 0 / ${TOTAL}`);
  return new Promise((res) => {
    cl.push(ar.onUpdate((dt) => {
      if (done) return;
      const now = performance.now();
      const flying = alive.filter((b) => !b.userData.bst.falling);
      if (spawned < TOTAL && flying.length < 3 && now > nextSpawn) { spawn(); nextSpawn = now + 1400; }
      let nearest = null, na = Infinity;
      for (const b of [...alive]) {
        const st = b.userData.bst;
        st.t += dt;
        b.userData.flap(dt, st.falling ? 30 : 14);
        if (st.falling) {
          st.vy -= 6 * dt;
          b.position.y += st.vy * dt;
          b.rotation.z += dt * 8;
          if (b.position.y < ar.floorY) { ar.remove(b); alive = alive.filter((x) => x !== b); }
          continue;
        }
        st.a += st.w * dt;
        place(b);
        if (now > st.nextScreech) { st.nextScreech = now + rand(1500, 3200); audio.screech(0.35, -Math.sin(ar.relYaw(b))); }
        const a = ar.angleTo(b);
        if (a < na) { na = a; nearest = b; }
      }
      ar.arrow(nearest && na > 0.6 ? ar.relYaw(nearest) : null);
      if (shot >= TOTAL && !alive.length) { done = true; ar.arrow(null); audio.heartbeat(0); res(); }
    }));
  });
}

// ---------- 3. El Doctor Moho, herido, da el agua de luna ----------
export async function doctor(el, ctx) {
  const { fear } = ctx;
  const pre = preloadDoctor();
  ctx.setHints([
    'Gira despacio: hay alguien pidiendo ayuda con la mano.',
    'Toca al Doctor en la pantalla para hablar con él.',
  ]);
  await arChallenge(el, ctx, {
    icon: '🧑‍⚕️',
    title: '¡Alguien pide ayuda!',
    text: F(fear, 'Hay alguien escondido aquí. Abre la cámara y búscalo.',
      'Se oyen quejidos… Hay alguien herido escondido aquí. Abre la cámara y búscalo.',
      'Se oyen gemidos de dolor… ¿Será un zombi? Abre la cámara y búscalo.'),
  }, async (c, cl) => {
    const { ar, audio } = c;
    await ar.waitFloor();
    await Promise.race([pre, sleep(8000)]);
    audio.drone(0.3);
    const doc = makeDoctor();
    if (!doc) { await collectItem(c, cl, 3, '🧪 El Doctor te ha dejado el agua de luna: ¡tócala!'); return 'done'; }
    doc.position.copy(ar.posAt(rand(-0.4, 0.4), 2.3));
    return new Promise((res) => {
      let talked = false, seen = false;
      ar.add(doc, {
        floor: true,
        tap: async () => {
          if (talked) return;
          talked = true;
          ar.untap(doc);
          doc.userData.play('hurt');
          const txt = story.doctorText(fear);
          if (audio.enabled) {
            // con sonido no hace falta tapar la pantalla con el texto
            ar.setMsg('🗣️ El Doctor te está hablando…', 3000);
            await audio.speak(txt, { creepy: fear >= 3 });
          } else {
            ar.setMsg('🗣️ ' + txt, 0);
            await sleep(txt.length * 55);
          }
          doc.userData.play('idle');
          await collectItem(c, cl, 3, '🧪 ¡Toca el agua de luna para cogerla!');
          res('done');
        },
      });
      ar.setMsg('👀 Busca a quien pide ayuda…');
      cl.push(ar.onUpdate(() => {
        ar.faceCamera(doc);
        if (!seen && ar.angleTo(doc) < 0.45) { seen = true; ar.setMsg('🧑‍⚕️ ¡Es el Doctor Moho! <b>Tócale</b> para hablar con él.'); audio.chime(); }
        ar.arrow(!seen ? ar.relYaw(doc) : null);
      }));
    });
  });
}

// ---------- 4. Radar sin punto con 5 zombis por el camino + mesa de laboratorio ----------
export async function lab(el, ctx) {
  const { fear } = ctx;
  ctx.setHints([
    'El radar dice «frío» o «caliente»: caminad hacia donde se calienta.',
    'Toca a los zombis en la pantalla para dormirlos. La flecha te dice dónde hay uno.',
    'En el laboratorio, toca cada ingrediente para echarlo en el caldero.',
  ]);
  await arChallenge(el, ctx, {
    icon: '⚗️',
    title: 'Camino al laboratorio',
    text: story.stationText(4, fear),
  }, async (c, cl) => {
    const { ar, audio } = c;
    await ar.waitFloor();
    testWalkButtons(ctx, cl);
    audio.drone(0.7);
    await zombiePath(c, cl, ctx);
    ctx.arrive();
    const tb = $('#ar-test');
    if (tb) tb.remove();
    await mixLab(c, cl);
    return 'done';
  });
}

function zombiePath({ ar, audio, fear }, cl, ctx) {
  const TOTAL = 5, target = ctx.target;
  return new Promise((res) => {
    const hud = h('<div id="ar-radar" class="noxr"><div class="pulse"></div><b>📡</b></div>');
    $('#ar-ui').append(hud);
    cl.push(() => hud.remove());
    const marks = [0.1, 0.28, 0.46, 0.64, 0.8];
    let d0 = null, spawned = 0, handled = 0, alive = [], lastBeep = 0, arrivedFlag = false, done = false;
    let lastSpawn = performance.now();
    const upd = () => ar.setCount(`🧟 ${handled} / ${TOTAL}`);
    const spawn = () => {
      const z = makeZombie(fear);
      z.position.copy(ar.posAt(rand(-0.7, 0.7), rand(3.2, 4.2)));
      z.userData.speed = rand(0.45, 0.7);
      z.userData.st.walk = 1;
      z.userData.nextGrowl = 0;
      ar.add(z, {
        floor: true,
        tap: (zz) => {
          if (zz.userData.asleep) return;
          zz.userData.sleep();
          ar.untap(zz);
          handled++;
          audio.growl(0.3, 0, 0.6);
          audio.sparkle();
          vibrate(60);
          upd();
          setTimeout(() => { ar.remove(zz); alive = alive.filter((x) => x !== zz); }, 2500);
        },
      });
      if (z.userData.special && Math.random() < 0.5) z.userData.special('scream');
      audio.growl(0.9, 0, 1.6);
      vibrate([200, 80, 200]);
      ar.flash('red');
      alive.push(z);
      spawned++;
      lastSpawn = performance.now();
      upd();
    };
    upd();
    cl.push(ar.onUpdate((dt) => {
      if (done) return;
      const now = performance.now();
      // radar sin punto: solo frío / caliente
      if (geo.pos) {
        const d = distM(geo.pos, target);
        if (d0 == null) d0 = d;
        const [, label, color] = TEMPS.find(([l]) => d > l) || TEMPS[TEMPS.length - 1];
        hud.querySelector('b').textContent = label;
        hud.style.setProperty('--heat', color);
        if (!arrivedFlag && now - lastBeep > clamp(d * 45, 450, 4000)) {
          lastBeep = now;
          audio.beep(clamp(1200 - d * 8, 300, 1200), 0.12);
          vibrate(d < 15 ? [90, 60, 90] : 50);
        }
        if (spawned < TOTAL && 1 - d / Math.max(d0, 20) >= marks[spawned] && now - lastSpawn > 4000) spawn();
        if (!arrivedFlag && arrivedAt(target, 20, d0)) { arrivedFlag = true; ctx.arrive(); }
      }
      // si se paran mucho (o ya han llegado) salen igualmente los que faltan
      if (spawned < TOTAL && now - lastSpawn > (arrivedFlag ? 2500 : 30000)) spawn();
      const c = ar.camPos();
      let nearest = null, nd = Infinity;
      for (const z of [...alive]) {
        if (z.userData.asleep) continue;
        ar.faceCamera(z);
        const dd = ar.flatDist(z);
        if (dd < nd) { nd = dd; nearest = z; }
        const busy = z.userData.st.busyUntil > z.userData.st.t;
        if (!busy) {
          const v = new THREE.Vector3(c.x - z.position.x, 0, c.z - z.position.z).normalize();
          z.position.addScaledVector(v, dt * z.userData.speed);
        }
        z.userData.st.lunge = dd < 1.8 ? 1 : 0;
        if (now > z.userData.nextGrowl) { z.userData.nextGrowl = now + rand(2000, 4000); audio.growl(Math.min(0.9, 1.6 / dd), -Math.sin(ar.relYaw(z))); }
        if (dd < 0.8) {
          ar.remove(z);
          alive = alive.filter((x) => x !== z);
          handled++;
          audio.bite();
          vibrate([400, 100, 200]);
          ar.flash('bite');
          const ms = biteMs(fear);
          if (ms) { ctx.penalty(ms); ar.toast(`🩸 ¡Te ha mordido! Perdéis ${ms / 1000} segundos.`); }
          upd();
        }
      }
      const awake = alive.some((z) => !z.userData.asleep);
      audio.heartbeat(nd < 2 ? 140 : nd < 4 ? 105 : awake ? 80 : 0);
      ar.arrow(nearest && ar.angleTo(nearest) > 0.5 ? ar.relYaw(nearest) : null);
      ar.setMsg(awake ? '🧟 ¡Un zombi! <b>Tócalo</b> para dormirlo.' : arrivedFlag ? '🧟 ¡Los últimos zombis protegen el laboratorio!' : '📡 Sigue el radar hasta el laboratorio');
      if (arrivedFlag && spawned >= TOTAL && handled >= TOTAL) {
        done = true;
        audio.heartbeat(0);
        ar.arrow(null);
        hud.remove();
        res();
      }
    }));
  });
}

function mixLab({ ar, audio }, cl) {
  return new Promise(async (res) => {
    ar.setMsg('📱 Apunta al frente, a un sitio despejado…', 0);
    // la mesa se coloca solo cuando delante hay al menos 3 m libres (sin árboles ni bancos)
    await ar.findClearSpot(3, 12000);
    ar.setMsg(audio.enabled ? '⚗️ ¡El laboratorio!' : '⚗️ ' + story.LAB_TEXT);
    audio.speak(story.LAB_TEXT);
    const table = makeLabTable();
    table.position.copy(ar.posAt(0, 2.3));
    ar.add(table, { floor: true });
    ar.faceCamera(table);
    const slots = [[-0.5, 0.83, 0.12], [0.5, 0.83, 0.12], [0.3, 0.83, 0.25]];
    const colors = [0x8b2be2, 0x2b6fe2, 0xffc400];
    let mixed = 0, flying = [], finished = false;
    for (let k = 1; k <= 3; k++) {
      const it = makeIngredient(k);
      it.scale.setScalar(1.6);
      it.position.set(...slots[k - 1]);
      it.userData.radius = 0.3;
      it.userData.onTap = (o) => { ar.untap(o); audio.click(); flying.push({ o, t: 0, from: o.position.clone() }); };
      table.add(it);
      ar.tappables.add(it);
    }
    ar.setCount('⚗️ 0 / 3');
    cl.push(ar.onUpdate((dt) => {
      table.userData.animate(dt);
      for (const f of [...flying]) {
        f.t += dt / 0.8;
        const k = Math.min(1, f.t);
        f.o.position.lerpVectors(f.from, table.userData.potPos, k);
        f.o.position.y += Math.sin(k * Math.PI) * 0.35;
        f.o.rotation.y += dt * 8;
        if (k >= 1) {
          table.remove(f.o);
          flying = flying.filter((x) => x !== f);
          mixed++;
          audio.splash();
          vibrate(100);
          table.userData.setColor(colors[mixed - 1]);
          ar.setCount(`⚗️ ${mixed} / 3`);
          if (mixed >= 3 && !finished) {
            finished = true;
            audio.win();
            ar.flash('gold');
            setTimeout(() => ar.flash('gold'), 500);
            ar.setMsg('✨ ¡ANTÍDOTO LISTO!');
            setTimeout(() => res(), 2600);
          }
        }
      }
    }));
  });
}

// Cara de zombi para los sustos (dibujo SVG)
export function scareFaceSVG(fear) {
  const blood = fear >= 2 ? `
    <path d="M60 175 q5 40 0 70 q-6 -30 -8 -70z M140 178 q4 30 0 55 q-5 -25 -6 -55z M95 182 q3 50 -1 85 q-6 -40 -5 -85z" fill="#9e0f1a"/>
    ${fear >= 3 ? '<circle cx="150" cy="60" r="14" fill="#7a0a12"/><path d="M40 70 l25 -5 l-20 25z" fill="#5c0a10"/><path d="M150 74 q4 30 0 50 q-5 -22 -4 -50z" fill="#9e0f1a"/>' : ''}` : '';
  return `<svg viewBox="0 0 200 280" class="scare-face" aria-hidden="true">
    <ellipse cx="100" cy="120" rx="80" ry="105" fill="#7d8c6a"/>
    <ellipse cx="65" cy="100" rx="24" ry="20" fill="#1b1b1b"/><ellipse cx="135" cy="100" rx="24" ry="20" fill="#1b1b1b"/>
    <circle cx="65" cy="102" r="7" fill="#fffbe6"/><circle cx="135" cy="102" r="7" fill="#fffbe6"/>
    <path d="M45 165 q55 -30 110 0 q-10 40 -55 42 q-45 -2 -55 -42z" fill="#1a0507"/>
    <path d="M55 162 l8 15 l8 -17 l8 17 l8 -18 l8 18 l8 -18 l8 17 l8 -17 l8 15 l8 -12z" fill="#e8e0c0"/>
    <path d="M30 60 l35 15 M38 55 l2 12 M48 60 l2 12 M58 65 l2 12" stroke="#3a2a2a" stroke-width="3"/>
    ${blood}
  </svg>`;
}
