# Deploy Velo behind a Cloudflare Tunnel

A production deployment path that needs **no open ports and no TLS certificate management**. `cloudflared` dials *outbound* to Cloudflare and Cloudflare terminates HTTPS at the edge, so this works from a home NAS, a box behind CGNAT, or anywhere you can't (or don't want to) port-forward.

This is an alternative to the [Caddy overlay](../docker-compose.prod.yml). Prefer a classic reverse proxy that you control end-to-end (single server with a public IP, no third party in the request path)? Use Caddy. Prefer zero port-forwarding and Cloudflare's edge/DDoS protection in front? Use this.

---

## Prerequisites

- A domain on Cloudflare (the domain's nameservers point at Cloudflare).
- **Cloudflare Zero Trust** enabled on your account (free tier is enough) — <https://one.dash.cloudflare.com>.
- The Velo stack already runnable locally via Docker Compose (see the [README quick start](../README.md)).

---

## 1. Create the tunnel and copy its token

1. In **Zero Trust → Networks → Tunnels**, create a tunnel (connector type: **Cloudflared**). Name it e.g. `velo`.
2. Cloudflare shows an install command containing a token (`eyJ...`, a long string). You don't run that command — Velo's `cloudflared` container uses the token. Copy just the token value into `.env`:

   ```dotenv
   CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...        # the long token from the tunnel page
   ```

   Treat this like a secret — anyone with it can serve traffic through your tunnel.

## 2. Route public hostnames to the services

Still on the tunnel's page, open the **Public Hostname** tab and add:

| Public hostname | Service (type: HTTP) |
|---|---|
| `app.DOMAIN` | `http://web:3000` |
| `api.DOMAIN` | `http://api:3001` |
| `storage.DOMAIN` | `http://minio:9000` — **only if using bundled MinIO** (R2 users skip this) |

`web`, `api`, and `minio` are the Docker Compose service names — `cloudflared` runs on the same Compose network and resolves them directly, which is why nothing needs a published host port.

> DNS: adding a public hostname auto-creates the proxied `CNAME` for it. No manual A/AAAA records, no port-forwarding.

## 3. Set the public URLs in `.env`

```dotenv
WEB_URL=https://app.DOMAIN            # Auth.js origin + API CORS allow-list
PUBLIC_API_URL=https://api.DOMAIN     # browser-facing API (SSE EventSource). Baked into the web image at build time.
```

`PUBLIC_API_URL` is compiled into the web bundle, so if you change it you must **re-pull/rebuild the web image** (the `up` command below re-pulls; contributors building from source need `--build`).

## 4. Choose storage

**Recommended — Cloudflare R2** (you're already on Cloudflare, so this is the natural fit and needs no `storage.DOMAIN`): drop `docker-compose.storage.yml` from the `up` command and point S3 at R2:

```dotenv
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=velo
# S3_PUBLIC_ENDPOINT not needed — the R2 endpoint is already public.
```

**Or — bundled MinIO**: keep `docker-compose.storage.yml`, add the `storage.DOMAIN` hostname from step 2, and set:

```dotenv
S3_PUBLIC_ENDPOINT=https://storage.DOMAIN   # presigned download URLs are signed for the host the browser fetches
MINIO_ROOT_PASSWORD=...                       # openssl rand -hex 16
```

Presigned evidence URLs are signed with `S3_PUBLIC_ENDPOINT` and fetched by the browser directly, so it **must** be the public `storage.DOMAIN`, never `minio:9000` or `localhost`.

## 5. Re-register OAuth callbacks (if you use Google/GitHub sign-in)

Update each provider's callback URL to the public origin:

```
https://app.DOMAIN/api/auth/callback/google
https://app.DOMAIN/api/auth/callback/github
```

## 6. Bring it up

Bundled MinIO:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.app.yml \
  -f docker-compose.storage.yml \
  -f docker-compose.cloudflared.yml \
  up -d
```

Cloudflare R2 (no storage overlay):

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.app.yml \
  -f docker-compose.cloudflared.yml \
  up -d
```

Confirm the tunnel connected: `docker compose logs cloudflared` should show four `Registered tunnel connection` lines, and the tunnel goes **Healthy** in the Cloudflare dashboard.

---

## Verify (the things a reverse proxy in front of Velo tends to break)

1. **Sign in** at `https://app.DOMAIN` and create the first account.
2. **Live run updates (SSE).** Open a run's execution screen and set a status; the run list / detail should update live. Velo's stream emits a heartbeat every 20s, comfortably under Cloudflare's ~100s idle timeout, so no special config is required — but this is the first thing that breaks behind a misconfigured proxy, so confirm it end-to-end.
3. **Evidence upload + download.** Upload an attachment on a run item and re-open it. A 404 on the image means `S3_PUBLIC_ENDPOINT` (MinIO) or the R2 credentials are wrong.
4. **Rapid navigation.** Click through several sections quickly. Multi-second stalls mean the keep-alive tuning below isn't taking effect.

---

## Gotchas & tuning

- **Keep-alive.** The overlay sets `KEEP_ALIVE_TIMEOUT=95000` on the web service so the Node origin keep-alive outlasts cloudflared's ~90s origin idle timeout. Without this you can hit the classic proxy race (cloudflared reuses a socket the server just closed → stalled requests). Leave it as-is.
- **SSE idle timeout.** Cloudflare drops a proxied connection after ~100s of silence (a 524). Velo's 20s SSE heartbeat keeps it open, so this is handled — but if you add your *own* long-polling endpoints, keep them under 100s or emit a keep-alive.
- **Don't enable HTML-rewriting features on `api.DOMAIN`.** Rocket Loader / Auto Minify / Email Obfuscation only touch HTML and are harmless on the API subdomain, but if you ever proxy the API through a Cloudflare *zone* with those on, scope them to `app.` only.
- **Body size.** Cloudflare's free plan caps request bodies at 100 MB; Velo's gateway cap is 20 MB, so uploads are fine.
- **Storage on the tunnel.** If you tunnel `storage.DOMAIN → minio:9000`, evidence up/download flows over Cloudflare too. That's fine for modest use; heavy evidence traffic is a reason to prefer R2 (served directly by Cloudflare, off your uplink).

---

## Rolling back to Caddy / direct

Nothing here is one-way. To switch to the Caddy overlay, bring the stack down and up again swapping `-f docker-compose.cloudflared.yml` for `-f docker-compose.prod.yml` (and set `DOMAIN` + DNS A records per that file's header). To go back to plain LAN access, drop the overlay entirely and use the [NAS/local](../README.md#nas--single-file-panels-dockhand-portainer-synology-container-manager) setup.
