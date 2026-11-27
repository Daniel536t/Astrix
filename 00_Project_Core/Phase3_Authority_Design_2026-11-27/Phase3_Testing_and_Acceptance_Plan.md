# Phase 3: Isolated Development, Testing & Acceptance Plan

**Date:** 2026-11-27  
**Status:** **[PROPOSAL]** — Verification strategy for Phase 3.1 (Resources & Inventory) and subsequent phases before any production devnet change.

---

## 1. Isolated Development Strategy (Zero Risk to Production `Gge4…`)

Following the exact discipline that succeeded in Phase 2:

1. **Preserve Production Program & Backups Untouched:**
   - Never deploy experimental Phase 3 code to `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy`, never touch slots `0–31`, demo settlement `4PV6…`, passports, registry, treasury, or production cranks.
   - Keep existing backups (`13_Integration_and_QA/Evidence/PHASE2-clock-vrf-migration/backup-manifest/` and `prod-preflight-backup/`) intact and read-only.
2. **Three-Tier Verification Ladder:**
   - **Tier 1 — Local Rust Unit + LiteSVM Tests (`cargo test`):** Fast (< 5 s), deterministic tests of every conservation invariant, reservation conflict, nonce replay, tool durability, and CU measurement (`< 100k` CU per ix).
   - **Tier 2 — Local TypeScript + Browser Sim Tests (`cd Game && npm test`):** Preserve all **585/585** existing settlement (v1–v8) and wilderness (v1–v9) fixture hashes byte-identical; add Phase 3 client-adapter tests (reconciler, pending-action UI, error mapping).
   - **Tier 3 — Isolated Disposable Devnet Program + Real MagicBlock ER (`devnet-eu.magicblock.app`):** Deploy Phase 3.1 to a fresh disposable program ID (keypair outside the repo), run the full 11-scenario integration suite against real ER `2.0.5` + real VRF oracle, then undelegate all test accounts, verify `0` Hydra cranks, and `solana program close` to reclaim ProgramData rent (`~0.03 SOL` net cost, matching the Phase 2 disposable benchmark **[MEASURED]**).
3. **Browser & Real-Device Gate:**
   - Before production devnet rollout, verify the linked wilderness client on desktop Chromium and on the owner's physical phone (`HANDOVER.md` §7–§8), confirming `0` console/page errors and render budget `< 120` draw calls / `< 250k` triangles.

---

## 2. Mandatory Phase 3.1 Test Matrix (All 11 Required Scenarios)

| # | Scenario | Setup & Stimulus | Required Authoritative Outcome (On-Chain) | Acceptance Evidence |
|---:|---|---|---|---|
| **1** | **Valid gathering** | Player within `3.0 m` of undepleted pickup `p:0,0:2` (branch) in `ChunkLedger`, bag `0/60`, `nonce = 1` | `pickup_depleted` bit flipped `0 → 1`; `PlayerInventory.items[BRANCH] += 1`; `action_nonce = 1`; `JournalEvent` emitted | Tx sig (`err: null`), pre/post PDA diff, CU log |
| **2** | **Invalid gathering** | (a) Re-pick same depleted node `p:0,0:2`; (b) gather from `25 m` away (`> reach`); (c) assert `qty = 10` on 1-unit node | Rejected with `NodeAlreadyDepleted` / `OutOfReach` / invalid arg; `items` and `action_nonce` unchanged | Failed simulation/tx log with exact error code; zero state delta |
| **3** | **Insufficient tool capability** | (a) `chop_tree` with bare hands (`equipped = 255`); (b) `chop_tree` with `stone_axe` at `durability = 0`; (c) `mine_deposit` with `stone_axe` | Rejected with `NoTool` / `ToolBroken` / `WrongTool`; tree HP & `ChunkLedger` untouched | Exact Anchor error code in logs; tree undamaged |
| **4** | **Inventory full** | Bag at `54/60` weight; attempt `transfer_item` of 1 log (weight `9` → `63 > 60`) | Rejected with `BagFull`; log remains in source `Container`, bag stays `54/60` | Exact conservation check: `sum(source + bag)` unchanged |
| **5** | **Duplicate transaction** | Re-submit identical `pickup_node` or `transfer_item` with already-used `action_nonce = 1` | Rejected with `NonceAlreadyUsed`; zero duplicate items minted or moved | Tx error log + unchanged `items` array |
| **6** | **Two projects reserving same resources** | `Container(12)` holds `2` free logs; submit `place_site(A)` (needs 2 logs) and `place_site(B)` (needs 2 logs) concurrently | Exactly **one** succeeds (`Container(12).reserved[LOG] = 2`); the second fails atomically with `Unfunded` (`free = 0`) | Both tx sigs (1 `ok`, 1 `Unfunded`); `reserved <= items` holds |
| **7** | **Disconnect during an action** | Client submits `chop_tree` (`nonce = 5`), drops WebSocket before receiving confirmation | On-chain ER commits `nonce = 5` atomically; client has no split-brain local mint | Compare ER PDA state vs client post-reconnect state |
| **8** | **Reconnect and catch-up** | Client reconnects after 20 s offline, fetches `PlayerInventory` + `World`, calls `settle()` | `world.tick` catches up `+10` ticks (`floor(20/2)`); client syncs `action_nonce = 5`, axe durability, and bag exactly | Pre/post `tick` + `sha256` mirror match |
| **9** | **Failed transaction & retry** | Submit `transfer_item` with stale/wrong precondition (`OutOfReach`), then move in reach and retry with valid `nonce` | First tx rolls back atomically (nonce not consumed); retry with same next `nonce` succeeds cleanly | Both tx logs + continuous `action_nonce` sequence |
| **10** | **Recovery & event replay** | Undelegate `World` + `PlayerInventory` + `Container` + `ChunkLedger` to base devnet; compare `sha256` hashes; re-delegate; replay `JournalEvent` hash chain | Base-layer `sha256` equals pre-undelegation ER `sha256` byte-for-byte; `journal_hash` reproduces from genesis through all events | Exact hash table + journal verification output |
| **11** | **Client manipulation attempts** | Crafted raw tx attempting: (a) forge `harvest(LOG, 99)`; (b) spoof another player's `PlayerInventory` signer; (c) drop reserved logs (`free < qty`); (d) exceed `SWINGS_PER_TICK = 4` in one tick | All 4 rejected on-chain (`InvalidResource` / `NotOwner` / `ReservedItem` / `RateLimited`); zero unauthorized state change | 4 rejected tx logs + unchanged account hashes |

---

## 3. Acceptance Criteria (Three-Level Evidence Standard, `HANDOVER.md` §2)

- **Implemented:** Rust program + IDL + TypeScript client adapter compiled cleanly (`cargo-build-sbf`, `npx tsc --noEmit`), zero Three.js imports in `Game/src/sim`, existing 585/585 tests pass untouched.
- **Verified:** All 11 mandatory scenarios above pass on **LiteSVM AND on an isolated disposable devnet program on `devnet-eu.magicblock.app`**, with full tx signatures, CU logs, hash comparisons, and clean disposable teardown recorded in `13_Integration_and_QA/Evidence/PHASE3-1-resources-inventory/REPORT.md`.
- **Owner-Accepted:** Owner reviews evidence report, completes physical-phone walkthrough on the live candidate, and grants explicit written approval before production devnet deployment.
