# DEPLOY-001 — Public game server

**Date:** 2026-10-22 · **Updated:** 2026-10-29 (M001) · **Owner:** DeepSeek · **Status:** Live, verified externally

## Live endpoint

**http://51.21.199.227/** — the M001 2048 × 2048 m voxel-world build (promoted 2026-10-29), served by
nginx on port 80.

The former T-009 256 m build is archived at `/usr/share/nginx/html-t009` and
`/home/ec2-user/t009-html-20261024.tgz`. It is no longer the public root.

## Resources created

| Resource | Value | Notes |
|---|---|---|
| Instance | `i-06e433729ac159665` | t3.micro, Amazon Linux 2023 (`ami-0c22f4c6a190cb58b`), eu-north-1b |
| Public / private IP | `51.21.199.227` / `172.31.47.113` | public IP is ephemeral (no EIP) |
| Security group | `sg-020850b03455baf08` (`noxel-web`) | new, dedicated to this server |
| Subnet / VPC | `subnet-09252e30074b7fb1b` / `vpc-00b530714c9d5d762` | existing, unchanged |
| Artifact bucket | `astrix-game-deploy-054772657464` | private, all public access blocked |
| SSH key | `~/.ssh/noxel_web` (build host only) | public half injected via user-data |

The existing `launch-wizard-1` security group and the build instance were **not modified**.

## Port / firewall posture

- **tcp/80 open to `0.0.0.0/0`** — as requested, this is the public M001 endpoint.
- **tcp/8080 open to `0.0.0.0/0`** — added 2026-10-29 for the M001 preview. It now returns a
  `301` redirect to port 80, so there is one canonical URL. Remove this rule when the redirect is
  no longer useful.
- **tcp/22 restricted** to `172.31.36.77/32` (build host private) and `16.171.199.7/32`
  (build host public). Not world-open.
- Egress: default all.
- No OS firewall rules added; Amazon Linux 2023 ships no active `firewalld`/`ufw`, and fail2ban is not
  installed. SSH key auth only, no passwords.

The pre-existing security group already had 80/8080/443 open from earlier work; this deployment uses a
separate group so that those unrelated rules stay untouched.

## Verified — current M001 build

| Check | Result |
|---|---|
| External HTTP fetch | `200 OK`; bundle `assets/index-Ot8YvNLF.js`; title `ASTrix — M001 World Foundation` |
| Headless Chromium against the public URL | WebGL2 render, **37 draw calls**, **189,792 tris**, **0 console errors** |
| World metrics | `worldSize: 2048`, `loadedChunks: 49`, `chunksGenerated: 81`, `natureInstances: 271` |
| Preview alias | `http://51.21.199.227:8080/` returns `301` to `http://51.21.199.227/` |
| T-009 rollback | `/usr/share/nginx/html-t009` and `/home/ec2-user/t009-html-20261024.tgz` |
| SSH via private IP | works (`ec2-user@172.31.47.113`, key `~/.ssh/noxel_web`) |
| nginx persistence | `systemctl enable --now nginx` — survives reboot |

**Initial bootstrap verification (2026-10-22, historical):** external `200 OK`,
`deployed 2026-10-22T18:25:20Z`; JS bundle 552,412 bytes; headless render 21 draw calls /
153,202 triangles / 0 errors; capture `Game/tests/deployed_public.png`.

## How the deployment works

Bootstrap is fully automated by EC2 user-data; no manual SSH step was needed to create the server:

1. `Game/dist` is tarred, uploaded to the private S3 bucket, and fetched by the instance through a
   short-lived presigned URL (expired; the bucket itself is not public).
2. User-data installs nginx, unpacks the build into `/usr/share/nginx/html`, installs the deploy public
   key, and enables the service.

## Redeploying a new build

```bash
cd /home/ubuntu/as/Game && npm run build
tar czf /tmp/game.tgz -C dist .
scp -i ~/.ssh/noxel_web /tmp/game.tgz ec2-user@172.31.47.113:/tmp/
ssh -i ~/.ssh/noxel_web ec2-user@172.31.47.113 \
  'sudo rm -rf /usr/share/nginx/html/* && sudo tar xzf /tmp/game.tgz -C /usr/share/nginx/html && sudo chmod -R a+rX /usr/share/nginx/html'
```

## Limitations / things to know

- **No TLS and no domain.** It is HTTP on a raw IP. A domain + Let's Encrypt would need DNS control and
  port 443 configured for the hostname.
- **Ephemeral public IP.** Stopping the instance changes `51.21.199.227`; an Elastic IP would fix it.
- **Single instance, no autoscaling or health checks.** Fine for a prototype.
- **Cost.** t3.micro runs continuously (~USD 7–9/month in eu-north-1) plus negligible S3 storage.
- The server is a **static host only** — it does not run the simulation server-side.


## Deploy log

- **2026-10-22 — T-008 build.** Replaced the pre-T-008 `dist` with the authored-terrain build
  (21 draw calls / 203,221 triangles). Verified HTTP 200 and a headless WebGL render of
  `http://51.21.199.227/?freeze=1&t=0.42` with 0 console errors. Capture:
  `Game/tests/t008_08_public.png`. The S3 presigned bootstrap URL was not reused; deploy used the
  tar → scp → unpack path above.
- **2026-10-24 01:54 UTC — first T-009 build.** Deployed the 256 m voxel candidate before the final
  stair/waystone fixes (49 draw calls / 245,094 triangles). Superseded by the entry below.
- **2026-10-24 02:38:50 UTC — final T-009 build.** Rebuilt `Game/dist` after the stair-landing and
  5 cm waystone-seat fixes; deployed via tar → scp → unpack. Public URL verified HTTP 200 and a
  headless WebGL2 render at 49 draw calls / 245,094 triangles / 0 console errors. Capture:
  `Game/tests/t009_public.png`. No instance, security-group or nginx configuration changed.
- **2026-10-29 07:11 UTC — M001 preview.** Added tcp/8080 ingress to `sg-020850b03455baf08`
  (`0.0.0.0/0`, `M001 preview HTTP`), deployed the 2048 m build to
  `/usr/share/nginx/html-m001`, and added `/etc/nginx/conf.d/m001-preview.conf`. Public preview
  verified at `http://51.21.199.227:8080/`: 37 draw calls / 189,792 triangles / 0 console errors,
  `worldSize: 2048`, 49 loaded chunks.
- **2026-10-29 07:23 UTC — M001 promoted to root.** Backed up the T-009 root to
  `/usr/share/nginx/html-t009` and `/home/ec2-user/t009-html-20261024.tgz`, replaced
  `/usr/share/nginx/html` with the M001 build, and changed the 8080 server block to a `301`
  redirect to port 80. Public root verified as `ASTrix — M001 World Foundation` with the same
  37 / 189,792 metrics. T-009 is retained only as an archive/rollback copy.
