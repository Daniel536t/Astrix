// M002 stage 2 gate: one shared validator, cost-ranked search, three-state
// preview. Every check is read-only with respect to the voxel world.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalRegionHash, canonicalEntityHash, canonicalInventoryHash,
} from '../src/sim/canonical';
import { createM002Fixture, M002_LAYOUT } from '../src/sim/m002';
import { TerrainQuery, rectColumns, envelopeContains, Rect } from '../src/sim/terrain';
import {
  HOUSE_RULES, SiteProposal, validateSite, searchSites, previewSite,
} from '../src/sim/construction';

type World = ReturnType<typeof createM002Fixture>['world'];

function fingerprint(world: World) {
  return {
    revision: world.revision,
    voxels: canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash,
    entities: canonicalEntityHash(world, M002_LAYOUT.protectedRegion),
    inventory: canonicalInventoryHash(world),
  };
}

function proposal(siteId: string, rect: Rect, floorY: number): SiteProposal {
  return { siteId, rect, floorY, rules: HOUSE_RULES };
}

function center(rect: Rect) {
  return { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 };
}

test('validator rejects the slope site with explicit rule errors', () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);

  const validation = validateSite(world, proposal(
    layout.rejected.id, layout.rejected.rect, layout.rejected.floorY,
  ));

  assert.equal(validation.state, 'invalid');
  const codes = validation.reasons.map((r) => r.code);
  for (const code of [
    'slope_exceeded', 'cut_exceeded', 'cut_volume_exceeded', 'footprint_obstructed',
  ]) {
    assert.ok(codes.includes(code as never), `missing ${code}: ${codes.join(', ')}`);
  }
  assert.ok(validation.reasons.every((r) => r.severity === 'error'
    || r.code === 'needs_grading' || r.code === 'needs_clearing'));
  assert.ok(validation.reasons.filter((r) => r.severity === 'error').length >= 4);

  // The rejection is grounded in real terrain, not a synthetic rule exception.
  assert.ok(validation.query.stats.relief >= 5);
  assert.ok(validation.query.support.maxCut >= 5);
  assert.ok(validation.query.stats.cutVolume >= 40);
  assert.equal(validation.query.stats.obstructions.length, 1);
  assert.equal(validation.preparation.obstructionIds.length, 1);
  assert.ok(validation.query.stats.obstructions[0].kind.startsWith('styl_rock'));

  assert.deepEqual(fingerprint(world), before);
});

test('validator separates footprint errors from preparation work', () => {
  const { world } = createM002Fixture();
  const before = fingerprint(world);

  const wrong = validateSite(world, proposal(
    'wrong-size', { x0: -60, z0: -46, x1: -54, z1: -41 }, 11,
  ));
  assert.equal(wrong.state, 'invalid');
  assert.ok(wrong.reasons.some((r) => r.code === 'footprint_mismatch'));

  const outside = validateSite(world, proposal(
    'outside', { x0: 1021, z0: 0, x1: 1028, z1: 5 }, 1,
  ));
  assert.equal(outside.state, 'invalid');
  assert.ok(outside.reasons.some((r) => r.code === 'out_of_bounds'));

  assert.deepEqual(fingerprint(world), before);
});

test('validator accepts the house shelf with preparation only', () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const site = proposal(layout.house.id, layout.house.rect, layout.house.floorY);

  const validation = validateSite(world, site);
  assert.equal(validation.state, 'valid_with_preparation');
  assert.deepEqual(validation.reasons.map((r) => r.code), ['needs_grading']);
  assert.equal(validation.reasons[0].severity, 'preparation');
  assert.equal(validation.preparation.needsGrading, true);
  assert.equal(validation.preparation.needsClearing, false);
  assert.equal(validation.preparation.cutVolume, 3);
  assert.equal(validation.preparation.fillVolume, 18);
  assert.equal(validation.preparation.maxCut, 1);
  assert.equal(validation.preparation.maxFill, 1);
  assert.equal(validation.preparation.foundation, 'graded_pad');
  assert.equal(validation.preparation.obstructionIds.length, 0);
  assert.equal(validation.query.support.total, rectColumns(layout.house.rect));
  assert.equal(validation.query.overhangCells.length, 0);

  // A caller that already evaluated the footprint gets the identical verdict.
  const query = new TerrainQuery(world);
  const footprint = query.footprint(layout.house.rect, layout.house.floorY);
  const reused = validateSite(world, site, query, footprint);
  assert.deepEqual(reused, validation);

  assert.deepEqual(fingerprint(world), before);
});

