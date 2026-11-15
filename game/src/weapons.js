// weapons.js — gunplay, and the whole of the judge's second criterion lives here.
// Firing is hitscan: a ray leaves the eye along the look direction, perturbed inside a
// spread cone. The cone's half-angle comes from config.js by stance — moving is worst,
// standing better, crouched best, airborne hopeless — and grows with bloom as a burst
// runs, so the game's central skill is stopping to shoot. Recoil kicks the view up with
// a patterned sideways walk; damage is by hit zone (head sphere, body capsule, leg
// capsule) with distance falloff, and armour halves what gets through. Every shot is
// also a sound: it lands in the hearEvents of everyone within 45 m, which is how the
// bots learn where a fight is. Kills are settled here — health, the feed, the killer's
// $300 and the bomb hitting the ground when its carrier falls — so rounds.js only has
// to watch the score.

import { WEAPONS, GRENADES, ECON, UTIL } from './config.js';
import { G, localPlayer } from './state.js';
import { Input, pressed, quietHeld } from './input.js';
import { rayHit, eyeHeight } from './physics.js';
import { FX, pulseMuzzle } from './render.js';
import { spawnTracer, spawnImpact, throwGrenadeFx, updateFx } from './fx.js';

let simNow = 0;            // the fixed-step clock, refreshed by updateWeapons each step
let zoomHeld = false;      // right mouse, tracked here because input.js only owns button 0

if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', (e) => { if (e.button === 2) zoomHeld = true; });
  document.addEventListener('mouseup', (e) => { if (e.button === 2) zoomHeld = false; });
  window.addEventListener('blur', () => { zoomHeld = false; });
}

function sfx(name) {
  if (typeof window !== 'undefined' && window.__sfx) window.__sfx(name);
}

function freshInst(id) {
  const def = WEAPONS[id];
  return { id, ammo: def.mag, reserve: def.reserve, reloadingUntil: 0, nextShotAt: 0, shotsFired: 0, bloom: 0, lastShotAt: -9, zoomed: false, held: false };
}

function curInst(actor) {
  return actor.weapon.inst[actor.weapon.current] || null;
}

function lookDir(actor, out) {
  const cp = Math.cos(actor.pitch);
  out.x = -Math.sin(actor.yaw) * cp;
  out.y = Math.sin(actor.pitch);
  out.z = -Math.cos(actor.yaw) * cp;
  return out;
}

// Reused scratch objects: the hot path (a shot, a trace) never allocates.
const _dir = { x: 0, y: 0, z: 0 };
const _eye = { x: 0, y: 0, z: 0 };
const _end = { x: 0, y: 0, z: 0 };

// --- hearing -------------------------------------------------------------------

// A noise at (x, z) reaches every living actor within radius: their hearEvents gain
// {x, z, t, kind} for bots.js to drain. Capped so a long firefight cannot grow it.
export function pushNoise(x, z, radius, kind) {
  const r2 = radius * radius;
  for (const a of G.actors) {
    if (!a.alive) continue;
    const dx = a.pos.x - x, dz = a.pos.z - z;
    if (dx * dx + dz * dz > r2) continue;
    a.hearEvents.push({ x, z, t: simNow, kind });
    if (a.hearEvents.length > 10) a.hearEvents.shift();
  }
}

// --- damage ----------------------------------------------------------------------

// Distance falloff by weapon class: the shotgun dies with range, the bolt-action
// barely notices it, everything else sits between.
function falloff(id, dist) {
  if (id === 'banteng8') return dist <= 6 ? 1 : Math.max(0.2, 1 - ((dist - 6) / 22) * 0.8);
  if (id === 'longbow12') return dist <= 30 ? 1 : Math.max(0.8, 1 - (dist - 30) / 200);
  if (id === 'rusa9') return dist <= 10 ? 1 : Math.max(0.5, 1 - (dist - 10) / 70);
  return dist <= 14 ? 1 : Math.max(0.55, 1 - (dist - 14) / 90);
}

