// bots.js — the nine non-player actors: perception, a tactical state machine and the
// team plan. Perception is honest: a bot knows an enemy only when it can see them
// (range, a 100° cone, a physics raycast for walls, smoke blocks sight) or hear them
// (weapons.js drops shot events into hearEvents; footsteps are added here). Brains run
// on a staggered think tick; movement and firing run every step. The plan is legible
// team play: attackers commit to a site (sometimes split), defenders split across both
// sites with a mid rotator, a plant sends every defender to retake and every attacker
// to a crossfire hold, and a hurt or outnumbered bot falls back instead of feeding.

import { G } from './state.js';
import { MAP } from './map.js';
import { moveActor, rayHit, eyeHeight } from './physics.js';
import { tryFire, startReload, switchWeapon, buyWeapon, buyGrenade, throwGrenade } from './weapons.js';
import { isSmokeBlocking } from './fx.js';
import { sfx } from './audio.js';

// --- nav graph ---------------------------------------------------------------

const ADJ = MAP.nav.nodes.map(() => []);
for (const [a, b] of MAP.nav.edges) { ADJ[a].push(b); ADJ[b].push(a); }

function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (const n of MAP.nav.nodes) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) { bd = d; best = n.id; }
  }
  return best;
}

function nodesNear(x, z, r) {
  return MAP.nav.nodes
    .filter((n) => Math.hypot(n.x - x, n.z - z) <= r)
    .sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))
    .map((n) => n.id);
}

// A* over the waypoint graph; returns a list of node ids from start's node to goal's.
function pathTo(a, goalNode) {
  const start = nearestNode(a.pos.x, a.pos.z);
  if (start === goalNode) return [goalNode];
  const open = new Set([start]);
  const came = new Map();
  const gs = new Map([[start, 0]]);
  const goal = MAP.nav.nodes[goalNode];
  const h = (id) => Math.hypot(MAP.nav.nodes[id].x - goal.x, MAP.nav.nodes[id].z - goal.z);
  while (open.size) {
    let cur = -1, bf = Infinity;
    for (const id of open) {
      const f = (gs.get(id) || 0) + h(id);
      if (f < bf) { bf = f; cur = id; }
    }
    if (cur === goalNode) {
      const path = [cur];
      while (came.has(cur)) { cur = came.get(cur); path.unshift(cur); }
      return path;
    }
    open.delete(cur);
    for (const nb of ADJ[cur]) {
      const w = Math.hypot(MAP.nav.nodes[nb].x - MAP.nav.nodes[cur].x, MAP.nav.nodes[nb].z - MAP.nav.nodes[cur].z);
      const ng = (gs.get(cur) || 0) + w;
      if (ng < (gs.get(nb) === undefined ? Infinity : gs.get(nb))) {
        gs.set(nb, ng);
        came.set(nb, cur);
        open.add(nb);
      }
    }
  }
  return [start];
}

// --- brains ------------------------------------------------------------------

function brain(a) {
  if (!a.brain) {
    a.brain = {
      state: 'route', path: [], pi: 0, goalNode: -1, holdNode: -1, role: '',
      seen: new Map(), vis: new Set(), targetId: -1, reactAt: 0, heard: null,
      thinkAt: Math.random() * 0.1, scanSeed: Math.random() * 10,
      lastX: a.pos.x, lastZ: a.pos.z, stuckAt: 0, stepAt: 0,
      fireUntil: 0, pauseUntil: 0, throwAt: 0, boughtRound: 0, liveRound: 0,
    };
  }
  return a.brain;
}

let planRound = -1;
let planSite = 'A';
let lastPhase = '';

function setGoal(a, b, node, state = 'route') {
  b.goalNode = node;
  b.path = pathTo(a, node);
  b.pi = 0;
  b.state = state;
  b.holdYaw = undefined;
}

