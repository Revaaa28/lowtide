// main.js — boot and the one loop. The simulation runs at a fixed 60 Hz (an accumulator
// drains real elapsed time into whole steps, so the game plays identically on a 60 Hz
// and a 144 Hz display), and rendering happens once per animation frame from whatever
// the last step left in state. A step is: read the local player's input, move them, then
// hand the world to weapons.js (gunplay), bots.js (the other nine actors) and rounds.js
// (phases, the bomb, the money) — each imported below and each owning exactly one job.
//
// With ?stage=buy|mid|plant|over the game instead poses one honest scene for the entry's
// screenshots: input.js writes the pose into state and the simulation never runs.

import { G, newMatch, localPlayer } from './state.js';
import { Input, initInput, down, pressed, consumeMouse, endStep, stageName, applyStage } from './input.js';
import { moveActor, eyeHeight } from './physics.js';
import { initRenderer, buildScene, renderFrame, resize, pulseMuzzle } from './render.js';
import { attachFx, spawnTracer, stageSmoke } from './fx.js';
import { updateWeapons } from './weapons.js';
import { updateBots } from './bots.js';
import { updateRounds } from './rounds.js';
import { initHUD, updateHUD } from './hud.js';

const STEP = 1 / 60;
const LOOK_SENS = 0.0021;

const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('start-overlay');
attachFx(initRenderer(canvas).scene);
initInput(canvas);
newMatch();
buildScene();
initHUD();

const stage = stageName();
if (stage) {
  applyStage(stage);
  overlay.style.display = 'none';
  document.body.classList.add('staged');
  if (stage === 'hero') {
    // The one dressing a pose cannot write into state: the shot itself. The tracer
    // is fx.js's own pooled line, drawn from the muzzle offset weapons.js fires
    // from to the target's chest; the smoke is fx.js's own volume, already
    // deployed; the flash is render.js's, re-pulsed so it is lit whenever the
    // shutter falls. Nothing here invents an object the game does not have.
    const me = localPlayer();
    const target = G.actors[5];
    const ey = me.pos.y + eyeHeight(me);
    const cp = Math.cos(me.pitch);
    const dx = -Math.sin(me.yaw) * cp, dy = Math.sin(me.pitch), dz = -Math.cos(me.yaw) * cp;
    const rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    spawnTracer(
      me.pos.x + dx * 0.55 + rx * 0.16, ey + dy * 0.55 - 0.14, me.pos.z + dz * 0.55 + rz * 0.16,
      target.pos.x, target.pos.y + 1.15, target.pos.z,
    );
    stageSmoke(31.5, 28.5, 0, 0.5);
    pulseMuzzle();
    setInterval(pulseMuzzle, 90);
  }
} else {
  overlay.addEventListener('click', () => canvas.requestPointerLock());
  document.addEventListener('pointerlockchange', () => {
    overlay.style.display = Input.locked ? 'none' : 'flex';
  });
  canvas.addEventListener('click', () => {
    if (!Input.locked) canvas.requestPointerLock();
  });
}
window.addEventListener('resize', resize);

let simT = 0;

// One fixed step of the world. The buy phase doubles as the freeze (config.js): the
// player may look around and shop, but nobody moves until the round goes live.
function step() {
  simT += STEP;
  const me = localPlayer();
  if (me && me.alive) {
    const m = consumeMouse();
    me.yaw -= m.dx * LOOK_SENS;
    me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - m.dy * LOOK_SENS));
    if (G.phase !== 'buy') {
      const f = (down('KeyW') ? 1 : 0) - (down('KeyS') ? 1 : 0);
      const r = (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0);
      const fx = -Math.sin(me.yaw);
      const fz = -Math.cos(me.yaw);
      const rx = Math.cos(me.yaw);
      const rz = -Math.sin(me.yaw);
      let wx = fx * f + rx * r;
      let wz = fz * f + rz * r;
      const len = Math.hypot(wx, wz);
      if (len > 1) { wx /= len; wz /= len; }
      me.crouch = down('ControlLeft') || down('KeyC');
      if (pressed('Space')) me.jumpQueued = true;
      moveActor(me, wx, wz, STEP);
    }
  }
  updateWeapons(STEP, simT);
  updateBots(STEP, simT);
  updateRounds(STEP, simT);
  endStep();
}

let last = performance.now();
let acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min((t - last) / 1000, 0.25);
  last = t;
  if (!stage) {
    acc += dt;
    while (acc >= STEP) {
      step();
      acc -= STEP;
    }
  }
  renderFrame();
  updateHUD();
}
requestAnimationFrame(frame);
