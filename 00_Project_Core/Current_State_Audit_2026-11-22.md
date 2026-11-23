# ASTrix — Current-State Audit

**Date:** 2026-11-22  
**Purpose:** Factual project-wide assessment of the working tree, documentation, visuals, verification and governance.  
**Disposition:** Read-only audit. This report changes no implementation, deployment or approval. It is not independent M002 closure or owner art acceptance.

## Executive assessment

ASTrix is a **working, locally playable founder construction and persistence slice**, not yet a playable civilization-building game. Its strongest achievement is not the visible house; it is the engineering underneath: a deterministic, genuinely volumetric 2048 m world, render-independent simulation, bounded authorized construction, versioned canonical state, accepted-command replay, rollback and browser restoration. Those systems provide a credible basis for the intended persistent game.

The playable experience is narrow. A player can orbit and pan around the world, change lighting/time, harvest nearby wood with `H`, inspect three authored projects, and build a pinned house, stepped path and terraced field. Construction changes real voxel earthwork and creates simulation-owned Noxel structures. The result saves and restores locally. There is no freeform building game, avatar, general excavation/mining workflow, production/storage economy, planted crop lifecycle, population, NPC work or progression.

The full vision—shared persistent civilization, player ownership and trade, an optional bounded AI Steward, and carefully evaluated Solana/MagicBlock support—is architectural direction, not current functionality. No autonomous Steward, network transport, authenticated identity, ownership system, marketplace, Solana program or MagicBlock integration exists in the current source.

The three-language visual split is now represented in executable content: voxel geology and earthworks, Noxel architecture/infrastructure, and separate faceted organic vegetation and crops. Fresh production captures substantiate that distinction. They do **not** establish final art quality. The 19-module founder house exceeds the provisional 4–9-volume target, and owner art review remains open.

**Bottom line:** proceed from this foundation, but do not mistake the successful vertical slice for the economy or shared-world game. The next important milestone should be one persistent gather → store → process → cultivate loop, with usability and LOD correctness addressed alongside it—not a blockchain integration or a large expansion of decorative content.

## 1. Overall project status

### Working and demonstrated

| Area | Current executable state |
|---|---|
| World | Deterministic 2048 × 2048 m volumetric voxel terrain, seed/version based, with chunked material storage and derived surface caches. |
| Camera/environment | Orbit, zoom, keyboard/touch panning, visual day/night presets, pause and speed controls. |
| Resources | Entity-based depletion and an accepted local harvest command; normal UI harvests nearby wood. |
| Construction | Three validated, bounded projects: founder house, door path and terraced field. Terrain preparation, obstruction removal, exact costs and rollback work. |
| State | Canonical voxel/entity/inventory/structure records, accepted-command journal, revision/duplicate checks and deterministic replay. |
| Persistence | Versioned local Web Storage snapshots plus accepted-command tail, explicit legacy handling and corrupt-save quarantine. |
| Presentation | Near voxel meshing, distant macro terrain, faceted nature and authoritative generated Noxel structures; HTML/CSS build panel. |
| Verification | Strict TypeScript, 84 passing tests, successful production build and nine passing production-browser checks with zero recorded page errors. |

### Partial

- **Construction** is a fixed authored scenario, not general placement. Candidate-site search exists in simulation but is not a player-facing workflow (`Game/src/app/projects.ts:65-124`).
- **Harvesting** is more general in the simulation than in the browser. `H` deliberately searches only for wood within 40 m of the camera target (`Game/src/main.ts:185-217`).
- **Natural resources** can deplete individually, but there is no ecological renewal or broader depletion/regrowth model.
- **Terrain editing** is genuine volumetric mutation, but production player actions do not offer arbitrary excavation or placement. Development-only debug edits are intentionally outside accepted history (`Game/src/main.ts:164-183`, `Game/src/main.ts:220-227`).
- **Farming** creates soil terraces and visible crop rows; crops are presentation records, not plants with a lifecycle.
- **Mobile support** is emulated browser UX, not validated physical-device support or accessibility.
- **Rendering** tracks authoritative edits in near terrain, but distant/map terrain does not.

### Missing as executable systems

