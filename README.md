# lowtide

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Revaaa28/lowtide/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Revaaa28/lowtide/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

LOWTIDE is a 5v5 tactical FPS set in a drained river lock at dawn. The Silt Runners attack: cross the lock, plant the charge on a bomb site, and hold it until it blows. The Lockkeepers defend both sites and defuse if the plant goes down. You play as the first Silt Runner; the other nine combatants are bots that pick routes, hold angles, react to gunfire and sightlines, and rotate when the charge is planted.

The map is one lock basin with three lanes — a warehouse in the west, the lock chamber and its catwalks in the middle, a gantry lane in the east — so every round forces a cross-map decision. Bomb site A is the Pump House at the north-west; site B is the Gate Winch at the south-east. Rounds run on a full buy economy: $800 to start, cash for kills, plants and round wins, and a loss ladder that pays the losing team more the longer its streak runs, so no match is a permanent eco round.

Features:

- Five weapons with distinct handling: PK-9 Kakatua pistol, Rusa-9 SMG ($1,200), Banteng-8 Pump shotgun ($1,800), AR-57 Anoa rifle ($2,700) and the bolt-action Longbow-12 ($4,500)
- Per-weapon recoil patterns: every automatic walks its own climb, a shape to learn and pull against
- Three grenades: Nanas Frag, Flash Charge and Smoke Pot
- Bomb plant/defuse objective; a $400 Defuse Kit from the buy menu halves a defuse (5 s against 10 s)
- Bot navigation on a validated A* waypoint graph: 57 nodes with walkability-proven edges — every route a bot takes is a shortest path over ground the graph has verified, not a steering guess
- A hearing bus for bot perception: gunfire, footsteps and plants are sound events with distance falloff and wall muffling (a shot through two lock gates is not heard; the same shot down an open lane is), and bots remember the last sound position and rotate toward it
- Defender bots hold pre-aimed angles on the sites and peek when the hearing bus gives them a reason to
- Bot radio callouts on first contact, plants and defuses
- Warm dawn palette with a site identity you can read at a glance: site A (Pump House) is painted orange, site B (Gate Winch) teal, under an orange sun
- Smoke Pot grenades build volumes of individual sprite puffs that genuinely block bot vision — stand behind one and the bots lose you
- A live minimap with honest spotting (teammates always, enemies only when seen or heard), round-history pips, and a kill feed that tags headshots
- Fixed-step simulation, decoupled from rendering
- Zero network requests — the whole game is static files

## Controls

WASD to move, mouse to look, left mouse button to fire. **R** reloads, **Ctrl** or **C** crouches, holding **Shift** walks quietly — slower, but your footsteps make no noise for bot ears. **B** opens the buy menu, holding **E** plants or defuses the charge, and **Tab** shows the scoreboard.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
