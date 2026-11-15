// render.js — everything that turns state into pixels, and nothing that decides anything.
// initRenderer builds the renderer, the dawn lighting and the sky; buildScene raises the
// map (map.js) and creates the actor meshes, the bomb and the first-person viewmodel;
// syncActors copies actor state onto meshes once a frame; renderFrame draws from the
// local player's eye. The renderer never writes game state — the one feedback channel is
// FX below, which weapons.js and hud.js poke to ask for a muzzle flash, a camera kick or
// a hitmarker pulse, and which this module consumes.

import * as THREE from 'three';
import { G, localPlayer } from './state.js';
import { buildMap } from './map.js';
import { WEAPONS } from './config.js';
import { eyeHeight } from './physics.js';

export const FX = { muzzleAt: -1, hitmarkAt: -1, damageAt: -1 };
export function pulseMuzzle() {
  FX.muzzleAt = performance.now() / 1000;
  camKick = Math.min(camKick + 0.011, 0.05);
}

let renderer = null;
let scene = null;
let camera = null;
let sun = null;
let bombMesh = null;
let bombLight = null;
let viewmodel = null;
let flashSprite = null;
let flashLight = null;
let camKick = 0;
let bobT = 0;
let lastT = 0;
const actorMeshes = new Map();
const vmByWeapon = new Map();

const TEAM = {
  atk: { vest: 0xd95f1e, cloth: 0x6e5a44, helm: 0x8a4a20 },
  def: { vest: 0x3f6fb5, cloth: 0x4a5568, helm: 0x2e4460 },
};

function skyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 512;
  const ctx = cv.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#31456b');
  grad.addColorStop(0.45, '#7d8dab');
  grad.addColorStop(0.78, '#d9905f');
  grad.addColorStop(1, '#eab075');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 512);
  return new THREE.CanvasTexture(cv);
}

export function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xc7a184, 65, 215);
  camera = new THREE.PerspectiveCamera(75, 1, 0.08, 420);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xcfe2f7, 0x5d5648, 0.9);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffb36b, 1.85);
  sun.position.set(-45, 34, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -58;
  sun.shadow.camera.right = 58;
  sun.shadow.camera.top = 58;
  sun.shadow.camera.bottom = -58;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 150;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  resize();
  return { renderer, scene, camera };
}

export function resize() {
  if (!renderer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// --- actor meshes ------------------------------------------------------------

function buildActorMesh(actor) {
  const t = TEAM[actor.team];
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: t.cloth, roughness: 0.9 });
  const vest = new THREE.MeshStandardMaterial({ color: t.vest, roughness: 0.75 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a189, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.6, metalness: 0.4 });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(0.17, 0.78, 0.17), cloth, -0.12, 0.39, 0);   // legs
  add(new THREE.BoxGeometry(0.17, 0.78, 0.17), cloth, 0.12, 0.39, 0);
  add(new THREE.CapsuleGeometry(0.26, 0.5, 4, 10), cloth, 0, 1.06, 0);   // torso
  add(new THREE.BoxGeometry(0.54, 0.6, 0.36), vest, 0, 1.08, 0);         // team vest
  add(new THREE.SphereGeometry(0.16, 14, 12), skin, 0, 1.63, 0);         // head
  const helm = add(new THREE.SphereGeometry(0.185, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: t.helm, roughness: 0.55 }), 0, 1.65, 0);
  helm.scale.y = 0.85;
  const gun = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.62), dark);
  receiver.castShadow = true;
  gun.add(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.04, -0.48);
  gun.add(barrel);
  gun.position.set(0.2, 1.34, -0.3);
  g.add(gun);
  g.userData.gun = gun;
  return g;
}

function buildBomb() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.24, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x35322c, roughness: 0.5, metalness: 0.3 }),
  );
  body.castShadow = true;
  g.add(body);
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.05, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1a, emissiveIntensity: 2 }),
  );
  lamp.position.set(0.08, 0.15, 0);
  g.add(lamp);
  g.userData.lamp = lamp;
  bombLight = new THREE.PointLight(0xff2a1a, 0, 7);
  bombLight.position.set(0, 0.4, 0);
  g.add(bombLight);
  return g;
}

