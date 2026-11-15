// input.js — keyboard and mouse state for the local player, plus the screenshot staging
// hook. Input is a plain object the simulation polls: keys holds every code currently
// down, pressed holds the codes that went down since the last step (main.js clears it
// after each fixed step via endStep), mouse deltas accumulate between consumeMouse calls.
// Pointer lock is requested by main.js's start overlay; this module only tracks it.
//
// The staging hook (?stage=buy|mid|plant|over) poses a real scene for the entry's
// screenshots: it writes genuine game state into G — actors standing where the pose puts
// them, the bomb where the phase says it is — and the ordinary renderer draws it. Nothing
// is composited or faked; it is the game, arranged.

import { G } from './state.js';
import { TIMING } from './config.js';
import { groundHeightAt } from './physics.js';

export const Input = {
  keys: new Set(),
  pressed: new Set(),
  mouseDX: 0,
  mouseDY: 0,
  firing: false,
  clicked: false,       // mouse went down since the last step (semi-auto weapons read this)
  wheel: 0,
  locked: false,
};

export function down(code) {
  return Input.keys.has(code);
}

// Quiet walk is Shift (either side), held: weapons.js reads it each step to slow the
// player through physics.js's speedMul and to silence their footsteps entirely —
// the counter to bot hearing. It needs no state of its own; the keys set above
// already tracks Shift like any other code.
export function quietHeld() {
  return down('ShiftLeft') || down('ShiftRight');
}

export function pressed(code) {
  return Input.pressed.has(code);
}

export function consumeMouse() {
  const out = { dx: Input.mouseDX, dy: Input.mouseDY };
  Input.mouseDX = 0;
  Input.mouseDY = 0;
  return out;
}

export function endStep() {
  Input.pressed.clear();
  Input.clicked = false;
  Input.wheel = 0;
}

export function initInput(dom) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (!e.repeat) Input.pressed.add(e.code);
    Input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => Input.keys.delete(e.code));
  window.addEventListener('blur', () => {
    Input.keys.clear();
    Input.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    Input.locked = document.pointerLockElement === dom;
    if (!Input.locked) Input.firing = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (!Input.locked) return;
    Input.mouseDX += e.movementX || 0;
    Input.mouseDY += e.movementY || 0;
  });
  document.addEventListener('mousedown', (e) => {
    if (!Input.locked || e.button !== 0) return;
    Input.firing = true;
    Input.clicked = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) Input.firing = false;
  });
  document.addEventListener('wheel', (e) => {
    if (Input.locked) Input.wheel += Math.sign(e.deltaY);
  }, { passive: true });
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
}

// --- staging ---------------------------------------------------------------

export function stageName() {
  return new URLSearchParams(window.location.search).get('stage');
}

function place(actor, x, z, yaw, opts = {}) {
  actor.pos.x = x;
  actor.pos.z = z;
  actor.pos.y = groundHeightAt(x, z, 10);
  actor.yaw = yaw;
  actor.pitch = opts.pitch || 0;
  actor.crouch = !!opts.crouch;
  actor.alive = opts.dead ? false : true;
  if (opts.hp) actor.hp = opts.hp;
  if (opts.weapon) {
    actor.weapon.primary = opts.weapon;
    actor.weapon.inst.primary = { id: opts.weapon, ammo: 25, reserve: 60, reloadingUntil: 0, nextShotAt: 0, shotsFired: 0 };
    actor.weapon.current = 'primary';
  }
}