Storage/stockpoints, recipes and production jobs, tools/crafting, planting/growth/harvest/replanting, food, animals, inhabitants, workers, settlement simulation, logistics, trade, progression/unlocks, multiplayer, remote persistence, player ownership/permissions, NPC planning and the AI Steward are absent. No current chain dependency or integration exists.

## 2. Architecture and technical foundation

### Runtime and layering

The application uses Three.js, strict TypeScript, Vite and direct HTML/CSS/DOM UI (`Game/package.json:6-20`). The lockfile resolves Three.js 0.186.1, TypeScript 5.9.3 and Vite 7.3.7. The package remains named `noxel-world`, version `0.0.1`; this is small naming/version debt, not a functional issue.

The simulation is pure TypeScript and has no Three.js/renderer imports, with a test enforcing that boundary (`Game/tests/sim.test.ts:200-209`). This is a significant strength: canonical behavior can be tested and replayed without a browser or WebGL.

The principal layers are:

1. `Game/src/sim/` — world generation, voxel/entity state, validation, preparation, structures, canonical snapshots.
2. `Game/src/app/` — command/journal authority, browser persistence, authored project definitions and playable controller.
3. `Game/src/render/` — terrain, nature, architecture, camera, environment.
4. `Game/src/ui/` and `Game/src/main.ts` — DOM controls and browser integration.

This is sound separation for a small game. It is not a client/server architecture: canonical currently means authoritative **within one local simulation**, not server authority or anti-cheat enforcement.

### Voxel and terrain data

World constants establish X/Z `[-1024,1024)`, Y `[-16,112)`, sea level 0, 32 × 32 chunks and 128 vertical cells per column (`Game/src/sim/world.ts:14-24`). Each chunk stores 131,072 material bytes. Heights and top materials are derived caches, not the storage model (`Game/src/sim/world.ts:142-155`). Tests distinguish exposed voxel surfaces from base height sampling, verify stratigraphy and water columns, and confirm that edits survive delta export and regeneration (`Game/tests/sim.test.ts:88-158`).

Generation uses deterministic integer hashes, value noise and FBM. It produces grass, soil, sand, gravel, stone, ore, water, bedrock and moss. There are sparse carved ledges/overhangs, but no general cave simulation or fluid dynamics. Water cells exist in the volume; rendering presents a static opaque sea surface.

Edits are stored separately and re-applied when chunks regenerate. Chunk eviction therefore need not erase accepted canonical work. This is appropriate for a persistent editable world and much stronger than saving only generated chunk bytes.

### Entities and inventory

Entities include four tree variants, shrubs, rocks, ore, cairns, waystones and markers (`Game/src/sim/world.ts:157-171`). Records have stable IDs, chunk membership, position, variant, scale, resource, remaining quantity, yield and harvest state. Generated/entity changes and tombstones are canonical. Animals and inhabitants are not implemented.

`ResourceType` is wood, stone, ore and fiber (`Game/src/sim/world.ts:173`). Genesis grants 24 wood and 48 stone; this is fixture/bootstrap support, not a self-sustaining economy (`Game/src/app/session.ts:362-365`). Preparation can remove obstructing trees/rocks and credit resources, but that is not a separate chopping/mining loop.

Normal harvesting uses camera-target proximity, not avatar proximity. There is no tool requirement, travel, collision, line-of-sight check, targeting cursor or resource selection. Ore and fiber in the HUD therefore do not imply equivalent normal harvesting workflows.

### Construction and authority

The preparation pipeline is proposal → site validation → preparation plan → local authorization → checked execution (`Game/src/sim/preparation.ts:1-16`). Plans digest targets, expected cut/fill, obstruction removals and mutation envelopes. Execution checks the plan before the first write. Structures have their own simulation records, costs, prepared-surface checks and bounded authorization (`Game/src/sim/structures.ts:1-7`, `Game/src/sim/structures.ts:106-133`).

`GameSession.dispatch` is the accepted-command boundary. It validates the input envelope, schema, command ID and expected revision, builds or harvests, then records the command, sequence, revision, state hash and outcome (`Game/src/app/session.ts:286-337`). Repeating an identical accepted command is idempotent; reusing the ID for different work is rejected. Replayed outcomes/hashes must match exactly (`Game/src/app/session.ts:340-347`).