// --- viewmodel ---------------------------------------------------------------
// One small gun model per weapon id, built lazily and toggled by visibility: receiver,
// barrel, grip, magazine, and a scope cylinder on the zoom weapons — enough silhouette
// for the screenshots and for the player to read what they are holding.

function vmGun(id) {
  if (vmByWeapon.has(id)) return vmByWeapon.get(id);
  const def = WEAPONS[id];
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.45, metalness: 0.55 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.85 });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const len = id === 'pk9' ? 0.24 : id === 'rusa9' ? 0.46 : id === 'banteng8' ? 0.6 : id === 'longbow12' ? 0.92 : 0.68;
  add(new THREE.BoxGeometry(0.07, 0.13, len), dark, 0, 0, -len / 2);                    // receiver
  add(new THREE.CylinderGeometry(0.02, 0.02, len * 0.55), dark, 0, 0.035, -len * 0.72); // barrel
  add(new THREE.BoxGeometry(0.06, 0.16, 0.08), wood, 0, -0.12, 0.06);                   // grip
  if (id !== 'pk9') add(new THREE.BoxGeometry(0.05, 0.2, 0.09), dark, 0, -0.15, -len * 0.38); // magazine
  if (def.zoom) {
    const scope = add(new THREE.CylinderGeometry(0.032, 0.032, 0.22), dark, 0, 0.11, -len * 0.45);
    scope.rotation.x = Math.PI / 2;
  } else if (id !== 'pk9') {
    add(new THREE.BoxGeometry(0.02, 0.05, 0.02), dark, 0, 0.09, -len * 0.8);            // front post
  }
  if (id === 'banteng8') add(new THREE.CylinderGeometry(0.035, 0.035, 0.5), wood, 0, -0.05, -0.32).rotation.x = Math.PI / 2; // pump
  g.visible = false;
  vmByWeapon.set(id, g);
  viewmodel.add(g);
  return g;
}

export function buildScene() {
  buildMap(scene);
  bombMesh = buildBomb();
  scene.add(bombMesh);
  viewmodel = new THREE.Group();
  viewmodel.position.set(0.24, -0.22, -0.45);
  camera.add(viewmodel);
  // Muzzle flash: a lit plane sprite at the barrel tip plus a short-lived light.
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,230,160,1)');
  grad.addColorStop(0.4, 'rgba(255,160,60,0.8)');
  grad.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0, depthWrite: false }));
  flashSprite.scale.set(0.34, 0.34, 1);
  flashSprite.position.set(0, 0.02, -0.85);
  viewmodel.add(flashSprite);
  flashLight = new THREE.PointLight(0xffc37a, 0, 9);
  flashLight.position.set(0, 0, -0.7);
  viewmodel.add(flashLight);
  syncActors();
}

// --- per-frame sync ------------------------------------------------------------

