// fx.js — everything the gunplay shows but never decides for long: pooled tracer lines,
// pooled impact particles, and the grenade projectiles with their three effects (frag
// blast, flash white-out, smoke volume). All visual objects are built once in attachFx
// and recycled; nothing is allocated per shot or per frame. The one piece of game truth
// this module owns is the smoke list, because bot vision has to ask whether a sight line
// crosses a live smoke — that query is isSmokeBlocking, answered from the same volumes
// the renderer draws. Damage from a blast is dealt through weapons.js's damageActor, so
// armour, falloff bookkeeping and the kill feed behave exactly like a bullet's.

import * as THREE from 'three';
import { GRENADES } from './config.js';
import { G, localPlayer } from './state.js';
import { rayHit, groundHeightAt } from './physics.js';
import { pulseMuzzle } from './render.js';
import { damageActor, pushNoise } from './weapons.js';

const TRACERS = 40;
const PARTICLES = 700;
const GRENADES_MAX = 12;
const SMOKES_MAX = 6;

let root = null;
let fxNow = 0;

const tracers = [];        // {line, until}
const grenades = [];       // {active, mesh, type, owner, x..z, vx..vz, fuseAt, rested}
const smokes = [];         // {mesh, x, y, z, r, bornAt, until}
let boomLight = null;

// Particle pool: parallel typed arrays, one THREE.Points cloud, vertex colours.
const pPos = new Float32Array(PARTICLES * 3);
const pCol = new Float32Array(PARTICLES * 3);
const pVel = new Float32Array(PARTICLES * 3);
const pLife = new Float32Array(PARTICLES);   // seconds remaining; <= 0 is dead
const pSpan = new Float32Array(PARTICLES);   // seconds the particle lives in total
let pCursor = 0;
let pGeo = null;

function sfx(name) {
  if (typeof window !== 'undefined' && window.__sfx) window.__sfx(name);
}

// Builds every pooled object and hangs them under the renderer's scene. Called once by
// main.js with the scene initRenderer returned.
export function attachFx(scene) {
  if (root) return;
  root = new THREE.Group();
  scene.add(root);

  const tracerMat = new THREE.LineBasicMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i < TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false;
    line.frustumCulled = false;
    root.add(line);
    tracers.push({ line, until: 0 });
  }

  pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  for (let i = 0; i < PARTICLES; i++) pPos[i * 3 + 1] = -999;
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.085, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  points.frustumCulled = false;
  root.add(points);

  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  for (let i = 0; i < GRENADES_MAX; i++) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3a4038, roughness: 0.6, metalness: 0.3 }));
    mesh.visible = false;
    mesh.castShadow = true;
    root.add(mesh);
    grenades.push({ active: false, mesh, type: null, owner: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuseAt: 0, rested: false });
  }

  const smokeGeo = new THREE.SphereGeometry(1, 18, 14);
  for (let i = 0; i < SMOKES_MAX; i++) {
    const mesh = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({
      color: 0x9aa2a6, transparent: true, opacity: 0, depthWrite: false,
    }));
    mesh.visible = false;
    root.add(mesh);
    smokes.push({ mesh, x: 0, y: 0, z: 0, r: 0, bornAt: -1, until: 0 });
  }

  boomLight = new THREE.PointLight(0xffa050, 0, 20);
  root.add(boomLight);
}

// --- tracers and particles ---------------------------------------------------

export function spawnTracer(x1, y1, z1, x2, y2, z2) {
  if (!root) return;
  for (const t of tracers) {
    if (fxNow <= t.until) continue;
    const a = t.line.geometry.attributes.position.array;
    a[0] = x1; a[1] = y1; a[2] = z1; a[3] = x2; a[4] = y2; a[5] = z2;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.visible = true;
    t.until = fxNow + 0.055;
    return;
  }
}

function spawnParticles(x, y, z, n, speed, life, r, g, b, up) {
  for (let k = 0; k < n; k++) {
    const i = pCursor;
    pCursor = (pCursor + 1) % PARTICLES;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = (Math.random() * 2 - 1) * speed;
    pVel[i * 3 + 1] = Math.random() * speed * up;
    pVel[i * 3 + 2] = (Math.random() * 2 - 1) * speed;
    pLife[i] = pSpan[i] = life * (0.5 + Math.random() * 0.5);
    pCol[i * 3] = r; pCol[i * 3 + 1] = g; pCol[i * 3 + 2] = b;
  }
}

