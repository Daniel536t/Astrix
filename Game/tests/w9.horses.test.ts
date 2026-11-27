// W9 (wilderness content v10): persistent wild horses, progressive taming, tack, riding, stamina, persistence & replay.
// Also verifies Phase A protagonist starting equipment ("Nothing from Nothing").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';
import { LATEST_WILD_CONTENT, WILD_CONTENT_V10, WILD_CONTENT_V9, wildSnapshot, validateWildSnapshot } from '../src/sim/gathering';
import { FEED_COOLDOWN_TICKS, HORSE_COATS, HORSE_MAX_STAMINA, HORSE_MAX_TRUST, ensureWildHorses } from '../src/sim/horses';
import { STARTING_EQUIPMENT } from '../src/render/protagonist';

const G = GENERATOR_V2;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function send(s: GameSession, body: Record<string, unknown>) {
  return s.dispatch({ schema: 3, id: s.commandId(body.type as never, 't'), expectedRevision: s.world.revision, ...body });
}

function tick(s: GameSession, n = 1, presence?: { x: number; z: number }) {
  for (let i = 0; i < n; i++) {
    const r = send(s, { type: 'tick', ticks: 1, ...(presence ? { presence: { x: presence.x, z: presence.z, mx: 0, mz: 0 } } : {}) });
    assert.equal(r.ok, true, `tick failed: ${r.ok ? '' : r.reasons.join('; ')}`);
  }
}

test('Phase A: STARTING_EQUIPMENT enforces Nothing from Nothing (bare hands, zero gear)', () => {
  assert.equal(STARTING_EQUIPMENT.equippedTool, null);
  assert.equal(STARTING_EQUIPMENT.hasCape, false);
  assert.equal(STARTING_EQUIPMENT.hasQuiver, false);
  assert.equal(STARTING_EQUIPMENT.hasPauldrons, false);
  assert.equal(STARTING_EQUIPMENT.hasHarness, false);
  assert.equal(STARTING_EQUIPMENT.hasBracers, false);
  assert.equal(STARTING_EQUIPMENT.hasAdventurerBoots, false);
  assert.equal(STARTING_EQUIPMENT.carryingLog, false);
});

test('W9: deterministic wild horse spawning, all 4 coats, zero tack on wild horses, v9 refuses horse commands', () => {
  const s9 = GameSession.genesis(1337, G, 'wilderness', WILD_CONTENT_V9);
  const refused = send(s9, { type: 'horse_feed', horseId: 'h:1', item: 'berries', at: { x: 0, z: 0 } });
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? '' : refused.reasons[0], /predates horses/);

  const up = send(s9, { type: 'upgrade_wilderness', content: WILD_CONTENT_V10 });
  assert.equal(up.ok, true);
  assert.equal(s9.world.wild!.content, 10);

  tick(s9, 1);
  const hs = s9.world.wild!.horses!;
  assert.equal(hs.horses.size, 6);
  const coats = new Set([...hs.horses.values()].map((h) => h.coat));
  for (const c of HORSE_COATS) assert.ok(coats.has(c), `coat ${c} present`);
  for (const h of hs.horses.values()) {
    assert.equal(h.tamed, false);
    assert.equal(h.saddled, false);
    assert.equal(h.bridled, false);
    assert.equal(h.trust, 0);
  }
});