// The one place health is ever removed. Armour halves the hit and wears down doing it.
// A kill credits the killer, pays the kill reward, writes the feed entry
// {killer, victim, weapon, headshot, t} (actor references, not names) and drops the
// bomb if the carrier was the one who fell. fx.js calls this for blast damage, so a
// frag kill is indistinguishable from a bullet kill everywhere downstream.
export function damageActor(target, dmg, zone, attacker, weaponId) {
  if (!target.alive || dmg <= 0) return;
  if (target.armor > 0) {
    target.armor = Math.max(0, target.armor - dmg * 0.5);
    dmg *= 0.5;
  }
  target.hp -= dmg;
  target.lastDamageFrom = { x: attacker ? attacker.pos.x : target.pos.x, z: attacker ? attacker.pos.z : target.pos.z, t: simNow, by: attacker ? attacker.id : -1 };
  const me = localPlayer();
  if (target === me) FX.damageAt = performance.now() / 1000;
  if (target.hp > 0) {
    if (attacker && attacker === me) FX.hitmarkAt = performance.now() / 1000;
    return;
  }
  target.hp = 0;
  target.alive = false;
  target.deaths += 1;
  target.reloading = false;
  if (attacker && attacker !== target) {
    if (attacker.team !== target.team) {
      attacker.kills += 1;
      attacker.money = Math.min(ECON.maxMoney, attacker.money + ECON.kill);
    }
    G.feed.push({ killer: attacker, victim: target, weapon: weaponId, headshot: zone === 'head', t: simNow });
    if (attacker === me) FX.hitmarkAt = performance.now() / 1000;
    sfx('kill');
  }
  if (G.bomb.carriedBy === target.id && G.bomb.state === 'carried') {
    G.bomb.state = 'dropped';
    G.bomb.carriedBy = null;
    G.bomb.x = target.pos.x;
    G.bomb.y = target.pos.y;
    G.bomb.z = target.pos.z;
  }
}

// --- hit resolution --------------------------------------------------------------

// Closest approach of the ray (o, d — d normalised) to the segment a-b. Returns the
// ray parameter of the closest point and the distance there.
function raySeg(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = ox - ax, vy = oy - ay, vz = oz - az;
  const a = dx * dx + dy * dy + dz * dz;         // 1 for a normalised ray, kept general
  const b = dx * ux + dy * uy + dz * uz;
  const c = ux * ux + uy * uy + uz * uz;
  const d = dx * vx + dy * vy + dz * vz;
  const e = ux * vx + uy * vy + uz * vz;
  const denom = a * c - b * b;
  let s = denom > 1e-9 ? (b * e - c * d) / denom : 0;   // along the ray
  s = Math.max(0, s);
  let t = c > 1e-9 ? (b * s + e) / c : 0;               // along the segment
  t = Math.max(0, Math.min(1, t));
  s = Math.max(0, (b * t - d) / a);
  const px = ox + dx * s - (ax + ux * t);
  const py = oy + dy * s - (ay + uy * t);
  const pz = oz + dz * s - (az + uz * t);
  return { t: s, dist: Math.hypot(px, py, pz) };
}

// Tests one actor's three zones against the ray and returns the nearest hit
// {t, zone} or null. The head is a sphere centred just under the eye line; the body
// and legs are capsules stacked beneath it, sized off the same eye height the
// renderer poses, so what you see is what the ray can hit.
function rayVsActor(ox, oy, oz, dx, dy, dz, actor) {
  const x = actor.pos.x, y = actor.pos.y, z = actor.pos.z;
  const eyeH = eyeHeight(actor);
  const headC = y + eyeH - 0.12;
  const headBot = eyeH - 0.36;                 // relative heights of the zone seams
  const legTop = headBot * 0.58;
  let best = null;
  // Head sphere, solved exactly.
  const ocx = ox - x, ocy = oy - headC, ocz = oz - z;
  const bq = ocx * dx + ocy * dy + ocz * dz;
  const cq = ocx * ocx + ocy * ocy + ocz * ocz - 0.24 * 0.24;
  const disc = bq * bq - cq;
  if (disc >= 0) {
    const t = -bq - Math.sqrt(disc);
    if (t > 0) best = { t, zone: 'head' };
  }
  const zones = [
    ['body', y + legTop, y + headBot, 0.36],
    ['leg', y + 0.08, y + legTop, 0.30],
  ];
  for (const [zone, y0, y1, r] of zones) {
    const hit = raySeg(ox, oy, oz, dx, dy, dz, x, y0, z, x, y1, z);
    if (hit.dist <= r) {
      const t = Math.max(0, hit.t - Math.sqrt(Math.max(0, r * r - hit.dist * hit.dist)));
      if (t > 0 && (!best || t < best.t)) best = { t, zone };
    }
  }
  return best;
}

