// M002 stage 4 gate: authoritative house, path and terrace structures.
//
// These tests pin the structure plans, their exact resource costs, the
// material readiness of prepared ground, the local authorizer's refusal paths,
// and the fact that building a structure never mutates terrain voxels.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAT, surfaceAt, topMaterialAtWorld, setVoxel,
} from '../src/sim/world';
import {
  canonicalRegionHash, canonicalEntityHash, canonicalInventoryHash,
  canonicalStructureHash, checkDerivedCaches, editsOutsideEnvelope,
} from '../src/sim/canonical';
import {
  createM002Fixture, M002_LAYOUT, M002_PATH_PROFILE, M002_PATH_SITE_ID,
  M002_TERRACE_BANDS,
} from '../src/sim/m002';
import { HOUSE_RULES, PATH_RULES, FARM_RULES } from '../src/sim/construction';
import { prepareSite, LocalAuthorizer } from '../src/sim/preparation';
import {
  planStructure, buildStructure, LocalStructureAuthorizer, structureDigest,
  executeStructure, StructurePlan,
} from '../src/sim/structures';
import {
  runM002Scenario, m002PathRect, m002PathTargets, m002FarmTargets,
  M002_STARTER_INVENTORY, m002StructureCosts,
} from '../src/sim/scenario';

type M002 = ReturnType<typeof createM002Fixture>;
type World = M002['world'];

function fixture(): M002 {
  const m = createM002Fixture();
  m.world.inventory = { ...M002_STARTER_INVENTORY };
  return m;
}

function prepAuthorizer() {
  return new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
}

function structureAuthorizer() {
  return new LocalStructureAuthorizer({ envelope: M002_LAYOUT.envelope });
}

function fingerprint(world: World) {
  return {
    revision: world.revision,
    voxels: canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash,
    structures: canonicalStructureHash(world),
    inventory: canonicalInventoryHash(world),
    entities: canonicalEntityHash(world, M002_LAYOUT.protectedRegion),
  };
}

function prepareHouse(m: M002) {
  const result = prepareSite(m.world, prepAuthorizer(), {
    siteId: m.layout.house.id,
    rect: m.layout.house.rect,
    floorY: m.layout.house.floorY,
    rules: HOUSE_RULES,
  });
  assert.equal(result.ok, true, result.ok ? '' : result.reasons.join('; '));
  if (!result.ok) throw new Error('house preparation failed');
  return result;
}

function preparePath(m: M002, gravel: boolean) {
  const result = prepareSite(m.world, prepAuthorizer(), {
    siteId: M002_PATH_SITE_ID,
    rect: m002PathRect(),
    floorY: 12,
    rules: PATH_RULES,
  }, {
    targets: m002PathTargets(),
    surfaceMaterial: gravel ? MAT.GRAVEL : undefined,
    envelope: [m.layout.envelope[1]],
  });
  assert.equal(result.ok, true, result.ok ? '' : result.reasons.join('; '));
  if (!result.ok) throw new Error('path preparation failed');
  return result;
}

function prepareFarm(m: M002, soil: boolean) {
  const result = prepareSite(m.world, prepAuthorizer(), {
    siteId: m.layout.farm.id,
    rect: m.layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES,
  }, {
    targets: m002FarmTargets(),
    surfaceMaterial: soil ? MAT.SOIL : undefined,
    envelope: [m.layout.envelope[2]],
  });
  assert.equal(result.ok, true, result.ok ? '' : result.reasons.join('; '));
  if (!result.ok) throw new Error('farm preparation failed');
  return result;
}

function houseProposal(m: M002) {
  return {
    siteId: m.layout.house.id,
    kind: 'house' as const,
    rect: m.layout.house.rect,
    floorY: m.layout.house.floorY,
    door: m.layout.house.door,
  };
}

function pathProposal(m: M002) {
  return {
    siteId: M002_PATH_SITE_ID,
    kind: 'path' as const,
    rect: m002PathRect(),
    floorY: 12,
  };
}

