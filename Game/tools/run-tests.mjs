// Bundle every tests/*.test.ts with esbuild, then run them under Node's
// built-in test runner. Keeps the game's Vite build out of the loop and lets
// each M002 stage be a separately gated file.
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = resolve(root, 'tests');
const outDir = resolve(testsDir, '.build');
const files = readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.ts'))
  .sort();

if (files.length === 0) {
  console.error('no test files found');
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const outfiles = [];
for (const file of files) {
  const outfile = resolve(outDir, file.replace(/\.ts$/, '.mjs'));
  await build({
    entryPoints: [resolve(testsDir, file)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile,
    external: ['three'],
    sourcemap: 'inline',
    logLevel: 'warning',
  });
  outfiles.push(outfile);
}

const child = spawn(process.execPath, ['--test', ...outfiles], {
  stdio: 'inherit',
  cwd: root,
});
child.on('exit', (code) => process.exit(code ?? 1));
