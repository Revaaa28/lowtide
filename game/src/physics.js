// physics.js — actor movement and world raycasts against map.js data. Movement is the
// tactical-shooter feel the whole game is tuned around: high ground friction so a player
// stops dead when they release a key (stopping to aim pays), weak air control, a short
// hop rather than a platformer jump, and a 0.55 m step so crates, channel steps and the
// catwalk ramps climb without a jump. Actors are cylinders of radius 0.35; collision is
// resolved one axis at a time, which gives wall sliding for free. Heights come from
// groundHeightAt: the map's ground zones (channel floor and steps) plus the tops of any
// colliders the actor is high enough to stand on (catwalks, bridges, crates).

import { MAP } from './map.js';

export const RADIUS = 0.35;
export const STEP = 0.55;
export const HEIGHT_STAND = 1.8;
export const HEIGHT_CROUCH = 1.3;

const RUN_SPEED = 4.6;
const CROUCH_SPEED = 1.7;
const GROUND_FRICTION = 9;
const GROUND_ACCEL = 45;
const AIR_ACCEL = 4;
const GRAVITY = 22;
const JUMP_VEL = 6.3;

export function eyeHeight(actor) {
  return actor.crouch ? 1.18 : 1.62;
}

export function actorHeight(actor) {
  return actor.crouch ? HEIGHT_CROUCH : HEIGHT_STAND;
}

// The height of the map's base ground at a point: a ground zone if inside one, else 0.
export function baseHeightAt(x, z) {
  for (const zn of MAP.groundZones) {
    if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn.y;
  }
  return 0;
}

// The walkable height at a point for an actor whose feet are at refY: the base ground, or
// the top of a collider the actor could step onto (top no more than STEP above the feet).
export function groundHeightAt(x, z, refY) {
  let g = baseHeightAt(x, z);
  for (const c of MAP.colliders) {
    if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) {
      const top = c.y0 + c.h;
      if (top <= refY + STEP + 1e-4 && top > g) g = top;
    }
  }
  return g;
}

// Does collider c block an actor standing at feetY? Not if the actor can step onto its
// top, and not if the actor passes entirely beneath it (the bridges, the crane beam).
function blocksAt(c, feetY, height) {
  const top = c.y0 + c.h;
  if (feetY >= top - STEP) return false;
  if (feetY + height <= c.y0 + 0.02) return false;
  return true;
}

function circleHitsBox(x, z, c) {
  const nx = Math.max(c.x0, Math.min(x, c.x1));
  const nz = Math.max(c.z0, Math.min(z, c.z1));
  const dx = x - nx;
  const dz = z - nz;
  return dx * dx + dz * dz < RADIUS * RADIUS;
}

// Advances one actor by dt. wishX/wishZ is the desired move direction in world space
// (length 0..1); the caller rotates input or bot steering into it. actor.jumpQueued is
// consumed here. Crouch is read from actor.crouch, set by the caller.
export function moveActor(actor, wishX, wishZ, dt) {
  const p = actor.pos;
  const v = actor.vel;
  const maxSpeed = (actor.crouch ? CROUCH_SPEED : RUN_SPEED) * (actor.speedMul || 1);

  if (actor.onGround) {
    const damp = Math.max(0, 1 - GROUND_FRICTION * dt);
    v.x *= damp;
    v.z *= damp;
    v.x += wishX * GROUND_ACCEL * dt;
    v.z += wishZ * GROUND_ACCEL * dt;
    const hs = Math.hypot(v.x, v.z);
    if (hs > maxSpeed) {
      v.x *= maxSpeed / hs;
      v.z *= maxSpeed / hs;
    }
    if (actor.jumpQueued) {
      v.y = JUMP_VEL;
      actor.onGround = false;
    }
  } else {
    v.x += wishX * AIR_ACCEL * dt;
    v.z += wishZ * AIR_ACCEL * dt;
  }
  actor.jumpQueued = false;

  v.y = Math.max(v.y - GRAVITY * dt, -32);

  moveAxis(actor, 'x', v.x * dt);
  moveAxis(actor, 'z', v.z * dt);

  p.y += v.y * dt;
  const ground = groundHeightAt(p.x, p.z, p.y - v.y * dt);
  if (p.y <= ground) {
    p.y = ground;
    v.y = 0;
    actor.onGround = true;
  } else if (p.y > ground + 0.02) {
    actor.onGround = false;
  }
}

function moveAxis(actor, axis, delta) {
  if (delta === 0) return;
  const p = actor.pos;
  const from = p[axis];
  const to = from + delta;
  const nx = axis === 'x' ? to : p.x;
  const nz = axis === 'z' ? to : p.z;
  // A rise steeper than STEP is a wall, whatever the colliders say (channel sides, steps).
  if (groundHeightAt(nx, nz, p.y) > p.y + STEP + 1e-4) return;
  const height = actorHeight(actor);
  for (const c of MAP.colliders) {
    if (blocksAt(c, p.y, height) && circleHitsBox(nx, nz, c)) return;
  }
  p[axis] = Math.max(MAP.bounds[axis === 'x' ? 'minX' : 'minZ'], Math.min(to, MAP.bounds[axis === 'x' ? 'maxX' : 'maxZ']));
}

// Casts a ray against every collider box and the ground (zones and the y=0 plane outside
// them). Returns the nearest hit {d, nx, ny, nz} or null. Direction need not be normalised;
// d is in the same units as the direction's length.
export function rayHit(ox, oy, oz, dx, dy, dz, maxD) {
  let best = null;
  const consider = (t, nx, ny, nz) => {
    if (t > 1e-6 && t < maxD && (!best || t < best.d)) best = { d: t, nx, ny, nz };
  };
  for (const c of MAP.colliders) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, c.x0, c.y0, c.z0, c.x1, c.y0 + c.h, c.z1);
    if (t !== null) consider(t.t, t.nx, t.ny, t.nz);
  }
  if (dy !== 0) {
    for (const zn of MAP.groundZones) {
      const t = (zn.y - oy) / dy;
      if (t > 1e-6 && t < maxD) {
        const px = ox + dx * t;
        const pz = oz + dz * t;
        if (px >= zn.x0 && px <= zn.x1 && pz >= zn.z0 && pz <= zn.z1) consider(t, 0, dy < 0 ? 1 : -1, 0);
      }
    }
    const t = (0 - oy) / dy;
    if (t > 1e-6 && t < maxD) {
      const px = ox + dx * t;
      const pz = oz + dz * t;
      if (baseHeightAt(px, pz) === 0) consider(t, 0, dy < 0 ? 1 : -1, 0);
    }
  }
  return best;
}

function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0;
  let tmax = Infinity;
  let nx = 0, ny = 0, nz = 0;
  const axes = [
    [ox, dx, x0, x1, 1, 0, 0],
    [oy, dy, y0, y1, 0, 1, 0],
    [oz, dz, z0, z1, 0, 0, 1],
  ];
  for (const [o, d, lo, hi, ax, ay, az] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    // face is -1 when the ray enters through the lo face (no swap), +1 through the hi
    // face; the entry normal is that face's outward axis, whichever way the ray travels.
    let face = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; face = 1; }
    if (t1 > tmin) { tmin = t1; nx = ax * face; ny = ay * face; nz = az * face; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmin <= 1e-6) return null;
  return { t: tmin, nx, ny, nz };
}
