// M002 stage 3 gate: plan -> authorize -> execute, with exact ledger,
// chunk deltas and a no-flatten proof outside the authorized envelope.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAT, surfaceAt, setVoxel, getVoxel,
} from '../src/sim/world';
import {
  canonicalRegionHash, canonicalEntityHash, canonicalInventoryHash,
  checkDerivedCaches, editsOutsideEnvelope,
} from '../src/sim/canonical';
import { createM002Fixture, M002_LAYOUT } from '../src/sim/m002';
import { HOUSE_RULES, FARM_RULES, SiteProposal } from '../src/sim/construction';
import {
  planPreparation, planDigest, prepareSite, executePreparation,
  LocalAuthorizer, PreparationPlan,
} from '../src/sim/preparation';

type World = ReturnType<typeof createM002Fixture>['world'];

function fingerprint(world: World) {
  return {
    revision: world.revision,
    voxels: canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash,
    outside: canonicalRegionHash(world, M002_LAYOUT.protectedRegion, M002_LAYOUT.envelope).hash,
    entities: canonicalEntityHash(world, M002_LAYOUT.protectedRegion),
    inventory: canonicalInventoryHash(world),
  };
}

function proposal(siteId: string, rect = M002_LAYOUT.house.rect, floorY = M002_LAYOUT.house.floorY): SiteProposal {
  return { siteId, rect, floorY, rules: HOUSE_RULES };
}

function housePolicy() {
  return new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
}

test('planning is read-only, deterministic and bounded', () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);

  const first = planPreparation(world, proposal(layout.house.id));
  const second = planPreparation(world, proposal(layout.house.id));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  assert.equal(first.plan.targets.length, 48);
  assert.ok(first.plan.targets.every((t) => t.y === layout.house.floorY));
  assert.deepEqual(first.plan.clearEntityIds, []);
  assert.equal(first.plan.expected.cutVolume, 3);
  assert.equal(first.plan.expected.fillVolume, 18);
  assert.equal(first.plan.expected.obstructions, 0);
  assert.equal(planDigest(first.plan), planDigest(second.plan));
  assert.equal(first.plan.id, second.plan.id);

  // The plan envelope is tight and inside the pinned M002 work envelope.
  assert.equal(first.plan.envelope.length, 1);
  const e = first.plan.envelope[0];
  assert.ok(e.x0 >= -62 && e.x1 <= -51 && e.z0 >= -48 && e.z1 <= -39);
  assert.ok(e.y0 >= 8 && e.y1 <= 16);

  assert.deepEqual(fingerprint(world), before);

  // A rejected site cannot produce a plan or an edit.
  const rejected = planPreparation(world, proposal(
    layout.rejected.id, layout.rejected.rect, layout.rejected.floorY,
  ));
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.stage, 'plan');
    assert.equal(rejected.code, 'site_invalid');
    assert.ok(rejected.reasons.length >= 4);
  }
  assert.deepEqual(fingerprint(world), before);
});

