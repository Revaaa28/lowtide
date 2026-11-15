// hud.js — every readout on screen: health, armour, ammo, money, the round clock and
// score, phase banners, the kill feed, the buy menu, the scoreboard, damage feedback
// and the match-end panel. It only reads state (G and the local player) and writes
// DOM — and only when a value actually changed, so a steady frame costs no layout.
// Buy input is its own listener set (B toggles, number keys and clicks buy, Tab holds
// the scoreboard) so it never fights input.js over the per-step pressed set.
//
// The minimap (top-left, drawn on a canvas this file creates) is honest intel, not a
// wallhack: colliders and sites always, teammates always, the dropped or planted
// charge always — but an enemy appears only while spotted, meaning a teammate bot's
// brain saw them in the last 3 s (bots.js keeps exactly that record), the player
// sees them right now (same cone, raycast and smoke test the bots use), or they
// fired in the last 3 s and gave themselves away. It redraws at 10 Hz, not per frame.

import { G, localPlayer } from './state.js';
import { WEAPONS, GRENADES, TIMING, UTIL } from './config.js';
import { MAP } from './map.js';
import { rayHit, eyeHeight } from './physics.js';
import { isSmokeBlocking } from './fx.js';
import { buyWeapon, buyGrenade, buyKit } from './weapons.js';
import { sfx } from './audio.js';

const el = {};
const cache = {};
let buyOpen = true;
let tabHeld = false;
let feedSeen = 0;
let bannerKey = '';
let bannerUntil = 0;
let lastHp = 100;
let lastFrameT = 0;
let dmgDirUntil = 0;
let buySig = '';
let boardSig = '';
let callSeen = 0;
let mapCtx = null;
let lastMapT = 0;
const lastSpot = new Map();   // enemy id -> sim time they were last confirmed spotted
const roundHist = [];         // 'atk' | 'def' per finished round, for the pips
let histSig = '';

const BUY_ITEMS = [
  ...Object.entries(WEAPONS).map(([id, d], i) => ({ kind: 'w', id, key: 'Digit' + (i + 1), label: d.name, price: d.price })),
  ...Object.entries(GRENADES).map(([id, d], i) => ({ kind: 'g', id, key: 'Digit' + (i + 6), label: d.name, price: d.price })),
  { kind: 'k', id: 'kit', key: 'Digit9', label: UTIL.kit.name, price: UTIL.kit.price },
];

function txt(node, v, key) {
  if (cache[key] !== v) { cache[key] = v; node.textContent = v; }
}

function actorRef(x) { return typeof x === 'object' && x !== null ? x : G.actors[x]; }

