// LOWTIDE — hand-in program for the make.fun three.js tactical FPS bounty (Node 22,
// standard library only, no build step).
//
// LOWTIDE itself is the static game under game/: plain files the browser loads as ES
// modules, three.js 0.187.0 arriving through the import map in game/index.html. This
// program is only the courier. It stages the entry in the output directory — a full
// copy of game/, a full copy of screenshots/ (real renders of the game, first by name
// is the cover) — and then writes dossier.json beside them with buildDossier from the
// vendored make.fun library, byte for byte the summary the scorer rebuilds and the
// judge reads.
//
// Run it the way the grader does, from the repository root:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// MAKEFUN_OUTPUT_DIR stands in for /output outside the grader's container. To play
// the game instead of handing it in: `node serve.ts`, then http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps, passed to the dossier builder unchanged: source text is capped
// at 160 KiB, at most 4 screenshots of at most 256 KiB each, and game/ may hold at
// most 993 files totalling 48 MiB (the output directory's own 1,000-entry cap is
// shared with screenshots/ and dossier.json).
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

// Stage 1: the game itself, copied whole — the entry is judged on exactly these files.
// Fail early with a readable message if the checkout is incomplete: a raw cpSync stack
// trace would not say which half of the entry is missing.
const gameDir = join(repoRoot, 'game');
if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('LOWTIDE hand-in aborted: game/index.html not found — run main.ts from a complete checkout of the repository.');
}
mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });

// Stage 2: the screenshots, when the repository carries any.
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoRoot, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// Stage 3: the dossier, built from the staged copies (never from the repository), so
// what the judge reads is provably what was handed in.
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, DOSSIER_LIMITS));
