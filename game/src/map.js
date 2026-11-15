// map.js — LOWTIDE, a drained river lock at dawn, described once as data and built from it.
// Three lanes run north-south: the warehouse lane west, the lock chamber in the centre
// (a dry channel below grade, catwalks above it, two bridges across), the gantry lane
// east. Site A is the Pump House (north-west), site B the Gate Winch (south-east), so
// every round forces a cross-map decision. Colliders are axis-aligned boxes
// {x0,z0,x1,z1,y0,h,kind}; physics.js collides and raycasts against exactly this list,
// and buildMap() raises one mesh per collider, so what the player sees is precisely
// what the simulation believes. groundZones are the walkable heights off grade.

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

// --- procedural paint ---------------------------------------------------------
// Every surface texture is drawn once on a small canvas at startup: panel seams, rust
// streaks, wet patches and stencil marks are what let the dawn light read as texture
// instead of flat colour. Painters draw bright; each material's colour carries the hue.
let _seed = 11;
const rnd = () => (_seed = (_seed * 16807) % 2147483647) / 2147483647;
function ctex(size, draw, rx = 1, ry = 1) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function speck(x, s, n, col, a, r = 2) {
  x.fillStyle = col;
  for (let i = 0; i < n; i++) { x.globalAlpha = rnd() * a; x.fillRect(rnd() * s, rnd() * s, r, r); }
  x.globalAlpha = 1;
}
function blobs(x, s, n, col, a, r) {
  x.fillStyle = col;
  for (let i = 0; i < n; i++) {
    x.globalAlpha = rnd() * a;
    x.beginPath(); x.arc(rnd() * s, rnd() * s, 4 + rnd() * r, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
}
function streaks(x, s, n, col, a) {
  x.fillStyle = col;
  for (let i = 0; i < n; i++) { x.globalAlpha = rnd() * a; x.fillRect(rnd() * s, 0, 2 + rnd() * 5, s * (0.3 + rnd() * 0.7)); }
  x.globalAlpha = 1;
}
function seams(x, s) {
  x.strokeStyle = 'rgba(34,38,42,0.6)'; x.lineWidth = 3;
  for (const p of [0, 128]) { x.beginPath(); x.moveTo(p, 0); x.lineTo(p, s); x.moveTo(0, p); x.lineTo(s, p); x.stroke(); }
}
const TEX = {
  concrete: ctex(256, (x, s) => {
    x.fillStyle = '#ddd2bf'; x.fillRect(0, 0, s, s);
    blobs(x, s, 14, '#55534c', 0.16, 42);
    speck(x, s, 500, '#3f4245', 0.25); speck(x, s, 300, '#ffffff', 0.18);
    seams(x, s); streaks(x, s, 5, '#6e4a28', 0.13);
  }, 2, 1),
  warehouse: ctex(256, (x, s) => {
    x.fillStyle = '#d3ccbf'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 16) { x.fillStyle = i % 32 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)'; x.fillRect(i, 0, 8, s); }
    blobs(x, s, 10, '#4c463c', 0.2, 40);
    streaks(x, s, 9, '#74522e', 0.22); speck(x, s, 260, '#3a362e', 0.25);
    const g = x.createLinearGradient(0, s * 0.8, 0, s);
    g.addColorStop(0, 'rgba(30,28,24,0)'); g.addColorStop(1, 'rgba(30,28,24,0.4)');
    x.fillStyle = g; x.fillRect(0, s * 0.8, s, s * 0.2);
  }, 2, 1),
  floor: ctex(256, (x, s) => {
    x.fillStyle = '#cfc2ab'; x.fillRect(0, 0, s, s);
    blobs(x, s, 16, '#4a4038', 0.34, 58); blobs(x, s, 8, '#e9e4d2', 0.06, 30);
    speck(x, s, 700, '#2f3336', 0.3); speck(x, s, 260, '#f4f2ea', 0.15);
    seams(x, s);
  }, 14, 10),
  steel: ctex(256, (x, s) => {
    x.fillStyle = '#c2beb2'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 3) { x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; x.fillRect(i, 0, 1, s); }
    streaks(x, s, 12, '#7c4520', 0.3); blobs(x, s, 8, '#5e4632', 0.2, 26);
    speck(x, s, 220, '#2e2a24', 0.25);
    x.strokeStyle = 'rgba(40,44,48,0.5)'; x.lineWidth = 3; x.strokeRect(1, 1, s - 2, s - 2);
  }, 2, 1),
  rust: ctex(256, (x, s) => {
    x.fillStyle = '#d98d54'; x.fillRect(0, 0, s, s);
    blobs(x, s, 22, '#8a4416', 0.5, 44); blobs(x, s, 14, '#5e2c0e', 0.4, 30); blobs(x, s, 8, '#eda763', 0.35, 22);
    streaks(x, s, 10, '#6e3410', 0.3); speck(x, s, 420, '#381b06', 0.35);
  }, 1.5, 1),
  moss: ctex(256, (x, s) => {
    x.fillStyle = '#a9b596'; x.fillRect(0, 0, s, s);
    blobs(x, s, 24, '#46582f', 0.45, 40); blobs(x, s, 12, '#6d7f4c', 0.4, 26);
    speck(x, s, 380, '#2f3d1e', 0.3); speck(x, s, 90, '#7c4a20', 0.3);
  }, 1.5, 1),
  crate: ctex(256, (x, s) => {
    x.fillStyle = '#caa26a'; x.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 64) {
      x.fillStyle = `rgba(60,38,16,${0.05 + rnd() * 0.1})`; x.fillRect(0, y, s, 64);
      x.fillStyle = 'rgba(40,26,10,0.8)'; x.fillRect(0, y, s, 3);
      x.fillStyle = '#5a3d1c';
      for (let i = 0; i < 26; i++) { x.globalAlpha = rnd() * 0.16; x.fillRect(rnd() * s, y + rnd() * 60, 8 + rnd() * 30, 1.5); }
      x.globalAlpha = 1;
    }
    x.fillStyle = 'rgba(30,24,16,0.6)';
    x.font = 'bold 30px ui-monospace, monospace'; x.fillText('LT-07', 20, 118);
    x.font = 'bold 17px ui-monospace, monospace'; x.fillText('LOCKTIDE FREIGHT', 20, 146);
    for (const [nx, ny] of [[10, 10], [240, 10], [10, 240], [240, 240]]) { x.beginPath(); x.arc(nx, ny, 4, 0, 7); x.fill(); }
  }),
  hazard: ctex(128, (x, s) => {
    x.fillStyle = '#c9a227'; x.fillRect(0, 0, s, s);
    x.fillStyle = '#24211c';
    for (let i = -1; i < 3; i++) {
      x.beginPath();
      x.moveTo(i * 64, 0); x.lineTo(i * 64 + 32, 0); x.lineTo(i * 64 + 32 - s, s); x.lineTo(i * 64 - s, s);
      x.closePath(); x.fill();
    }
    speck(x, s, 200, '#3a2c10', 0.3);
  }, 3, 1),
};
// Painted site roundel: ring + letter, worn back with eraser speckle so it reads as
// old paint on concrete, not a UI overlay. Arrows point the way down the approach lanes.
function siteDecal(letter, col) {
  return ctex(256, (x, s) => {
    x.strokeStyle = 'rgba(233,230,223,0.85)'; x.lineWidth = 11;
    x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 10, 0, 7); x.stroke();
    x.fillStyle = col; x.font = `bold ${s * 0.54}px ui-monospace, monospace`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(letter, s / 2, s / 2 + s * 0.04);
    x.globalCompositeOperation = 'destination-out';
    speck(x, s, 650, '#000', 0.9, 3); blobs(x, s, 10, '#000', 0.5, 16);
    x.globalCompositeOperation = 'source-over';
  });
}
const arrowTex = ctex(128, (x, s) => {
  x.fillStyle = 'rgba(233,230,223,0.8)';
  x.beginPath();
  x.moveTo(s / 2, 10); x.lineTo(s * 0.82, s * 0.52); x.lineTo(s * 0.6, s * 0.52); x.lineTo(s * 0.6, s - 14);
  x.lineTo(s * 0.4, s - 14); x.lineTo(s * 0.4, s * 0.52); x.lineTo(s * 0.18, s * 0.52);
  x.closePath(); x.fill();
  x.globalCompositeOperation = 'destination-out';
  speck(x, s, 260, '#000', 0.9, 3);
  x.globalCompositeOperation = 'source-over';
});