// kind: 'wall' (dust and sparks off hard surfaces), 'hit' (a dark red puff on a body),
// 'muzzle' (two sparks at a bot's barrel — the local player's flash is render.js's).
export function spawnImpact(x, y, z, kind) {
  if (!root) return;
  if (kind === 'hit') spawnParticles(x, y, z, 7, 1.6, 0.4, 0.45, 0.08, 0.06, 0.7);
  else if (kind === 'muzzle') spawnParticles(x, y, z, 2, 0.7, 0.12, 1.0, 0.72, 0.3, 0.4);
  else {
    spawnParticles(x, y, z, 5, 1.3, 0.5, 0.62, 0.55, 0.44, 0.8);
    spawnParticles(x, y, z, 2, 2.6, 0.22, 1.0, 0.75, 0.35, 0.6);
  }
}

// --- grenades ------------------------------------------------------------------

// Launches a grenade from the thrower's eye along the look direction weapons.js computed.
// The projectile is simulated here: gravity, ground and wall bounces off physics.js, then
// its effect by kind — frag and flash on a fuse, smoke when it comes to rest.
export function throwGrenadeFx(actor, type, ox, oy, oz, dx, dy, dz) {
  if (!root) return;
  for (const g of grenades) {
    if (g.active) continue;
    g.active = true;
    g.type = type;
    g.owner = actor;
    g.x = ox; g.y = oy; g.z = oz;
    const SPEED = 16;
    g.vx = dx * SPEED + actor.vel.x * 0.5;
    g.vy = dy * SPEED + 3.2 + actor.vel.y * 0.3;
    g.vz = dz * SPEED + actor.vel.z * 0.5;
    g.fuseAt = fxNow + (type === 'flash' ? 1.35 : type === 'nanas' ? 1.7 : 2.5);
    g.rested = false;
    g.mesh.material.color.set(type === 'flash' ? 0xb8bcc0 : type === 'smoke' ? 0x5a6068 : 0x3a4038);
    g.mesh.position.set(ox, oy, oz);
    g.mesh.visible = true;
    sfx('throw');
    return;
  }
}

function explodeFrag(g) {
  const def = GRENADES.nanas;
  spawnParticles(g.x, g.y + 0.3, g.z, 42, 6.5, 0.6, 1.0, 0.6, 0.25, 1.0);
  spawnParticles(g.x, g.y + 0.2, g.z, 16, 2.5, 0.9, 0.35, 0.3, 0.27, 1.2);
  boomLight.position.set(g.x, g.y + 0.6, g.z);
  boomLight.intensity = 90;
  pushNoise(g.x, g.z, 60, 'explosion');
  sfx('explosion');
  const me = localPlayer();
  if (me && me.alive) {
    const d = Math.hypot(me.pos.x - g.x, me.pos.z - g.z);
    if (d < 11) pulseMuzzle(); // the blast kicks the local camera through render's FX channel
  }
  // Radius damage with falloff, blocked by walls: a blast around a corner does nothing.
  for (const a of G.actors) {
    if (!a.alive) continue;
    const cx = a.pos.x, cy = a.pos.y + 1.0, cz = a.pos.z;
    const dist = Math.hypot(cx - g.x, cy - g.y, cz - g.z);
    const reach = def.radius + 0.4;
    if (dist > reach) continue;
    const wall = rayHit(g.x, g.y + 0.25, g.z, (cx - g.x) / dist, (cy - g.y) / dist, (cz - g.z) / dist, dist);
    if (wall && wall.d < dist - 0.5) continue;
    const dmg = def.dmg * Math.max(0.12, 1 - dist / reach);
    damageActor(a, dmg, 'body', g.owner, 'nanas');
  }
}

function popFlash(g) {
  const def = GRENADES.flash;
  spawnParticles(g.x, g.y, g.z, 20, 3.5, 0.3, 1.0, 0.98, 0.9, 1.0);
  boomLight.position.set(g.x, g.y + 0.3, g.z);
  boomLight.intensity = 60;
  sfx('flash');
  // White-out scales with how squarely the actor faces the pop and fades with distance;
  // a wall between the actor and the charge cancels it entirely.
  for (const a of G.actors) {
    if (!a.alive) continue;
    const ex = a.pos.x, ey = a.pos.y + 1.5, ez = a.pos.z;
    const dx = g.x - ex, dy = g.y - ey, dz = g.z - ez;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > def.radius || dist < 1e-4) continue;
    const wall = rayHit(ex, ey, ez, dx / dist, dy / dist, dz / dist, dist);
    if (wall && wall.d < dist - 0.4) continue;
    const lx = -Math.sin(a.yaw) * Math.cos(a.pitch), ly = Math.sin(a.pitch), lz = -Math.cos(a.yaw) * Math.cos(a.pitch);
    const dot = (lx * dx + ly * dy + lz * dz) / dist;
    const facing = dot > 0.5 ? 1 : dot > 0 ? 0.5 : 0.18;
    const fall = 1 - (dist / def.radius) * 0.5;
    const until = fxNow + def.duration * facing * fall;
    if (until > (a.flashedUntil || 0)) a.flashedUntil = until;
  }
}

