// Hands the entry in: copies app/ and screenshots/ from this repository to the output directory
// and writes dossier.json with the kit's vendored builder, so the dossier is byte for byte the one
// the scorer would make.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts     (outside the grader, out/ stands in for /output)
//
// Node 22.18+ runs this TypeScript as it is. Nothing here draws the art: the app under app/ does
// that in the browser, offline, from its own files.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's limits (reference/gate.json). Anything over them is a wasted run, so the copier
// refuses before it writes a dossier the gate would throw out.
const LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    const st = statSync(full);
    if (st.isSymbolicLink()) throw new Error(`symlink in app/: ${relative(here, full)}`);
    entries.push(full);
    if (name.isDirectory()) entries.push(...walk(full));
  }
  return entries;
}

function checkApp() {
  const index = join(here, 'app', 'index.html');
  if (!existsSync(index)) throw new Error('app/index.html is missing');
  if (statSync(index).size > 1048576) throw new Error('app/index.html is over 1 MiB');

  const files = walk(join(here, 'app'));
  const bytes = files.reduce((sum, f) => sum + statSync(f).size, 0);
  if (files.length > LIMITS.app_max_files) throw new Error(`app/ holds ${files.length} entries, over ${LIMITS.app_max_files}`);
  if (bytes > LIMITS.app_max_bytes) throw new Error(`app/ is ${bytes} bytes, over ${LIMITS.app_max_bytes}`);
  for (const f of files) {
    const rel = relative(join(here, 'app'), f).split(sep).join('/');
    if (Buffer.byteLength(rel, 'utf8') > LIMITS.app_path_max_bytes) throw new Error(`path too long: ${rel}`);
  }
  return { files: files.length, bytes };
}

function checkScreenshots() {
  const dir = join(here, 'screenshots');
  if (!existsSync(dir)) throw new Error('screenshots/ is missing');
  const shots = readdirSync(dir).filter((n) => !n.startsWith('.'));
  if (shots.length < 3 || shots.length > LIMITS.screenshots.max) {
    throw new Error(`screenshots/ holds ${shots.length} files, needs 3 or 4`);
  }
  for (const n of shots) {
    const size = statSync(join(dir, n)).size;
    if (size > LIMITS.screenshots.max_bytes) throw new Error(`${n} is ${size} bytes, over 256 KiB`);
  }
  return shots.length;
}

const app = checkApp();
const shots = checkScreenshots();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

writeFileSync(join(out, 'dossier.json'), buildDossier(out, LIMITS));

const dossierBytes = statSync(join(out, 'dossier.json')).size;
process.stdout.write(`app: ${app.files} entries, ${app.bytes} bytes\n`);
process.stdout.write(`screenshots: ${shots}\n`);
process.stdout.write(`dossier: ${dossierBytes} bytes\n`);