test('house preparation applies exactly the planned voxel edits', () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const authorizer = housePolicy();

  const planned = planPreparation(world, proposal(layout.house.id));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const decision = authorizer.authorize(world, planned.plan);
  assert.equal(decision.ok, true);
  assert.ok(decision.authorization);

  const result = executePreparation(world, planned.plan, decision.authorization!);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { ledger } = result;

  assert.equal(ledger.authority, 'local-stub');
  assert.equal(ledger.enforcement, 'local-simulation-only');
  assert.equal(ledger.planDigest, planDigest(planned.plan));
  assert.equal(ledger.cutVolume, 3);
  assert.equal(ledger.fillVolume, 18);
  assert.equal(ledger.netSpoil, -15);
  assert.equal(ledger.borrowedFill, 15);
  assert.equal(ledger.voxelEdits, 21);
  assert.deepEqual(ledger.cutByMaterial, { grass: 3 });
  assert.deepEqual(ledger.fillByMaterial, { grass: 18 });
  assert.deepEqual(ledger.entitiesCleared, []);
  assert.deepEqual(ledger.resourcesGained, {});
  assert.deepEqual(ledger.inventoryBefore, {});
  assert.deepEqual(ledger.inventoryAfter, {});
  assert.equal(ledger.revisionAfter - ledger.revisionBefore, 21);

  assert.equal(ledger.chunkDeltas.length, 1);
  assert.deepEqual(ledger.chunkDeltas[0], {
    chunk: '30,30', changed: 21, added: 18, removed: 3,
  });

  // Every footprint column now has the prepared walking floor.
  for (let z = layout.house.rect.z0; z <= layout.house.rect.z1; z++) {
    for (let x = layout.house.rect.x0; x <= layout.house.rect.x1; x++) {
      assert.equal(surfaceAt(world, x, z), layout.house.floorY, `column ${x},${z}`);
    }
  }

  // No terrain or resource change outside the complete authorized envelope.
  const after = fingerprint(world);
  assert.equal(after.outside, before.outside);
  assert.equal(after.entities, before.entities);
  assert.equal(after.inventory, before.inventory);
  assert.notEqual(after.voxels, before.voxels);
  assert.deepEqual(editsOutsideEnvelope(world, layout.envelope), []);
  assert.deepEqual(checkDerivedCaches(world, layout.protectedRegion), []);
  assert.ok(world.dirty.has('30,30'));

  // Replaying the same token is a stale no-op, not a second excavation.
  const replay = executePreparation(world, planned.plan, decision.authorization!);
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.code, 'stale_authorization');
  assert.deepEqual(fingerprint(world), after);
});

test('preparation clears authorized obstructions and credits their resources', () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const entityCount = world.entities.size;
  const authorizer = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });

  const result = prepareSite(world, authorizer, {
    siteId: layout.farm.id,
    rect: layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { ledger } = result;

  assert.equal(ledger.cutVolume, 41);
  assert.equal(ledger.fillVolume, 22);
  assert.equal(ledger.voxelEdits, 63);
  assert.deepEqual(ledger.entitiesCleared.map((e) => e.entityId), [
    'hero:styl_ore:-38:-42',
    'hero:styl_tree_blossom:-28:-38',
  ]);
  assert.deepEqual(ledger.resourcesGained, { ore: 8, wood: 12 });
  assert.deepEqual(ledger.inventoryAfter, { ore: 8, wood: 12 });
  assert.equal(world.entities.size, entityCount - 2);
  assert.equal(world.entities.has('hero:styl_ore:-38:-42'), false);
  assert.equal(world.entities.has('hero:styl_tree_blossom:-28:-38'), false);

  const chunkTotals = ledger.chunkDeltas.reduce((sum, d) => ({
    changed: sum.changed + d.changed,
    added: sum.added + d.added,
    removed: sum.removed + d.removed,
  }), { changed: 0, added: 0, removed: 0 });
  assert.deepEqual(chunkTotals, { changed: 63, added: 22, removed: 41 });

  for (let z = layout.farm.rect.z0; z <= layout.farm.rect.z1; z++) {
    for (let x = layout.farm.rect.x0; x <= layout.farm.rect.x1; x++) {
      assert.equal(surfaceAt(world, x, z), 15, `column ${x},${z}`);
    }
  }

  const after = fingerprint(world);
  assert.equal(after.outside, before.outside);
  assert.notEqual(after.entities, before.entities);
  assert.notEqual(after.inventory, before.inventory);
  assert.deepEqual(editsOutsideEnvelope(world, layout.envelope), []);
  assert.deepEqual(checkDerivedCaches(world, layout.protectedRegion), []);
});