function farmProposal(m: M002) {
  return {
    siteId: m.layout.farm.id,
    kind: 'terrace' as const,
    rect: m.layout.farm.rect,
    floorY: 15,
    terraces: m.layout.farm.terraces,
  };
}

test('structure plans refuse unprepared ground and wrong surface materials', () => {
  const m = fixture();
  const before = fingerprint(m.world);

  const rawHouse = planStructure(m.world, houseProposal(m));
  assert.equal(rawHouse.ok, false);
  if (!rawHouse.ok) {
    assert.equal(rawHouse.stage, 'plan');
    assert.equal(rawHouse.code, 'site_not_prepared');
    assert.ok(rawHouse.reasons.length >= 1);
  }

  const rawFarm = planStructure(m.world, farmProposal(m));
  assert.equal(rawFarm.ok, false);
  if (!rawFarm.ok) {
    assert.equal(rawFarm.code, 'terrace_earthwork');
    assert.ok(rawFarm.reasons[0].includes('cut 108'));
  }

  // Planning is read-only, including on rejected proposals.
  assert.deepEqual(fingerprint(m.world), before);
  assert.equal(m.world.structures.size, 0);

  // A path whose heights are prepared but whose top is still grass is not a
  // path. The material check must be explicit, not inferred from height.
  const pathPrep = preparePath(m, false);
  assert.equal(pathPrep.ledger.cutVolume, 13);
  assert.equal(pathPrep.ledger.surfaceEdits, 0);
  const grassPath = planStructure(m.world, pathProposal(m));
  assert.equal(grassPath.ok, false);
  if (!grassPath.ok) {
    assert.equal(grassPath.code, 'path_surface');
    assert.ok(grassPath.reasons[0].includes('expected gravel'));
  }

  // Same for terraces: correct bands, wrong top material.
  const farmPrep = prepareFarm(m, false);
  assert.equal(farmPrep.ledger.cutVolume, 40);
  assert.equal(farmPrep.ledger.fillVolume, 33);
  assert.equal(farmPrep.ledger.surfaceEdits, 0);
  const grassFarm = planStructure(m.world, farmProposal(m));
  assert.equal(grassFarm.ok, false);
  if (!grassFarm.ok) {
    assert.equal(grassFarm.code, 'terrace_surface');
    assert.ok(grassFarm.reasons[0].includes('expected soil'));
  }

  assert.equal(canonicalStructureHash(m.world), before.structures);
  assert.equal(m.world.structures.size, 0);
});

test('house build pays its exact cost and changes no terrain voxels', () => {
  const m = fixture();
  const prep = prepareHouse(m);
  assert.equal(prep.ledger.cutVolume, 3);
  assert.equal(prep.ledger.fillVolume, 18);
  assert.equal(prep.ledger.voxelEdits, 21);

  const world = m.world;
  const before = fingerprint(world);
  const planned = planStructure(world, houseProposal(m));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const plan = planned.plan;

  assert.equal(plan.modules.length, 17);
  assert.deepEqual(plan.cost, { wood: 10, stone: 18 });
  assert.deepEqual(plan.origin, { x: -56, y: 11, z: -43 });
  assert.equal(plan.surface.length, 48);
  assert.equal(plan.modules.filter((mod) => mod.kind === 'floor').length, 1);
  assert.equal(plan.modules.filter((mod) => mod.kind === 'roof').length, 1);
  assert.equal(plan.modules.filter((mod) => mod.kind === 'door').length, 2);
  assert.equal(plan.modules.filter((mod) => mod.kind === 'window').length, 2);

  const decision = structureAuthorizer().authorize(world, plan);
  assert.equal(decision.ok, true, decision.reasons.join('; '));
  if (!decision.ok || !decision.authorization) return;
  assert.equal(decision.authorization.authority, 'local-stub');
  assert.equal(decision.authorization.enforcement, 'local-simulation-only');
  assert.equal(decision.authorization.planDigest, structureDigest(plan));

  const result = executeStructure(world, plan, decision.authorization);
  assert.equal(result.ok, true, result.ok ? '' : result.reasons.join('; '));
  if (!result.ok) return;
  const { ledger } = result;

  assert.equal(ledger.kind, 'house');
  assert.equal(ledger.moduleCount, 17);
  assert.deepEqual(ledger.costPaid, { wood: 10, stone: 18 });
  assert.deepEqual(ledger.inventoryBefore, { stone: 48, wood: 24 });
  assert.deepEqual(ledger.inventoryAfter, { stone: 30, wood: 14 });
  assert.equal(ledger.revisionAfter, ledger.revisionBefore + 1);

  const after = fingerprint(world);
  assert.equal(after.voxels, before.voxels, 'structure build must not edit voxels');
  assert.equal(after.entities, before.entities);
  assert.notEqual(after.inventory, before.inventory);
  assert.notEqual(after.structures, before.structures);
  assert.equal(world.structures.size, 1);

  const stored = world.structures.get(plan.id);
  assert.ok(stored);
  assert.equal(stored.kind, 'house');
  assert.equal(stored.modules.length, 17);
  assert.equal(stored.builtRevision, world.revision);
  assert.equal(stored.provisional, true);

  // A second build re-plans the same id, gets a fresh token, and is refused by
  // the executor without charging again.
  const replay = buildStructure(world, structureAuthorizer(), houseProposal(m));
  assert.equal(replay.ok, false);
  if (!replay.ok) {
    assert.equal(replay.code, 'unauthorized_structure');
    assert.ok(replay.reasons.some((r) => r.includes('already exists')));
  }
  assert.deepEqual(fingerprint(world), after);
});