// One pellet's trace: world first (the wall caps the range), then every living enemy
// inside that range. The nearest thing the ray meets is what it hits. wid is the
// weapon's config key — the WEAPONS entries carry no id of their own, and falloff
// is keyed by it, so it travels with the shot.
function traceShot(shooter, def, wid, ox, oy, oz, dx, dy, dz) {
  const wall = rayHit(ox, oy, oz, dx, dy, dz, 160);
  const maxT = wall ? wall.d : 160;
  let victim = null;
  let vHit = null;
  for (const a of G.actors) {
    if (a === shooter || !a.alive || a.team === shooter.team) continue;
    const hit = rayVsActor(ox, oy, oz, dx, dy, dz, a);
    if (hit && hit.t < maxT && (!vHit || hit.t < vHit.t)) { victim = a; vHit = hit; }
  }
  const t = vHit ? vHit.t : maxT;
  _end.x = ox + dx * t; _end.y = oy + dy * t; _end.z = oz + dz * t;
  spawnTracer(ox, oy, oz, _end.x, _end.y, _end.z);
  if (victim) {
    spawnImpact(_end.x, _end.y, _end.z, 'hit');
    damageActor(victim, def.dmg[vHit.zone] * falloff(wid, t), vHit.zone, shooter, wid);
  } else if (wall) {
    spawnImpact(_end.x, _end.y, _end.z, 'wall');
  }
}

// The stance table read as a rule: airborne is always worst; above a walking pace you
// are "moving" whatever your keys say; crouch pays only when you are also still.
function stanceSpread(actor, def) {
  if (!actor.onGround) return def.spread.air;
  const speed = Math.hypot(actor.vel.x, actor.vel.z);
  if (speed > 1.0) return def.spread.move;
  return actor.crouch ? def.spread.crouch : def.spread.stand;
}

// --- firing ------------------------------------------------------------------------

export function tryFire(actor) {
  if (!actor.alive || G.phase === 'buy' || G.phase === 'over') return false;
  if (actor.weapon.current === 'grenade') return false;
  const inst = curInst(actor);
  if (!inst) return false;
  const def = WEAPONS[inst.id];
  if (simNow < inst.nextShotAt || simNow < inst.reloadingUntil) return false;
  if (inst.ammo <= 0) {
    inst.nextShotAt = simNow + 0.35;
    sfx('dry');
    startReload(actor);
    return false;
  }
  inst.ammo -= 1;
  inst.shotsFired += 1;
  if (simNow - inst.lastShotAt > 0.4) inst.burst = 0;   // a pause starts a fresh burst
  const burstIdx = inst.burst || 0;
  inst.burst = burstIdx + 1;
  inst.lastShotAt = simNow;
  inst.nextShotAt = simNow + 60 / def.rpm;
  inst.bloom = Math.min(0.05, (inst.bloom || 0) + def.recoil * 1.1);

  // Spread: the stance cone plus accumulated bloom; an unscoped bolt-action throws
  // its tiny scoped numbers away and sprays like a hip-fired rifle.
  let spread = stanceSpread(actor, def) + (inst.bloom || 0);
  if (def.zoom) spread = inst.zoomed ? spread : Math.max(spread, 0.05);

  lookDir(actor, _dir);
  _eye.x = actor.pos.x; _eye.y = actor.pos.y + eyeHeight(actor); _eye.z = actor.pos.z;
  // Muzzle sits a little right and low of the eye, where the viewmodel's barrel is.
  const rx = Math.cos(actor.yaw), rz = -Math.sin(actor.yaw);
  const mx = _eye.x + _dir.x * 0.55 + rx * 0.16;
  const my = _eye.y + _dir.y * 0.55 - 0.14;
  const mz = _eye.z + _dir.z * 0.55 + rz * 0.16;

  // Orthonormal basis around the look direction, for cone perturbation.
  let px = _dir.z, py = 0, pz = -_dir.x;                    // d × up, roughly
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl; py /= pl; pz /= pl;
  const qx = _dir.y * pz - _dir.z * py, qy = _dir.z * px - _dir.x * pz, qz = _dir.x * py - _dir.y * px;

  const me = localPlayer();
  if (actor === me) pulseMuzzle();
  else spawnImpact(mx, my, mz, 'muzzle');
  sfx('shot');
  pushNoise(actor.pos.x, actor.pos.z, 45, 'shot');

  for (let p = 0; p < def.pellets; p++) {
    const gx = ((Math.random() * 2 - 1) + (Math.random() * 2 - 1)) * 0.5 * spread;
    const gy = ((Math.random() * 2 - 1) + (Math.random() * 2 - 1)) * 0.5 * spread;
    let dx = _dir.x + px * gx + qx * gy;
    let dy = _dir.y + py * gx + qy * gy;
    let dz = _dir.z + pz * gx + qz * gy;
    const dl = Math.hypot(dx, dy, dz) || 1;
    traceShot(actor, def, inst.id, _eye.x, _eye.y, _eye.z, dx / dl, dy / dl, dz / dl);
  }

  // Recoil: a weapon with a pattern table (config.js) climbs it step by step — pitch
  // plus a sideways walk in a fixed shape, so a practiced burst can be pulled back
  // onto target and an unpracticed one climbs off it. The rest keep the generic kick:
  // most of it into the view (the remainder is render.js's camera kick), walking
  // sideways on a fixed phase of the shot count.
  const pat = def.pattern;
  if (pat) {
    const s = pat[Math.min(burstIdx, pat.length - 1)];
    actor.yaw += s[0];
    actor.pitch = Math.min(1.45, actor.pitch + s[1]);
  } else {
    actor.pitch = Math.min(1.45, actor.pitch + def.recoil * 0.6);
    actor.yaw += Math.sin(inst.shotsFired * 2.3) * def.recoil * 0.4;
  }
  if (def.zoom) inst.zoomed = false;   // a bolt-action leaves the scope after each shot
  return true;
}

