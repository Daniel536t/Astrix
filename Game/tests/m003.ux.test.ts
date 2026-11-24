import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = (path: string) => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8');

test('touch controls are exposed with accessible names and browser zoom remains available', () => {
  const html = source('../index.html');
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/);
  const controls = html.match(/<div id="controls"[^>]*>/)?.[0]!;
  assert.ok(controls);
  assert.doesNotMatch(controls!, /aria-hidden/);
  assert.match(controls!, /aria-label="Touch actions and zoom"/);
  // Movement is a joystick zone (left half of the screen), not buttons.
  assert.match(html, /<div id="move-zone" aria-label="[^"]+">/);
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);
  // Gather + Jump + Dive + 2 zoom + Walk/Builder view mode switch.
  assert.equal(buttons.length, 6);
  for (const button of buttons) assert.match(button, /aria-label="[^"]+"/);
});

test('mobile tabs preserve separate Settlement, Build and World panels', () => {
  const html = source('../index.html');
  const css = source('../src/styles.css');
  assert.match(html, /type="radio" name="game-panel" checked id="world-panel"/);
  assert.match(html, /<label class="drawer-settlement" for="world-panel">Settlement<\/label>/);
  assert.match(html, /<label class="drawer-build" for="build-drawer">Build<\/label>/);
  assert.match(html, /<label class="drawer-world" for="world-drawer">World<\/label>/);
  assert.match(css, /\.world-drawer-state:checked ~ #build-panel \.build-cards \{ display: none; \}/);
  assert.match(css, /#build-drawer:checked ~ #build-panel \{ display: block; \}/);
  assert.match(css, /#build-drawer:checked ~ #life-panel, \.world-drawer-state:checked ~ #life-panel \{ display: none; \}/);
  assert.doesNotMatch(css, /world-drawer-state:checked ~ \.inspector\s*\{\s*display:\s*none/,
    'World controls hide settlement/build panels but keep object inspection usable');
  assert.match(css, /#build-drawer:checked ~ \.inspector \{ display: none; \}/);
  assert.match(html, /id="gather-nearest" aria-label="Gather nearest natural resource"/);
});

test('global shortcuts guard interactive targets before camera key handling', () => {
  const main = source('../src/main.ts');
  const handler = main.slice(main.indexOf("window.addEventListener('keydown'"));
  assert.match(handler, /e\.key !== 'Escape' && target instanceof HTMLElement/,
    'global camera shortcut suppression cannot intercept Escape from focused UI');
  assert.match(handler, /target instanceof HTMLElement/);
  assert.match(handler, /target\.isContentEditable/);
  assert.match(handler, /input, textarea, select, button, a\[href\], \[contenteditable\], \[role="textbox"\]/);
  assert.match(handler, /e\.stopImmediatePropagation\(\)/);
  assert.match(handler, /new KeyboardEvent\('keyup'/);
  assert.match(handler, /\},\s*\{\s*capture:\s*true\s*\}\);/);
});

test('a build has one immediate toast that retains save failure and success details', () => {
  const m2 = source('../src/app/m2.ts');
  const build = m2.slice(m2.indexOf('private build('), m2.indexOf('private addStructure('));
  assert.equal((build.match(/this\.panel\.toast\(/g) ?? []).length, 3,
    'two rejection branches and one accepted-build branch');
  const accepted = build.slice(build.indexOf('const saved ='), build.indexOf('this.panel.setInventory'));
  assert.equal((accepted.match(/this\.panel\.toast\(/g) ?? []).length, 1);
  assert.match(accepted, /\$\{saved\.message\}/);
  assert.match(accepted, /saved\.ok \? 'good' : 'bad'/);
  assert.ok(accepted.indexOf('built · paid') < accepted.indexOf('saved.message'));
});

test('canvas blur preserves inspection when focus enters its Close control', () => {
  const inspector = source('../src/app/inspector.ts');
  assert.match(inspector, /canvas\.addEventListener\('blur', \(event\) => \{/);
  assert.match(inspector, /const nextFocus = event\.relatedTarget/);
  assert.match(inspector, /!this\.panel\.root\.contains\(nextFocus as Node \| null\)/,
    'focus transfer to Close cannot cancel its click by hiding the card');
});

test('inspection numeric parameters reject non-finite and out-of-range values', () => {
  const main = source('../src/main.ts');
  assert.match(main, /!Number\.isFinite\(value\)/);
  assert.match(main, /num\('radius', 3, 1, 8, true\)/);
  assert.match(main, /num\('macro', 8, 1, 64, true\)/);
  assert.match(main, /num\('mapmacro', 8, 1, 64, true\)/);
  assert.match(main, /num\('t', 0\.42, 0, 1\)/);
});
