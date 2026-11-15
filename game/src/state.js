// state.js — the one place match state lives. Every system reads and writes the exported
// object G; nothing keeps a private copy of score, phase or actor data, so the HUD, the
// round director and the bots can never disagree about what is happening. Actors are plain
// objects (see makeActor) shared by physics, weapons, bots and the renderer: pos is the
// feet position in metres, yaw/pitch the facing in radians (yaw 0 looks north, -z).

import { WEAPONS, ECON, TIMING } from './config.js';
import { MAP } from './map.js';

export const G = {
  phase: 'buy',          // 'buy' | 'live' | 'planted' | 'over'
  phaseT: 0,             // seconds spent in the current phase
  round: 0,
  maxRounds: 12,
  score: { atk: 0, def: 0 },
  lossStreak: { atk: 0, def: 0 },
  actors: [],
  bomb: { carriedBy: null, state: 'carried', site: null, x: 0, y: 0, z: 0, t: 0 },
  timeLeft: TIMING.round,
  buyUntil: TIMING.buy,
  winner: null,          // 'atk' | 'def' once a round or the match is decided
  winReason: '',
  feed: [],              // kill feed entries {killer, victim, weapon, headshot, t}
  staged: null,          // set by input.js staging (?stage=...) — a posed screenshot scene
};

const ATK_NAMES = ['YOU', 'VEX', 'ORIN', 'TALO', 'MIRA'];
const DEF_NAMES = ['HOLD', 'PIER', 'GANT', 'ROOK', 'SEMA'];

function freshInst(id) {
  const def = WEAPONS[id];
  return { id, ammo: def.mag, reserve: def.reserve, reloadingUntil: 0, nextShotAt: 0, shotsFired: 0 };
}

// A weapon loadout as the contract defines it: the instances live in weapon.inst keyed by
// slot, weapon.current names the held one. Grenades are a list of grenade ids.
function freshLoadout() {
  return {
    primary: null,
    secondary: 'pk9',
    grenades: [],
    current: 'secondary',
    inst: { secondary: freshInst('pk9') },
  };
}

function makeActor(id, team, bot, name) {
  return {
    id, team, bot, name,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0,
    hp: 100, armor: 0, alive: true,
    crouch: false, onGround: true,
    money: ECON.start, kills: 0, deaths: 0,
    weapon: freshLoadout(),
    hearEvents: [],      // noises this actor has perceived; bots.js fills and drains it
  };
}

// The local player is always attacker 0: the Silt Runners plant, the Lockkeepers defend.
export function localPlayer() {
  return G.actors[0];
}

export function newMatch() {
  G.actors = [];
  for (let i = 0; i < 5; i++) G.actors.push(makeActor(i, 'atk', i !== 0, ATK_NAMES[i]));
  for (let i = 0; i < 5; i++) G.actors.push(makeActor(5 + i, 'def', true, DEF_NAMES[i]));
  G.score.atk = 0;
  G.score.def = 0;
  G.lossStreak.atk = 0;
  G.lossStreak.def = 0;
  G.round = 0;
  G.winner = null;
  G.winReason = '';
  spawnRound();
}

// Places every actor on its team spawn, restores health, refills the ammunition of weapons
// already owned (bought guns are kept between rounds; a fresh match starts pistol-only via
// newMatch's loadouts), and hands the bomb to a random living attacker.
export function spawnRound() {
  G.round += 1;
  G.phase = 'buy';
  G.phaseT = 0;
  G.buyUntil = TIMING.buy;
  G.timeLeft = TIMING.round;
  G.winner = null;
  G.winReason = '';
  G.feed = [];
  for (const a of G.actors) {
    const spawns = MAP.spawns[a.team];
    const s = spawns[a.id % spawns.length];
    a.pos.x = s[0];
    a.pos.z = s[1];
    a.pos.y = 0;
    a.vel.x = 0; a.vel.y = 0; a.vel.z = 0;
    a.yaw = s[2];
    a.pitch = 0;
    a.hp = 100;
    a.alive = true;
    a.crouch = false;
    a.hearEvents.length = 0;
    for (const slot of ['primary', 'secondary']) {
      const inst = a.weapon.inst[slot];
      if (inst) {
        const def = WEAPONS[inst.id];
        inst.ammo = def.mag;
        inst.reserve = def.reserve;
        inst.reloadingUntil = 0;
        inst.nextShotAt = 0;
        inst.shotsFired = 0;
      }
    }
    if (!a.weapon.inst[a.weapon.current]) a.weapon.current = a.weapon.secondary ? 'secondary' : 'primary';
  }
  const attackers = G.actors.filter((a) => a.team === 'atk');
  const carrier = attackers[Math.floor(Math.random() * attackers.length)];
  G.bomb.carriedBy = carrier.id;
  G.bomb.state = 'carried';
  G.bomb.site = null;
  G.bomb.t = 0;
  G.bomb.x = carrier.pos.x;
  G.bomb.y = carrier.pos.y;
  G.bomb.z = carrier.pos.z;
}
