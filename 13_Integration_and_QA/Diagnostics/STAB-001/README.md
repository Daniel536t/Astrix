# STAB-001 · Stabilization diagnostics (2026-11-25)

This is the investigation the owner asked for before any wilderness work. **No game code was changed for it.** Every number comes from headless simulation runs or browser runs on the current build (`6e7fc61`, live).

| Issue | Document | Root cause | Status |
|---|---|---|---|
| M015 device evidence | [M015_device_evidence_assessment.md](M015_device_evidence_assessment.md) | The report came from a real Android tablet (Adreno 710) in Chrome "Desktop site" mode. 143 calls were drawn in the chain-on farm scene, which no earlier probe measured. | Draw-call and hitch fixes deployed in `6e7fc61`, emulated only. **OPEN:** device run 2 required. |
| Bug A, animals standing still | [BUG-A_animals_still.md](BUG-A_animals_still.md) | Proven: (1) animals are placed or born on blocked shelter cells with no way out, and freeze forever; (2) an arrival-radius mismatch (8 dm vs 7 dm) parks animals until their next meal. | Diagnosed. **Open, not fixed.** |
| Bug B, walking through animals | [BUG-B_player_animal_collision.md](BUG-B_player_animal_collision.md) | Proven: the player collides only with static layers. The hashed sim never learns where the player is, and animals route with no occupancy check. | Diagnosed, with a design. **Open, not fixed.** |
| Bug C, slow stewards | [BUG-C_worker_productivity.md](BUG-C_worker_productivity.md) | Measured: steward job-assignment rules can leave approved work with no worker forever; there is no priority for owner work; 34–38 % of time is night; walking takes 22–43 %; hunger grows during sleep. Navigation overhead is under 4 %. | Diagnosed. **Open, not fixed.** |

## Key findings in one line each

- **Bug A:** on seed 1337, 3 of 15 starter animals are frozen from tick 0 (chicken 001, sow 009, mare 014), and 7 of 29 after 3 days, including that sow's piglets. Rules v3 to v6 animals move on 11–13 % of ticks; v1/v2 animals move on 25–27 %. The renderer, herder, feed, night and upgrade were all ruled out as causes.
- **Bug B:** the player walked through a cow, with centres 0.06 m apart. A cow walked through the standing player, 0.10 m apart. Animals shared a 1 m cell 1,106 times in 600 ticks.
- **Bug C:** a woodshed approved after tick 105 was never finished within 1 hour, because the steward turns Ada into a herder and only makes a spare farmer the woodcutter. A new field on a farm with 2 or more fields was never touched in 30 minutes. Villagers walk at 1.3 m/s against the player's 4.2 m/s. A 1.5× speed raise (scratch test) cut the stalled field from 243 to 22 ticks.

## Proposed stabilization milestone: STAB-002 (settlement rules v7)

Every fix below changes saved simulation outcomes. They therefore go behind **settlement rules v7**, reached by one journaled `upgrade_homestead { rules: 7 }`. Rules v1–v6 replay to their recorded hashes unchanged.

The work is four independently testable changes, delivered in this order.

| # | Change | Acceptance criteria |
|---|---|---|
| S1 | **Animal unstick.** Place founding animals, newborns and wander targets only on free walk cells. Walk trapped animals out at upgrade time and whenever their start cell is blocked. Treat an empty route as arrival. Add visible graze/rest states, with time spent recorded per state. | On 15 seeds there are 0 frozen animals after 3 days. Every animal moves in at least 15 % of daytime ticks. Its longest still stretch by day is at most 80 ticks, excluding night rest. Graze and rest are observable in the browser. Behaviour is the same after reload. v1–v6 hashes are unchanged. |
| S2 | **Bodies and presence.** The `tick` command gets an optional quantized player `presence` field. Under v7 the player occupies cells in the shared occupancy map, and animals route around and step aside from them. On the player side, soft contact against drawn animal, villager and wildlife bodies refuses moves that go deeper into a body and pushes out at up to 1.5 m/s. Separation between animals comes in a later stage. | The player cannot pass through any animal (repeatable test, all six species). An animal walking into the standing player stops or detours. In a crowded pen, neither the player nor an animal is held for more than 3 s. No oscillation: separation is monotonic in the test. Fence, gate, door and building tests still pass. Old journals without presence replay identically. |
| S3 | **Work priority and steward rules.** Priority classes: safety, then owner orders (approved sites and marked fields), then urgent upkeep, then routine. Routine work ages up so it cannot starve. Any idle villager may help with owner orders. Fix the steward's woodcutter rule, and save its cooldown. Interrupts are allowed only with empty hands. Villagers eat before bed, and hunger rises more slowly during sleep. | An approved woodshed with no hand-assigned roles is finished within 1 in-game day. A 6×6 field marked on a busy farm is started within 30 ticks and sown within 60. Routine chores are never delayed more than 120 ticks. Nothing is teleported, carried loads are never dropped, and reservations stay correct (M012/M014 probes pass). Travel, wait, work and idle time are reported separately. |
| S4 | **Evidence-tuned walking speed.** Raise villager speed from 1.3 to 1.95 m/s (1.5×), and batch trips where a load allows it. | Measured before and after on the S3 scenarios: total task time falls by at least 30 %. The no-teleport check still passes at 1.0 of the walking allowance. |

**Device gate (M015, run 2) runs in parallel.** Procedure and pass criteria are in the M015 assessment. Birds stay blocked until M015 passes and the bird reference sheets are in `05_Noxel_Studio/Asset_Sheets/`.

**Risks:**
- v7 must not leak into v1–v6 replays. Each change needs a pinned-hash test.
- Presence makes sim outcomes depend on the player's journaled position. This is deterministic because it is journaled, but it increases the size of tick entries. Quantize presence and send it only when it changes.
- Faster villagers interact with gate hold times and queueing, so the M012 tests must be re-run.
- Wildlife collision is not hashed, so it needs its own tests.
