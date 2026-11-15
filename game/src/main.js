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
import { moveActor } from './physics.js';
import { initRenderer, buildScene, renderFrame, resize } from './render.js';
import { attachFx } from './fx.js';
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
