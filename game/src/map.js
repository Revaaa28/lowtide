// map.js — LOWTIDE, a drained river lock at dawn, described once as data and built from it.
// The layout is three lanes running north-south: the warehouse lane in the west, the lock
// chamber in the centre (a dry channel below grade, catwalks above it, two bridges across),
// and the gantry lane in the east. Bomb site A is the Pump House at the north-west, site B
// the Gate Winch at the south-east, so every round forces a cross-map decision. Colliders
// are axis-aligned boxes {x0,z0,x1,z1,y0,h,kind}; physics.js collides and raycasts against
// exactly this list, and buildMap() raises one mesh per collider, so what the player sees
// is precisely what the simulation believes. groundZones are the walkable heights below or
// above grade (the channel floor and its end steps); catwalk and bridge tops come from
// their colliders. The nav graph is hand-laid over the same ground for bots.js pathing.

import * as THREE from 'three';

const colliders = [];
function box(x0, z0, x1, z1, h, kind, y0 = 0) {
  colliders.push({ x0, z0, x1, z1, y0, h, kind });
}

// Outer fence walls.
box(-49, -33, 49, -32, 6, 'concrete');
box(-49, 32, 49, 33, 6, 'concrete');
box(-49, -33, -48, 33, 6, 'concrete');
box(48, -33, 49, 33, 6, 'concrete');

// Lock gates standing in the channel: each leaves a floor-level gap on one side, so the
// channel is a route, not a corridor — you cross a gate line low or take a bridge high.
box(-6, -17, 2, -15, 7, 'gate', -2.2);
box(-2, 13, 6, 15, 7, 'gate', -2.2);

// Catwalks along both chamber walls and the two bridges joining them (tops at y 2.2).
box(-13.5, -24, -9.5, 24, 0.15, 'metal', 2.05);
box(9.5, -24, 13.5, 24, 0.15, 'metal', 2.05);
box(-9.5, -11, 9.5, -8, 0.25, 'metal', 1.95);
box(-9.5, 10, 9.5, 13, 0.25, 'metal', 1.95);
// Stepped ramps up to each catwalk end (four steps of 0.55 each).
for (const [rx0, rx1] of [[-13.5, -9.5], [9.5, 13.5]]) {
  box(rx0, 24, rx1, 25, 0.55, 'concrete');
  box(rx0, 25, rx1, 26, 1.1, 'concrete');
  box(rx0, 26, rx1, 27, 1.65, 'concrete');
  box(rx0, 27, rx1, 28, 2.2, 'concrete');
  box(rx0, -25, rx1, -24, 0.55, 'concrete');
  box(rx0, -26, rx1, -25, 1.1, 'concrete');
  box(rx0, -27, rx1, -26, 1.65, 'concrete');
  box(rx0, -28, rx1, -27, 2.2, 'concrete');
}

// Chamber side walls, with door gaps where the lanes connect (west gaps at z -19..-11,
// -5..3, 13..21; east gaps at -17..-9, -1..7, 15..23).
for (const z of [[-32, -19], [-11, -5], [3, 13], [21, 32]]) box(-14.3, z[0], -13.7, z[1], 3.2, 'concrete');
for (const z of [[-32, -17], [-9, -1], [7, 15], [23, 32]]) box(13.7, z[0], 14.3, z[1], 3.2, 'concrete');

// Warehouse (west lane): high walls, three doors, crate stacks inside.
box(-44, -18.2, -34.5, -17.8, 4.2, 'warehouse');
box(-31, -18.2, -28, -17.8, 4.2, 'warehouse');
box(-44, 5.8, -38.5, 6.2, 4.2, 'warehouse');
box(-35, 5.8, -28, 6.2, 4.2, 'warehouse');
box(-28.2, -18, -27.8, -12.5, 4.2, 'warehouse');
box(-28.2, -9, -27.8, -2.5, 4.2, 'warehouse');
box(-28.2, 1, -27.8, 6, 4.2, 'warehouse');
box(-44.2, -18, -43.8, 6, 4.2, 'warehouse');
box(-41.2, -13.2, -38.8, -10.8, 1.2, 'crate');
box(-34.2, -5.2, -31.8, -2.8, 2.4, 'crate');
box(-37.6, -0.6, -36.4, 0.6, 1.2, 'crate');
box(-32.2, -15.2, -31, -14, 1.2, 'crate');