test('validator accepts a flat footprint with no preparation', () => {
  const { world } = createM002Fixture();
  const before = fingerprint(world);

  const validation = validateSite(world, proposal(
    'flat-shelf', { x0: -14, z0: -60, x1: -7, z1: -55 }, 21,
  ));
  assert.equal(validation.state, 'valid');
  assert.equal(validation.reasons.length, 0);
  assert.equal(validation.preparation.needsGrading, false);
  assert.equal(validation.preparation.needsClearing, false);
  assert.equal(validation.preparation.cutVolume, 0);
  assert.equal(validation.preparation.fillVolume, 0);
  assert.equal(validation.query.stats.relief, 0);

  assert.deepEqual(fingerprint(world), before);
});

test('candidate search is cost-ranked, deterministic and inside its budget', () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const anchor = center(layout.rejected.rect);
  const options = {
    step: 2, anchor, maxDistance: 32, maxResults: 6, budgetMs: 1000,
  };

  // Warm-up run plus three measured runs; the fastest is the honest machine
  // time, independent of transient load from other test files.
  searchSites(world, HOUSE_RULES, layout.searchArea, options);
  const runs = [0, 1, 2].map(() => searchSites(world, HOUSE_RULES, layout.searchArea, options));
  const best = runs.reduce((a, b) => (a.elapsedMs <= b.elapsedMs ? a : b));

  assert.equal(best.truncated, false);
  assert.ok(best.elapsedMs < 100, `search took ${best.elapsedMs} ms`);
  assert.ok(best.evaluated > 500, `only ${best.evaluated} evaluations`);
  assert.ok(best.rejected > 0);
  assert.ok(best.candidates.length >= 2);

  for (let i = 1; i < best.candidates.length; i++) {
    assert.ok(
      best.candidates[i - 1].score <= best.candidates[i].score,
      'candidates must be sorted by score',
    );
  }
  for (const candidate of best.candidates) {
    assert.ok(candidate.state === 'valid' || candidate.state === 'valid_with_preparation');
    assert.equal(candidate.validation.state, candidate.state);
    const direct = validateSite(world, proposal(
      candidate.siteId, candidate.rect, candidate.floorY,
    ));
    assert.equal(direct.state, candidate.state);
    assert.deepEqual(direct.reasons, candidate.validation.reasons);
  }

  // Distinct results never overlap.
  for (let i = 0; i < best.candidates.length; i++) {
    for (let j = i + 1; j < best.candidates.length; j++) {
      const a = best.candidates[i].rect;
      const b = best.candidates[j].rect;
      const overlaps = a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;
      assert.equal(overlaps, false, `candidates ${i} and ${j} overlap`);
    }
  }

  // The pinned top result of the unconstrained search.
  assert.deepEqual(best.candidates[0].rect, { x0: -64, z0: -60, x1: -57, z1: -55 });
  assert.equal(best.candidates[0].floorY, 10);

  assert.deepEqual(fingerprint(world), before);
});

test('search honours the wall-clock budget', () => {
  const { world, layout } = createM002Fixture();
  const result = searchSites(world, HOUSE_RULES, layout.searchArea, {
    step: 1, budgetMs: 1, maxResults: 8,
  });
  assert.equal(result.truncated, true);
  assert.ok(result.elapsedMs < 1000, `budget overshoot ${result.elapsedMs} ms`);
});