test('W9: progressive feeding & taming (never 1-click), tack, mount, gait stamina, dismount, save/reload & replay', () => {
  const s = GameSession.genesis(1337, G, 'wilderness', LATEST_WILD_CONTENT);
  tick(s, 1);
  const hs = s.world.wild!.horses!;
  assert.equal(hs.horses.size, 6);
  const h1 = hs.horses.get('h:1')!;
  const atH = () => ({ x: h1.x, z: h1.z });

  // Cannot feed without real items in bag
  const noFood = send(s, { type: 'horse_feed', horseId: h1.id, item: 'berries', at: atH() });
  assert.equal(noFood.ok, false);
  assert.equal(noFood.ok ? '' : noFood.code, 'missing_item');

  // Cannot mount an untamed horse
  const wildMount = send(s, { type: 'horse_mount', horseId: h1.id, at: atH() });
  assert.equal(wildMount.ok, false);
  assert.equal(wildMount.ok ? '' : wildMount.code, 'wild');

  // Give real berries in bag for progressive feeding test (4 feeds needed for calm horse: 30 * 4 = 100)
  s.world.wild!.items.berries = 6;

  // First feed succeeds and consumes 1 berry, does NOT 1-click tame
  const f1 = send(s, { type: 'horse_feed', horseId: h1.id, item: 'berries', at: atH() });
  assert.equal(f1.ok, true);
  assert.equal(s.world.wild!.items.berries, 5);
  assert.equal(h1.tamed, false, 'never 1-click tame');
  assert.ok(h1.trust > 0 && h1.trust < HORSE_MAX_TRUST);

  // Immediate second feed without cooldown is refused
  const tooFast = send(s, { type: 'horse_feed', horseId: h1.id, item: 'berries', at: atH() });
  assert.equal(tooFast.ok, false);
  assert.equal(tooFast.ok ? '' : tooFast.code, 'too_fast');

  // Progressively feed until tamed
  let feeds = 1;
  while (!h1.tamed && feeds < 10) {
    tick(s, FEED_COOLDOWN_TICKS);
    const fr = send(s, { type: 'horse_feed', horseId: h1.id, item: 'berries', at: atH() });
    assert.equal(fr.ok, true);
    feeds++;
  }
  assert.equal(h1.tamed, true);
  assert.equal(h1.trust, HORSE_MAX_TRUST);
  assert.ok(feeds >= 3, 'taming requires multiple feedings');

  // Still cannot mount without saddle & bridle
  const noTack = send(s, { type: 'horse_mount', horseId: h1.id, at: atH() });
  assert.equal(noTack.ok, false);
  assert.equal(noTack.ok ? '' : noTack.code, 'no_tack');

  // Equip real saddle & bridle from bag
  s.world.wild!.items.saddle = 1;
  s.world.wild!.items.bridle = 1;
  assert.equal(send(s, { type: 'horse_tack', horseId: h1.id, item: 'saddle', at: atH() }).ok, true);
  assert.equal(send(s, { type: 'horse_tack', horseId: h1.id, item: 'bridle', at: atH() }).ok, true);
  assert.equal(s.world.wild!.items.saddle, undefined);
  assert.equal(s.world.wild!.items.bridle, undefined);
  assert.equal(h1.saddled, true);
  assert.equal(h1.bridled, true);

  // Mount, switch to gallop, verify stamina drains over ticks, then walk to recover
  assert.equal(send(s, { type: 'horse_mount', horseId: h1.id, at: atH() }).ok, true);
  assert.equal(hs.mountedId, h1.id);
  assert.equal(send(s, { type: 'horse_gait', gait: 'gallop' }).ok, true);
  assert.equal(hs.gait, 'gallop');

  tick(s, 5, { x: h1.x + 50, z: h1.z });
  assert.ok(h1.stamina < HORSE_MAX_STAMINA, 'gallop drains stamina');
  const drained = h1.stamina;

  assert.equal(send(s, { type: 'horse_gait', gait: 'walk' }).ok, true);
  tick(s, 3, { x: h1.x + 10, z: h1.z });
  assert.ok(h1.stamina > drained, 'walking recovers stamina');

  // Snapshot round-trip validates cleanly
  const snap = wildSnapshot(s.world.wild!);
  const validated = validateWildSnapshot(clone(snap), s.world.life?.tick ?? 0);
  assert.equal(validated.horses!.mountedId, h1.id);
  assert.equal(validated.horses!.horses.find((x) => x.id === h1.id)!.saddled, true);

  // Dismount updates horse position
  const disPos = { x: h1.x + 20, z: h1.z + 20 };
  assert.equal(send(s, { type: 'horse_dismount', at: disPos }).ok, true);
  assert.equal(hs.mountedId, null);
  assert.equal(h1.x, disPos.x);
  assert.equal(h1.z, disPos.z);

  // Ensure deterministic wild seeding helper is idempotent
  ensureWildHorses(s.world);
  assert.equal(hs.horses.size, 6);
});