Failed builds restore a complete pre-build state if a late failure occurs. Tests inject authorization and obstruction failures and verify terrain, entities and inventory rollback (`Game/tests/m002.remediation.test.ts:69-105`). Only accepted commands are journaled (`Game/src/app/session.ts:307-335`).

The authority is explicitly `local-stub / local-simulation-only`. Its digest and canonical hashes detect accidental divergence; they are neither cryptographic signatures nor protection against a user modifying their own browser.

### Strengths, weaknesses and debt

**Strengths:** durable voxel deltas rather than cache-only edits; deterministic site planning; simulation-owned geometry and cost; transactional rollback; schema versioning; exact snapshot-tail replay; renderer isolation; tests that fault-inject rather than only test successful paths.

**Debt:** synchronous main-thread generation/meshing; wholesale nature rebuilding on chunk/harvest changes; one large JavaScript chunk; duplicated noncryptographic digest logic; manual palette copying; generated test bundles and production artifacts mixed into the working tree; stale architecture records; no server/coordination abstraction proven by actual multi-participant behavior.

## 3. Gameplay: actions versus designed systems

### Actual player actions

- Drag to orbit, wheel/pinch to zoom, use WASD/arrows or the touch pad to pan, and Q/E to rotate. Shift accelerates keyboard movement.
- Select dawn/noon/dusk/midnight with `1`–`4`; pause visual time with Space; change its speed with `[` and `]`.
- Press `H` to harvest a nearby wood entity. Repeated depletion is available to the inspection harness.
- Choose a project to focus it, read its footprint/cost/site conditions and see a translucent footprint/massing preview.
- Click Build to prepare terrain, clear authorized obstructions, pay resources and create a structure.
- Continue after browser reload with restored local canonical state.

The house costs 10 wood/18 stone; the terrace costs 6 wood/12 stone; the path costs one stone per corridor width (`Game/src/sim/structures.ts:106-112`). The founder house is 8 × 6 m with a 3.2 m storey, real east doorway and two south window openings. The path has nine modules; the terrace has 14 records, including crop rows and retaining/earth elements (`Game/src/app/projects.ts:65-123`).

### Important limits

- There is **no avatar or walking controller**; this is an orbit-camera builder view.
- The three projects are pinned authored records, not arbitrary placement. Ghosts show massing/footprints, not detailed final architecture.
- Preparation automatically performs earthworks and resource recovery. It does not yet expose tools, labor or construction time.
- Trees do not regrow; crops do not grow; time of day has no gameplay effect.
- `scene=kit` and `scene=map` are inspection modes, not additional playable modes.
- No completed-building management, demolition, upgrade, repair or production assignment exists.

The target loop in the design document—observe → gather → build → produce → grow population → unlock → reshape—is explicitly marked unimplemented (`00_Project_Core/Game_Design_Document.md:13-16`). Current play covers portions of observe, gather, build and reshape.

## 4. World and visual development

### What the code renders

Near terrain uses actual volumetric material state and greedy meshing. Structure meshes are derived from authoritative modules; they do not invent extra buildings in the renderer. Architecture casts and receives shadows. Crop foliage is faceted geometry bounded by authoritative crop-row envelopes. Nature is a separate faceted mesh family.

The visual-domain division is:

| Domain | Intended role | Current evidence |
|---|---|---|
| **Voxels** | Geology, cliffs, strata, shorelines, excavation, graded shelves and terrace earth | Implemented in the authoritative world and visible in the founder earthwork. |
| **Noxels** | Foundations, walls, real openings, roofs, path runs, curbs, retaining walls and future settlement infrastructure | Implemented procedurally for the bounded founder candidate; no exported general GLB asset library was found. |
| **Faceted organics** | Trees, shrubs, crops and eventually wildlife | Trees/shrubs and presentation-only crops exist; wildlife does not. |

The founder design uses a 0.05 m Noxel quantum and 0.6 m walls; openings are actual full-thickness voids, not dark blocks (`Game/src/sim/structures.ts:52-79`). This directly addresses the visual concern that architecture must not collapse into an undifferentiated voxel pile.

