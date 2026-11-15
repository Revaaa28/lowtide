// nav.js — the waypoint graph the bots walk: seeded from map.js's layout,
// then validated at boot against the same colliders physics.js moves actors
// through: every edge is walked in short steps under the game's own rules
// and kept only in the directions a body can really walk it (drop-ins are
// one-way). A* returns paths; wallsBetween() serves the hearing bus.

import { MAP } from './map.js';
import { groundHeightAt, baseHeightAt } from './physics.js';

const R = 0.35, STEPH = 0.55;

// physics.js's blocking rule, replicated for validation.
function blocked(x, z, y) {
  for (const c of MAP.colliders) {
    const top = c.y0 + c.h;
    if (y >= top - STEPH || y + 1.8 <= c.y0 + 0.02) continue;
    const nx = Math.max(c.x0, Math.min(x, c.x1)), nz = Math.max(c.z0, Math.min(z, c.z1));
    if ((x - nx) ** 2 + (z - nz) ** 2 < R * R) return true;
  }
  return false;
}

// The highest surface a body can stand on over the point, or null.
function standHeight(x, z) {
  let best = null;
  const tryY = (y) => { if (!blocked(x, z, y) && (best === null || y > best)) best = y; };
  tryY(baseHeightAt(x, z));
  for (const c of MAP.colliders) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) tryY(c.y0 + c.h);
  return best;
}

function snapFree(x, z) {
  for (let r = 0.4; r <= 2.4; r += 0.25) for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (!blocked(px, pz, baseHeightAt(px, pz))) return { x: px, z: pz };
  }
  return null;
}

const RAW = MAP.nav.nodes.map((n) => ({ x: n.x, z: n.z }));
// Nodes the hand layout missed: the lock gates' gaps in the channel, the
// strips beside it linking the mouths to the door gaps, points past the winch.
RAW.push({ x: 4, z: -16 }, { x: -4, z: 14 }, { x: 37, z: 22 }, { x: -8, z: -30 },
  { x: -8, z: -15 }, { x: 8, z: -30 }, { x: 8, z: -13 }, { x: -8, z: 30 },
  { x: -8, z: 17 }, { x: 8, z: 30 }, { x: 8, z: 19 }, { x: 31, z: 27 });
const EXTRA_EDGES = [[19, 45], [45, 20], [20, 46], [46, 21], [40, 48], [48, 49], [49, 32],
  [40, 50], [50, 51], [51, 33], [41, 52], [52, 53], [53, 31], [41, 54], [54, 55],
  [55, 35], [3, 56], [56, 47], [47, 39]];

export const NAVnodes = [];
const nodeY = [];
for (const p of RAW) {
  let { x, z } = p, y = standHeight(x, z);
  if (y === null || blocked(x, z, baseHeightAt(x, z))) {
    const s = snapFree(x, z);
    if (s) { x = s.x; z = s.z; y = standHeight(x, z); }
  }
  NAVnodes.push({ id: NAVnodes.length, x, z, live: y !== null });
  nodeY.push(y ?? 0);
}

function canWalk(ax, az, ay, bx, bz) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
  let y = ay;
  for (let i = 1; i <= n; i++) {
    const x = ax + (bx - ax) * (i / n), z = az + (bz - az) * (i / n);
    if (groundHeightAt(x, z, y) > y + STEPH + 1e-4 || blocked(x, z, y)) return false;
    y = groundHeightAt(x, z, y);
  }
  return true;
}

export const ADJ = NAVnodes.map(() => []);
for (const [a, b] of [...MAP.nav.edges, ...EXTRA_EDGES]) {
  if (!NAVnodes[a].live || !NAVnodes[b].live) continue;
  for (const [u, v] of [[a, b], [b, a]]) {
    if (canWalk(NAVnodes[u].x, NAVnodes[u].z, nodeY[u], NAVnodes[v].x, NAVnodes[v].z)) ADJ[u].push(v);
  }
}

export function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (const n of NAVnodes) {
    if (!n.live) continue;
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) { bd = d; best = n.id; }
  }
  return best;
}

export function nodesNear(x, z, r) {
  return NAVnodes
    .filter((n) => n.live && Math.hypot(n.x - x, n.z - z) <= r)
    .sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))
    .map((n) => n.id);
}

export function pathTo(x, z, goalNode) {
  const start = nearestNode(x, z);
  if (start === goalNode) return [goalNode];
  const gx = NAVnodes[goalNode].x, gz = NAVnodes[goalNode].z;
  const h = (id) => Math.hypot(NAVnodes[id].x - gx, NAVnodes[id].z - gz);
  const open = new Set([start]), came = new Map(), gs = new Map([[start, 0]]);
  let best = start;
  while (open.size) {
    let cur = -1, bf = Infinity;
    for (const id of open) { const f = (gs.get(id) || 0) + h(id); if (f < bf) { bf = f; cur = id; } }
    if (h(cur) < h(best)) best = cur;
    if (cur === goalNode) break;
    open.delete(cur);
    for (const nb of ADJ[cur]) {
      const ng = (gs.get(cur) || 0) + Math.hypot(NAVnodes[nb].x - NAVnodes[cur].x, NAVnodes[nb].z - NAVnodes[cur].z);
      if (ng < (gs.get(nb) ?? Infinity)) { gs.set(nb, ng); came.set(nb, cur); open.add(nb); }
    }
  }
  const path = [gs.has(goalNode) ? goalNode : best];
  while (came.has(path[0])) path.unshift(came.get(path[0]));
  return path;
}

// Ear-height walls on the line between two points: the muffling count.
export function wallsBetween(x0, z0, x1, z1) {
  const seen = new Set();
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.2));
  for (let i = 0; i <= steps; i++) {
    const x = x0 + (x1 - x0) * (i / steps), z = z0 + (z1 - z0) * (i / steps);
    for (const c of MAP.colliders) {
      if (c.y0 <= 1.2 && c.y0 + c.h >= 1.35 && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) seen.add(c);
    }
  }
  return seen.size;
}