function fmt(t) {
  t = Math.max(0, Math.ceil(t));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

function doBuy(item) {
  const me = localPlayer();
  if (!me || !me.alive || G.phase !== 'buy') return;
  const before = me.money;
  if (item.kind === 'w') {
    if (me.weapon.primary === item.id || me.weapon.secondary === item.id) return;
    buyWeapon(me, item.id);
  } else if (item.kind === 'k') {
    if (me.hasKit) return;
    buyKit(me);
  } else {
    buyGrenade(me, item.id);
  }
  if (me.money < before) sfx('buy');
}

function makeDiv(id, css) {
  const d = document.createElement('div');
  d.id = id;
  d.style.cssText = css;
  document.getElementById('hud').appendChild(d);
  return d;
}

export function initHUD() {
  for (const id of ['hud-score-atk', 'hud-score-def', 'hud-timer', 'hud-phase', 'hud-health',
    'hud-armor', 'hud-healthbar-fill', 'hud-money', 'hud-weapon', 'hud-ammo', 'hud-grenades',
    'kill-feed', 'round-banner', 'round-banner-big', 'round-banner-sub', 'bomb-status',
    'buy-menu', 'buy-grid', 'scoreboard', 'scoreboard-rows', 'dmg-vignette']) {
    el[id] = document.getElementById(id);
  }
  // Buy grid: one card per catalogue entry, key number, name, price.
  for (const item of BUY_ITEMS) {
    const d = document.createElement('div');
    d.className = 'item';
    d.innerHTML = `<span class="key">${item.key.slice(5)}</span>${item.label}<span class="price">$${item.price}</span>`;
    d.style.pointerEvents = 'auto';
    d.style.cursor = 'pointer';
    d.addEventListener('click', () => doBuy(item));
    item.node = d;
    el['buy-grid'].appendChild(d);
  }
  // Elements the shell does not provide: damage direction arc, a context prompt, the
  // plant/defuse progress bar and the match-end panel.
  el.dmgDir = makeDiv('dmg-dir', 'position:fixed;left:50%;top:50%;width:110px;height:110px;margin:-55px 0 0 -55px;opacity:0;pointer-events:none;');
  el.dmgDir.innerHTML = '<div style="width:100%;height:100%;border-radius:50%;border:4px solid transparent;border-top-color:rgba(224,48,40,0.9);"></div>';
  el.prompt = makeDiv('hud-prompt', 'position:fixed;left:50%;bottom:19%;transform:translateX(-50%);font-size:14px;letter-spacing:0.14em;color:#ffd479;text-shadow:0 1px 6px #000;pointer-events:none;');
  el.interact = makeDiv('interact', 'position:fixed;left:50%;bottom:24%;transform:translateX(-50%);width:230px;height:7px;background:rgba(255,255,255,0.15);border-radius:3px;overflow:hidden;opacity:0;pointer-events:none;');
  el.interact.innerHTML = '<div style="height:100%;width:0%;background:#e86a2a;"></div>';
  el.matchEnd = makeDiv('match-end', 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,10,12,0.55);pointer-events:none;');
  // The minimap canvas and the round-history pip strip: the shell provides neither,
  // so they are made here and styled inline like the elements above.
  el.minimap = document.createElement('canvas');
  el.minimap.id = 'minimap';
  el.minimap.width = 186;
  el.minimap.height = 126;
  el.minimap.style.cssText = 'position:fixed;left:14px;top:14px;background:rgba(12,15,18,0.62);border:1px solid rgba(233,230,223,0.16);border-radius:4px;pointer-events:none;';
  document.getElementById('hud').appendChild(el.minimap);
  mapCtx = el.minimap.getContext('2d');
  el.pips = makeDiv('round-pips', 'position:fixed;top:66px;left:50%;transform:translateX(-50%);display:flex;gap:3px;pointer-events:none;');
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyB') buyOpen = !buyOpen;
    if (e.code === 'Tab') tabHeld = true;
    const item = BUY_ITEMS.find((i) => i.key === e.code);
    if (item && buyOpen) doBuy(item);
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Tab') tabHeld = false; });
}

function showBanner(big, sub, holdS = 2.6) {
  txt(el['round-banner-big'], big, 'bb');
  txt(el['round-banner-sub'], sub, 'bs');
  el['round-banner'].classList.add('on');
  bannerUntil = performance.now() / 1000 + holdS;
}

// One minimap redraw. Spotting is refreshed first (see the header note): teammate
// brains' seen records, the player's own eyes under the bots' rules, and recent
// gunfire. Enemy dots are drawn from the live position while the spot lasts.
function drawMinimap(me) {
  const now = G.now || 0;
  for (const a of G.actors) {
    if (a.team !== me.team || !a.brain || !a.brain.seen) continue;
    for (const [id, s] of a.brain.seen) if (now - s.t < 3) lastSpot.set(id, now);
  }
  const ex = me.pos.x, ey = me.pos.y + eyeHeight(me), ez = me.pos.z;
  for (const e of G.actors) {
    if (!e.alive || e.team === me.team) continue;
    const inst = e.weapon.inst[e.weapon.current];
    if (inst && inst.lastShotAt !== undefined && now - inst.lastShotAt < 3) lastSpot.set(e.id, now);
    const dx = e.pos.x - ex, dz = e.pos.z - ez;
    const dist = Math.hypot(dx, dz);
    let seen = dist < 3.2;
    if (!seen && dist <= 60) {
      let d = Math.atan2(-dx, -dz) - me.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) <= 1.15) {
        const ty = e.pos.y + eyeHeight(e) * 0.82;
        const len = Math.hypot(dist, ty - ey);
        const hit = rayHit(ex, ey, ez, dx / len, (ty - ey) / len, dz / len, len);
        if (!(hit && hit.d < len - 0.7) && !isSmokeBlocking(ex, ey, ez, e.pos.x, ty, e.pos.z)) seen = true;
      }
    }
    if (seen) lastSpot.set(e.id, now);
  }
  const c = mapCtx, W = 186, H = 126;
  const bw = MAP.bounds.maxX - MAP.bounds.minX, bh = MAP.bounds.maxZ - MAP.bounds.minZ;
  const X = (x) => (x - MAP.bounds.minX) / bw * W;
  const Y = (z) => (z - MAP.bounds.minZ) / bh * H;
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(233,230,223,0.15)';
  for (const b of MAP.colliders) {
    if (b.y0 > 0.1) continue;   // overhead catwalks and bridges would ink the centre
    c.fillRect(X(b.x0), Y(b.z0), Math.max(1, (b.x1 - b.x0) / bw * W), Math.max(1, (b.z1 - b.z0) / bh * H));
  }
  c.font = 'bold 10px ui-monospace, monospace';
  for (const key of ['A', 'B']) {
    const s = MAP.sites[key];
    c.strokeStyle = key === 'A' ? '#e86a2a' : '#5b8dd6';
    c.fillStyle = c.strokeStyle;
    c.beginPath(); c.arc(X(s.x), Y(s.z), s.r / bw * W, 0, 7); c.stroke();
    c.fillText(key, X(s.x) - 3, Y(s.z) + 3);
  }
  if (G.bomb.state === 'dropped' || G.bomb.state === 'planted') {
    c.fillStyle = '#ffd479';
    c.fillRect(X(G.bomb.x) - 2, Y(G.bomb.z) - 2, 4, 4);
  }
  for (const a of G.actors) {
    if (!a.alive || a === me) continue;
    if (a.team === me.team) c.fillStyle = '#e86a2a';
    else if (now - (lastSpot.get(a.id) || -9) < 3) c.fillStyle = '#5b8dd6';
    else continue;
    c.beginPath(); c.arc(X(a.pos.x), Y(a.pos.z), 2.5, 0, 7); c.fill();
  }
  const px = X(me.pos.x), py = Y(me.pos.z);
  const fx = -Math.sin(me.yaw), fy = -Math.cos(me.yaw);
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(px + fx * 7, py + fy * 7);
  c.lineTo(px - fx * 3 - fy * 4, py - fy * 3 + fx * 4);
  c.lineTo(px - fx * 3 + fy * 4, py - fy * 3 - fx * 4);
  c.closePath(); c.fill();
}