test('path preparation uses its exact envelope and requires a gravel top', () => {
  const m = fixture();
  const world = m.world;
  assert.deepEqual(m002PathRect(), { x0: -53, z0: -44, x1: -45, z1: -42 });

  // The default derived envelope adds a 1 m buffer and escapes the pinned
  // policy. It must be rejected, not silently widened.
  const implicit = prepareSite(world, prepAuthorizer(), {
    siteId: M002_PATH_SITE_ID,
    rect: m002PathRect(),
    floorY: 12,
    rules: PATH_RULES,
  }, { targets: m002PathTargets(), surfaceMaterial: MAT.GRAVEL });
  assert.equal(implicit.ok, false);
  if (!implicit.ok) {
    assert.equal(implicit.stage, 'authorize');
    assert.equal(implicit.code, 'not_authorized');
    assert.ok(implicit.reasons.some((r) => r.includes('outside the local policy')));
  }

  // Prepare the shared house door column first, as the pinned scenario does.
  prepareHouse(m);
  const outsideBefore = canonicalRegionHash(
    world, M002_LAYOUT.protectedRegion, [M002_LAYOUT.envelope[1]],
  ).hash;
  const prep = preparePath(m, true);

  assert.equal(prep.plan.envelope.length, 1);
  assert.deepEqual(prep.plan.envelope[0], M002_LAYOUT.envelope[1]);
  assert.equal(prep.ledger.cutVolume, 12);
  assert.equal(prep.ledger.fillVolume, 0);
  assert.equal(prep.ledger.voxelEdits, 39);
  assert.equal(prep.ledger.surfaceEdits, 27);
  assert.deepEqual(prep.ledger.resourcesGained, {});

  for (let i = 0; i < M002_PATH_PROFILE.length; i++) {
    for (let z = -44; z <= -42; z++) {
      const x = -53 + i;
      assert.equal(surfaceAt(world, x, z), M002_PATH_PROFILE[i], `column ${x},${z}`);
      assert.equal(topMaterialAtWorld(world, x, z), MAT.GRAVEL, `top ${x},${z}`);
    }
  }
  assert.equal(
    canonicalRegionHash(world, M002_LAYOUT.protectedRegion, [M002_LAYOUT.envelope[1]]).hash,
    outsideBefore,
    'path preparation must stay inside its exact envelope',
  );

  const planned = planStructure(world, pathProposal(m));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const plan = planned.plan;
  assert.equal(plan.modules.length, 27);
  assert.deepEqual(plan.cost, { stone: 9 });

  const pathModules = plan.modules.filter((mod) => mod.kind === 'path');
  assert.equal(pathModules.length, 9);
  assert.deepEqual(pathModules.map((mod) => mod.y), [...M002_PATH_PROFILE]);
  for (let i = 1; i < pathModules.length; i++) {
    assert.ok(Math.abs(pathModules[i].y - pathModules[i - 1].y) <= 1);
  }
  assert.equal(plan.modules.filter((mod) => mod.kind === 'curb').length, 18);

  const beforeBuild = fingerprint(world);
  const built = buildStructure(world, structureAuthorizer(), pathProposal(m));
  assert.equal(built.ok, true, built.ok ? '' : built.reasons.join('; '));
  if (!built.ok) return;
  assert.equal(built.ledger.moduleCount, 27);
  assert.deepEqual(built.ledger.costPaid, { stone: 9 });
  assert.equal(built.ledger.inventoryBefore.stone, 48);
  assert.equal(built.ledger.inventoryAfter.stone, 39);

  const afterBuild = fingerprint(world);
  assert.equal(afterBuild.voxels, beforeBuild.voxels);
  assert.equal(afterBuild.entities, beforeBuild.entities);
  assert.notEqual(afterBuild.inventory, beforeBuild.inventory);
  assert.equal(world.structures.get(plan.id)?.kind, 'path');
  assert.deepEqual(editsOutsideEnvelope(world, M002_LAYOUT.envelope), []);
  assert.deepEqual(checkDerivedCaches(world, M002_LAYOUT.protectedRegion), []);
});

