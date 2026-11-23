import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LifeGame } from '../src/app/life';
import { BrowserSaveStore, KeyValueStorage } from '../src/app/persistence';
import { GameSession } from '../src/app/session';

// LifePanel's DOM is outside this test's purpose. These minimal nodes cover its
// construction/render contract without installing a production DOM dependency.
class Element {
  readonly children: Element[] = [];
  readonly dataset: Record<string, string> = {};
  readonly classList = {
    toggle: (_name: string, _force?: boolean) => false,
    remove: (..._names: string[]) => {},
  };
  hidden = false;
  disabled = false;
  value = '';
  id = '';
  name = '';
  type = '';
  min = '';
  step = '';
  required = false;
  htmlFor = '';
  className = '';
  textContent = '';

  constructor(readonly tagName: string) {
    if (tagName.toUpperCase() === 'SELECT') this.value = 'fiber';
  }
  append(...children: (Element | string)[]): void {
    for (const child of children) if (child instanceof Element) this.children.push(child);
  }
  setAttribute(): void {}
  removeAttribute(): void {}
  addEventListener(): void {}
  querySelector(selector: string): Element | null {
    if (selector === '.life-unavailable') return new Element('p');
    return null;
  }
}

const documentStub = {
  createElement: (tag: string) => new Element(tag),
  body: {
    append: (..._children: Element[]) => {},
    classList: { contains: (_name: string) => false },
  },
};
Object.assign(globalThis, { document: documentStub });

class MemoryStorage implements KeyValueStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function buildFarm(session: GameSession): void {
  const result = session.dispatch({
    schema: 3, id: 'controller-test-farm', type: 'build', projectId: 'farm',
    designVersion: 2, expectedRevision: session.world.revision,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
}

test('controller refresh grows from an empty depot to nine crop rows and remains revision-driven', () => {
  const session = GameSession.genesis();
  const scene = new THREE.Scene();
  const game = new LifeGame({
    session, store: new BrowserSaveStore(new MemoryStorage(), session.world.seed),
    scene, toast: () => {},
  });
  const overlay = scene.getObjectByName('life_state')!;
  assert.equal(overlay.children.length, 1);
  game.refresh();
  assert.equal(overlay.children.length, 1, 'an unchanged revision does no render work');

  buildFarm(session);
  assert.equal(overlay.children.length, 1, 'the old overlay remains valid before refresh');
  assert.doesNotThrow(() => game.refresh());
  assert.equal(overlay.parent, scene);
  assert.equal(overlay.children.filter((child) => child.userData.cropId).length, 9);
  assert.doesNotThrow(() => game.refresh());
  assert.equal(overlay.children.filter((child) => child.userData.cropId).length, 9,
    'later revisions must not duplicate or remove crop rows');
});