test('execution rejects forged, stale or over-limit authorization before writing', () => {
  const { world, layout } = createM002Fixture();
  const planned = planPreparation(world, proposal(layout.house.id));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const authorizer = housePolicy();
  const decision = authorizer.authorize(world, planned.plan);
  assert.equal(decision.ok, true);
  const auth = decision.authorization!;

  const before = fingerprint(world);

  const forgedDigest = executePreparation(world, planned.plan, {
    ...auth, planDigest: '0000000000000000',
  });
  assert.equal(forgedDigest.ok, false);
  if (!forgedDigest.ok) assert.equal(forgedDigest.code, 'digest_mismatch');

  const forgedAuthority = executePreparation(world, planned.plan, {
    ...auth, authority: 'magicblock' as never,
  });
  assert.equal(forgedAuthority.ok, false);
  if (!forgedAuthority.ok) assert.equal(forgedAuthority.code, 'unsupported_authority');

  const narrowed = executePreparation(world, planned.plan, {
    ...auth,
    envelope: [{ ...auth.envelope[0], y1: auth.envelope[0].y0 }],
  });
  assert.equal(narrowed.ok, false);
  if (!narrowed.ok) assert.equal(narrowed.code, 'envelope_mismatch');

  const limited = new LocalAuthorizer({
    envelope: M002_LAYOUT.envelope,
    limits: { maxCutVolume: 1 },
  }).authorize(world, planned.plan);
  assert.equal(limited.ok, false);
  assert.ok(limited.reasons.some((r) => r.includes('cut 3 exceeds limit 1')));

  const outsidePolicy = new LocalAuthorizer({
    envelope: [M002_LAYOUT.envelope[2]],
  }).authorize(world, planned.plan);
  assert.equal(outsidePolicy.ok, false);
  assert.ok(outsidePolicy.reasons.some((r) => r.includes('outside the local policy')));

  assert.deepEqual(fingerprint(world), before);

  // A stale token is rejected even though it was genuinely issued.
  assert.equal(setVoxel(world, -45, surfaceAt(world, -45, -43), -43, MAT.STONE), true);
  const afterManualEdit = fingerprint(world);
  const stale = executePreparation(world, planned.plan, auth);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, 'stale_authorization');
  assert.deepEqual(fingerprint(world), afterManualEdit);
});

test('preparation is deterministic across independent replays', () => {
  const a = createM002Fixture();
  const b = createM002Fixture();

  const ra = prepareSite(a.world, housePolicy(), proposal(a.layout.house.id));
  const rb = prepareSite(b.world, housePolicy(), proposal(b.layout.house.id));
  assert.equal(ra.ok, true);
  assert.equal(rb.ok, true);
  if (!ra.ok || !rb.ok) return;

  assert.deepEqual(ra.ledger, rb.ledger);
  assert.equal(ra.authorization.id, rb.authorization.id);
  assert.deepEqual(
    canonicalRegionHash(a.world, a.layout.protectedRegion),
    canonicalRegionHash(b.world, b.layout.protectedRegion),
  );
  assert.equal(
    canonicalEntityHash(a.world, a.layout.protectedRegion),
    canonicalEntityHash(b.world, b.layout.protectedRegion),
  );
  assert.equal(canonicalInventoryHash(a.world), canonicalInventoryHash(b.world));
});