// The round plan, assigned once per buy phase: attackers pick a site (42% A, 42% B,
// 16% a 3-2 split), the carrier walks the site heart, the rest take cover nodes near
// it; defenders split 2-3 across the sites and one holds mid as the rotator.
function assignPlans() {
  planRound = G.round;
  const r = Math.random();
  planSite = r < 0.42 ? 'A' : r < 0.84 ? 'B' : 'split';
  const atk = G.actors.filter((a) => a.team === 'atk');
  const def = G.actors.filter((a) => a.team === 'def');
  atk.forEach((a, i) => {
    if (!a.bot) return;
    const b = brain(a);
    const siteKey = planSite === 'split' ? (i < 3 ? 'A' : 'B') : planSite;
    b.planSite = siteKey;
    const s = MAP.sites[siteKey];
    if (G.bomb.carriedBy === a.id) {
      setGoal(a, b, nearestNode(s.x, s.z));
    } else {
      const near = nodesNear(s.x, s.z, 12);
      const node = near[Math.min(i, near.length - 1)] ?? nearestNode(s.x, s.z);
      b.holdNode = node;
      setGoal(a, b, node);
    }
  });
  const swap = Math.random() < 0.5;
  def.forEach((a, i) => {
    const b = brain(a);
    const siteKey = i === 4 ? null : ((i < 2) === swap ? 'A' : 'B');
    if (siteKey === null) {
      b.holdNode = nearestNode(0, 0);
      b.planSite = null;
    } else {
      const s = MAP.sites[siteKey];
      const near = nodesNear(s.x, s.z, 10);
      b.holdNode = near[Math.min(i % 3, near.length - 1)] ?? nearestNode(s.x, s.z);
      b.planSite = siteKey;
    }
    setGoal(a, b, b.holdNode);
  });
}

// After a plant the round changes shape: the nearest defender becomes the defuser and
// walks the bomb, the rest of the defence floods the site, attackers dig into holds.
function assignPlanted() {
  const bx = G.bomb.x, bz = G.bomb.z;
  const defs = G.actors.filter((a) => a.bot && a.team === 'def' && a.alive)
    .sort((p, q) => Math.hypot(p.pos.x - bx, p.pos.z - bz) - Math.hypot(q.pos.x - bx, q.pos.z - bz));
  defs.forEach((a, i) => {
    const b = brain(a);
    if (i === 0) {
      b.role = 'defuser';
      setGoal(a, b, nearestNode(bx, bz));
    } else {
      b.role = 'retake';
      const near = nodesNear(bx, bz, 11);
      b.holdNode = near[Math.min(i, near.length - 1)] ?? nearestNode(bx, bz);
      setGoal(a, b, b.holdNode);
    }
  });
  for (const a of G.actors) {
    if (!a.bot || a.team !== 'atk' || !a.alive) continue;
    const b = brain(a);
    b.role = 'crossfire';
    if (b.state !== 'engage') {
      const near = nodesNear(bx, bz, 12);
      b.holdNode = near[Math.min(a.id, near.length - 1)] ?? nearestNode(bx, bz);
      setGoal(a, b, b.holdNode);
    }
  }
}

// --- perception --------------------------------------------------------------

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function perceive(a, b, now) {
  const prevVis = b.vis;
  b.vis = new Set();
  const ex = a.pos.x, ey = a.pos.y + eyeHeight(a), ez = a.pos.z;
  for (const e of G.actors) {
    if (!e.alive || e.team === a.team) continue;
    const dx = e.pos.x - ex, dz = e.pos.z - ez;
    const dist = Math.hypot(dx, dz);
    if (dist > 60) continue;
    let seen = dist < 3.2;
    if (!seen) {
      const bearing = Math.atan2(-dx, -dz);
      if (Math.abs(angDiff(bearing, a.yaw)) > 1.75) continue;
      const ty = e.pos.y + eyeHeight(e) * 0.82;
      const dy = ty - ey;
      const len = Math.hypot(dist, dy);
      const hit = rayHit(ex, ey, ez, dx / len, dy / len, dz / len, len);
      if (hit && hit.d < len - 0.7) continue;
      if (isSmokeBlocking(ex, ey, ez, e.pos.x, ty, e.pos.z)) continue;
      seen = true;
    }
    if (seen) {
      b.vis.add(e.id);
      b.seen.set(e.id, { x: e.pos.x, y: e.pos.y, z: e.pos.z, t: now });
    }
  }
  // Hearing: drain the event queue weapons.js and footsteps filled.
  for (const ev of a.hearEvents) b.heard = { x: ev.x, z: ev.z, t: now, kind: ev.kind };
  a.hearEvents.length = 0;
  // Target: nearest visible enemy; a fresh acquisition costs a reaction delay.
  let best = -1, bd = Infinity;
  for (const id of b.vis) {
    const e = G.actors[id];
    const d = Math.hypot(e.pos.x - ex, e.pos.z - ez);
    if (d < bd) { bd = d; best = id; }
  }
  if (best !== -1 && !prevVis.has(best)) b.reactAt = now + 0.25 + Math.random() * 0.25;
  if (best !== -1) b.targetId = best;
  else if (b.targetId !== -1 && !G.actors[b.targetId].alive) b.targetId = -1;
}

