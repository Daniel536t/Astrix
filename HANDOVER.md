# ASTrix handover for the next coding agent (2026-11-26)

Read this first, then `00_Project_Core/` and the evidence reports it points to. Everything below was true when this was written. Verify before you rely on it.

## 1. What ASTrix is

ASTrix is a browser voxel survival-to-civilization game: Three.js, TypeScript and Vite, with a Solana/MagicBlock layer beside it.

- **Philosophy:** "From one pair of hands to a civilization". See `00_Project_Core/Wilderness_Architecture_2026-11-25.md`.
- **Two scenarios:**
  - the **settlement** (farm, villagers, livestock), started at founding;
  - the **wilderness** (bare start, gather, craft, fell, build, map, mine, smelt, wildlife, hunting).

  Both save locally in the browser, each under its own save key.
- **Live site:** https://astrix.nyc.boxd.sh.
- **Repo:** https://github.com/Daniel536t/Astrix. Work happens on branch **`deploy/boxd`**. PR #1 (`deploy/boxd` into `main`) is **open and must not be merged without the owner's approval**. `main` is stale.

## 2. Rules the owner set (non-negotiable)

- **Authority:**
  - The simulation is authoritative; the renderer only renders.
  - AI and stewards propose actions and never invent outcomes.
  - `Game/src/sim` must not import three.js.
- **Saves:**
  - Never reset, convert, overwrite or delete an existing save, especially the owner's farm.
  - Every simulation rule change is versioned and journaled, and old saves must replay to their pinned hashes:
    - settlement uses `HOMESTEAD_*` rules v1..v8;
    - wilderness uses content v1..v9 via `upgrade_wilderness`;
    - fixtures are in `Game/tests/fixtures/`.
- **Evidence:**
  - Use three acceptance levels: **Implemented**, **Verified** (reproducible evidence), and **Owner-accepted** (only the owner can grant it).
  - Never invent test results, measurements, commit hashes, release IDs or deployment evidence.
  - Write a report only after reading the result.
- **Order of operations:**
  - Never run dependent steps in parallel: implement, then commit, then push, then confirm on the remote, then deploy, then live-check, then record.
  - Deploy only a commit confirmed on GitHub (`git fetch` plus `gh api repos/Daniel536t/Astrix/branches/deploy/boxd`).
- **Off limits:**
  - **Mainnet** is completely out of scope: no transactions, deployments or spending.
  - Devnet changes need explicit owner approval, after you show the migration results and the exact proposed change.
  - No force-push, no history rewrite, no merging PR #1, no new recurring costs, no identity or wallet security changes, without approval.
  - Do not start W9 or W10, do not add new animal species, and do not generate horse model sheets until the owner approves.
- **Never commit** the stray untracked `05_Noxel_Studio/Asset_Sheets/2026-11-24_animals/Animals` file or any key or keypair file.

## 3. Layout

| Path | What |
|---|---|
| `Game/` | The game. `src/sim` (rules), `src/app` (session, journal, UI controllers), `src/render`, `src/ui`, `src/chain` (browser chain view and identity), `tests/`, `tools/run-tests.mjs` |
| `chain/` | Anchor program `astrix-settlement` (`programs/astrix-settlement/src/lib.rs`, `v2.rs`), IDL, `client/scripts/` CLI, `docs/ACCOUNT_LAYOUTS.md` |
| `deploy/boxd/` | `deploy.sh` and `nginx.conf` |
| `00_Project_Core/` | Architecture and decision docs, `Controls.md`, `MagicBlock_Research_2026-11-26/` (eight research docs plus executive summary) |
| `13_Integration_and_QA/Evidence/` | One folder per milestone, each with a `REPORT.md` |
| `13_Integration_and_QA/Diagnostics/STAB-001/` | Diagnostics of earlier bugs |

## 4. Build and test

- **Requirements:** Node 22 (developed on v22.23.4).
- **Commands:** `cd Game && npm ci && npx tsc --noEmit && npm test && npm run build`. The last run was 585 of 585 passing.
- **Known flaky timing tests:** two wall-clock tests sometimes fail on a loaded machine; the pre-change code fails them equally.
  - `m004` "v2 chunk generation stays within budget per chunk", limit 60 ms;
  - `m002` "candidate search is cost-ranked", limit 100 ms.

  Do not relax them. Re-run them in isolation, and record the failure honestly.