// Pump House (site A): a small machine hall with a south door and an east window gap.
box(-42, -21.2, -38.5, -20.8, 3.4, 'warehouse');
box(-36, -21.2, -33, -20.8, 3.4, 'warehouse');
box(-42, -29.2, -33, -28.8, 3.4, 'warehouse');
box(-42.2, -29, -41.8, -21, 3.4, 'warehouse');
box(-33.2, -29, -32.8, -26, 3.4, 'warehouse');
box(-33.2, -23, -32.8, -21, 3.4, 'warehouse');
box(-40, -27.4, -38, -26, 1.4, 'machine');
box(-36.2, -28.2, -34.8, -26.8, 1.1, 'machine');

// Gantry lane (east): container stacks with lanes between them.
box(30, -17, 36.4, -14.4, 2.6, 'rust');
box(36, -8, 42.4, -5.4, 2.6, 'moss');
box(28, 2, 34.4, 4.6, 2.6, 'rust');
box(29, 2.2, 33, 4.4, 2.6, 'moss', 2.6);
box(38, 10, 44.4, 12.6, 2.6, 'moss');
box(23.4, -2.6, 24.6, -1.4, 1.2, 'crate');
box(43.4, -20.6, 44.6, -19.4, 1.2, 'crate');
box(23.4, 19.4, 24.6, 20.6, 1.2, 'crate');

// Gate Winch hut (site B) and the winch machine the charge is planted on.
box(38.5, 23.8, 43, 24.2, 3, 'warehouse');
box(38.5, 15.8, 40, 16.2, 3, 'warehouse');
box(41.5, 15.8, 43, 16.2, 3, 'warehouse');
box(38.3, 16, 38.7, 24, 3, 'warehouse');
box(42.8, 16, 43.2, 24, 3, 'warehouse');
box(31, 18, 34, 21, 1.6, 'machine');
box(29.4, 23.4, 30.6, 24.6, 1.2, 'crate');
box(35.4, 13.4, 36.6, 14.6, 1.2, 'crate');

// Cover: crates and low blocks where the lanes and crossings would otherwise be bare.
box(-10.6, -2.6, -9.4, -1.4, 1.2, 'crate');
box(9.4, 3.4, 10.6, 4.6, 1.2, 'crate');
box(-10.6, 19.4, -9.4, 20.6, 0.55, 'concrete');
box(11.4, -24.6, 12.6, -23.4, 1.2, 'crate');
box(-20.6, 23.4, -19.4, 24.6, 1.2, 'crate');
box(19.4, 27.4, 20.6, 28.6, 1.2, 'crate');
box(-22.6, -26.6, -21.4, -25.4, 1.2, 'crate');
box(17.4, -28.6, 18.6, -27.4, 0.55, 'concrete');
box(-24.6, 11.4, -23.4, 12.6, 1.2, 'crate');
box(-24.6, -8.6, -23.4, -7.4, 0.55, 'concrete');
box(19.4, -20.6, 20.6, -19.4, 1.2, 'crate');
box(19.4, 15.4, 20.6, 16.6, 0.55, 'concrete');

// Walkable heights off grade: the channel floor and the steps at both of its ends.
const groundZones = [
  { x0: -6, z0: -25, x1: 6, z1: 25, y: -2.2 },
  { x0: -6, z0: 25, x1: 6, z1: 26.6, y: -1.65 },
  { x0: -6, z0: 26.6, x1: 6, z1: 28.2, y: -1.1 },
  { x0: -6, z0: 28.2, x1: 6, z1: 29.8, y: -0.55 },
  { x0: -6, z0: -26.6, x1: 6, z1: -25, y: -1.65 },
  { x0: -6, z0: -28.2, x1: 6, z1: -26.6, y: -1.1 },
  { x0: -6, z0: -29.8, x1: 6, z1: -28.2, y: -0.55 },
];