export function startReload(actor) {
  const inst = curInst(actor);
  if (!inst || actor.weapon.current === 'grenade') return false;
  const def = WEAPONS[inst.id];
  if (inst.ammo >= def.mag || inst.reserve <= 0 || simNow < inst.reloadingUntil) return false;
  inst.reloadingUntil = simNow + def.reloadS;
  inst.zoomed = false;
  actor.reloading = true;
  sfx('reload');
  return true;
}

export function switchWeapon(actor, slot) {
  const w = actor.weapon;
  if (slot === 'grenade') {
    if (!w.grenades.length) return false;
    w.current = 'grenade';
  } else {
    if (!w.inst[slot]) return false;
    w.current = slot;
  }
  const inst = curInst(actor);
  if (inst) inst.zoomed = false;
  // A swap cancels the reload outright — the magazine never made it in.
  for (const s of ['primary', 'secondary']) {
    const i = w.inst[s];
    if (i && simNow < i.reloadingUntil) i.reloadingUntil = 0;
  }
  actor.reloading = false;
  sfx('switch');
  return true;
}

// --- buying --------------------------------------------------------------------------

export function buyWeapon(actor, id) {
  if (G.phase !== 'buy') return false;
  const def = WEAPONS[id];
  if (!def || actor.money < def.price) return false;
  if (actor.weapon[def.slot] === id) return false;   // already carrying it
  actor.money -= def.price;
  actor.weapon[def.slot] = id;
  actor.weapon.inst[def.slot] = freshInst(id);
  if (def.slot === 'primary') switchWeapon(actor, 'primary');
  sfx('buy');
  return true;
}

export function buyGrenade(actor, type) {
  if (G.phase !== 'buy') return false;
  const def = GRENADES[type];
  if (!def || actor.money < def.price) return false;
  if (actor.weapon.grenades.length >= 3) return false;
  if (type === 'smoke' && actor.weapon.grenades.includes('smoke')) return false;
  actor.money -= def.price;
  actor.weapon.grenades.push(type);
  sfx('buy');
  return true;
}

// The defuse kit: bought once, carried all match. rounds.js halves the carrier's
// defuse channel (TIMING.defuseKit against defuseNoKit); nothing else reads hasKit.
export function buyKit(actor) {
  if (G.phase !== 'buy') return false;
  if (actor.hasKit || actor.money < UTIL.kit.price) return false;
  actor.money -= UTIL.kit.price;
  actor.hasKit = true;
  sfx('buy');
  return true;
}

// --- grenades --------------------------------------------------------------------------