// Poses the scene named by ?stage=. Called by main.js once, after newMatch() and after the
// renderer exists. The local player's camera comes from the pose like any other frame.
export function applyStage(name) {
  const [you, a1, a2, a3, a4, d0, d1, d2, d3, d4] = G.actors;
  G.staged = name;
  if (name === 'buy') {
    G.phase = 'buy';
    G.round = 3;
    G.score.atk = 2; G.score.def = 1;
    G.buyUntil = TIMING.buy;
    you.money = 3400;
    place(you, -4, 25.5, 0);
    place(a1, -8, 20.5, 3.0);
    place(a2, 0, 20, 2.9);
    place(a3, -12, 22, 2.6);
    place(a4, 4, 21.5, -2.8);
  } else if (name === 'mid') {
    G.phase = 'live';
    G.round = 5;
    G.score.atk = 3; G.score.def = 2;
    G.timeLeft = 63;
    place(you, -10, 6, -0.55, { weapon: 'ar57' });
    place(a1, -11.5, -2, -0.2, { weapon: 'ar57' });
    place(a2, 0, 2, 0, { dead: true });
    place(a3, -20, 16, -0.9, { weapon: 'rusa9' });
    place(d0, 10, -6, 2.6, { weapon: 'ar57' });
    place(d1, 3, -15, 2.9, { weapon: 'rusa9', crouch: true });
    place(d2, 11.5, -9.5, -1.8, { weapon: 'longbow12' });
    G.bomb.carriedBy = a3.id;
  } else if (name === 'plant') {
    G.phase = 'planted';
    G.round = 8;
    G.score.atk = 4; G.score.def = 3;
    G.bomb.state = 'planted';
    G.bomb.site = 'A';
    G.bomb.x = -37.5; G.bomb.y = 0; G.bomb.z = -25;
    G.bomb.t = 22;
    G.bomb.carriedBy = null;
    place(you, -34, -22.5, 0.9, { weapon: 'ar57', pitch: -0.28 });
    place(a1, -30, -24, 1.9, { weapon: 'ar57' });
    place(a2, -11.5, 11.5, 3.1, { weapon: 'longbow12' });
    place(d0, -36.9, -24.1, -0.7, { crouch: true, weapon: 'rusa9' });
    place(d1, -36, -29.5, 2.82, { weapon: 'ar57' });
    place(d2, -20, -15, -1.2, { weapon: 'rusa9' });
  } else if (name === 'hero') {
    // The cover frame: a live fight in the gantry lane at the Gate Winch — you are
    // mid-burst on the defender standing in the site ring, the painted GATE WINCH
    // sign over his head, a teammate at your shoulder, and the smoke from the lane
    // fight still hanging off to the left. main.js adds the tracer, the muzzle
    // flash and the smoke volume itself.
    G.phase = 'live';
    G.round = 7;
    G.score.atk = 4; G.score.def = 2;
    G.timeLeft = 47;
    you.money = 2650;
    you.hp = 82; you.armor = 50; you.hasKit = true;
    you.weapon.grenades = ['nanas', 'smoke'];
    place(you, 26, 20, -2.034, { weapon: 'ar57', pitch: -0.05 });
    you.weapon.inst.primary.ammo = 17;
    place(a1, 24.2, 22.6, -1.9, { weapon: 'rusa9' });
    place(a2, 31.5, 22.8, 0.6, { dead: true });
    place(a3, 20, 26, -0.9, { weapon: 'ar57' });
    place(d0, 35.2, 24.5, 1.107, { weapon: 'ar57', hp: 55 });
    place(d1, 33, 16.8, 1.99, { weapon: 'rusa9', crouch: true });
    place(d2, 11.5, -9.5, -1.8, { weapon: 'longbow12' });
    place(d4, 2, -24, 3.14, { dead: true });
    G.bomb.carriedBy = you.id;
    G.feed.push({ killer: a1, victim: d4, weapon: 'rusa9', headshot: true, t: 0 });
    G.feed.push({ killer: d0, victim: a2, weapon: 'ar57', headshot: false, t: 0 });
    G.callouts = [{ name: a1.name, team: 'atk', text: 'contact B' }];
  } else if (name === 'over') {
    G.phase = 'over';
    G.round = 12;
    G.score.atk = 7; G.score.def = 5;
    G.winner = 'atk'; G.matchOver = true;
    G.actors.forEach((a, i) => { a.kills = (i * 7 + 3) % 11; a.deaths = (i * 5 + 2) % 9; });
    G.winReason = 'The charge detonated on the Pump House.';
    G.bomb.state = 'exploded';
    G.bomb.site = 'A';
    G.bomb.x = -37.5; G.bomb.y = 0; G.bomb.z = -25;
    place(you, -34, -22.5, 0.9, { weapon: 'ar57' });
    place(a1, -31, -26, 2.2, { weapon: 'rusa9' });
    place(a2, -38, -19.5, 2.6);
    place(d0, -36.5, -24, 0, { dead: true });
    place(d1, -33, -28, 0, { dead: true });
  }
}