// Hand-laid waypoint graph: spawns, doors, lane junctions, catwalk ends, bridge middles,
// site hearts. Edges are straight walks verified against the walls above.
const NODES = [
  [-4, 27], [2, -27], [-20, 27], [20, 27], [-20, -27], [20, -27],
  [-36, 9], [-36, -6], [-26, -10.5], [-26, -1], [-37, -19], [-37.5, -25],
  [-30, -24], [-10, -20], [-10, 0], [-10, 18], [10, -20], [10, 0],
  [10, 18], [0, -20], [0, 0], [0, 20], [-11.5, -9.5], [0, -9.5],
  [11.5, -9.5], [-11.5, 11.5], [0, 11.5], [11.5, 11.5], [-11.5, -20], [11.5, -20],
  [-20, -1], [-20, 16], [-20, -15], [20, -11], [20, 7], [20, 18],
  [25, -21], [26, -2], [30, 16], [34, 20], [0, -30], [0, 30],
  [-11.5, 20], [11.5, 20], [-33, -19],
];
const EDGES = [
  [0, 2], [0, 3], [0, 41], [0, 15], [0, 18], [1, 4], [1, 5], [1, 40], [1, 12], [1, 13], [1, 16],
  [2, 6], [2, 31], [3, 35], [3, 38], [3, 39], [4, 12], [5, 33],
  [6, 7], [7, 8], [7, 9], [7, 44], [8, 30], [8, 32], [9, 30], [9, 31],
  [10, 11], [10, 44], [11, 12], [12, 44],
  [13, 14], [14, 15], [16, 17], [17, 18], [13, 28], [15, 42], [16, 29], [18, 43],
  [13, 32], [14, 30], [15, 31], [16, 33], [17, 34], [18, 35],
  [13, 19], [14, 20], [15, 21], [16, 19], [17, 20], [18, 21],
  [19, 20], [20, 21], [19, 40], [21, 41],
  [22, 28], [22, 25], [25, 42], [24, 29], [24, 27], [27, 43],
  [22, 23], [23, 24], [25, 26], [26, 27],
  [30, 31], [30, 32], [31, 2], [32, 4], [33, 34], [34, 35], [33, 36], [34, 37],
  [36, 37], [36, 5], [37, 38], [38, 39], [38, 35], [39, 35],
];

export const MAP = {
  colliders,
  groundZones,
  nav: {
    nodes: NODES.map(([x, z], id) => ({ id, x, z })),
    edges: EDGES,
  },
  sites: {
    A: { x: -37.5, z: -25, r: 5, label: 'Pump House' },
    B: { x: 34, z: 20, r: 5, label: 'Gate Winch' },
  },
  spawns: {
    atk: [[-10, 28, 0], [-6, 28.5, 0], [-2, 28, 0], [2, 28.5, 0], [-4, 25.5, 0]],
    def: [[-2, -27, Math.PI], [2, -27, Math.PI], [-6, -25.5, Math.PI], [6, -25.5, Math.PI], [0, -23.5, Math.PI]],
  },
  bounds: { minX: -47.5, maxX: 47.5, minZ: -31.5, maxZ: 31.5 },
};

// The palette of the place: wet concrete, rust, moss, steel — lit by a low warm sun.
const MATERIALS = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.95 }),
  warehouse: new THREE.MeshStandardMaterial({ color: 0x7d7468, roughness: 0.9 }),
  gate: new THREE.MeshStandardMaterial({ color: 0x8c5a24, roughness: 0.7, metalness: 0.35 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5, metalness: 0.6 }),
  rust: new THREE.MeshStandardMaterial({ color: 0xa34d1c, roughness: 0.8, metalness: 0.2 }),
  moss: new THREE.MeshStandardMaterial({ color: 0x5a6e46, roughness: 0.9 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 0.85 }),
  machine: new THREE.MeshStandardMaterial({ color: 0x4f6b6e, roughness: 0.45, metalness: 0.55 }),
};

function textSprite(text, scale = 12) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 54px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(10,12,14,0.55)';
  ctx.fillRect(56, 24, 400, 80);
  ctx.fillStyle = '#ffd9a0';
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  spr.scale.set(scale, scale / 4, 1);
  return spr;
}

