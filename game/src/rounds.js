// rounds.js — the round director: the phase machine (buy → live → planted → over), the
// bomb's plant/defuse channels, win checks and every money payout. Kill money is paid
// by consuming G.feed with a cursor (G.feedPaid) so the HUD can read the same feed for
// its display without either system eating the other's entries. The planter is paid
// when the plant completes; round winners and the loss ladder are paid as the round
// ends. The local player's plant channel lives here too (hold E inside a site);
// bot channels arrive via actor.plantT / actor.defuseT, set by bots.js.

import { G, spawnRound, newMatch, localPlayer } from './state.js';
import { MAP } from './map.js';
import { ECON, TIMING } from './config.js';
import { down, pressed } from './input.js';
import { sfx } from './audio.js';
import { pushNoise } from './weapons.js';

let feedPaid = 0;
let planterId = -1;
let lastBeepAt = 0;

function actorRef(x) {
  return typeof x === 'object' && x !== null ? x : G.actors[x];
}

function pay(a, amount) {
  if (a) a.money = Math.min(ECON.maxMoney, a.money + amount);
}

function setPhase(p) {
  G.phase = p;
  G.phaseT = 0;
}

function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = MAP.sites[key];
    if (Math.hypot(s.x - x, s.z - z) <= s.r) return key;
  }
  return null;
}

function aliveCount(team) {
  return G.actors.filter((a) => a.team === team && a.alive).length;
}

function endRound(winner, kind) {
  const loser = winner === 'atk' ? 'def' : 'atk';
  const siteLabel = G.bomb.site ? MAP.sites[G.bomb.site].label : '';
  G.winner = winner;
  G.winReason = {
    elim: winner === 'atk' ? 'Lockkeepers eliminated.' : 'Silt Runners eliminated.',
    time: 'The clock ran out on the plant.',
    defuse: `The charge on the ${siteLabel} was defused.`,
    objective: `The charge detonated on the ${siteLabel}.`,
  }[kind];
  G.score[winner] += 1;
  const winPay = kind === 'objective' || kind === 'defuse' ? ECON.winObj : ECON.winElim;
  const lossPay = ECON.loss[Math.min(G.lossStreak[loser], ECON.loss.length - 1)];
  for (const a of G.actors) {
    if (a.team === winner) pay(a, winPay);
    else pay(a, lossPay);
  }
  G.lossStreak[loser] += 1;
  G.lossStreak[winner] = 0;
  const me = localPlayer();
  sfx(me && me.team === winner ? 'win' : 'lose');
  setPhase('over');
}

function completePlant(a) {
  const site = siteAt(a.pos.x, a.pos.z) || G.bomb.site || 'A';
  G.bomb.state = 'planted';
  G.bomb.site = site;
  G.bomb.x = a.pos.x;
  G.bomb.y = a.pos.y;
  G.bomb.z = a.pos.z;
  G.bomb.t = TIMING.bomb;
  G.bomb.carriedBy = null;
  planterId = a.id;
  a.plantT = 0;
  pay(a, ECON.plant);
  sfx('planted');
  setPhase('planted');
}