test('terraces plan from pinned bands, require soil, and pay exact costs', () => {
  const m = fixture();
  const world = m.world;
  const outsideBefore = canonicalRegionHash(
    world, M002_LAYOUT.protectedRegion, [M002_LAYOUT.envelope[2]],
  ).hash;
  const prep = prepareFarm(m, true);

  assert.equal(prep.ledger.cutVolume, 40);
  assert.equal(prep.ledger.fillVolume, 33);
  assert.equal(prep.ledger.voxelEdits, 107);
  assert.equal(prep.ledger.surfaceEdits, 34);
  assert.deepEqual(prep.ledger.entitiesCleared.map((e) => e.entityId), [
    'hero:styl_ore:-38:-42',
    'hero:styl_tree_blossom:-28:-38',
  ]);
  assert.deepEqual(prep.ledger.resourcesGained, { ore: 8, wood: 12 });
  assert.deepEqual(prep.ledger.inventoryAfter, { ore: 8, stone: 48, wood: 36 });
  assert.equal(
    canonicalRegionHash(world, M002_LAYOUT.protectedRegion, [M002_LAYOUT.envelope[2]]).hash,
    outsideBefore,
    'farm preparation must stay inside its exact envelope',
  );

  for (const band of M002_TERRACE_BANDS) {
    for (let z = band.z0; z <= band.z1; z++) {
      for (let x = m.layout.farm.rect.x0; x <= m.layout.farm.rect.x1; x++) {
        assert.equal(surfaceAt(world, x, z), band.y, `column ${x},${z}`);
        assert.equal(topMaterialAtWorld(world, x, z), MAT.SOIL, `top ${x},${z}`);
      }
    }
  }

  const planned = planStructure(world, farmProposal(m));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const plan = planned.plan;
  assert.equal(plan.modules.length, 14);
  assert.deepEqual(plan.cost, { wood: 6, stone: 12 });
  assert.deepEqual(plan.terraces, M002_TERRACE_BANDS);
  assert.deepEqual(plan.envelope, [
    { x0: -39, z0: -43, x1: -26, z1: -34, y0: 13, y1: 18 },
  ]);

  const beds = plan.modules.filter((mod) => mod.kind === 'soil_bed');
  const rows = plan.modules.filter((mod) => mod.kind === 'crop_row');
  const walls = plan.modules.filter((mod) => mod.kind === 'retaining_wall');
  assert.equal(beds.length, 3);
  assert.equal(rows.length, 9);
  assert.equal(walls.length, 2);
  assert.deepEqual(beds.map((mod) => mod.y), [16, 15, 14]);
  for (const row of rows) {
    assert.ok([16.18, 15.18, 14.18].includes(row.y));
  }
  for (const wall of walls) {
    assert.equal(wall.h, 1);
  }

  const beforeBuild = fingerprint(world);
  const built = buildStructure(world, structureAuthorizer(), farmProposal(m));
  assert.equal(built.ok, true, built.ok ? '' : built.reasons.join('; '));
  if (!built.ok) return;
  assert.equal(built.ledger.moduleCount, 14);
  assert.deepEqual(built.ledger.costPaid, { wood: 6, stone: 12 });
  assert.deepEqual(built.ledger.inventoryBefore, { ore: 8, stone: 48, wood: 36 });
  assert.deepEqual(built.ledger.inventoryAfter, { ore: 8, stone: 36, wood: 30 });

  const afterBuild = fingerprint(world);
  assert.equal(afterBuild.voxels, beforeBuild.voxels);
  assert.notEqual(afterBuild.inventory, beforeBuild.inventory);
  assert.equal(world.structures.get(plan.id)?.kind, 'terrace');
  assert.deepEqual(editsOutsideEnvelope(world, M002_LAYOUT.envelope), []);
  assert.deepEqual(checkDerivedCaches(world, M002_LAYOUT.protectedRegion), []);
});

