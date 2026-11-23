// M002 playable slice gate: the exact project definitions used by the sidebar
// must inspect, prepare and build through the shared simulation pipeline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createM002Fixture, M002_LAYOUT } from '../src/sim/m002';
import { M002_STARTER_INVENTORY } from '../src/sim/scenario';
import { LocalAuthorizer } from '../src/sim/preparation';
import { LocalStructureAuthorizer } from '../src/sim/structures';
import {
  canonicalEntityHash, canonicalInventoryHash, canonicalRegionHash,
} from '../src/sim/canonical';
import {
  M2_PROJECTS, buildProject, inspectProject, isProjectBuilt,
} from '../src/app/projects';

function fixture() {
  const m = createM002Fixture();
  m.world.inventory = { ...M002_STARTER_INVENTORY };
  const prep = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
  const structures = new LocalStructureAuthorizer({ envelope: M002_LAYOUT.envelope });
  return { m, world: m.world, prep, structures };
}

function fingerprint(world: ReturnType<typeof fixture>['world']) {
  return {
    revision: world.revision,
    voxels: canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash,
    entities: canonicalEntityHash(world, M002_LAYOUT.protectedRegion),
    inventory: canonicalInventoryHash(world),
  };
}

test('the three playable projects inspect as buildable and read-only', () => {
  const { world } = fixture();
  const before = fingerprint(world);

  for (const project of M2_PROJECTS) {
    const inspection = inspectProject(world, project);
    assert.equal(inspection.built, false);
    assert.equal(inspection.affordable, true);
    assert.equal(inspection.plan.ok, true, `${project.id}: ${!inspection.plan.ok ? inspection.plan.reasons.join('; ') : ''}`);
    assert.equal(inspection.canBuild, true);
    assert.notEqual(inspection.state, 'invalid');
  }

  assert.deepEqual(fingerprint(world), before);
});

test('the playable slice builds house, path and farm with exact costs', () => {
  const { world, prep, structures } = fixture();
  const results = [];

  for (const project of M2_PROJECTS) {
    const result = buildProject(world, prep, structures, project);
    assert.equal(result.ok, true, !result.ok ? `${result.stage}: ${result.reasons.join('; ')}` : '');
    results.push(result);
    assert.equal(isProjectBuilt(world, project), true);
  }

  assert.equal(world.structures.size, 3);
  const house = results[0];
  const path = results[1];
  const farm = results[2];
  assert.equal(house.ok && path.ok && farm.ok, true);
  if (!house.ok || !path.ok || !farm.ok) return;

  assert.deepEqual(house.structure.costPaid, { stone: 18, wood: 10 });
  assert.deepEqual(path.structure.costPaid, { stone: 9 });
  assert.deepEqual(farm.structure.costPaid, { stone: 12, wood: 6 });
  assert.deepEqual(world.inventory, { ore: 8, stone: 9, wood: 20 });

  // A finished project is no longer buildable, and the refusal happens before
  // any terrain or inventory change.
  const before = fingerprint(world);
  const again = buildProject(world, prep, structures, M2_PROJECTS[0]);
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.stage, 'precheck');
  assert.deepEqual(fingerprint(world), before);
});

test('an unaffordable build is refused before any terrain is graded', () => {
  const { world, prep, structures } = fixture();
  world.inventory = { wood: 1, stone: 1 };
  const before = fingerprint(world);

  const result = buildProject(world, prep, structures, M2_PROJECTS[0]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.stage, 'precheck');
    assert.equal(result.code, 'insufficient_resources');
  }
  assert.deepEqual(fingerprint(world), before);
  assert.equal(world.structures.size, 0);
});