// Channels: whoever is channeling (bot fields or the local player's E key) advances a
// progress field; this module validates and completes them, and reverts a channel
// nobody is holding any more.
function channels(dt) {
  const me = localPlayer();
  // The local player plants by holding E inside a site while carrying the charge.
  if (me && me.alive && G.phase === 'live' && G.bomb.state !== 'planted'
      && G.bomb.carriedBy === me.id) {
    const site = siteAt(me.pos.x, me.pos.z);
    if (site && down('KeyE')) {
      me.plantT = (me.plantT || 0) + dt;
      G.bomb.state = 'planting';
      G.bomb.site = site;
    } else if (me.plantT) {
      me.plantT = 0;
    }
  }
  if (G.bomb.state === 'planting') {
    const planter = G.actors.find((a) => a.alive && (a.plantT || 0) > 0);
    if (!planter) {
      G.bomb.state = G.bomb.carriedBy !== null && G.actors[G.bomb.carriedBy]?.alive ? 'carried' : 'dropped';
    } else if (planter.plantT >= TIMING.plant) {
      completePlant(planter);
      return;
    }
  }
  if (G.bomb.state === 'defusing' && G.phase === 'planted') {
    const defuser = G.actors.find((a) => a.alive && (a.defuseT || 0) > 0);
    if (!defuser) {
      G.bomb.state = 'planted';
    } else {
      const need = defuser.hasKit ? TIMING.defuseKit : TIMING.defuseNoKit;
      if (defuser.defuseT >= need) {
        defuser.defuseT = 0;
        G.bomb.state = 'defused';
        sfx('defuse');
        endRound('def', 'defuse');
      }
    }
  }
  // A dropped charge is picked up by the first living attacker to step on it.
  if (G.bomb.state === 'dropped' && G.phase === 'live') {
    for (const a of G.actors) {
      if (a.team === 'atk' && a.alive && Math.hypot(a.pos.x - G.bomb.x, a.pos.z - G.bomb.z) < 1.3) {
        G.bomb.carriedBy = a.id;
        G.bomb.state = 'carried';
        break;
      }
    }
  }
}

export function updateRounds(dt, now) {
  G.now = now;
  if (G.matchOver === undefined) G.matchOver = false;
  G.phaseT += dt;

  // Kill rewards, paid once per feed entry.
  if (feedPaid > G.feed.length) feedPaid = 0;
  while (feedPaid < G.feed.length) {
    const e = G.feed[feedPaid++];
    const killer = actorRef(e.killer);
    const victim = actorRef(e.victim);
    if (killer && victim && killer.team !== victim.team) pay(killer, ECON.kill);
  }
  G.feedPaid = feedPaid;

  if (G.staged) return;

  switch (G.phase) {
    case 'buy': {
      G.buyUntil = Math.max(0, TIMING.buy - G.phaseT);
      if (G.phaseT >= TIMING.buy) {
        G.timeLeft = TIMING.round;
        setPhase('live');
      }
      break;
    }
    case 'live': {
      G.timeLeft = Math.max(0, TIMING.round - G.phaseT);
      channels(dt);
      if (G.phase !== 'live') break;
      if (aliveCount('atk') === 0) endRound('def', 'elim');
      else if (aliveCount('def') === 0) endRound('atk', 'elim');
      else if (G.timeLeft <= 0) endRound('def', 'time');
      break;
    }
    case 'planted': {
      channels(dt);
      if (G.phase !== 'planted') break;
      G.bomb.t -= dt;
      // The beep quickens as the timer runs down: 1 s, then 0.5 s, then 0.25 s.
      const interval = G.bomb.t > 10 ? 1 : G.bomb.t > 5 ? 0.5 : 0.25;
      if (now - lastBeepAt >= interval) {
        lastBeepAt = now; sfx('beep');
        // The beeper lands on the hearing bus too.
        pushNoise(G.bomb.x, G.bomb.z, 26, 'beep');
      }
      if (aliveCount('def') === 0) endRound('atk', 'elim');
      else if (G.bomb.t <= 0) {
        G.bomb.state = 'exploded';
        sfx('explosion');
        endRound('atk', 'objective');
      }
      break;
    }
    case 'over': {
      if (G.matchOver) {
        if (pressed('KeyR') || pressed('Enter')) {
          G.matchOver = false;
          feedPaid = 0;
          planterId = -1;
          newMatch();
        }
        break;
      }
      if (G.phaseT >= 6) {
        if (G.round >= G.maxRounds) {
          G.matchOver = true;
          G.winner = G.score.atk === G.score.def ? null : (G.score.atk > G.score.def ? 'atk' : 'def');
          G.winReason = G.winner ? 'Match over.' : 'Match drawn.';
        } else {
          feedPaid = 0;
          planterId = -1;
          spawnRound();
        }
      }
      break;
    }
    default:
      break;
  }
}
