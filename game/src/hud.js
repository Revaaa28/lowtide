// hud.js — every readout on screen: health, armour, ammo, money, the round clock and
// score, phase banners, the kill feed, the buy menu, the scoreboard, damage feedback
// and the match-end panel. It only reads state (G and the local player) and writes
// DOM — and only when a value actually changed, so a steady frame costs no layout.
// Buy input is its own listener set (B toggles, number keys and clicks buy, Tab holds
// the scoreboard) so it never fights input.js over the per-step pressed set.

import { G, localPlayer } from './state.js';
import { WEAPONS, GRENADES, TIMING } from './config.js';
import { buyWeapon, buyGrenade } from './weapons.js';
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

const BUY_ITEMS = [
  ...Object.entries(WEAPONS).map(([id, d], i) => ({ kind: 'w', id, key: 'Digit' + (i + 1), label: d.name, price: d.price })),
  ...Object.entries(GRENADES).map(([id, d], i) => ({ kind: 'g', id, key: 'Digit' + (i + 6), label: d.name, price: d.price })),
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
  const nades = {};
  for (const g of me.weapon.grenades) nades[g] = (nades[g] || 0) + 1;
  txt(el['hud-grenades'], Object.entries(nades).map(([g, n]) => `${GRENADES[g].name.split(' ')[0].toUpperCase()} ×${n}`).join(' · '), 'gr');

  // Clock, phase and score.
  const phaseName = { buy: 'BUY', live: 'LIVE', planted: 'PLANTED', over: 'OVER' }[G.phase];
  const clock = G.phase === 'buy' ? G.buyUntil : G.phase === 'planted' ? G.bomb.t : G.timeLeft;
  const timeStr = fmt(clock);
  if (cache.tm !== timeStr) { cache.tm = timeStr; el['hud-timer'].childNodes[0].nodeValue = timeStr; }
  el['hud-timer'].classList.toggle('low', (G.phase === 'live' && G.timeLeft < 10) || (G.phase === 'planted' && G.bomb.t < 10));
  txt(el['hud-phase'], `ROUND ${G.round} · ${phaseName}`, 'ph');
  txt(el['hud-score-atk'], String(G.score.atk), 'sa');
  txt(el['hud-score-def'], String(G.score.def), 'sd');
  el['bomb-status'].classList.toggle('hidden', G.phase !== 'planted');
  if (G.phase === 'planted') txt(el['bomb-status'], `CHARGE PLANTED — ${Math.ceil(G.bomb.t)}`, 'bs2');

  // Prompt line and the plant/defuse progress bar.
  let prompt = '';
  let prog = -1;
  if (inst && inst.reloadingUntil > (G.now || 0)) prompt = 'RELOADING…';
  else if (inst && inst.ammo === 0) prompt = 'PRESS R TO RELOAD';
  else if (inst && inst.ammo <= Math.ceil(def.mag * 0.25)) prompt = 'LOW AMMO';
  if (me.plantT > 0) { prompt = 'PLANTING THE CHARGE…'; prog = me.plantT / TIMING.plant; }
  else if (me.defuseT > 0) { prompt = 'DEFUSING…'; prog = me.defuseT / TIMING.defuseNoKit; }
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
    row.innerHTML = `<span class="${k.team}">${k.name}</span><span class="wpn">${(WEAPONS[e.weapon]?.name || e.weapon || '—')}${e.headshot ? ' ⌖' : ''}</span><span class="${v.team}">${v.name}</span>`;
    el['kill-feed'].appendChild(row);
    setTimeout(() => row.remove(), 5000);
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

  // Match-end panel.
  const showEnd = !!G.matchOver;
  el.matchEnd.style.display = showEnd ? 'flex' : 'none';
  if (showEnd && cache.end !== G.score.atk + '-' + G.score.def) {
    cache.end = G.score.atk + '-' + G.score.def;
    el.matchEnd.innerHTML = `<div style="background:rgba(14,17,21,0.92);border:1px solid rgba(233,230,223,0.16);border-radius:6px;padding:26px 40px;text-align:center;font-family:ui-monospace,monospace;">
      <div style="font-size:34px;font-weight:700;">${G.winner ? (G.winner === me.team ? 'MATCH WON' : 'MATCH LOST') : 'MATCH DRAWN'}</div>
      <div style="font-size:20px;margin-top:8px;">SILT RUNNERS ${G.score.atk} — ${G.score.def} LOCKKEEPERS</div>
      <div style="color:#9aa3ab;margin-top:10px;">Press R to play again</div></div>`;
  }
}

function MAP_LABEL(site) {
  return site === 'A' ? 'Pump House' : site === 'B' ? 'Gate Winch' : '';
}
