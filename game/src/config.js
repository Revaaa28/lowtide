// config.js — every tuning number in LOWTIDE lives here: the weapon catalogue, the grenades,
// the round economy and the phase timings. Nothing else in the game hard-codes a balance
// value; weapons.js, rounds.js and hud.js all read from these tables, so a balance pass is
// a one-file edit. Damage is per-hit before armour; spread is in radians and is the half-angle
// of the cone a shot can leave the muzzle in — see weapons.js for how stance feeds it.

export const WEAPONS = {
  // The free sidearm everyone spawns with. Weak past mid range, exact when still.
  pk9: {
    name: 'PK-9 Kakatua', price: 0, slot: 'secondary',
    dmg: { head: 88, body: 34, leg: 25 }, rpm: 352, mag: 12, reserve: 100, reloadS: 2.2,
    spread: { stand: 0.006, move: 0.045, crouch: 0.004, air: 0.09 },
    recoil: 0.011, pellets: 1, auto: false, zoom: 0,
  },
  // Cheap automatic: strong up close, its spread blooms fast on the move.
  rusa9: {
    name: 'Rusa-9 SMG', price: 1200, slot: 'primary',
    dmg: { head: 62, body: 26, leg: 19 }, rpm: 750, mag: 30, reserve: 120, reloadS: 2.4,
    spread: { stand: 0.012, move: 0.06, crouch: 0.009, air: 0.11 },
    recoil: 0.008, pellets: 1, auto: true, zoom: 0,
  },
  // The standard rifle. A standing headshot kills through no helmet; recoil climbs in bursts.
  ar57: {
    name: 'AR-57 Anoa', price: 2700, slot: 'primary',
    dmg: { head: 132, body: 33, leg: 24 }, rpm: 666, mag: 30, reserve: 90, reloadS: 2.5,
    spread: { stand: 0.008, move: 0.07, crouch: 0.005, air: 0.12 },
    recoil: 0.014, pellets: 1, auto: true, zoom: 0,
  },
  // Pump shotgun: eight pellets, one shell decides a doorway, useless down a lane.
  banteng8: {
    name: 'Banteng-8 Pump', price: 1800, slot: 'primary',
    dmg: { head: 40, body: 22, leg: 16 }, rpm: 68, mag: 7, reserve: 32, reloadS: 3.4,
    spread: { stand: 0.035, move: 0.06, crouch: 0.03, air: 0.08 },
    recoil: 0.05, pellets: 8, auto: false, zoom: 0,
  },
  // Bolt-action. One body shot nearly ends a fight; firing unscoped is a lottery ticket.
  longbow12: {
    name: 'Longbow-12', price: 4500, slot: 'primary',
    dmg: { head: 250, body: 110, leg: 82 }, rpm: 41, mag: 5, reserve: 30, reloadS: 3.7,
    spread: { stand: 0.0008, move: 0.15, crouch: 0.0006, air: 0.2 },
    recoil: 0.09, pellets: 1, auto: false, zoom: 2,
  },
};

export const GRENADES = {
  nanas: { name: 'Nanas Frag', price: 300, kind: 'frag', dmg: 85, radius: 5.5 },
  flash: { name: 'Flash Charge', price: 200, kind: 'flash', radius: 14, duration: 2.8 },
  smoke: { name: 'Smoke Pot', price: 300, kind: 'smoke', radius: 4.5, duration: 14 },
};

// Round money. loss[] is the consecutive-loss ladder: the deeper a team's losing streak,
// the more it is paid, which keeps a shut-out match from becoming a permanent eco round.
export const ECON = {
  start: 800,
  kill: 300,
  plant: 300,
  winElim: 2700,
  winObj: 3000,
  loss: [1400, 1900, 2400, 2900, 3400],
  maxMoney: 16000,
};

// Phase timings in seconds. The buy window doubles as the freeze: nobody moves until it ends.
export const TIMING = {
  buy: 15,
  round: 105,
  bomb: 40,
  plant: 3.2,
  defuseKit: 5,
  defuseNoKit: 10,
  freeze: 2,
};
