# ASTrix — Project-wide Execution Plan

**Date:** 2026-11-22  
**Status:** Active engineering plan; milestone and art acceptance remain independent.  
**Governing direction:** natural editable world → player-built civilization; player-owned shared-world foundations; optional, permissioned AI Steward; blockchain only where executable evidence supports a concrete need.

## 1. Delivery principles

1. **One game, not a collection of showcases.** Every vertical slice must connect terrain, resources, construction, persistence and player intent through the authoritative command boundary.
2. **Two domains, three visual languages.** Voxel terrain/geology; Noxel architecture and built infrastructure; faceted organic meshes for vegetation, crops and wildlife where appropriate.
3. **Functional acceptance is not visual acceptance.** Automated tests establish behavior; actual production-browser captures establish what was rendered; human/owner art acceptance is still separate.
4. **Version durable design changes.** Structure geometry is authoritative state. Changes require design-versioned planning, compatible snapshot handling and explicit replay verification.
5. **No indiscriminate tokenization.** Ordinary voxels, crops, resources and inventory remain game state. Ownership and external settlement are introduced only for assets/actions that justify them.
6. **Local is explicitly local.** `local-stub / local-simulation-only` is neither authentication nor Solana/MagicBlock enforcement.
7. **Preserve evidence and unknowns.** Failed runs, provisional assets and open decisions remain visible. Green checks do not self-approve a milestone.

## 2. Dependency-ordered workstreams

### A. Consolidate M002 — blocking verification track

**Owner:** core simulation + independent review  
**Depends on:** existing remediation  
**Exit gate:** every blocking finding resolved or explicitly dispositioned by the owner; deterministic fixture/live-world verification, accepted-command replay, exact restoration, rollback, obstruction checks and production debug isolation remain green.

- Independently review persistence/replay, canonical state coverage, construction rollback, adjacent-chunk obstructions and production debug exposure.
- Preserve existing M001/M002 evidence and failed runs.
- Treat the final closure recommendation as a review recommendation, not formal milestone approval.

**Current:** the integrated source passes 116 tests, strict TypeScript and the production build. Earlier M002 implementation runs passed 84 tests; earlier 74-test and 12-browser-check evidence remains preserved separately. Independent review is still pending; these implementation gates are not formal closure. Production gameplay verification is recorded under `13_Integration_and_QA/Evidence/M003-life-browser-20261122/REPORT.md`.

### B. Visual vertical slice — highest-value safe implementation track

**Owner:** simulation content + rendering + technical art  
**Depends on:** no unresolved M002 blocker; REF-002 and Noxel proportion/material review  
**Exit gate:** one integrated founder settlement is demonstrable at construction and gameplay distance, with tests for its authoritative geometry and browser evidence for close/wide/mobile/daylight presentation. Art approval remains explicit and separate.

1. Resolve the working material policy: one structural stone family; shade comes from lighting; architecture participates in shadow receiving as well as casting.
2. Upgrade the founder house with deliberate, nonuniform massing, human-scale openings that are actual voids, a legible floor/roof/foundation hierarchy and an entry related to its approach path.
3. Consolidate path modules into deliberate runs/steps rather than an undifferentiated repeated grid.
4. Keep farm earthwork in voxels and retaining/edge elements in Noxels; replace rectangular green crop bars with restrained faceted organic crop clusters generated deterministically from authoritative crop-row records.
5. Version structure planning/snapshots deliberately. Preserve old saves byte-for-byte when incompatible rather than silently substituting geometry or accepting divergent replay.
6. Verify tests, full replay/restoration and actual application rendering. Label results candidate/provisional until visual acceptance.

**Current:** the design-2 founder candidate has a 19-module house with full-thickness door/window voids, a nine-module stepped path, bounded faceted crop foliage and architecture that casts and receives shadows. Schema-2 commands, snapshots and browser saves preserve legacy schema-1 content separately. The production-preview gate passed nine browser checks: schema-2 genesis/debug isolation, harvest persistence, normal UI construction, exact reload restoration, snapshot-tail replay and wide/close/mobile inspection. Captures were visually inspected and recorded in `13_Integration_and_QA/Evidence/M002-founder-visual-browser-20261122/REPORT.md`; failed and stale-camera attempts remain preserved separately. The founder design still exceeds the provisional 4–9 asset-volume target and remains Review Required; no art approval is claimed.

### C. Integrated playable life loop