### Image inspection

The final retained images in `13_Integration_and_QA/Evidence/M002-founder-visual-browser-20261122/` were opened and inspected:

- `wide-daylight.png` shows the settlement on stepped voxel ground, distinguishable Noxel architecture/infrastructure and separate organic vegetation.
- `close-house-openings.png` shows a real doorway, two open south windows, foundation, walls and roof hierarchy.
- `close-farm-crops.png` shows faceted crop clusters on three stepped soil bands with retaining/edge elements.
- `desktop-built-ui.png` shows the three completed projects and resource/persistence interface.
- `mobile-house-inspection.png` shows the panel fitting the emulated viewport while obscuring much of the world.

These images are production implementation evidence, **not art approval**. They do not demonstrate the richer settlement/world compositions in reference analyses across all lighting and gameplay distances.

### Visual gaps and defects

1. **Edited terrain disappears or reverts in distant/map views.** Macro samples are cached only by seed/generator/step and call `surfaceHeightAt` and `baseTopMaterial`, not edited chunks (`Game/src/render/terrain.ts:399-453`). Map mode hides near terrain and builds macro terrain without a near-hole. Thus genuine cuts/fills are not consistently represented across LODs. This is a correctness issue, not merely polish.
2. The 19-module house exceeds the provisional founder-tier 4–9-volume target (`05_Noxel_Studio/Noxel_Style_Guide/Noxel_Style_Guide_v1.0.md:89-103`; `Game/src/app/projects.ts:69-73`). Either the design or the provisional rule needs an explicit art ruling.
3. The written Noxel guide is Review Required and records that original owner reference images were absent from disk; REF documents are derived analyses, not substitutes for those originals (`05_Noxel_Studio/Noxel_Style_Guide/Noxel_Style_Guide_v1.0.md:10-14`).
4. The world lacks animated/transparent water, flowing waterways, advanced atmospheric/cloud behavior, ambient occlusion and a dense settlement composition. Time changes sky/fog/sun/exposure, not ecology or activity.
5. Geometry is programmatic and provisional; the promised general Noxel asset-production pipeline is not yet a library of authored/exported GLBs.
6. Palette v2 is manually copied into `Game/src/data/palette.json`; drift remains possible (`00_Project_Core/Task_Backlog.md:49-51`).
7. The mobile panel needs a less obstructive presentation, and physical-device, accessibility and all-lighting visual checks remain incomplete.

It is **not too early to work on visuals**, but the appropriate scope is this integrated founder slice and its defects, not broad asset expansion before gameplay contracts are established.

## 5. AI and agents

There is no in-game AI architecture implementing observation → planning → execution → verification. There is no LLM adapter, autonomous planner, agent controller, task scheduler, NPC job system or self-checking Steward loop.

Existing reusable validation, deterministic candidate-site search, local authorizers, command receipts, replay and browser/test harnesses are **useful future tools** for an agent. Comments that call preparation a pipeline shared by player and AI express intended reuse (`Game/src/sim/preparation.ts:1-16`); they do not prove that an AI participant exists.

The correct future Steward boundary is already well represented in the execution plan: it must use the same validated commands and owner-scoped permissions as other participants, with scoped/revocable capabilities and observable proposals, decisions, results and rejections (`00_Project_Core/Execution_Plan.md:62-75`). That remains planned work. Current `local-stub` authorization must not be described as an AI permission system.

## 6. Persistence, reliability and verification

### Save and replay behavior

Snapshots contain the manifest, revision, sorted voxel deltas, authoritative entity changes/removals, inventory, structures, authored placement and next sequence (`Game/src/sim/snapshot.ts:17-31`). Chunk bytes, meshes, timing metrics and derived caches are regenerated. Limits include 25 MB snapshot JSON, one million voxel edits and 500,000 entities. Validation rejects unknown/malformed fields and unsupported generator configuration.

Restore checks snapshot/journal schema and seed compatibility and the canonical hash at the journal boundary before replaying the accepted tail (`Game/src/app/session.ts:245-265`). Hashing uses two noncryptographic lanes (`Game/src/sim/snapshot.ts:83-99`); it supports reproducibility/divergence checking, not tamper-proof history.

