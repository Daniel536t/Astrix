# DEPLOY-002 — boxd hosting

**Date:** 2026-11-23 · **Supersedes:** DEPLOY-001 (EC2 at a raw HTTP IP) as the public build.

## What runs where

| Item | Value |
|---|---|
| Public URL | https://astrix.nyc.boxd.sh (TLS terminated by boxd) |
| Machine | `astrix` (id `5ccfa51a-683a-455a-8bdb-4b68007a05ea`), region New York, 1 vCPU / 4 GiB |
| Server | nginx 1.24 on port 80, config `deploy/boxd/nginx.conf` |
| Web root | `/var/www/astrix/current` → `/var/www/astrix/releases/<UTC timestamp>-<git sha>` (5 kept) |
| Health check | `GET /healthz` → `200 ok` |
| Idle behaviour | auto-hibernate after 4 h without traffic; wakes in ~85 ms on the next request |
| Bot protection | `sleep_only`: visitors may see a one-second browser check only while the machine is asleep |

## Backend

There is no application backend. The game is a static bundle; saves live in each player's browser
(localStorage), exactly as in local play. A server-side simulation, accounts or shared persistence are
Workstream D items in `00_Project_Core/Execution_Plan.md` and do not exist yet.

## Deploy and roll back

```bash
boxd auth login                     # or: export BOXD_TOKEN=<api key>
deploy/boxd/deploy.sh               # typecheck, test, build, upload, switch symlink
deploy/boxd/deploy.sh --rollback    # point "current" back at the previous release
```

The script refuses to publish if typecheck, tests or build fail, and switches the live symlink only
after the upload and `nginx -t` succeed. `index.html` is served `no-cache`; fingerprinted `/assets/*`
are cached for a year, so a new deploy takes effect on the next page load.

## Verification (2026-11-23 17:01 UTC, release `20261123T170031Z-92ec3d5`)

- 126/126 tests, strict typecheck and production build passed inside the deploy script.
- `/`, `/healthz` and the JS bundle return 200 over HTTPS; JS is served gzip-compressed.
- Headless Chromium (software WebGL) on the public URL: `__ready` true, 49 chunks, 47 draw calls,
  194,972 triangles, 0 console errors. Still serving after a resize reboot (nginx is enabled at boot).
- Not verified: physical-GPU frame rate, real mobile devices.

## Deployment log

| UTC | Release | Contents | Verified |
|---|---|---|---|
| 2026-11-23 17:00 | `20261123T170031Z-92ec3d5` | Initial boxd deployment of the M003 build | HTTP 200, render, 0 console errors |
| 2026-11-23 17:06 | `20261123T170634Z-642dd69` | Resize, URL-param and constant fixes | Resize and bad-param checks on the live URL |
| 2026-11-23 19:24 | `20261123T192419Z-93386e8` | Living world phases 1–2: terrain v2 valley and mountain river, flowing water, walking founder, wildlife, chunk workers, village kit (`?scene=kit`) | 150/150 tests in the deploy script; live headless check: v2 world, 3 workers, 69 creatures, explore mode, 0 console errors |

| 2026-11-23 19:42 | `20261123T194224Z-c4b82cf` | Real-time settlement simulation (tick every 2 s), save throttling, single-writer tab lease | 154/154 tests; live tick-rate check |

Rollback to the previous release: `deploy/boxd/deploy.sh --rollback`. Owner deployment authority (2026-11-23): normal,
reversible development builds may be deployed at verified checkpoints.