test('structure authorization rejects forged, stale, poor and out-of-envelope work', () => {
  const m = fixture();
  prepareHouse(m);
  const world = m.world;
  const planned = planStructure(world, houseProposal(m));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const plan = planned.plan;
  const decision = structureAuthorizer().authorize(world, plan);
  assert.equal(decision.ok, true);
  if (!decision.ok || !decision.authorization) return;
  const token = decision.authorization;
  const before = fingerprint(world);

  const forgedDigest = executeStructure(world, plan, {
    ...token, planDigest: '0000000000000000',
  });
  assert.equal(forgedDigest.ok, false);
  if (!forgedDigest.ok) assert.equal(forgedDigest.code, 'digest_mismatch');

  const forgedAuthority = executeStructure(world, plan, {
    ...token, authority: 'magicblock' as never,
  });
  assert.equal(forgedAuthority.ok, false);
  if (!forgedAuthority.ok) assert.equal(forgedAuthority.code, 'unsupported_authority');

  const narrowed = executeStructure(world, plan, {
    ...token,
    envelope: [{ ...token.envelope[0], x0: token.envelope[0].x0 + 1 }],
  });
  assert.equal(narrowed.ok, false);
  if (!narrowed.ok) assert.equal(narrowed.code, 'envelope_mismatch');

  const limitedModules = new LocalStructureAuthorizer(
    { envelope: M002_LAYOUT.envelope }, { maxModules: 10 },
  ).authorize(world, plan);
  assert.equal(limitedModules.ok, false);
  assert.ok(limitedModules.reasons.some((r) => r.includes('17 modules exceed limit 10')));

  const limitedCost = new LocalStructureAuthorizer(
    { envelope: M002_LAYOUT.envelope }, { maxCost: 10 },
  ).authorize(world, plan);
  assert.equal(limitedCost.ok, false);
  assert.ok(limitedCost.reasons.some((r) => r.includes('cost 28 exceeds limit 10')));

  // A module pushed outside the plan envelope is refused before execution.
  const forged: StructurePlan = {
    ...plan,
    modules: plan.modules.map((mod, i) => (i === 0 ? { ...mod, x: mod.x + 20 } : mod)),
  };
  forged.id = `structure:${structureDigest(forged)}`;
  const outside = structureAuthorizer().authorize(world, forged);
  assert.equal(outside.ok, false);
  assert.ok(outside.reasons.some((r) => r.includes('outside the plan envelope')
    || r.includes('outside the local policy')));

  // Even a token with the forged digest cannot get past the executor's own
  // module-in-envelope check.
  const forgedExecution = executeStructure(world, forged, {
    ...token, planDigest: structureDigest(forged),
  });
  assert.equal(forgedExecution.ok, false);
  if (!forgedExecution.ok) {
    assert.equal(forgedExecution.code, 'unauthorized_structure');
    assert.ok(forgedExecution.reasons.some((r) => r.includes('outside the authorized envelope')));
  }

  assert.deepEqual(fingerprint(world), before);

  // A genuine token goes stale after any world revision change.
  assert.equal(setVoxel(world, -56, 11, -43, MAT.STONE), true);
  const afterManualEdit = fingerprint(world);
  const stale = executeStructure(world, plan, token);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, 'stale_authorization');
  assert.deepEqual(fingerprint(world), afterManualEdit);
});