New sessions use schema/design 2. Legacy design 1 is represented by an absent `designVersion`; separate keys prevent silent migration. Browser load prefers schema 2, then explicitly tries schema 1, quarantining rejected bytes where possible (`Game/src/app/persistence.ts:54-93`). Failed quarantine preserves the original record and marks the session volatile. Save failures do not report success.

### Verified gates

This audit reran the current working tree:

- `npm --prefix Game run typecheck`: passed.
- `npm --prefix Game test`: **84 passed, 0 failed**, approximately 30.7 seconds.
- `npm --prefix Game run build`: passed with Vite 7.3.7 in 1.72 seconds.
- Production artifacts: `index-D0Cff74d.js` (681.51 kB minified; 183.42 kB Vite gzip estimate) and `index-CP3IsjGm.css` (10.53 kB; 2.86 kB gzip estimate).
- Vite retains its >500 kB chunk-size advisory.

The latest preserved production-browser run passed nine checks with no page errors (`13_Integration_and_QA/Evidence/M002-founder-visual-browser-20261122/REPORT.md:23-59`). It verifies schema-2 genesis/debug isolation, harvest persistence, normal-UI builds, exact reload, snapshot-tail replay and wide/close/mobile rendering. The final restored hash is `d1e79035f68ee923`; four accepted commands produce 19 house, 9 path and 14 terrace modules with inventory `{ ore: 8, stone: 9, wood: 24 }`.

Earlier stale-camera and scripted-focus failures remain archived. The camera fix now updates position/look-at/world matrices synchronously, and tests assert actual camera direction, not screenshot readiness. Test-generated `tests/.build/*.mjs` files are bundles, not additional independent test suites.

### Confirmed current defects

1. **Macro/map terrain ignores edits**, as detailed in §4.
2. **Save status becomes stale.** Successful `save()` returns `Saved locally.` without updating `this.status`/`this.message` (`Game/src/app/persistence.ts:96-120`). Metrics can therefore continue to display `New local world.` or `Restored 1 accepted command.` after subsequent saves. This is a messaging defect; exact state restoration was separately verified.
3. **Build feedback hides the save result.** The save toast is immediately replaced by a success/cost toast (`Game/src/app/m2.ts:129-141`), so even a failed save may not remain visible as the primary outcome.
4. **Touch controls are inaccessible to assistive technology.** Buttons sit inside `#controls[aria-hidden="true"]`; their individual labels do not undo that. The viewport also disables user scaling.
5. **Keyboard handling can conflict with focused controls.** Global shortcuts do not consistently exclude interactive DOM focus. Inspection URL numeric parameters also have limited finite/range validation beyond the explicitly checked seed.

### Performance and unverified assumptions

The latest rebuilt desktop scene reports 49 render calls and 200,882 triangles at 1440 × 1000. Mobile checks used a 390 × 844 emulated viewport. These are scene metrics, not FPS, frame-time percentile, heap or GPU profiling.

The older documented budget—≤120 calls, ≤250,000 triangles, ≤16 ms at 1920 × 1080 integrated GPU, ≤120 MB heap and ≤3 s warm load—is only partly measurable from this evidence. Physical-GPU frame time, memory, warm-load and real-device acceptance remain unverified. Software-WebGL `ReadPixels` stalls, deprecated `THREE.Clock`, and `PCFSoftShadowMap` fallback warnings are recorded rather than hidden (`13_Integration_and_QA/Evidence/M002-founder-visual-browser-20261122/REPORT.md:90-100`).

Browser evidence tooling uses a machine-specific absolute Playwright lookup; it is not portable test infrastructure. The nine-check run is valuable but does not replace independent review, sustained soak testing, fuzz/property testing at larger histories, crash/power-loss tests or multi-tab conflict tests.

## 7. Recent development and remaining review

The latest substantive work moved beyond the older terrain/Noxel-kit demonstrations:

- Added a canonical accepted-command journal, strict schema/design-2 handling, complete snapshots, browser quarantine and replay tests.
- Added bounded atomic construction and fixed adjacent-chunk obstruction and rollback cases.
- Added the design-2 founder house with genuine openings, consolidated stepped path and bounded faceted crop presentation.
- Corrected stale synchronous inspection-camera matrices and added regression coverage.
- Produced fresh production evidence while preserving invalid/stale runs separately.