test('farm-proximity constraint selects the viable shelf near the field', () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const anchor = center(layout.rejected.rect);
  const farmCenter = center(layout.farm.rect);

  const constrained = searchSites(world, HOUSE_RULES, layout.searchArea, {
    step: 2, anchor, maxDistance: 32, maxResults: 6,
    near: { ...farmCenter, maxDistance: 30 },
  });

  assert.ok(constrained.candidates.length >= 1);
  assert.deepEqual(constrained.candidates[0].rect, layout.house.rect);
  assert.equal(constrained.candidates[0].floorY, layout.house.floorY);
  assert.equal(constrained.candidates[0].state, 'valid_with_preparation');
  for (const candidate of constrained.candidates) {
    const c = center(candidate.rect);
    const distance = Math.hypot(c.x - farmCenter.x, c.z - farmCenter.z);
    assert.ok(distance <= 30, `candidate ${candidate.siteId} is ${distance} m from the farm`);
  }

  // The unconstrained winner is farther away, so the policy changed the choice.
  const unconstrained = searchSites(world, HOUSE_RULES, layout.searchArea, {
    step: 2, anchor, maxDistance: 32, maxResults: 1,
  });
  const top = unconstrained.candidates[0];
  const topCenter = center(top.rect);
  const topDistance = Math.hypot(topCenter.x - farmCenter.x, topCenter.z - farmCenter.z);
  assert.ok(topDistance > 30, `unconstrained winner is only ${topDistance} m from the farm`);
  assert.notDeepEqual(top.rect, constrained.candidates[0].rect);

  assert.deepEqual(fingerprint(world), before);
});

test('preview exposes valid, preparation and invalid states without mutating the world', () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);

  const rejected = previewSite(
    world,
    proposal(layout.rejected.id, layout.rejected.rect, layout.rejected.floorY),
    { door: layout.rejected.door, approach: layout.rejected.approach },
  );
  assert.equal(rejected.state, 'invalid');
  assert.equal(rejected.obstructions.length, 1);
  assert.equal(rejected.obstructions[0].action, 'blocked');
  assert.ok(rejected.foundation.cutVolume >= 40);
  assert.ok(rejected.foundation.retainingWallCells > 0);

  const house = previewSite(
    world,
    proposal(layout.house.id, layout.house.rect, layout.house.floorY),
    { door: layout.house.door, approach: layout.house.approach },
  );
  assert.equal(house.state, 'valid_with_preparation');
  assert.deepEqual(house.reasons.map((r) => r.code), ['needs_grading']);
  assert.equal(house.obstructions.length, 0);
  assert.equal(house.foundation.type, 'graded_pad');
  assert.equal(house.foundation.cutVolume, 3);
  assert.equal(house.foundation.fillVolume, 18);
  assert.equal(house.foundation.plinthCells, rectColumns(layout.house.rect) + 18);
  assert.ok(house.access);
  assert.equal(house.access!.walkable, true);
  assert.equal(house.access!.distance, 8);
  assert.ok(Math.abs(house.access!.grade - 0.25) < 1e-9);

  // The preview's envelope covers the complete footprint at its floor.
  for (const [x, z] of [
    [layout.house.rect.x0, layout.house.rect.z0],
    [layout.house.rect.x1, layout.house.rect.z0],
    [layout.house.rect.x0, layout.house.rect.z1],
    [layout.house.rect.x1, layout.house.rect.z1],
  ]) {
    assert.equal(
      envelopeContains(house.envelope, x, layout.house.floorY, z),
      true,
      `envelope misses ${x},${layout.house.floorY},${z}`,
    );
  }

  const flat = previewSite(
    world,
    proposal('flat-shelf', { x0: -14, z0: -60, x1: -7, z1: -55 }, 21),
    { door: { x: -7, z: -57 }, approach: { x: -1, z: -57 } },
  );
  assert.equal(flat.state, 'valid');
  assert.equal(flat.reasons.length, 0);
  assert.equal(flat.foundation.cutVolume, 0);
  assert.equal(flat.foundation.fillVolume, 0);
  assert.equal(flat.foundation.retainingWallCells, 0);
  assert.equal(flat.access?.walkable, true);

  // Previewing any state leaves voxels, entities and inventory untouched.
  assert.deepEqual(fingerprint(world), before);
});