test('executor re-checks surface and obstructions before charging resources', () => {
  const m = fixture();
  prepareHouse(m);
  const world = m.world;

  // A plan whose surface samples disagree with the current world is refused
  // even when its digest and authorization are internally consistent. The
  // authorizer checks envelopes, not terrain; the executor must re-read it.
  const surfacePlan = planStructure(world, houseProposal(m));
  assert.equal(surfacePlan.ok, true);
  if (!surfacePlan.ok) return;
  const raised: StructurePlan = {
    ...surfacePlan.plan,
    surface: surfacePlan.plan.surface.map((s, i) => (i === 0 ? { ...s, y: s.y + 1 } : s)),
  };
  raised.id = `structure:${structureDigest(raised)}`;
  const raisedToken = structureAuthorizer().authorize(world, raised);
  assert.equal(raisedToken.ok, true);
  if (!raisedToken.ok || !raisedToken.authorization) return;
  const beforeRaised = fingerprint(world);
  const onRaised = executeStructure(world, raised, raisedToken.authorization);
  assert.equal(onRaised.ok, false);
  if (!onRaised.ok) {
    assert.equal(onRaised.code, 'unauthorized_structure');
    assert.ok(onRaised.reasons.some((r) => r.includes('expected 12')));
  }
  assert.deepEqual(fingerprint(world), beforeRaised);

  // A new obstruction on the footprint is caught by the executor even though
  // the revision and surface are unchanged.
  const blocked = fixture();
  prepareHouse(blocked);
  const planned = planStructure(blocked.world, houseProposal(blocked));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const token = structureAuthorizer().authorize(blocked.world, planned.plan);
  assert.equal(token.ok, true);
  if (!token.ok || !token.authorization) return;
  const extra = {
    id: 'test:house-rock',
    kind: 'styl_rock_small' as const,
    chunk: '30,30',
    x: -56.5, y: 11, z: -43.5,
    rot: 0, scale: 1, variant: 0,
    resource: 'stone' as const, remaining: 2, yieldPerHarvest: 1,
    harvested: false, provisional: false, authored: false,
  };
  blocked.world.entities.set(extra.id, extra);
  blocked.world.entityChunks.get('30,30')!.push(extra.id);
  const beforeBlocked = fingerprint(blocked.world);
  const onBlocked = executeStructure(blocked.world, planned.plan, token.authorization);
  assert.equal(onBlocked.ok, false);
  if (!onBlocked.ok) {
    assert.equal(onBlocked.code, 'unauthorized_structure');
    assert.ok(onBlocked.reasons.some((r) => r.includes('footprint has 1 obstructions')));
  }
  assert.deepEqual(fingerprint(blocked.world), beforeBlocked);
});