These are implementation advances, not governance completion. Still required are independent M002 review and owner disposition, owner art acceptance, resolution of the volume-target conflict, and correction/disposition of the source-derived defects in this report. No approval should be inferred from green tests, an agent review, a generated report or a notification.

Repository traceability is also unresolved. The visible history has only the initial commit `39511d1`; much of the current M002 source, tests, production assets, execution plan and evidence is modified or untracked on `main`. This makes it difficult to identify a stable reviewed baseline. This audit did not reset, stage, commit, push, clean or delete any of that work.

## 8. Milestones and governance

The following reflects records, not a new ruling:

| Disposition | Current records |
|---|---|
| **Approved** | Browser/desktop-first Three.js, strict TypeScript/Vite, render-independent deterministic simulation; voxel/Noxel split; hybrid faceted organics; green forest/pink accents; Palette v2; day/night. Tasks 001, 002, 003, 007 and 014 are Approved. The 128 m `start_map_v1.json` remains the formal map baseline. |
| **Review Required / candidate** | Tasks 006 and 008/T-009; the proposed 256 m map and voxel mesher; November M002 workstream A; founder visual workstream B and its 19-module house. |
| **Blocked** | Task 004 remains blocked on Task 008 review. |
| **Superseded, not silently approved** | T-008 continuous terrain and standalone-kit/broad-content-first ordering. Older M1 scope descriptions do not describe the newer construction direction. |
| **Planned/evaluation only** | Workstream C playable loop; D ownership/permissions/Steward; E Solana/MagicBlock experiments and adoption decision. |
| **Rejected** | No reviewed backlog task is explicitly marked Rejected. |

Several documents are stale. October records discuss 128/256 m worlds, heightfields and nature-only milestones; current executable terrain is 2048 m volumetric with persistent bounded construction (`00_Project_Core/Decision_Log.md:13-23`). The old architecture document also differs from current strict unknown-field save validation. D-007/D-008 still say they await Task 003 although Task 003 is Approved. These conflicts require explicit reconciliation, not an automatic transfer of old approvals to new implementation.

DEPLOY-001 records an October 29 static M001 deployment at a raw HTTP IP and old bundle. It does not prove present availability, serve the verified M002 bundle or provide server-side simulation. Current visual evidence is from local production preview at `127.0.0.1:4173`; no current public availability check or deployment was performed for this audit.

## 9. Full-vision gap analysis

| Capability | Present today | Needed for the vision |
|---|---|---|
| Persistent natural world | Deterministic local world, voxel deltas, entity state, restoration | Durable shared persistence, larger-history/crash testing, consistent LOD and richer biome/water behavior |
| Natural depletion | Per-entity remaining/yield/harvested state | Deliberate regeneration/ecology, geological extraction and world-scale consequences |
| Tools/crafting/mining | Wood harvest command; bounded preparation | Player-selected nodes, tool/action requirements, recipes, processing and explainable inventory transformations |
| Logistics/storage | Global simple inventory | Physical stockpoints, deposit/withdrawal, conservation, capacities and transport/jobs where justified |
| Construction | Three pinned validated projects | General placement/site search, varied infrastructure, storage/production connections and management UX |
| Farming | Prepared terraces and static crop rows | Planting, deterministic growth, tending, bounded yield, harvesting and replanting |
| Animals/wildlife | None executable | Faceted organic presentation, behavior/ecology and a defined gameplay role |
| Economy | Starter inventory and exact build costs | Production, scarcity, storage, exchange, sinks/sources and progression balancing |
| Settlements/population | One tiny founder composition | Inhabitants, needs, housing/work relationships, growth and settlement legibility |
| NPC work | None | Job graphs, navigation, resource claims, execution, recovery and observable status |
| Progression/civilization | No unlocks or tiers in play | Technology/architecture/infrastructure unlocks tied to sustained play rather than scripted clicks |
| Optional AI Steward | Future-compatible validators and local command receipts only | Planner adapter, capabilities, budgets, revocation, audits, failure handling and shared-command parity |
| Ownership | Local world only | Actor identity, claims, provenance, transfer semantics and owner-scoped permissions |
| Multiplayer/shared world | None | Reservations/conflict recovery, authenticated transport, authoritative server and replication |
| Trade/common market | None | Offers, settlement, escrow/atomicity, permissions and recovery before optional external settlement |
| Solana/MagicBlock | No SDK, program, IDL, account or integration | Concrete scarce-claim use case, official-doc research, local/zero-spend proofs and explicit adoption decision |
| UX/accessibility | Build sidebar, camera shortcuts, basic touch controls | Onboarding, selection/placement cursor, save/reset controls, job/history UI, accessible mobile/layout and settings |