function lastKnown(b, now) {
  if (b.targetId !== -1) {
    const s = b.seen.get(b.targetId);
    if (s && now - s.t < 4) return s;
  }
  let best = null;
  for (const s of b.seen.values()) if (!best || s.t > best.t) best = s;
  if (best && now - best.t < 4) return best;
  if (b.heard && now - b.heard.t < 3.5) return b.heard;
  return null;
}

// --- decisions (think tick) ----------------------------------------------------

function decide(a, b, now) {
  const inst = a.weapon.inst[a.weapon.current];
  if (inst && inst.ammo === 0) startReload(a);
  else if (inst && b.vis.size === 0 && inst.ammo > 0 && inst.ammo <= 8 && inst.reserve > 0) startReload(a);

  if (G.phase === 'planted') {
    if (a.team === 'def' && b.role === 'defuser') {
      const d = Math.hypot(G.bomb.x - a.pos.x, G.bomb.z - a.pos.z);
      if (d < 1.7) { if (b.state !== 'defuse') { b.state = 'defuse'; a.defuseT = 0; } return; }
      if (b.state === 'defuse') { a.defuseT = 0; if (G.bomb.state === 'defusing') G.bomb.state = 'planted'; }
      if (b.state !== 'route' || b.goalNode !== nearestNode(G.bomb.x, G.bomb.z)) setGoal(a, b, nearestNode(G.bomb.x, G.bomb.z));
      return;
    }
    if (b.vis.size) { b.state = 'engage'; return; }
    if (b.state !== 'route' && b.state !== 'hold') setGoal(a, b, b.holdNode >= 0 ? b.holdNode : nearestNode(a.pos.x, a.pos.z));
    return;
  }

  if (G.phase !== 'live') return;

  // A dropped bomb pulls the nearest attacker back for it.
  if (a.team === 'atk' && G.bomb.state === 'dropped') {
    const carrier = G.actors.filter((x) => x.bot && x.team === 'atk' && x.alive)
      .sort((p, q) => Math.hypot(p.pos.x - G.bomb.x, p.pos.z - G.bomb.z) - Math.hypot(q.pos.x - G.bomb.x, q.pos.z - G.bomb.z))[0];
    if (carrier === a && b.state !== 'engage') { setGoal(a, b, nearestNode(G.bomb.x, G.bomb.z)); return; }
  }

  // The carrier's whole job is the plant: at the site, unspotted, it channels.
  if (a.team === 'atk' && G.bomb.carriedBy === a.id && G.bomb.state === 'carried') {
    const s = MAP.sites[b.planSite || planSite] || MAP.sites.A;
    const d = Math.hypot(s.x - a.pos.x, s.z - a.pos.z);
    if (d < s.r - 0.6) {
      if (b.vis.size) { b.state = 'engage'; a.plantT = 0; }
      else if (b.state !== 'plant') { b.state = 'plant'; a.plantT = 0; }
      return;
    }
    if (b.state === 'plant') { a.plantT = 0; if (G.bomb.state === 'planting') G.bomb.state = 'carried'; }
  }

  if (b.vis.size) {
    if (b.state === 'plant') { a.plantT = 0; if (G.bomb.state === 'planting') G.bomb.state = 'carried'; }
    b.state = 'engage';
    return;
  }
  if (b.state === 'plant') { a.plantT = 0; if (G.bomb.state === 'planting') G.bomb.state = 'carried'; b.state = 'hold'; }

  // Hurt and outnumbered, or last alive against three: fall back and hold a line.
  const mates = G.actors.filter((x) => x.team === a.team && x.alive).length;
  const foes = G.actors.filter((x) => x.team !== a.team && x.alive).length;
  if ((a.hp < 32 && foes >= 2) || (mates === 1 && foes >= 3)) {
    if (b.state !== 'retreat' && b.state !== 'hold') {
      const sp = MAP.spawns[a.team][0];
      setGoal(a, b, nearestNode(sp[0], sp[1]), 'retreat');
    }
    return;
  }

  // A known enemy position pulls a hunter; otherwise resume the plan.
  const known = lastKnown(b, now);
  if (known && b.state !== 'route') {
    setGoal(a, b, nearestNode(known.x, known.z));
    return;
  }
  if (b.state === 'engage') {
    if (known) setGoal(a, b, nearestNode(known.x, known.z));
    else if (b.holdNode >= 0) setGoal(a, b, b.holdNode);
    else b.state = 'hold';
  }
}