export function updateHUD() {
  const me = localPlayer();
  if (!me) return;
  const nowS = performance.now() / 1000;
  const frameDt = Math.min(0.1, nowS - lastFrameT || 0);
  lastFrameT = nowS;

  // Vitals and weapon readouts.
  txt(el['hud-health'], String(Math.max(0, Math.ceil(me.hp))), 'hp');
  el['hud-health'].classList.toggle('low', me.hp < 35);
  el['hud-healthbar-fill'].style.width = Math.max(0, me.hp) + '%';
  txt(el['hud-armor'], me.armor > 0 ? 'ARMOR ' + me.armor : '', 'ar');
  txt(el['hud-money'], '$' + me.money, 'mn');
  const inst = me.weapon.inst[me.weapon.current];
  const def = inst ? WEAPONS[inst.id] : null;
  txt(el['hud-weapon'], def ? def.name : '—', 'wp');
  if (inst) {
    const html = `${inst.ammo}<span class="reserve"> / ${inst.reserve}</span>`;
    if (cache.ammo !== html) { cache.ammo = html; el['hud-ammo'].innerHTML = html; }
    el['hud-ammo'].classList.toggle('empty', inst.ammo === 0);
  }
  // Utility readout: every slot, always — what you hold and what you do not, with the
  // kit named while you carry it. It sits under the ammo, where a glance lands mid-round.
  const nades = {};
  for (const g of me.weapon.grenades) nades[g] = (nades[g] || 0) + 1;
  txt(el['hud-grenades'], Object.keys(GRENADES).map((g) => `${GRENADES[g].name.split(' ')[0].toUpperCase()} ×${nades[g] || 0}`).join(' · ') + (me.hasKit ? ' · KIT' : ''), 'gr');

  // Clock, phase and score.
  const phaseName = { buy: 'BUY', live: 'LIVE', planted: 'PLANTED', over: 'OVER' }[G.phase];
  const clock = G.phase === 'buy' ? G.buyUntil : G.phase === 'planted' ? G.bomb.t : G.timeLeft;
  const timeStr = fmt(clock);
  if (cache.tm !== timeStr) { cache.tm = timeStr; el['hud-timer'].childNodes[0].nodeValue = timeStr; }
  el['hud-timer'].classList.toggle('low', (G.phase === 'live' && G.timeLeft < 10) || (G.phase === 'planted' && G.bomb.t < 10));
  txt(el['hud-phase'], `ROUND ${G.round} OF ${G.maxRounds} · ${phaseName}`, 'ph');
  txt(el['hud-score-atk'], String(G.score.atk), 'sa');
  txt(el['hud-score-def'], String(G.score.def), 'sd');

  // Round-history pips: one square per finished round under the score, in the order
  // they were won. The score that just moved names the winner; a staged scene that
  // sets both scores at once fills from the totals in order.
  const tot = G.score.atk + G.score.def;
  if (tot < roundHist.length) roundHist.length = 0;
  while (roundHist.length < tot) {
    roundHist.push(G.score.atk > roundHist.filter((w) => w === 'atk').length ? 'atk' : 'def');
  }
  if (histSig !== roundHist.join('')) {
    histSig = roundHist.join('');
    el.pips.innerHTML = roundHist.map((w) => `<i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${w === 'atk' ? '#e86a2a' : '#5b8dd6'}"></i>`).join('');
  }

  // Minimap at 10 Hz: the redraw walks every collider and does the vision raycasts,
  // which is real work a 60 Hz frame should not pay.
  if (nowS - lastMapT >= 0.1) { lastMapT = nowS; drawMinimap(me); }
  el['bomb-status'].classList.toggle('hidden', G.phase !== 'planted');
  if (G.phase === 'planted') txt(el['bomb-status'], `CHARGE PLANTED — ${Math.ceil(G.bomb.t)}`, 'bs2');

  // Prompt line and the plant/defuse progress bar.
  let prompt = '';
  let prog = -1;
  if (inst && inst.reloadingUntil > (G.now || 0)) prompt = 'RELOADING…';
  else if (inst && inst.ammo === 0) prompt = 'PRESS R TO RELOAD';
  else if (inst && inst.ammo <= Math.ceil(def.mag * 0.25)) prompt = 'LOW AMMO';
  if (me.plantT > 0) { prompt = 'PLANTING THE CHARGE…'; prog = me.plantT / TIMING.plant; }
  else if (me.defuseT > 0) { prompt = 'DEFUSING…'; prog = me.defuseT / (me.hasKit ? TIMING.defuseKit : TIMING.defuseNoKit); }
  else if (G.phase === 'live' && G.bomb.carriedBy === me.id && prompt === '') prompt = 'REACH A SITE — HOLD E TO PLANT';
  txt(el.prompt, prompt, 'pr');
  el.interact.style.opacity = prog >= 0 ? '1' : '0';
  if (prog >= 0) el.interact.firstChild.style.width = Math.min(100, prog * 100) + '%';

  // Banners on phase transitions.
  const key = G.phase + '|' + G.round + '|' + (G.winner || '');
  if (key !== bannerKey) {
    bannerKey = key;
    if (G.matchOver) showBanner(G.winner ? (G.winner === me.team ? 'MATCH WON' : 'MATCH LOST') : 'MATCH DRAWN', `${G.score.atk} — ${G.score.def}`, 9999);
    else if (G.phase === 'over') showBanner(G.winner === me.team ? 'ROUND WON' : 'ROUND LOST', G.winReason);
    else if (G.phase === 'planted') showBanner('CHARGE PLANTED', MAP_LABEL(G.bomb.site));
    else if (G.phase === 'buy' && !G.staged) showBanner('ROUND ' + G.round, me.team === 'atk' ? 'Plant the charge, or eliminate the Lockkeepers.' : 'Hold both sites.');
  }
  if (nowS > bannerUntil) el['round-banner'].classList.remove('on');

  // Kill feed: rows for entries not yet shown, gone after five seconds.
  if (feedSeen > G.feed.length) feedSeen = 0;
  while (feedSeen < G.feed.length) {
    const e = G.feed[feedSeen++];
    const k = actorRef(e.killer), v = actorRef(e.victim);
    if (!k || !v) continue;
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span class="${k.team}">${k.name}</span><span class="wpn">${(WEAPONS[e.weapon]?.name || e.weapon || '—')}${e.headshot ? ' <span style="color:#ffd479;font-weight:700">HS</span>' : ''}</span><span class="${v.team}">${v.name}</span>`;
    el['kill-feed'].appendChild(row);
    setTimeout(() => row.remove(), G.staged ? 60000 : 5000);
    while (el['kill-feed'].children.length > 5) el['kill-feed'].firstChild.remove();
  }

  // Bot callouts (bots.js fills G.callouts): the same feed, quieter dress — a name
  // and a few words, gone in five seconds like a kill row.
  const calls = G.callouts || [];
  if (callSeen > calls.length) callSeen = 0;
  while (callSeen < calls.length) {
    const c = calls[callSeen++];
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span class="${c.team}">${c.name}</span><span class="wpn">» ${c.text}</span>`;
    el['kill-feed'].appendChild(row);
    setTimeout(() => row.remove(), G.staged ? 60000 : 5000);
    while (el['kill-feed'].children.length > 5) el['kill-feed'].firstChild.remove();
  }

  // Buy menu: visible through the buy phase unless B closed it; item states refresh
  // only when money or ownership changed.
  const menuOn = G.phase === 'buy' && buyOpen;
  el['buy-menu'].classList.toggle('hidden', !menuOn);
  if (menuOn) {
    const sig = me.money + '|' + me.weapon.primary + '|' + me.weapon.grenades.join(',');
    if (sig !== buySig) {
      buySig = sig;
      for (const item of BUY_ITEMS) {
        const owned = item.kind === 'w'
          ? (me.weapon.primary === item.id || me.weapon.secondary === item.id)
          : item.kind === 'k' ? me.hasKit
          : me.weapon.grenades.includes(item.id);
        item.node.classList.toggle('owned', owned);
        item.node.classList.toggle('cant', !owned && me.money < item.price);
      }
    }
  }

  // Scoreboard while Tab is held, and for good at match end.
  const boardOn = tabHeld || !!G.matchOver;
  el['scoreboard'].classList.toggle('hidden', !boardOn);
  if (boardOn) {
    const sig = G.actors.map((a) => a.kills + '/' + a.deaths + '/' + a.money + '/' + (a.alive ? 1 : 0)).join('|');
    if (sig !== boardSig) {
      boardSig = sig;
      const rows = (team, label) => `<tr><th colspan="4">${label}</th></tr>` + G.actors.filter((a) => a.team === team)
        .map((a) => `<tr class="${a.alive ? '' : 'dead'} ${a === me ? 'me' : ''}"><td>${a.name}</td><td>${a.kills}</td><td>${a.deaths}</td><td>$${a.money}</td></tr>`).join('');
      el['scoreboard-rows'].innerHTML = `<table><tr><th>PLAYER</th><th>K</th><th>D</th><th>MONEY</th></tr>${rows('atk', 'SILT RUNNERS — ' + G.score.atk)}${rows('def', 'LOCKKEEPERS — ' + G.score.def)}</table>`;
    }
  }

  // Damage feedback: a vignette flash on any hp drop, and a direction arc when
  // weapons.js recorded where the shot came from.
  const vig = el['dmg-vignette'];
  if (me.hp < lastHp - 0.5) {
    vig.style.opacity = '0.9';
    if (me.lastDamageFrom && typeof me.lastDamageFrom.x === 'number') {
      const rel = Math.atan2(-(me.lastDamageFrom.x - me.pos.x), -(me.lastDamageFrom.z - me.pos.z)) - me.yaw;
      el.dmgDir.style.transform = `rotate(${-rel}rad)`;
      dmgDirUntil = nowS + 0.9;
    }
    sfx('hurt');
  }
  lastHp = me.hp;
  vig.style.opacity = String(Math.max(0, parseFloat(vig.style.opacity || 0) - frameDt * 1.8));
  el.dmgDir.style.opacity = nowS < dmgDirUntil ? '1' : '0';

  // Match-end panel: the verdict, the score, and the full table — every player's
  // kills and deaths under their team's name, the local player picked out in gold.
  const showEnd = !!G.matchOver;
  el.matchEnd.style.display = showEnd ? 'flex' : 'none';
  if (showEnd) {
    const endSig = G.score.atk + '-' + G.score.def + '|' + G.actors.map((a) => a.kills + '/' + a.deaths).join('|');
    if (cache.end !== endSig) {
      cache.end = endSig;
      const trows = (team, label, col) => `<tr><td colspan="3" style="color:${col};text-align:left;padding-top:9px;">${label}</td></tr>` +
        G.actors.filter((a) => a.team === team)
          .map((a) => `<tr${a === me ? ' style="color:#ffd479"' : ''}><td style="text-align:left;padding-right:20px;">${a.name}</td><td style="padding-right:12px;">${a.kills} K</td><td>${a.deaths} D</td></tr>`).join('');
      el.matchEnd.innerHTML = `<div style="background:rgba(14,17,21,0.92);border:1px solid rgba(233,230,223,0.16);border-radius:6px;padding:26px 40px;text-align:center;font-family:ui-monospace,monospace;">
      <div style="font-size:34px;font-weight:700;">${G.winner ? (G.winner === me.team ? 'MATCH WON' : 'MATCH LOST') : 'MATCH DRAWN'}</div>
      <div style="font-size:20px;margin-top:8px;">SILT RUNNERS ${G.score.atk} — ${G.score.def} LOCKKEEPERS</div>
      <table style="margin:12px auto 0;font-size:14px;color:#e9e6df;">${trows('atk', 'SILT RUNNERS', '#e86a2a')}${trows('def', 'LOCKKEEPERS', '#5b8dd6')}</table>
      <div style="color:#9aa3ab;margin-top:12px;">Press R to play again</div></div>`;
    }
  }
}

function MAP_LABEL(site) {
  return site === 'A' ? 'Pump House' : site === 'B' ? 'Gate Winch' : '';
}