test('planning rejects malformed targets and uncleared obstructions', () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const base = proposal(layout.house.id);

  const planned = planPreparation(world, base);
  assert.equal(planned.ok, true);
  if (!planned.ok) return;

  const missing = planPreparation(world, base, {
    targets: planned.plan.targets.slice(0, -1),
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, 'target_count');

  const duplicate = planPreparation(world, base, {
    targets: planned.plan.targets.map((t, i) => (i === 1 ? { ...planned.plan.targets[0] } : t)),
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.code, 'duplicate_target');

  const outside = planPreparation(world, base, {
    targets: planned.plan.targets.map((t, i) => (i === 0 ? { ...t, x: t.x - 10 } : t)),
  });
  assert.equal(outside.ok, false);
  if (!outside.ok) assert.equal(outside.code, 'target_outside_footprint');

  const badHeight = planPreparation(world, base, {
    targets: planned.plan.targets.map((t, i) => (i === 0 ? { ...t, y: 500 } : t)),
  });
  assert.equal(badHeight.ok, false);
  if (!badHeight.ok) assert.equal(badHeight.code, 'target_height');

  const uncleared = planPreparation(world, {
    siteId: layout.farm.id, rect: layout.farm.rect, floorY: 15, rules: FARM_RULES,
  }, { clear: 'none' });
  assert.equal(uncleared.ok, false);
  if (!uncleared.ok) assert.equal(uncleared.code, 'uncleared_obstructions');

  assert.deepEqual(fingerprint(world), before);
});

test('executor refuses a plan whose obstruction set changed after authorization', () => {
  const { world, layout } = createM002Fixture();
  const planned = planPreparation(world, {
    siteId: layout.farm.id, rect: layout.farm.rect, floorY: 15, rules: FARM_RULES,
  });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const auth = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope })
    .authorize(world, planned.plan);
  assert.equal(auth.ok, true);
  if (!auth.ok) return;

  // A new obstruction appears on the footprint after authorization. Revision
  // is deliberately left untouched so the test reaches the executor's second
  // guard: it re-reads the obstruction set instead of trusting the token.
  const extra = {
    id: 'test:extra-rock',
    kind: 'styl_rock_small' as const,
    chunk: '30,30',
    x: -32.5, y: 16, z: -38.5,
    rot: 0, scale: 1, variant: 0,
    resource: 'stone' as const, remaining: 2, yieldPerHarvest: 1,
    harvested: false, provisional: false, authored: false,
  };
  world.entities.set(extra.id, extra);
  world.entityChunks.get('30,30')!.push(extra.id);

  const before = fingerprint(world);
  const result = executePreparation(world, planned.plan, auth.authorization!);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'unauthorized_edits');
  assert.deepEqual(fingerprint(world), before);
});

test('the execution guard rejects a plan that escapes its own envelope', () => {
  const { world, layout } = createM002Fixture();
  const planned = planPreparation(world, proposal(layout.house.id));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const auth = housePolicy().authorize(world, planned.plan);
  assert.equal(auth.ok, true);
  if (!auth.ok) return;

  // Forge a plan with one target moved outside the authorized envelope while
  // keeping the digest consistent with the forged plan.
  const targets = planned.plan.targets.map((t, i) => (i === 0 ? { ...t, x: -80 } : t));
  const forged: PreparationPlan = { ...planned.plan, targets };
  forged.id = `prep:${planDigest(forged)}`;
  const before = fingerprint(world);
  const result = executePreparation(world, forged, {
    ...auth.authorization!,
    planDigest: planDigest(forged),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'unauthorized_edits');
  assert.ok(result.reasons.some((r) => r.includes('outside the footprint')
    || r.includes('outside the authorized envelope')));
  assert.deepEqual(fingerprint(world), before);
});

test('authorized execution never touches voxels outside the work envelope', () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const authorizer = housePolicy();

  // House, path-like corridor and farm all in one session: the complete M002
  // envelope is the union, so each action must stay inside its own subset.
  const house = prepareSite(world, authorizer, proposal(layout.house.id));
  assert.equal(house.ok, true);
  const farm = prepareSite(world, authorizer, {
    siteId: layout.farm.id, rect: layout.farm.rect, floorY: 15, rules: FARM_RULES,
  });
  assert.equal(farm.ok, true);

  assert.deepEqual(editsOutsideEnvelope(world, layout.envelope), []);
  assert.equal(
    canonicalRegionHash(world, layout.protectedRegion, layout.envelope).hash,
    before.outside,
  );

  // The house preparation is not flattened into the farm and vice versa.
  assert.equal(surfaceAt(world, layout.house.rect.x0, layout.house.rect.z0), 11);
  assert.equal(surfaceAt(world, layout.farm.rect.x0, layout.farm.rect.z0), 15);
  assert.equal(getVoxel(world, layout.house.rect.x0, 11, layout.house.rect.z0), MAT.AIR);
});