// --- actions (every step) ------------------------------------------------------

function faceToward(a, wantYaw, dt, rate = 4.2) {
  const d = angDiff(wantYaw, a.yaw);
  const step = Math.max(-rate * dt, Math.min(rate * dt, d));
  a.yaw += step;
}

function followPath(a, b, dt, now) {
  if (b.pi >= b.path.length) return true;
  const n = MAP.nav.nodes[b.path[b.pi]];
  const dx = n.x - a.pos.x, dz = n.z - a.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.8) { b.pi++; return b.pi >= b.path.length; }
  faceToward(a, Math.atan2(-dx, -dz), dt, 5);
  moveActor(a, dx / d, dz / d, dt);
  // Stuck detection: barely moved in half a second of trying — hop, then skip a node.
  if (now - b.stuckAt > 0.5) {
    const moved = Math.hypot(a.pos.x - b.lastX, a.pos.z - b.lastZ);
    if (moved < 0.22) {
      a.jumpQueued = true;
      if (b.stuckTwice) { b.pi++; b.stuckTwice = false; } else b.stuckTwice = true;
    }
    b.lastX = a.pos.x; b.lastZ = a.pos.z; b.stuckAt = now;
  }
  // Footsteps: audible to enemies nearby, and to the player as soft taps.
  if (now >= b.stepAt) {
    b.stepAt = now + 0.38;
    for (const e of G.actors) {
      if (e.team === a.team || !e.alive) continue;
      const dd = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
      if (dd < 9) e.hearEvents.push({ x: a.pos.x, z: a.pos.z, t: now, kind: 'step' });
      if (!e.bot && dd < 14) sfx('step', { vol: Math.max(0.15, 1 - dd / 14) });
    }
  }
  return false;
}