export function syncActors() {
  if (!scene) return;
  for (const actor of G.actors) {
    let mesh = actorMeshes.get(actor.id);
    if (!mesh) {
      mesh = buildActorMesh(actor);
      actorMeshes.set(actor.id, mesh);
      scene.add(mesh);
    }
    const me = localPlayer();
    mesh.visible = actor !== me;
    if (!actor.alive) {
      mesh.rotation.set(0, actor.yaw, Math.PI / 2);
      mesh.position.set(actor.pos.x, actor.pos.y + 0.22, actor.pos.z);
      mesh.scale.y = 1;
      continue;
    }
    mesh.rotation.set(0, actor.yaw, 0);
    mesh.position.set(actor.pos.x, actor.pos.y, actor.pos.z);
    mesh.scale.y = actor.crouch ? 0.76 : 1;
    const gun = mesh.userData.gun;
    if (gun) gun.rotation.x = -actor.pitch;
  }
  // The bomb rides on its carrier's back, sits where it was dropped or planted.
  if (bombMesh) {
    const b = G.bomb;
    if (b.state === 'carried' && b.carriedBy !== null) {
      const carrier = G.actors[b.carriedBy];
      if (carrier && carrier.alive) {
        bombMesh.visible = true;
        bombMesh.position.set(
          carrier.pos.x + Math.sin(carrier.yaw) * 0.3,
          carrier.pos.y + 1.15,
          carrier.pos.z + Math.cos(carrier.yaw) * 0.3,
        );
        bombMesh.rotation.y = carrier.yaw;
      } else {
        bombMesh.visible = false;
      }
    } else if (b.state === 'dropped' || b.state === 'planting' || b.state === 'planted' || b.state === 'defusing') {
      bombMesh.visible = true;
      bombMesh.position.set(b.x, b.y + 0.13, b.z);
      bombMesh.rotation.y = 0;
    } else {
      bombMesh.visible = false;
    }
    const planted = b.state === 'planted' || b.state === 'defusing';
    const blink = planted ? (Math.sin(performance.now() / 130) > 0 ? 2.4 : 0.4) : 0.8;
    bombMesh.userData.lamp.material.emissiveIntensity = blink;
    bombLight.intensity = planted ? blink * 1.6 : 0;
  }
}

export function renderFrame() {
  if (!renderer) return;
  const now = performance.now() / 1000;
  const dt = Math.min(now - (lastT || now), 0.1);
  lastT = now;
  const me = localPlayer();
  if (!me) return;

  syncActors();

  // Camera at the local player's eye, with a decaying kick from the last shot.
  camKick *= Math.pow(0.0001, dt); // fast decay
  if (camKick < 0.0001) camKick = 0;
  const speed = Math.hypot(me.vel.x, me.vel.z);
  if (me.onGround && speed > 0.6) bobT += dt * speed * 1.6;
  const bobY = Math.sin(bobT * 2) * 0.022 * Math.min(speed / 4, 1);
  camera.position.set(me.pos.x, me.pos.y + eyeHeight(me) + bobY, me.pos.z);
  camera.rotation.y = me.yaw;
  camera.rotation.x = me.pitch + camKick;

  // Zoom: a scoped weapon narrows the field of view while its instance says zoomed.
  const inst = me.weapon.inst[me.weapon.current];
  const def = inst ? WEAPONS[inst.id] : null;
  const targetFov = inst && inst.zoomed && def && def.zoom ? (def.zoom >= 2 ? 26 : 48) : 75;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }

  // Viewmodel: show the held weapon, bob it, kick it when a shot just fired.
  if (viewmodel) {
    for (const g of vmByWeapon.values()) g.visible = false;
    if (inst && me.alive) {
      const vm = vmGun(inst.id);
      vm.visible = true;
      const sinceShot = now - FX.muzzleAt;
      const kick = sinceShot < 0.09 ? (0.09 - sinceShot) / 0.09 : 0;
      vm.position.z = kick * 0.09;
      vm.rotation.x = kick * 0.16 + (me.reloading ? 0.55 : 0);
      viewmodel.position.y = -0.22 + Math.sin(bobT * 2) * 0.008 * Math.min(speed / 4, 1) - (inst.zoomed ? 0.06 : 0);
      viewmodel.position.x = 0.24 - (inst.zoomed ? 0.24 : 0);
      flashSprite.material.opacity = kick > 0 ? 0.95 : 0;
      flashLight.intensity = kick * 26;
    } else {
      flashSprite.material.opacity = 0;
      flashLight.intensity = 0;
    }
  }

  // The planted site's ring breathes; the other stays steady.
  for (const key of ['A', 'B']) {
    const ring = scene.getObjectByName('siteRing' + key);
    if (ring) {
      const active = G.phase === 'planted' && G.bomb.site === key;
      ring.material.opacity = active ? 0.55 + 0.4 * Math.sin(now * 6) : 0.8;
    }
  }

  renderer.render(scene, camera);
}