- **Build output:** `npm test` regenerates `Game/tests/.build/*.mjs` and `npm run build` regenerates `Game/dist`. Both are tracked, so commit them with feature commits.

## 5. Hosting on boxd (the live server)

- **Machine:** `astrix`, 1 vCPU / 4 GiB, region nyc, URL `astrix.nyc.boxd.sh`. nginx serves static files; boxd terminates TLS.
- **Install the CLI:**
  1. Run `curl -fsSL https://boxd.sh/downloads/install.sh | sh` (add `--dir <path>` to choose where).
  2. Authenticate with `boxd auth login`, or `export BOXD_TOKEN=<API key from the owner's boxd dashboard>`.

  The owner must give you an API key. Never commit it.
- **Deploy:** run `BOXD=<path to boxd binary> ./deploy/boxd/deploy.sh astrix` from the repo root.
  - The script runs `npm ci`, typecheck, the tests and the build. **It stops without uploading if any test fails**, including the flaky ones; if so, re-run it.
  - It then uploads to `/var/www/astrix/releases/<UTC timestamp>-<short commit>` and switches the `current` symlink.
  - Roll back with `deploy.sh --rollback astrix`.
- **Verify a deploy** after the script returns:
  - the served bundle: `curl -s https://astrix.nyc.boxd.sh/ | grep -o 'assets/index-[^"]*js'`;
  - the bundle's build stamp `commit:"<sha>",dirty:false`, found by fetching the bundle;
  - the release in use: `boxd machine exec astrix -- bash -c 'readlink -f /var/www/astrix/current'`.
- **Incident (2026-11-26):** the server disk went read-only after I/O errors (`dmesg` showed ext4 `emergency_ro`). `boxd machine reboot astrix` fixed it, with the owner's approval. If deploy fails with "Read-only file system", stop and ask the owner.
- **Current live release:** `20261126T224414Z-c28cd1d`, bundle `index-BYLgLfLr.js`, which is the full-world map build.

## 6. MagicBlock and Solana devnet

- **Program:** `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy` on Solana **devnet**. The upgrade authority is the devnet wallet `GVbu…`.
- **Rollup endpoint:** `https://devnet-eu.magicblock.app`, overridable with `ASTRIX_ER_RPC`. The validator runs core 2.0.5 and its tasks are executed by MagicBlock's Hydra cranker key `8hwz…`.
- **Wallets:** the owner must transfer these privately; never commit them.

  | Env var | File | Purpose |
  |---|---|---|
  | `ASTRIX_WALLET` | `astrix-devnet.json` | Upgrade authority and payer |
  | `ASTRIX_SESSION` | `astrix-session.json` | Session key |
  | (none) | `astrix-program.json` | Program keypair |

- **CLI:** `cd chain/client && npm ci && npx tsx scripts/astrix.ts <command>`. Commands include `setup-worlds`, `schedule-worlds [iterations]` and `cancel-task <id>`. Read-only helpers: `scripts/crank-inventory.ts`, `crank-observe.ts`, `crank-scan.ts`.
- **On-chain accounts:** a demo settlement `4PV6…`, a registry, 32 world slots with passports, and a treasury.
  - Quick Play gives a browser-key world protected by a passkey; Wallet Play gives a wallet-owned world.
  - The website shows the demo settlement read-only in the "MagicBlock" panel.
  - **No game action is sent to the chain yet.**
- **Cranks:** tick cranks 742001 (settlement), 742101 (slots 0–15) and 742117 (slots 16–31).
  - They were renewed in place on 2026-11-26 and run until about 2026-12-29.
  - Checkpoint cranks 743000 and 743008 are **stalled** because the treasury was drained by commit fees. Refilling it is awaiting the owner's decision.
  - Evidence: `13_Integration_and_QA/Evidence/MB004-crank-renewal/REPORT.md`.