**Owner:** gameplay systems + UI + simulation  
**Depends on:** A and the authoritative contracts established by B  
**Exit gate:** a player can gather, construct, store, process and cultivate in one persistent local world through visible, explainable actions; no isolated demos or renderer-owned resources.

Recommended sequence:

1. Storage and stockpoints as owned world structures, with explicit withdrawal/deposit and inventory conservation.
2. A production station with deterministic recipes, inputs, outputs, capacity and observable job state.
3. Crop lifecycle on the existing farm: prepared bed → planting → growth → harvest → replanting; no unbounded free yield.
4. Construction selection/site search connected to storage and production, rather than only three pinned projects.
5. Player orientation, selection and interaction feedback; desktop/mobile usability checks and performance budgets.

Keep resource generation, production and farming inside accepted commands and snapshots. Add replay tests before presentation work.

**Current:** the smallest persistent schema-3 loop is implemented through accepted commands: natural fiber → carried bag → founder stockpile → seeds → farm planting → four-tick growth → food/fiber harvest → ration production and withdrawal. Capacity-limited transfers, reserved production output, deterministic snapshots/replay, and mobile panels are implemented. The full production-browser lifecycle, exact desktop reload, emulated restored-mobile controls, and injected storage-failure feedback are verified in `13_Integration_and_QA/Evidence/M003-life-browser-20261122/REPORT.md`. General site selection, inhabitants/jobs/logistics, physical-device validation, and long-running performance work remain open.

### D. Player-owned shared-world foundations

**Owner:** authority + persistence + security  
**Depends on:** C's item/ownership semantics  
**Exit gate:** executable local multi-participant proofs demonstrate owner-scoped actions, permissions, conflicts and recovery without conflating local tests with networked authentication.

1. Participant/owner identity interface, ownership/provenance records and explicit ownership transfer semantics.
2. Permissioned command authorization: actor, action, target, policy, expected revision and auditable decision.
3. Reservations/stock locks and deterministic conflict handling for concurrent builds, production and storage.
4. Shared authoritative persistence with journal/snapshot integrity and recovery semantics.
5. Transport/server boundary and authenticated remote participants only after local contracts are executable.
6. Steward adapter consumes exactly this command/permission system. Every proposal, authorization, result and rejection is observable and auditable; capabilities are scoped and revocable.

Do not place general gameplay state on-chain. Decide later which scarce, transferable claims actually benefit from external ownership/settlement.

### E. Solana / MagicBlock evaluation — evidence before adoption

**Owner:** external systems research + executable proof  
**Depends on:** D's interfaces and a concrete ownership use case  
**Exit gate:** official documentation citations plus reproducible experiments describe account/state model, identity/session model, delegation/undelegation, latency/cost assumptions, failure/recovery behavior and test environment. No integration claim before code and proofs exist.

1. Map official Solana and MagicBlock capabilities to the specific shared-world requirement.
2. Run isolated, zero-spend/local-validator experiments where supported; obtain approval before external spending or deployment.
3. Compare ordinary authoritative server + database against chain-assisted settlement for the chosen claims.
4. Record rejected options and reasons; keep the core game playable without chain availability.

## 3. Acceptance matrix

| Concern | Automated proof | Runtime proof | Separate decision |
|---|---|---|---|
| M002 | tests, typecheck, build, replay/hash/rollback | production-browser workflow/restoration | independent review + owner closure |
| Noxel visual slice | module/opening/version/material tests | close, wide, mobile and lighting captures | owner art acceptance |
| Playable loop | conservation, lifecycle, persistence tests | complete gather→store→make→cultivate session | gameplay review |
| Ownership | actor/permission/provenance/conflict tests | two-participant conflict/recovery demonstration | authority/security review |
| Steward | shared-command parity and audit tests | bounded/revoked action demonstration | owner policy approval |
| Chain | official-doc trace + executable environment proof | measured experiment results | explicit adoption decision |

## 4. Immediate execution order

1. Incorporate the independent M002 and visual audits; fix any correctness blocker first.
2. Implement and verify the bounded, versioned founder visual slice.
3. Preserve a new, non-overwritten evidence run with honest rendering limitations.
4. Begin storage/production/farming as one dependency-ordered persistent loop, using the visual-slice contracts.
5. Establish local multi-owner permission/provenance contracts before considering a network or chain implementation.

This plan supersedes stale task ordering that treats a standalone Noxel kit or broad content expansion as the next primary deliverable. It does not erase earlier decisions or mark their review gates complete.