function deploySmoke(g) {
  const def = GRENADES.smoke;
  for (const s of smokes) {
    if (fxNow < s.until) continue;
    s.x = g.x; s.y = g.y + def.radius * 0.55; s.z = g.z;
    s.r = def.radius;
    s.bornAt = fxNow;
    s.until = fxNow + def.duration;
    s.mesh.position.set(s.x, s.y, s.z);
    s.mesh.visible = true;
    sfx('smoke');
    return;
  }
}

// True when the straight sight line between two points crosses a live smoke volume —
// bots.js asks this before it lets a bot see through a smoked lane.
export function isSmokeBlocking(x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1e-6) return false;
  for (const s of smokes) {
    if (fxNow >= s.until || fxNow - s.bornAt < 0.6) continue;
    // Closest approach of the segment to the smoke centre, clamped to the segment.
    let t = ((s.x - x1) * dx + (s.y - y1) * dy + (s.z - z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t - s.x, py = y1 + dy * t - s.y, pz = z1 + dz * t - s.z;
    const rr = s.r * 0.92;
    if (px * px + py * py + pz * pz < rr * rr) return true;
  }
  return false;
}

// Per-step effects update, driven from weapons.js's updateWeapons so the fixed-step order
// in main.js (weapons, bots, rounds) already accounts for blasts and flashes.
export function updateFx(dt, now) {
  fxNow = now;
  if (!root) return;

  for (const t of tracers) if (t.line.visible && now > t.until) t.line.visible = false;

  let anyParticle = false;
  for (let i = 0; i < PARTICLES; i++) {
    if (pLife[i] <= 0) continue;
    anyParticle = true;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -999; continue; }
    pVel[i * 3 + 1] -= 9 * dt;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
  }
  if (anyParticle) pGeo.attributes.position.needsUpdate = true;

  boomLight.intensity *= Math.pow(0.0001, dt);

  for (const s of smokes) {
    if (!s.mesh.visible) continue;
    if (now >= s.until) { s.mesh.visible = false; continue; }
    const age = now - s.bornAt;
    const grow = Math.min(1, age / 0.8);
    const fade = Math.min(1, (s.until - now) / 1.5);
    s.mesh.scale.setScalar(Math.max(0.05, s.r * grow));
    s.mesh.material.opacity = 0.88 * grow * fade;
  }

  for (const g of grenades) {
    if (!g.active) continue;
    if (now >= g.fuseAt) {
      g.active = false;
      g.mesh.visible = false;
      if (g.type === 'nanas') explodeFrag(g);
      else if (g.type === 'flash') popFlash(g);
      else deploySmoke(g);
      continue;
    }
    if (!g.rested) {
      const speed = Math.hypot(g.vx, g.vy, g.vz);
      const stepLen = speed * dt;
      if (stepLen > 1e-5) {
        const hit = rayHit(g.x, g.y, g.z, g.vx / speed, g.vy / speed, g.vz / speed, stepLen + 0.09);
        if (hit) {
          const dot = g.vx * hit.nx + g.vy * hit.ny + g.vz * hit.nz;
          g.vx -= 1.55 * dot * hit.nx;
          g.vy -= 1.55 * dot * hit.ny;
          g.vz -= 1.55 * dot * hit.nz;
          g.x += hit.nx * 0.1; g.y += hit.ny * 0.1; g.z += hit.nz * 0.1;
        } else {
          g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
        }
      }
      g.vy -= 18 * dt;
      const gy = groundHeightAt(g.x, g.z, g.y) + 0.09;
      if (g.y < gy) {
        g.y = gy;
        if (Math.abs(g.vy) > 1.4) {
          g.vy = -g.vy * 0.38;
          g.vx *= 0.7; g.vz *= 0.7;
        } else {
          g.vy = 0; g.vx *= 0.6; g.vz *= 0.6;
          if (Math.hypot(g.vx, g.vz) < 0.4) {
            g.rested = true;
            if (g.type === 'smoke') { g.active = false; g.mesh.visible = false; deploySmoke(g); continue; }
          }
        }
      }
      g.mesh.position.set(g.x, g.y, g.z);
    }
  }
}
