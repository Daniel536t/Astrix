# ASTrix

**ASTrix** is a 3D stylized Noxel wilderness-to-civilization survival and settlement game built with Three.js and a deterministic TypeScript simulation, integrated with **Solana Devnet** and **MagicBlock Ephemeral Rollups (ER)** (delegated world slots, real-time clock cranks, MagicBlock VRF, session keys, and Solana base-layer checkpoints).

- **Live Playable Build:** https://astrix.nyc.boxd.sh
- **Solana Devnet Program (`Gge4…GRdy`):** [Solana Explorer (Devnet)](https://explorer.solana.com/address/Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy?cluster=devnet)
- **Live MagicBlock ER Demo Settlement:** [MagicBlock ER Explorer](https://explorer.solana.com/address/4PV6Ks9yUnfMd54vtmbYobM4RZza3ZtsM6zxczSmaxzw?cluster=custom&customUrl=https%3A%2F%2Fdevnet-eu.magicblock.app)

---

## Project Overview

ASTrix follows a **Nothing from Nothing** design philosophy in its Wilderness progression: you begin alone with basic clothing, bare hands, and an empty bag, and work your way up through foraging, forestry, toolmaking, shelter building, cartography, mining, smelting, bow hunting, taming and riding wild horses, finite-stock merchant bartering, and recruiting settlers into a living community.

Every simulation rule in `Game/src/sim/` is pure, deterministic TypeScript (zero Three.js imports), journaled, and validated on save/reload.

### Worlds Available on Launch

When you open ASTrix, you can choose between:

1. **Founder’s Settlement (`DEMO`)** — A guided showcase world featuring a pre-built homestead loop (villagers, domestic herds, field planning, steward policies) and the 3D **MagicBlock ER Outpost** (`View ER Outpost`).
   - *Resource provenance:* Starts with a preloaded demo starter kit (`24 wood`, `48 stone`, plus `20 fiber`, `10 food`, `6 seed` on homestead founding — **preloaded, not minted**) so visitors can test building and farming immediately.
2. **New Wilderness World (Recommended Adventure)** — Strict **Nothing from Nothing**: bare hands, empty bag (`0` resources), untamed 2048 × 2048 m voxel world saved locally per world slot.
3. **MagicBlock On-Chain World (`Quick Play` / `Wallet Play` / `Recover with Passkey`)** — Claims one of 32 delegated on-chain world slots on MagicBlock ER (`devnet-eu.magicblock.app`) with gasless session keys, live ER clock cranks, MagicBlock VRF prospecting, and Solana Devnet checkpoints.

> **Architecture transparency:** On-chain MagicBlock ER currently executes world ownership, session keys, live ER ticks/cranks, VRF prospecting, and the on-chain settlement/outpost state (`Gge4…GRdy`). Full 3D Wilderness gameplay (W1–W10) runs locally in the deterministic client simulation; the specification for moving Wilderness resources, tree felling, and inventory authoritatively onto MagicBlock ER is documented in `00_Project_Core/Phase3_Authority_Design_2026-11-27/`.

---

## Camera Modes & Controls

### Walk Mode vs. Builder View
- **Walk Mode (`Explore` — default):** Direct third-person control of your protagonist for gathering, swimming, hunting, building, and riding. While walking, the top button reads **`Builder view`** (click or press **`Tab`** to switch).
- **Builder View (`Overview`):** Your character stands still while the camera pulls up to an overhead free-orbit view (`WASD` pans, drag orbits, wheel zooms) for surveying terrain or planning buildings. The world clock, animals, villagers, and water remain live unless paused (`P`). Click **`Walk`** or press **`Tab`** to return.

### Complete Keyboard, Mouse & Touch Controls

| Action | Desktop Control | Touch / Mobile Control |
| --- | --- | --- |
| Move / Steer | `W` `A` `S` `D` | Left virtual joystick |
| Sprint / Faster Ride Gait | Hold `Shift` | Sprint toggle / Gait button |
| Jump / Swim Upward | `Space` (tap to jump; double-tap higher jump; hold in water to swim up) | `Jump` button |
| Dive Underwater | Hold `C` while swimming | `Dive` button |
| Interact / Gather / Chop / Mine / Butcher / Build / Mount | `E` (hold `E` to keep swinging axe/pickaxe/hammer) | `Use` button |
| Target Specific Tree / Object | Left-click object in 3D view | Tap object |
| Aim & Fire Bow (when equipped) | Hold **Right-click** or `Q` to draw, aim, release to shoot | Hold **`Bow`** button, drag to aim, release |
| Orbit Camera / Zoom | Drag mouse · Mouse wheel | Drag screen · Pinch / Zoom buttons |
| Bag, Crafting, Stockpiles, Horses & Community | `I` or click **`Bag`** | Tap **`Bag`** |
| Wilderness Build Placement Mode | Click **`Build`** (or `G` in Demo Settlement) | Tap **`Build`** |
| Full World Map & Waypoints (Wilderness) | `M` or click top-right Minimap (`Esc` closes) | Tap top-right Minimap |
| Plant Field Banner (Portable Waypoint) | `V` | `Plant` button |
| Channel Return Home (Spawn or Claimed Shelter) | `R` (hold still while channeling) | `Home` button |
| Channel Return to Field Banner | `T` (hold still while channeling) | `To banner` button |
| Switch Walk ↔ Builder View | `Tab` or top **`Builder view` / `Walk`** button | Tap **`Builder view` / `Walk`** |
| Toggle MagicBlock Panel | Click **`Hide MagicBlock` / `MagicBlock`** (also `M` in Demo Settlement) | Tap **`MagicBlock`** |
| Pause / Resume World Clock | `P` | Pause in controls |
| Time-of-Day Shortcuts (Demo / Inspection) | `1` Dawn · `2` Noon · `3` Dusk · `4` Midnight · `[` / `]` Speed | Settings |
| Demo Settlement Panels | `F` Plan field · `G` Build · `B` Build panel · `I` Settlement panel · `H` Gather | **`Farm`** / drawer tabs |

---

## How to Play: Wilderness-to-Civilization Guide

### 1. Foraging, Vitals & Survival (W1–W2)
- **Vitals HUD (top center):**
  - **Health** (red bar) — Drops from drowning or starvation; wakes at your claimed Lean-to shelter (or spawn) if depleted.
  - **Stamina** (gold bar) — Used by sprinting, jumping, and mounted galloping; regenerates while resting or walking.
  - **Breath** (blue bubbles, shown underwater) — Drains while submerged (`C`); refills immediately at the surface.
  - **Hunger** (shown in HUD & Bag) — Rises over time; eat **berries**, **mushrooms**, **cooked mushrooms**, or **cooked meat** from the **`Bag`** (`I`).
- **Starting Forage:** Walk near ground pickups (`branch`, `stone`, `fiber`, `grass`, `berries`, `mushroom`) and press **`E`** to pick them up. Your bag uses a real weight capacity (`60` units).

### 2. Swimming & Underwater Diving (M011)
- Walk into deep rivers, lakes, or ocean water to transition smoothly from wading to swimming.
- **Treading water:** Release movement keys to float effortlessly with head and shoulders above the water line — breath never drops at the surface.
- **Surface breaststroke:** Hold `W`/`A`/`S`/`D` to swim forward with breaststroke arm pulls, whip kicks, and a speed-scaled water-foam ripple ring.
- **Diving & Surfacing:** Hold **`C`** to dive head-down underwater (breath bubbles begin ticking down). Release **`C`** to float back up naturally, or hold **`Space`** to swim upward faster. Swim straight onto any shoreline bank to climb out.

### 3. Forestry & Timber Logistics (W3)
- Craft a **Stone Axe** by hand (`1 branch + 1 stone + 2 fiber`, or `1 cord`) and equip it in the **`Bag`**.
- Walk up to a tree (or click to target it) and press/hold **`E`** to chop. Each swing spends axe durability and damages the tree until it falls into a real trunk on the ground.
- Press **`E`** on a fallen trunk to buck it into heavy **logs**.
- Open **`Bag`** → **Mark a log stockpile** at a clear spot, carry logs there, and press **`E`** to deliver them (or store logs inside a **Log Store** building).

### 4. Tools & Complete Crafting Reference

#### Hand Crafting (Available Anywhere via `Bag`)
| Recipe | Inputs | Output | Purpose |
| --- | --- | --- | --- |
| **Stone axe** | `1 branch`, `1 stone`, `2 fiber` | `1 Stone axe` (60 dur.) | Fell trees, buck trunks, build early timber frames, split logs into planks |
| **Stone axe (cord)** | `1 branch`, `1 stone`, `1 cord` | `1 Stone axe` (60 dur.) | Alternate cord-bound stone axe |
| **Cord (twisted fibre)** | `2 fiber` | `1 cord` | Lashings for tools, shelters, bows, tack, and gear |
| **Cord (braided grass)** | `3 grass` | `1 cord` | Alternate cord from wild grass |

#### Workbench Crafting (Stand Within Reach of a Built Workbench)
| Recipe | Inputs | Required Tool | Output | Purpose |
| --- | --- | --- | --- | --- |
| **Planks** | `1 log` | Stone axe | `2 plank` | Building walls, chests, storage sheds, trading posts, bartering |
| **Stone pickaxe** | `1 branch`, `2 stone`, `1 cord` | — | `1 Stone pickaxe` (60 dur.) | Mine discovered mineral deposits (iron, copper, coal, clay, sand, gravel) |
| **Hammer** | `1 branch`, `1 stone`, `1 cord` | — | `1 Hammer` (80 dur.) | Construct Storage Sheds, Trading Posts, and craft Wooden Chests |
| **Stone knife** | `1 stone`, `1 branch`, `1 fiber` | — | `1 Stone knife` (40 dur.) | Butcher hunted carcasses; shape bows, arrows, tack, and leather gear |
| **Wooden chest** | `4 plank`, `1 cord` | Hammer | `1 chest` | Required component for Storage Sheds |
| **Bow** | `2 branch`, `2 cord` | Stone knife | `1 Bow` (150 dur.) | Ranged hunting weapon (visible on protagonist when equipped) |
| **Arrows (×4)** | `1 branch`, `1 stone`, `2 fiber` | Stone knife | `4 arrow` | Lethal hunting ammunition (missed arrows can often be recovered) |
| **Blunt arrows (×4)** | `1 branch`, `1 fiber` | Stone knife | `4 blunt_arrow` | Non-lethal stunning shots |
| **Leather saddle** | `3 hide`, `2 cord`, `1 iron_ingot` | Stone knife | `1 saddle` | Equip onto a tamed horse (along with bridle) to mount & ride |
| **Riding bridle** | `1 hide`, `2 cord`, `1 iron_ingot` | Stone knife | `1 bridle` | Leather headstall & iron bit for mounted steering |
| **Leather armour** | `4 hide`, `2 cord`, `1 iron_ingot` | Stone knife | `1 leather_armour` | Unlocks visible pauldrons, chest harness, bracers & adventurer boots |
| **ASTrix star cape** | `2 hide`, `4 fiber`, `2 cord` | Stone knife | `1 astrix_cape` | Unlocks the iconic red-orange cape with white ASTrix star |

*Visual Equipment Progression:* Your protagonist starts with **zero visible gear** (basic tunic, bare hands). Tools, bow, quiver, carried logs, leather armour, and the ASTrix star cape only appear on your 3D character once legitimately crafted or bartered and equipped.

### 5. Multi-Stage Building, Cooking & Smelting (W4 & W6)
Click **`Build`**, choose a structure, position the green footprint on valid dry terrain (rotate as needed), and place the construction site. Deliver each stage's real materials and swing (`E`) with the required tool to finish every stage.

| Building | Footprint | Prerequisites | Build Tool | Total Materials | Utility |
| --- | --- | --- | --- | --- | --- |
| **Lean-to shelter** | 3 × 2 m | None | Hands | `6 branch`, `2 log`, `2 cord` | Claim as your **home & respawn point** (`R` returns here) |
| **Campfire** | 2 × 2 m | None | Hands | `6 stone`, `3 branch` | Fuel with branches (`1 min`) or logs (`5 min`); cooks mushrooms & raw meat |
| **Workbench** | 2 × 1 m | None | Stone axe | `2 stone`, `3 log` | Unlocks all Workbench crafting recipes within reach |
| **Log store** | 2 × 2 m | None | Stone axe | `2 stone`, `2 log`, `4 branch` | Stores `120` weight of items (up to 13 logs); enables settlement storage |
| **Clay smelter** | 2 × 2 m | None | Hands | `6 stone`, `4 gravel`, `10 clay`, `4 sand`, `2 branch` | Bloomery furnace for smelting mined ore + coal into ingots |
| **Storage shed** | 3 × 3 m | Workbench + Hammer | Hammer | `4 stone`, `2 log`, `6 plank`, `1 chest` | High-capacity storage (`300` weight) |
| **Trading post** | 3 × 3 m | Workbench + Hammer | Hammer | `3 stone`, `3 log`, `2 cord`, `4 plank` | Unlocks finite **Merchant Barter**, **Settler Recruitment**, and the **Depot** |

#### Smelting Recipes (at a Finished Clay Smelter)
| Recipe | Inputs | Duration | Output |
| --- | --- | --- | --- |
| **Iron ingot (bloom)** | `2 iron_ore` + `2 coal` | 45 ticks (90 s) | `1 iron_ingot` |
| **Copper ingot** | `2 copper_ore` + `1 coal` | 30 ticks (60 s) | `1 copper_ingot` |

### 6. Exploration, Cartography & Fast Travel (W5)
- **Minimap & Full Map (`M`):** Terrain, coastlines, rivers, forests, and mineral deposits are revealed dynamically as you explore. Open the full map (`M`) to inspect biome landmarks, discovered deposits, buildings, and set a **waypoint** (displays a live directional route pill).
- **Banners & Channelled Return:**
  - Press **`V`** on dry ground to plant your portable **Field Banner**.
  - Press **`R`** to channel back to your **Home** (spawn or claimed Lean-to shelter).
  - Press **`T`** to channel back to your **Field Banner**. Moving interrupts channeling.

### 7. Geology & Mining (W6)
- As you explore hills, cliffs, riverbanks, and beaches, you automatically discover real geological deposits: **Iron ore**, **Copper ore**, **Coal**, **Clay**, **Sand**, and **Gravel**.
- Equip your **Stone Pickaxe** and press/hold **`E`** next to any discovered deposit to mine it into your bag. Use clay, sand, gravel, and stone to build a **Clay Smelter**, then smelt **Iron Ingots** with coal for horse tack and armour.

### 8. Wildlife & Bow Hunting (W7–W8)
- Living wildlife roams the wilderness and reacts to your presence, movement, and sound.
- Craft a **Bow** and **Arrows** (or **Blunt Arrows**) at the Workbench using a **Stone Knife**, then equip the Bow.
- Hold **Right-click** or **`Q`** (mobile: hold **`Bow`**) to draw, aim with the reticle, and release to fire a ballistic arrow.
- Equip your **Stone Knife**, kneel by a hunted carcass, and press **`E`** to butcher it for **`raw_meat`** (cook on a lit Campfire into **`cooked_meat`**) and **`hide`** (for saddles, bridles, leather armour, and cape).

### 9. Wild Horses, Taming & Mounted Riding (W9)
- Wild herds roam the wilderness in **4 Noxel coat variants** (`paint`, `brown`, `white`, `black`) with distinct temperaments (`calm`, `spirited`, `shy`) and animated 20-bone rigs (13 animation clips). Wild horses spawn with zero tack.
- **Progressive Taming (never 1-click):**
  1. Approach a wild horse calmly (within `4.5 m`) carrying **`berries`** or **`grass`**.
  2. Feed the horse via the **`Bag` → Horses** panel (or interact). Each feed respects a cooldown (`2` ticks) and builds **Trust (`0 → 100`)**.
  3. At `100` trust, the horse becomes **Tamed**.
- **Tack & Riding:**
  1. Craft or barter a **Leather Saddle** and **Riding Bridle**, then fit both onto your tamed horse (visible modular 3D saddle & bridle appear on the horse).
  2. **Mount** to ride across the 2048 m world using **3 gaits**:
     - **Walk:** `4.8 m/s` (recovers horse stamina)
     - **Trot:** `8.6 m/s` (light stamina use)
     - **Gallop:** `13.2 m/s` (requires `≥ 15` stamina; drains stamina while sprinting)
  3. Dismount anytime; horse positions, trust, tack, and stamina persist across saves and reloads.

### 10. Trading Post, Finite Barter & Settlers (W10)
Build a **Trading Post** (plus any settlement storage such as a Log Store or Storage Shed) to transition from solo survival into a growing settlement:

#### Finite Merchant Barter (Zero Fabricated Resources)
Every trade consumes real items from your bag and decrements finite merchant stock:
| Offer | You Give | You Receive | Stock |
| --- | --- | --- | --- |
| Wild seeds | `2 berries` | `3 seeds` | 8 |
| Iron ingot | `4 plank`, `2 stone` | `1 iron_ingot` | 6 |
| Cooked meat | `2 log` | `2 cooked_meat` | 6 |
| Leather saddle | `4 plank`, `2 iron_ingot`, `2 cord` | `1 saddle` | 2 |
| Riding bridle | `2 plank`, `1 iron_ingot`, `2 cord` | `1 bridle` | 2 |
| Adventurer leather armour | `3 hide`, `2 iron_ingot` | `1 leather_armour` | 1 |
| ASTrix star cape | `2 hide`, `4 plank`, `1 iron_ingot` | `1 astrix_cape` | 1 |

#### Settler Recruitment & Productive Work
- **Requirements:** Finished **Trading Post**, settlement storage, and real food rations (`3 cooked_meat`, `4 cooked_mushroom`, or `8 berries`). Up to **`8` settlers** (`Alden`, `Bryn`, `Cora`, `Dain`, `Elin`, `Fenn`, `Gale`, `Hana`).
- **Assignable Roles:**
  - `idle` — Resting at the settlement
  - `forager` — Gathers berries, mushrooms & fiber into the depot
  - `woodcutter` — Produces branches & timber into the depot
  - `farmer` — Tends crops and produces food & fiber into the depot
  - `builder` — Produces building materials into the depot
- Collect accumulated goods from the **Settlement Depot** inside **`Bag` → Community** into your inventory.

---

## MagicBlock Ephemeral Rollup & Solana Integration

The **MagicBlock** panel (bottom-right on desktop; top-right button on touch devices) stays available in both Demo Settlement and Wilderness modes and connects live to **MagicBlock ER (`https://devnet-eu.magicblock.app`)** and **Solana Devnet (`https://api.devnet.solana.com`)**.

### Verified On-Chain Infrastructure
- **Program ID:** `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy`
- **Delegation Program (MagicBlock DLP):** `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`
- **World Registry PDA:** `8J8shpq3C8eMSMvMV2HJXVsgyDNKcRQBX3jLGqwiFCCx`
- **Owner-Run Demo Settlement PDA:** `4PV6Ks9yUnfMd54vtmbYobM4RZza3ZtsM6zxczSmaxzw`
- **32 Pre-Funded World Slots:** Delegated to MagicBlock ER for instant gasless player onboarding.

### Live On-Chain Features
1. **Quick Play / Wallet Play / Passkey Protection:**
   - **Quick Play:** Claim an on-chain world slot with zero wallet pop-ups and zero SOL (browser key, upgradeable anytime to Passkey or Phantom/Backpack wallet).
   - **Wallet Play:** Sign once with Phantom or Backpack to own the world and authorize a scoped **session key** (expiry + action budget) for smooth gameplay.
   - **Recovery:** Recover your owned world on any device via Passkey or Wallet, or export/import a backup key.
2. **Real-Time ER Clock Cranks:** Autonomous Ephemeral Rollup cranks advance world ticks (`2 s` cadence), grow planted plots, run the sawmill (`2 wood → 1 plank`), and feed settlers without user signatures.
3. **MagicBlock VRF Prospecting:** Click **`Prospect (VRF)`** (spends `4 food` on-chain) to request verifiable randomness from MagicBlock VRF for **ore veins (`+6 ore`)** or **rare crystals (`+1 crystal`)**.
4. **Solana Devnet Checkpoints:** State periodically commits back from the Ephemeral Rollup to Solana Devnet, verifiable directly via the **ER account** and **Solana account** explorer links in the panel.
5. **View ER Outpost (`Founder’s Settlement [DEMO]`):** Click **`View ER Outpost`** inside the MagicBlock panel to frame the 3D outpost at `(6, -60)` and watch crop rows, crates, woodpiles, and the sawmill update live as ER transactions confirm.

---

## Repository Structure

```text
Astrix/
├── Game/                         # Playable 3D client + pure TypeScript simulation
│   ├── src/
│   │   ├── sim/                  # Pure deterministic game logic (zero Three.js)
│   │   ├── render/               # Three.js voxel terrain, Noxel protagonist & horses, water, buildings
│   │   ├── app/                  # Session journal, persistence, explore/wilderness controllers, HUD
│   │   ├── chain/                # MagicBlock ER watcher, session keys, passkey/wallet identity, UI panel
│   │   └── ui/                   # Demo settlement panels
│   ├── public/assets/models/     # Noxel protagonist & 4-coat horse GLBs
│   └── tests/                    # Automated deterministic sim, persistence, W1–W10 & M011 test suites
├── chain/                        # Anchor / Rust Solana + MagicBlock ER program (`astrix-settlement`)
├── deploy/                       # Deployment scripts & nginx configuration
├── 00_Project_Core/              # Architecture specs, audits & Phase 3 ER authority design (v1–v3)
└── HANDOVER.md                   # Engineering handover & verification notes
```

---

## Local Development & Testing

**Prerequisites:** Node.js 22+ and npm.

```bash
cd Game
npm install

# Run local development server
npm run dev

# Type-check & build production bundle
npx tsc --noEmit
npm run build

# Run the complete automated test suite
npx tsx --test tests/*.test.ts
```

### Useful URL Parameters
- `?metrics=1` — Exposes `window.__metrics` (position, mode, render draw-call/triangle budget, active clip, ER state)
- `?perf=1` — Enables the live FPS & frame-time performance monitor
- `?quality=low|medium|high` — Overrides automatic graphics preset
- `?fps=30|60|0` — Sets frame-rate cap
- `?chain=0` — Disables the MagicBlock ER watcher/panel for offline local testing
- `?enter=1` — Re-opens the initial world selector / entry modal