The intended chain boundary is sound: ordinary voxels, crops, resources and inventory remain game state. Blockchain should support only a demonstrated ownership/settlement need and remain removable without making the core game unusable. No evidence currently justifies claiming that Solana or MagicBlock is necessary.

## 10. Independent risks and priorities

These priorities include repository-derived issues not simply copied from the task backlog.

1. **P0 — Canonical world and rendered world disagree at distance.** Fix or explicitly bound macro/map behavior before relying on exploration/map UX. Add edited-cut/fill regression tests across near/far transitions and map mode.
2. **P0 — Save failure can be visually obscured and status is stale.** Correct save-state reporting and preserve an unambiguous failure indicator. Persistence correctness tests do not cover this user-trust issue.
3. **P0 — No stable reviewed baseline.** Once authorized, reconcile the working tree and preserve a reviewable source/evidence baseline. Do not mix generated artifacts into the definition of handwritten implementation.
4. **P1 — The experience may remain a construction showcase.** Require conservation-backed storage, production and crop lifecycle before broadening the map or asset catalog. The acceptance test should be one ordinary player completing a persistent useful loop, not another `buildAll` demo.
5. **P1 — World scale exceeds interaction scale.** A 2048 m world has no traversal, general targeting, minimap, logistics or meaningful distant-state rendering. Either build those systems or present a deliberately bounded playable region; scale alone does not create a civilization game.
6. **P1 — Art rules and geometry conflict.** Resolve the founder-volume target and Noxel material/proportion questions with owner review. Functional door/window tests cannot answer aesthetic acceptance.
7. **P1 — Accessibility/input assurance is incomplete.** Fix hidden touch controls and zoom restrictions, manage keyboard focus, and validate real devices. A panel that fits is not sufficient mobile usability.
8. **P1 — Main-thread scaling risk.** Measure sustained movement, many structures/entities and long play on physical GPUs before adding populations. Incremental nature/structure/terrain rebuilds and worker scheduling may be needed; optimize from measured evidence.
9. **P2 — Local determinism can be mistaken for shared authority.** Introduce identity, permissions, reservations and recovery before networking. Do not reuse stable IDs/revisions as if they solved distributed concurrency or authentication.
10. **P2 — Governance and documentation drift.** Reconcile formal baselines, old approvals and November direction; keep evidence from implying closure. Old deployment and performance figures need dates/artifact IDs wherever quoted.
11. **P2 — Verification portability and durability limits.** Replace the absolute Playwright path, add repeatable browser scripts, and test large journals, quota/crash behavior, multi-tab access and long-running rebuild behavior.
12. **P3 — Premature chain or autonomous-agent complexity.** Both depend on stable item/ownership semantics. Prioritize them only after local permissions and the playable economy are demonstrably useful.

## 11. Roadmap, dependencies and parallel work

The existing execution plan has the right broad dependency order (`00_Project_Core/Execution_Plan.md:17-86`). This audit recommends the following concrete sequencing, without inventing dates or completion percentages.

### Stage 1 — Establish a trustworthy slice

- Disposition independent M002 review and the new macro/save/accessibility findings.
- Fix edited LOD/map consistency and persistence feedback; add regression coverage.
- Re-run real production-browser workflows and measure physical-device performance.
- Obtain explicit owner art direction on the 19-module founder candidate and unresolved Noxel rules.
- Reconcile core records and, only with authorization, establish a clean reviewable baseline.

**Dependency:** precedes confident expansion of the UI/world and formal M002 closure.