- **Phase 2:** world clock, VRF binding, fair world creation, escape hatch and in-place migration. It is committed in `e4c4118` and **verified locally only, not deployed to devnet**.
  - The proposed devnet procedure and rollback are in `13_Integration_and_QA/Evidence/PHASE2-clock-vrf-migration/REPORT.md` §7.
  - The upgrade **must keep the `tick` instruction**, now an alias for `settle`.
  - The local toolchain was Agave v4.4.1, Anchor 1.0.2, a local MagicBlock ER 2.0.3, Hydra and the VRF oracle (`run-stack.sh` in that folder).
  - **Awaiting owner approval.**
- **Research:** `00_Project_Core/MagicBlock_Research_2026-11-26/`. Main facts:
  - MagicBlock runs only Solana programs.
  - The full simulation can't run on-chain.
  - There is no SLA, RTO or RPO.
  - Self-hosting needs a BSL licence and MagicBlock's whitelisting.
  - VRF results are proof-checked on-chain.

## 7. Status by milestone (none of these is owner-accepted)

| Item | State | Evidence |
|---|---|---|
| W1–W3 wilderness, gathering, felling | Live, verified | `Evidence/W1…`, `W2…`, `W3…` (W2 and W3 have correction notes) |
| W4 build anywhere | Live candidate; owner's phone walkthrough pending (campfire bug and bag size 60 fixed) | `Evidence/W4-build-anywhere/REPORT.md` |
| W5 map, W6 mining and smelting, W7 persistent wildlife, W8 hunting | Live, each proposed **Partial** | `Evidence/W5-W8/FINAL-REPORT.md` |
| Full-world map (no fog, all deposits, tap to route) | Live, Verified | `Evidence/FINAL-MAP/REPORT.md` |
| M015 mobile device gate | Open: needs a 20+ minute device run (draw calls 143 → 86 confirmed) | `Evidence/M015-mobile-verification/` |
| STAB-002 | Accepted, with recorded limitations | `Evidence/STAB-002-stabilization/REPORT.md` |

## 8. Next work, in the owner's order (final integration phase)

1. **Owner walkthroughs:** W4–W8 on a phone. Fix what the owner reports.
2. **Phase 2 on devnet:** after approval, run the procedure in the PHASE2 report.
3. **Phase 3, MagicBlock game integration (wilderness first; the farm stays local):**
   - Send wilderness state-changing commands to the program, which validates their preconditions.
   - Never trust a client report like "give me 6 logs".
   - Make the MagicBlock panel show live values: tick, settlers, stock, last VRF result, connection status.
4. **Phase 4, recovery and validator migration:** test undelegate and re-delegate, the escape hatch, and the owner's test: disconnect, stop the scheduler, wait, restart, reconnect.
5. **Wallets:** Solana Wallet Standard / wallet-adapter (Phantom, Solflare, Backpack and others), covering connect, disconnect, account change, network checks and signing.
6. **Interface redesign:** the whole UI, after integration settles. Keep the world the focus, and keep mobile usable.
7. **Final integration and release audit.**

## 9. Browser testing tips

- Headless Chromium uses software GL and runs at about 1–3 fps, so frame-rate numbers there are meaningless. Draw calls and triangles are meaningful.
- Read `window.__metrics` (fields such as `wild`, `fauna`, `homestead`, `rendererCalls`, `rendererTriangles`).
- To open a wilderness world, set these in localStorage:
  - `astrix:entered:v1=1`;
  - `astrix:worlds:v1={"v":1,"worlds":[{"id":"w1","seed":1337,"generatorVersion":2,"created":<ms>,"spawn":{"x":-82,"z":-172}}]}`;
  - `astrix:world:active:v1=w1`.
- Useful URL parameters:
  - `?chain=0`: no MagicBlock view;
  - `?perf=1`: device perf overlay and report;
  - `?quality=low|medium|high`;
  - `?timescale=N`: development time-lapse;
  - `?worlds=1`: world list;
  - `?multidraw=0`: draw-path fallback.
- Render budget: **under 120 draw calls and 250k triangles**. Never reach it by shrinking animals or reducing close-up quality.