test('the pinned M002 scenario is deterministic and leaves outside terrain alone', () => {
  const a = createM002Fixture();
  const b = createM002Fixture();
  const ra = runM002Scenario(a);
  const rb = runM002Scenario(b);

  assert.equal(ra.ok, true, ra.errors.join('; '));
  assert.equal(rb.ok, true, rb.errors.join('; '));
  assert.deepEqual(ra.errors, []);

  assert.deepEqual(ra.house.preparation, rb.house.preparation);
  assert.deepEqual(ra.path.preparation, rb.path.preparation);
  assert.deepEqual(ra.farm.preparation, rb.farm.preparation);
  assert.deepEqual(ra.house.structure, rb.house.structure);
  assert.deepEqual(ra.path.structure, rb.path.structure);
  assert.deepEqual(ra.farm.structure, rb.farm.structure);

  assert.equal(ra.house.preparation?.cutVolume, 3);
  assert.equal(ra.house.preparation?.fillVolume, 18);
  assert.equal(ra.house.preparation?.voxelEdits, 21);
  assert.equal(ra.path.preparation?.cutVolume, 12);
  assert.equal(ra.path.preparation?.fillVolume, 0);
  assert.equal(ra.path.preparation?.voxelEdits, 39);
  assert.equal(ra.path.preparation?.surfaceEdits, 27);
  assert.equal(ra.farm.preparation?.cutVolume, 40);
  assert.equal(ra.farm.preparation?.fillVolume, 33);
  assert.equal(ra.farm.preparation?.voxelEdits, 107);
  assert.equal(ra.farm.preparation?.surfaceEdits, 34);

  assert.equal(ra.house.structure?.moduleCount, 17);
  assert.equal(ra.path.structure?.moduleCount, 27);
  assert.equal(ra.farm.structure?.moduleCount, 14);
  assert.deepEqual(ra.house.structure?.costPaid, { wood: 10, stone: 18 });
  assert.deepEqual(ra.path.structure?.costPaid, { stone: 9 });
  assert.deepEqual(ra.farm.structure?.costPaid, { wood: 6, stone: 12 });
  assert.deepEqual(m002StructureCosts(ra), { wood: 16, stone: 39 });

  assert.deepEqual(ra.inventoryBefore, { stone: 48, wood: 24 });
  assert.deepEqual(ra.inventoryAfter, { ore: 8, stone: 9, wood: 20 });
  assert.equal(a.world.structures.size, 3);
  assert.deepEqual([...a.world.structures.keys()], [
    'structure:7f2ab549e46d8ddb',
    'structure:0e68d6af974d7a55',
    'structure:8c4a68c0e8536323',
  ]);
  // Revision steps: 21 house edits, 39 path edits, 107 farm edits, two entity
  // removals during farm preparation, and one commit per structure.
  const housePrep = ra.house.preparation!;
  const houseBuild = ra.house.structure!;
  const pathPrep = ra.path.preparation!;
  const pathBuild = ra.path.structure!;
  const farmPrep = ra.farm.preparation!;
  const farmBuild = ra.farm.structure!;
  assert.equal(housePrep.revisionAfter - housePrep.revisionBefore, 21);
  assert.equal(houseBuild.revisionAfter - houseBuild.revisionBefore, 1);
  assert.equal(pathPrep.revisionAfter - pathPrep.revisionBefore, 39);
  assert.equal(pathBuild.revisionAfter - pathBuild.revisionBefore, 1);
  assert.equal(farmPrep.revisionAfter - farmPrep.revisionBefore, 109);
  assert.equal(farmBuild.revisionAfter - farmBuild.revisionBefore, 1);
  assert.equal(
    a.world.revision - housePrep.revisionBefore,
    172,
    '21 + 1 + 39 + 1 + 109 + 1 revision steps',
  );

  assert.deepEqual(ra.hashes, rb.hashes);
  assert.equal(
    canonicalRegionHash(a.world, a.layout.protectedRegion).hash,
    canonicalRegionHash(b.world, b.layout.protectedRegion).hash,
  );
  assert.equal(
    canonicalEntityHash(a.world, a.layout.protectedRegion),
    canonicalEntityHash(b.world, b.layout.protectedRegion),
  );
  assert.equal(canonicalInventoryHash(a.world), canonicalInventoryHash(b.world));
  assert.deepEqual(editsOutsideEnvelope(a.world, a.layout.envelope), []);
  assert.deepEqual(checkDerivedCaches(a.world, a.layout.protectedRegion), []);

  // House, path and terraces are all present on prepared, real terrain.
  assert.equal(surfaceAt(a.world, -56, -43), 11);
  assert.equal(topMaterialAtWorld(a.world, -49, -43), MAT.GRAVEL);
  assert.equal(surfaceAt(a.world, -32, -41), 16);
  assert.equal(surfaceAt(a.world, -32, -38), 15);
  assert.equal(surfaceAt(a.world, -32, -36), 14);
  assert.equal(topMaterialAtWorld(a.world, -32, -36), MAT.SOIL);
});