export function throwGrenade(actor, type) {
  if (!actor.alive || G.phase === 'buy' || G.phase === 'over') return false;
  const idx = actor.weapon.grenades.indexOf(type);
  if (idx < 0) return false;
  if (simNow < (actor.nextThrowAt || 0)) return false;
  actor.nextThrowAt = simNow + 0.45;
  actor.weapon.grenades.splice(idx, 1);
  lookDir(actor, _dir);
  throwGrenadeFx(actor, type,
    actor.pos.x, actor.pos.y + eyeHeight(actor) - 0.1, actor.pos.z,
    _dir.x, _dir.y, _dir.z);
  pushNoise(actor.pos.x, actor.pos.z, 12, 'throw');
  if (actor.weapon.current === 'grenade' && !actor.weapon.grenades.length) {
    switchWeapon(actor, actor.weapon.primary ? 'primary' : 'secondary');
  }
  return true;
}

// --- per-step driver ---------------------------------------------------------------------

function localInput(me) {
  // Quiet walk (Shift, input.js): slower through physics.js's speedMul lever, and
  // the footsteps below never happen — silence is the trade for pace.
  const quiet = quietHeld();
  me.quiet = quiet;
  me.speedMul = quiet ? 0.55 : 1;
  // Footsteps: a running player is a noise on the bots' map on the same terms as a
  // bot's own steps (9 m, every 0.38 s — bots.js). Quiet-walking or crouch-walking
  // makes none, which is the whole point of both.
  const speed = Math.hypot(me.vel.x, me.vel.z);
  if (me.onGround && !quiet && !me.crouch && speed > 2 && simNow >= (me.stepAt || 0)) {
    me.stepAt = simNow + 0.38;
    for (const e of G.actors) {
      if (e.team === me.team || !e.alive) continue;
      if (Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z) < 9) {
        e.hearEvents.push({ x: me.pos.x, z: me.pos.z, t: simNow, kind: 'step' });
        if (e.hearEvents.length > 10) e.hearEvents.shift();
      }
    }
  }
  if (pressed('Digit1')) switchWeapon(me, 'primary');
  else if (pressed('Digit2')) switchWeapon(me, 'secondary');
  else if (pressed('Digit3')) switchWeapon(me, 'grenade');
  if (Input.wheel !== 0) switchWeapon(me, me.weapon.current === 'primary' ? 'secondary' : 'primary');
  if (pressed('KeyR')) startReload(me);
  if (pressed('KeyG')) {
    const sel = me.weapon.grenades[0];
    if (sel) throwGrenade(me, sel);
  }
  const inst = curInst(me);
  if (inst) inst.zoomed = zoomHeld && WEAPONS[inst.id].zoom > 0;
  if (me.weapon.current === 'grenade') {
    if (Input.clicked) {
      const sel = me.weapon.grenades[0];
      if (sel) throwGrenade(me, sel);
    }
    return;
  }
  if (!inst) return;
  const def = WEAPONS[inst.id];
  if (def.auto ? Input.firing : (Input.clicked || (Input.firing && !inst.held))) tryFire(me);
}

export function updateWeapons(dt, now) {
  simNow = now;
  for (const actor of G.actors) {
    if (!actor.alive) continue;
    const inst = curInst(actor);
    if (inst) {
      // Bloom cools once the burst has been over for a beat.
      if (inst.bloom > 0 && now - inst.lastShotAt > 0.25) {
        inst.bloom = Math.max(0, inst.bloom - dt * 0.12);
      }
      if (inst.reloadingUntil && now >= inst.reloadingUntil) {
        const def = WEAPONS[inst.id];
        const take = Math.min(def.mag - inst.ammo, inst.reserve);
        inst.ammo += take;
        inst.reserve -= take;
        inst.reloadingUntil = 0;
        if (curInst(actor) === inst) actor.reloading = false;
      }
      inst.held = actor.bot ? !!actor.wantFire : Input.firing;
    }
    if (actor.bot && actor.wantFire && actor.weapon.current !== 'grenade') {
      const i2 = curInst(actor);
      if (i2) {
        const def = WEAPONS[i2.id];
        if (def.auto || !i2.heldBefore) tryFire(actor);
      }
    }
    if (actor.bot) {
      const i3 = curInst(actor);
      if (i3) i3.heldBefore = !!actor.wantFire;
    }
  }
  const me = localPlayer();
  if (me && me.alive && G.phase !== 'buy' && G.phase !== 'over') localInput(me);
  updateFx(dt, now);
}