function engage(a, b, dt, now) {
  const t = G.actors[b.targetId];
  if (!t || !t.alive) { b.state = 'hold'; return; }
  const known = b.seen.get(b.targetId) || t;
  const dx = known.x - a.pos.x, dz = known.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  const visible = b.vis.has(b.targetId);
  // Aim with human error: worse at range, worse against a moving target, halved when
  // the bot is planted and crouched — the same trade the player is offered.
  const tSpeed = Math.hypot(t.vel.x, t.vel.z);
  const err = (0.016 + dist * 0.0008 + tSpeed * 0.0035) * (a.crouch ? 0.6 : 1);
  const wantYaw = Math.atan2(-dx, -dz) + Math.sin(now * 7 + a.id * 3.1) * err;
  faceToward(a, wantYaw, dt, 5.2);
  const ty = known.y + eyeHeight(t) - 0.28;
  const wantPitch = Math.atan2(ty - (a.pos.y + eyeHeight(a)), Math.max(1, dist));
  a.pitch += Math.max(-3 * dt, Math.min(3 * dt, wantPitch - a.pitch));
  a.crouch = dist > 16 && visible;
  if (!visible) {
    // Lost them: push the last known position.
    if (followPath(a, b, dt, now)) b.state = 'hold';
    if (!b.path.length) setGoal(a, b, nearestNode(known.x, known.z));
    return;
  }
  // Stop-and-fire discipline: halt, let the reaction delay pass, fire in bursts.
  if (dist < 5) moveActor(a, -dx / dist, -dz / dist, dt);
  else moveActor(a, 0, 0, dt);
  if (now < b.reactAt) return;
  if (now >= b.pauseUntil && now >= b.fireUntil) {
    b.fireUntil = now + 0.26 + Math.random() * 0.14;
  }
  if (now < b.fireUntil) {
    tryFire(a);
  } else if (b.fireUntil && now >= b.fireUntil) {
    b.pauseUntil = now + 0.28 + Math.random() * 0.3;
    b.fireUntil = 0;
  }
  // A frag at a heard-but-unseen enemy, now and then.
  if (a.weapon.grenades.includes('nanas') && now > b.throwAt && dist > 8 && dist < 20 && Math.random() < 0.004) {
    throwGrenade(a, 'nanas');
    b.throwAt = now + 9;
  }
}

function buyLogic(a, b) {
  if (b.boughtRound === G.round) return;
  b.boughtRound = G.round;
  const w = a.weapon;
  if (!w.primary) {
    if (a.money >= 4500 && a.id % 5 === 4) buyWeapon(a, 'longbow12');
    else if (a.money >= 2700) buyWeapon(a, 'ar57');
    else if (a.money >= 1200) buyWeapon(a, 'rusa9');
  }
  if (a.money >= 900 && !w.grenades.includes('nanas')) buyGrenade(a, 'nanas');
  if (a.money >= 700) buyGrenade(a, a.team === 'atk' ? 'smoke' : 'flash');
}

export function updateBots(dt, now) {
  if (G.phase === 'buy' && G.round !== planRound) assignPlans();
  if (G.phase === 'planted' && lastPhase !== 'planted') assignPlanted();
  lastPhase = G.phase;
  for (const a of G.actors) {
    if (!a.bot) continue;
    const b = brain(a);
    if (!a.alive) { a.plantT = 0; a.defuseT = 0; continue; }
    if (G.phase === 'buy') { buyLogic(a, b); continue; }
    if (G.phase === 'over' || G.matchOver) { a.crouch = false; continue; }
    if (b.liveRound !== G.round && G.phase === 'live') {
      b.liveRound = G.round;
      if (a.weapon.primary && a.weapon.current !== 'primary') switchWeapon(a, 'primary');
    }
    if (now >= b.thinkAt) {
      b.thinkAt = now + 0.12 + (a.id % 3) * 0.013;
      perceive(a, b, now);
      decide(a, b, now);
    }
    switch (b.state) {
      case 'route':
      case 'retreat':
        if (followPath(a, b, dt, now)) b.state = 'hold';
        break;
      case 'hold': {
        moveActor(a, 0, 0, dt);
        a.crouch = a.id % 2 === 0;
        if (b.holdYaw === undefined) b.holdYaw = a.yaw;
        faceToward(a, b.holdYaw + Math.sin(now * 0.45 + b.scanSeed) * 0.9, dt, 1.6);
        break;
      }
      case 'engage':
        engage(a, b, dt, now);
        break;
      case 'plant':
        if (G.phase !== 'live') { b.state = 'hold'; break; }
        moveActor(a, 0, 0, dt);
        a.plantT = (a.plantT || 0) + dt;
        G.bomb.state = 'planting';
        G.bomb.site = b.planSite || G.bomb.site;
        break;
      case 'defuse':
        if (G.phase !== 'planted') { b.state = 'hold'; break; }
        moveActor(a, 0, 0, dt);
        a.defuseT = (a.defuseT || 0) + dt;
        G.bomb.state = 'defusing';
        break;
      default:
        break;
    }
  }
}