// Painted wall signage: the site's name stencilled straight onto its building in two
// lines — the building's name, then the site letter in the site's colour — inside a
// worn painted border. Same eraser wear as the roundels, so it reads as old paint on
// the wall, not a label pasted over the world.
function signTexture(name, sub, col) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 160;
  const x = cv.getContext('2d');
  x.textAlign = 'center';
  x.strokeStyle = 'rgba(233,230,223,0.5)'; x.lineWidth = 5;
  x.strokeRect(9, 9, 494, 142);
  x.fillStyle = 'rgba(233,230,223,0.92)';
  x.font = 'bold 58px ui-monospace, monospace';
  x.fillText(name, 256, 70);
  x.fillStyle = col;
  x.font = 'bold 42px ui-monospace, monospace';
  x.fillText(sub, 256, 128);
  x.globalCompositeOperation = 'destination-out';
  speck(x, 512, 550, '#000', 0.9, 3); blobs(x, 512, 8, '#000', 0.45, 18);
  x.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// The palette of the place: warm stone, rust, teal-painted steel — a low orange sun.
const MATERIALS = {
  concrete: new THREE.MeshStandardMaterial({ map: TEX.concrete, color: 0xc0ab8d, roughness: 0.95 }),
  warehouse: new THREE.MeshStandardMaterial({ map: TEX.warehouse, color: 0xa8906e, roughness: 0.9 }),
  gate: new THREE.MeshStandardMaterial({ map: TEX.steel, color: 0xd09a58, roughness: 0.6, metalness: 0.35 }),
  metal: new THREE.MeshStandardMaterial({ map: TEX.steel, color: 0x7fa8a2, roughness: 0.5, metalness: 0.6 }),
  rust: new THREE.MeshStandardMaterial({ map: TEX.rust, roughness: 0.8, metalness: 0.2 }),
  moss: new THREE.MeshStandardMaterial({ map: TEX.moss, color: 0x6d7f4c, roughness: 0.9 }),
  crate: new THREE.MeshStandardMaterial({ map: TEX.crate, color: 0xb28e5e, roughness: 0.85 }),
  machine: new THREE.MeshStandardMaterial({ map: TEX.steel, color: 0x699e96, roughness: 0.45, metalness: 0.55 }),
  hazard: new THREE.MeshStandardMaterial({ map: TEX.hazard, roughness: 0.8 }),
};

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
  const groundMat = new THREE.MeshStandardMaterial({ map: TEX.floor, color: 0x96876e, roughness: 0.85 });
  box3(-60, -0.5, -45, 60, 0, 45, groundMat, false);
  const darkMat = new THREE.MeshStandardMaterial({ map: TEX.concrete, color: 0x776853, roughness: 0.95 });
  const wetTex = TEX.floor.clone();
  wetTex.repeat.set(2, 10); wetTex.needsUpdate = true;
  const wetMat = new THREE.MeshStandardMaterial({ map: wetTex, color: 0x776a58, roughness: 0.42, metalness: 0.18 });
  box3(-6, -2.5, -30, 6, -2.2, 30, wetMat, false);
  box3(-6.6, -2.2, -30, -6, 0, 30, darkMat, false);
  box3(6, -2.2, -30, 6.6, 0, 30, darkMat, false);
  box3(-6, -2.2, -30.6, 6, 0, -30, darkMat, false);
  box3(-6, -2.2, 30, 6, 0, 30.6, darkMat, false);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(11.6, 58),
    new THREE.MeshStandardMaterial({ color: 0x2e524e, roughness: 0.14, metalness: 0.5 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -2.12, 0);
  scene.add(water);
  for (const zn of groundZones) {
    if (zn.y > -2.2) box3(zn.x0, zn.y - 0.3, zn.z0, zn.x1, zn.y, zn.z1, darkMat, false);
  }

  // One mesh per collider, in the material of its kind. Lock gates get a hazard-stripe
  // cap (dressing only, no collider) so the gate line reads from the catwalks above.
  for (const c of colliders) {
    box3(c.x0, c.y0, c.z0, c.x1, c.y0 + c.h, c.z1, MATERIALS[c.kind] || MATERIALS.concrete);
    if (c.kind === 'gate') box3(c.x0, c.y0 + c.h, c.z0, c.x1, c.y0 + c.h + 0.07, c.z1, MATERIALS.hazard, false);
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
  const craneMat = new THREE.MeshStandardMaterial({ map: TEX.rust, color: 0xf0e6da, roughness: 0.6, metalness: 0.35 });
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

  // Site rings — the two places the round is about. The names live on the buildings
  // themselves (the wall signs below), not on floating labels.
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
    // The painted roundel on the concrete inside the ring: letter + circle, worn thin.
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(s.r * 2 - 1, s.r * 2 - 1),
      new THREE.MeshBasicMaterial({ map: siteDecal(key, key === 'A' ? '#e86a2a' : '#3fb3a4'), transparent: true, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(s.x, 0.05, s.z);
    scene.add(decal);
  }

  // Wall signs, painted on the buildings and read down the approach: the Pump House
  // name on its south wall; the Gate Winch name on the hut's west wall. Each is
  // sized to the wall it sits on — paint does not float past the building's edges.
  const signA = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.03), new THREE.MeshBasicMaterial({ map: signTexture('PUMP HOUSE', 'SITE A', '#e86a2a'), transparent: true, depthWrite: false }));
  signA.position.set(-40.25, 1.9, -20.72);
  scene.add(signA);
  const signB = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 2.375), new THREE.MeshBasicMaterial({ map: signTexture('GATE WINCH', 'SITE B', '#3fb3a4'), transparent: true, depthWrite: false }));
  signB.position.set(38.22, 1.78, 20);
  signB.rotation.y = -Math.PI / 2;
  scene.add(signB);

  // Hazard paint along both channel rims — the edge a player reads before dropping in.
  const rimTex = TEX.hazard.clone();
  rimTex.repeat.set(1, 26); rimTex.needsUpdate = true;
  const rimMat = new THREE.MeshStandardMaterial({ map: rimTex, roughness: 0.8 });
  box3(-6.62, 0, -30, -6.3, 0.03, 30, rimMat, false);
  box3(6.3, 0, -30, 6.62, 0.03, 30, rimMat, false);

  // Worn directional arrows stencilled on the approach lanes (rotation z orients them:
  // 0 = north toward A side, PI/2 = west, -PI/2 = east, PI = south toward B).
  const arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false });
  for (const [ax, az, a] of [[-20, -25, Math.PI / 2], [-30, -25, Math.PI / 2], [26, 20, -Math.PI / 2], [34, 8, Math.PI]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), arrowMat);
    p.rotation.set(-Math.PI / 2, 0, a);
    p.position.set(ax, 0.05, az);
    scene.add(p);
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
    new THREE.MeshStandardMaterial({ color: 0x39585a, roughness: 0.16, metalness: 0.7 }),
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(74, -0.4, 0);
  scene.add(river);
  const silMat = new THREE.MeshBasicMaterial({ color: 0x46525a });
  const silhouettes = [[-58, -20, 10, 12], [-56, 14, 8, 8], [58, -30, 12, 15], [62, 24, 9, 10], [-20, -52, 16, 9], [26, -54, 12, 12], [10, 54, 18, 8]];
  for (const [sx, sz, sw, sh] of silhouettes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 6), silMat);
    m.position.set(sx, sh / 2 - 0.5, sz);
    scene.add(m);
  }
}