// Raises the whole scene from the data above: one mesh per collider, the channel dug as
// geometry (its floor and walls sit below the ground slab), dressing that carries no
// collision — catwalk rails, the gantry crane, lamp poles, site rings and labels, the
// river beyond the east fence and the silhouettes of the far bank.
export function buildMap(scene) {
  const box3 = (x0, y0, z0, x1, y1, z1, mat, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // Ground slab and the channel: floor, side walls, end walls, a skin of leftover water.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x6f7276, roughness: 0.92 });
  box3(-60, -0.5, -45, 60, 0, 45, groundMat, false);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x4c4f52, roughness: 0.95 });
  box3(-6, -2.5, -30, 6, -2.2, 30, darkMat, false);
  box3(-6.6, -2.2, -30, -6, 0, 30, darkMat, false);
  box3(6, -2.2, -30, 6.6, 0, 30, darkMat, false);
  box3(-6, -2.2, -30.6, 6, 0, -30, darkMat, false);
  box3(-6, -2.2, 30, 6, 0, 30.6, darkMat, false);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(11.6, 48),
    new THREE.MeshStandardMaterial({ color: 0x16242c, roughness: 0.15, metalness: 0.85 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -2.12, 0);
  scene.add(water);
  for (const zn of groundZones) {
    if (zn.y > -2.2) box3(zn.x0, zn.y - 0.3, zn.z0, zn.x1, zn.y, zn.z1, darkMat, false);
  }

  // One mesh per collider, in the material of its kind.
  for (const c of colliders) {
    box3(c.x0, c.y0, c.z0, c.x1, c.y0 + c.h, c.z1, MATERIALS[c.kind] || MATERIALS.concrete);
  }

  // Catwalk rails and posts, bridge rails (dressing only — the platforms already collide).
  const railMat = MATERIALS.metal;
  for (const sx of [-1, 1]) {
    const edge = sx * 13.4;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 48), railMat);
    rail.position.set(edge, 3.15, 0);
    scene.add(rail);
    for (let z = -24; z <= 24; z += 6) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), railMat);
      post.position.set(sx * 11.5, 1.1, z);
      scene.add(post);
    }
    for (const bz of [-9.5, 11.5]) {
      const brail = new THREE.Mesh(new THREE.BoxGeometry(19, 0.08, 0.08), railMat);
      brail.position.set(0, 3.15, bz + (bz < 0 ? -1.4 : 1.4));
      scene.add(brail);
    }
  }

  // Gantry crane over the east lane: legs, beam, trolley and a hanging hook.
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xb3541e, roughness: 0.6, metalness: 0.4 });
  box3(39.4, 0, -20.6, 40.6, 9, -19.4, craneMat);
  box3(39.4, 0, 15.4, 40.6, 9, 16.6, craneMat);
  box3(24, 9, -2.6, 46, 10, -1.4, craneMat);
  box3(33, 8.2, -2.5, 35, 9, -1.5, darkMat);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4), darkMat);
  cable.position.set(34, 7, -2);
  scene.add(cable);
  box3(33.4, 5.2, -2.6, 34.6, 5.8, -1.4, craneMat);

  // Lamp poles at the junctions, lit heads, no real light cost.
  const lampHead = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd9a0, emissiveIntensity: 1.6 });
  for (const [lx, lz] of [[-20, 27], [20, -27], [-26, -1], [26, 7], [-37, -19], [30, 16], [0, 27], [0, -27]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4), railMat);
    pole.position.set(lx, 2.7, lz);
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.4), lampHead);
    head.position.set(lx, 5.45, lz);
    scene.add(head);
  }

  // Site rings and floating labels — the two places the round is about.
  for (const key of ['A', 'B']) {
    const s = MAP.sites[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xe86a2a, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.07, s.z);
    ring.name = 'siteRing' + key;
    scene.add(ring);
    const label = textSprite(key + ' · ' + s.label.toUpperCase());
    label.position.set(s.x, 6.4, s.z);
    label.name = 'siteLabel' + key;
    scene.add(label);
  }

  // Gate warning lights: small amber blocks that read from down the channel.
  const warnMat = new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0xff9a2a, emissiveIntensity: 2 });
  for (const [wx, wz] of [[-5.6, -16], [1.6, -16], [-1.6, 14], [5.6, 14]]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), warnMat);
    w.position.set(wx, 4.4, wz);
    scene.add(w);
  }

  // The river east of the fence and the far bank's silhouettes, for depth at dawn.
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 130),
    new THREE.MeshStandardMaterial({ color: 0x27383f, roughness: 0.2, metalness: 0.7 }),
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(74, -0.4, 0);
  scene.add(river);
  const silMat = new THREE.MeshBasicMaterial({ color: 0x2c3542 });
  const silhouettes = [[-58, -20, 10, 12], [-56, 14, 8, 8], [58, -30, 12, 15], [62, 24, 9, 10], [-20, -52, 16, 9], [26, -54, 12, 12], [10, 54, 18, 8]];
  for (const [sx, sz, sw, sh] of silhouettes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 6), silMat);
    m.position.set(sx, sh / 2 - 0.5, sz);
    scene.add(m);
  }
}