### Stage 2 — One persistent playable life loop

1. Introduce stockpoints with explicit deposit/withdrawal and conservation.
2. Add one production station with deterministic inputs/outputs, capacities and observable jobs.
3. Turn the existing crop rows into plant → grow → harvest → replant with bounded yield.
4. Connect general resource selection and construction site search to these storage/production semantics.
5. Add onboarding, selection/save/history feedback and desktop/mobile usability verification.

All generation and jobs must use accepted commands and versioned snapshots, with replay/fault tests before presentation polish. The exit gate is an actual gather → store → make → cultivate session that survives reload.

### Stage 3 — Deepen the local civilization game

- Add inhabitants and a small job/navigation model, food/needs, resource renewal and settlement progression.
- Expand buildings and environment only where those systems need them; preserve the three visual languages.
- Profile and optimize streaming/rebuilds at representative settlement scale.

**Dependency:** stable storage, production, crop and construction semantics. Animal AI and population behavior should not precede an economy that gives them meaningful work.

### Stage 4 — Player-owned local multi-participant contracts

- Define actor/owner identity interfaces, provenance and transfer semantics.
- Add actor/action/target policy authorization, auditable decisions and revocable grants.
- Add reservations/stock locks, deterministic conflict resolution and recovery.
- Demonstrate at least two local participants transferring/using resources and resolving conflicting actions without claiming network authentication.

**Dependency:** Stage 2 item/ownership semantics. This is the prerequisite for both server transport and Steward permissions.

### Stage 5 — Shared authoritative world, then optional Steward

- Implement authenticated server transport, shared persistence/replication and recovery.
- Expose proposals and command history to a future Steward adapter using exactly the same permissions.
- Prove bounded action, rejection, revocation, auditability and safe failure before granting broader autonomy.

### Stage 6 — Evaluate, rather than presume, chain adoption

- Choose a specific scarce transferable claim that benefits from external ownership.
- Verify official Solana/MagicBlock documentation and run reproducible local/zero-spend experiments before external cost/deployment.
- Compare an ordinary authoritative server/database against chain-assisted settlement for latency, cost, recovery and operational complexity.
- Keep normal game state off-chain and the local game playable without chain availability.

### Suitable parallel-agent tracks

Work can be parallelized at stable interfaces, not by having many agents mutate the same canonical state:

- **Simulation:** storage, conservation, recipes and crop lifecycle with replay tests.
- **Rendering:** edited macro/LOD correctness and measured incremental rebuild design, coordinating on world-read APIs.
- **UX/accessibility:** keyboard focus, touch semantics, panel layout, save/job/history presentation against read-only state/view models.
- **Technical art:** founder proportion/material review and bounded capture comparisons; no silent geometry/version changes.
- **Verification:** portable Playwright infrastructure, physical-device performance plan, save corruption/soak/fuzz tests.
- **Governance/documentation:** dated source-to-record reconciliation, with no authority to mark reviews approved.
- **Research only:** official-document-backed ownership/chain analysis, isolated from production dependencies until a concrete approved experiment exists.

Canonical schema edits, construction semantics and authority policy should have a single coordinating owner; parallel presentation/research work must not redefine them.

## 12. Final judgment

ASTrix has crossed an important threshold: it is no longer just a terrain demonstration or a folder of concept documents. It contains a coherent, test-backed path from deterministic natural terrain to a small persistent human-made place. The voxel/Noxel/faceted-organic distinction is real in both state and rendered imagery. That is meaningful progress.

It has **not** crossed the threshold into a civilization builder. The current session is short and authored; there is no economic reason to gather beyond paying three fixed costs, no storage/production/farming cycle, no people or work, no ownership/shared world, and no autonomous Steward. The large world is broader than the gameplay that currently supports it.

The most credible route is to protect the strong canonical foundation, correct the world/save/UX inconsistencies, finish the bounded art review, and deliver a complete local life loop next. Shared ownership and permissions should follow that loop; networking and the optional Steward should follow those contracts; Solana/MagicBlock should remain an evidence-gated evaluation. This sequence gives ASTrix the best chance of becoming one coherent persistent game rather than a collection of technically impressive but disconnected demonstrations.
