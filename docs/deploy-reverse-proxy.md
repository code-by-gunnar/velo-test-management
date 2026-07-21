# Deploy Velo behind your own reverse proxy (Nginx Proxy Manager, nginx, Traefik…)

For self-hosters who already run a reverse proxy — a NAS with **Nginx Proxy Manager**, an nginx box, Traefik, etc. — and want Velo on a public HTTPS domain with their existing TLS setup.

**It's one proxy host and two env vars.** Velo serves everything the browser needs — including live SSE updates and evidence images — through its **own single origin**, so you don't need separate `api.`/`minio.` subdomains, a `PUBLIC_API_URL`, or an `S3_PUBLIC_ENDPOINT`. The same setup works whether you reach Velo by its **LAN IP at home** or the **public domain from anywhere** — no split config.

> This wasn't always true. Earlier versions connected SSE and evidence straight to fixed hosts, which forced per-origin config and broke on whichever origin wasn't configured. That's fixed (VEL-77): both now ride the same-origin `/api/backend` gateway.

---

## Setup

### 1. One proxy host

Point `velo.DOMAIN` at your proxy and forward it to the **web** service:

| Public hostname | Proxy target |
|---|---|
| `velo.DOMAIN` | `web:3000` (service name if same Docker network) or `NAS_IP:3000` (if the proxy is on the host) |

**Nginx Proxy Manager:** *Proxy Hosts → Add* → Scheme `http`, forward host/port as above, **SSL → request a Let's Encrypt cert + Force SSL**. Enable **Websockets Support** (harmless, and future-proofs streaming). Leave header handling at the default (NPM forwards the original `Host`).

**nginx:** a standard proxy block works; for snappy live updates make sure SSE isn't buffered:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_buffering off;          # let SSE events flush immediately
    proxy_read_timeout 3600s;     # allow long-lived SSE connections
}
```

### 2. Two env vars

```dotenv
WEB_URL=https://velo.DOMAIN     # app origin — used for OAuth callbacks + email links
AUTH_URL=https://velo.DOMAIN    # (and NEXTAUTH_URL) — Auth.js canonical origin
```

That's it for URLs. **You do not need `PUBLIC_API_URL` or `S3_PUBLIC_ENDPOINT`** — SSE and evidence are same-origin. (`AUTH_TRUST_HOST=true`, already set, also lets credential logins work from the raw LAN IP simultaneously; OAuth sign-in works on whichever origin you registered the callback for.)

### 3. OAuth callbacks (only if you use Google/GitHub sign-in)

```
https://velo.DOMAIN/api/auth/callback/google
https://velo.DOMAIN/api/auth/callback/github
```

### 4. Restart

```bash
docker compose ... up -d
```

Sign in at `https://velo.DOMAIN` and you're done — live run updates and evidence images work over the proxy **and** over the LAN IP with the same config.

---

## Storage: bundled MinIO vs cloud

- **Bundled MinIO (default):** evidence is **streamed through the app** (same-origin), so it works everywhere with zero storage config. Nothing to set up. `MINIO_ROOT_PASSWORD` is the only required storage secret.
- **Cloud R2 / S3 / B2 / Wasabi:** set `S3_*` (drop the storage overlay). These endpoints are already public, so Velo hands the browser a **presigned URL** directly — proper, and it offloads evidence bytes from the app. No proxy host needed for storage either way.

You can force direct/presigned delivery for a self-hosted MinIO by setting `S3_PUBLIC_ENDPOINT` to a **public HTTPS** host you've proxied (e.g. `https://minio.DOMAIN`) — but that's now an optional optimization, not a requirement.

---

## Known behaviours (not proxy bugs)

- **Reports lag ~a minute:** report data is cached 60s and the Reports page doesn't live-stream (the execution screen and run list/detail do). A just-recorded result appears on Reports within the TTL. The cache is busted on every result change, so a refresh is immediately fresh.
- **Navigation keep-alive:** behind a proxy, the Node keep-alive should outlast your proxy's upstream idle timeout (the Caddy overlay uses `95000`). Periodic multi-second nav stalls = tune `KEEP_ALIVE_TIMEOUT`.

## Quick reference

| Symptom | Cause | Fix |
|---|---|---|
| Live updates never arrive | proxy buffering the SSE stream | `proxy_buffering off` (nginx) / Websockets support (NPM) |
| OAuth sign-in fails | callback URL ≠ public origin | register `https://velo.DOMAIN/api/auth/callback/{google,github}` and set `WEB_URL` |
| Evidence images 404 (cloud storage only) | wrong `S3_*` creds/endpoint | verify the cloud bucket config; MinIO needs no storage URL config |
| Reports stale for ~a minute | 60s reports cache | expected; refresh after the TTL |
