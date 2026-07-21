# Deploy Velo behind your own reverse proxy (Nginx Proxy Manager, nginx, Traefik…)

For self-hosters who already run a reverse proxy — a NAS with **Nginx Proxy Manager**, an nginx box, Traefik, etc. — and want Velo on a public HTTPS domain with their existing TLS setup. This is the manual counterpart to the batteries-included [Caddy](../docker-compose.prod.yml) and [Cloudflare Tunnel](deploy-cloudflare-tunnel.md) overlays: you bring the proxy, Velo just needs the right URLs.

> **The one thing that trips everyone up:** the web app funnels almost all traffic through a single origin (the browser calls the web app, which proxies to the API server-side via the `/api/backend` gateway). But **two things the browser fetches _directly_, bypassing that gateway, need their own browser-reachable public HTTPS host**:
> 1. **SSE live-update streams** (`EventSource` can't send auth headers, so it connects straight to the API).
> 2. **Evidence/attachment downloads** (presigned S3/MinIO URLs are fetched straight from the storage host).
>
> Point one hostname at `web` and login + navigation work — but live run updates and evidence images silently fail until the API and storage each get a public host too. This guide sets all three up.

---

## Topology: three proxy hosts, one per service

| Public hostname | Proxy target (container:port) | Serves |
|---|---|---|
| `velo.DOMAIN` | `web:3000` | the app (UI, gateway, auth) |
| `api.DOMAIN` | `api:3001` | direct browser→API: **SSE**, plus the CI ingestion endpoint |
| `minio.DOMAIN` | `minio:9000` | **evidence downloads** (presigned URLs) — only if using bundled MinIO |

If your reverse proxy runs **on the same host** as the Docker stack, target the published ports on the host IP (`NAS_IP:3000`, `:3001`, `:9000`) instead of container names. If it runs **in the same Docker network**, use the service names above.

> Why three hosts instead of subpaths on one? S3 presigned URLs are **path-style** (`/bucket/key`) and the SigV4 signature covers the host + path — proxying MinIO under a subpath (`velo.DOMAIN/storage/…`) breaks the signature. Subdomains keep each service at a clean origin. It's the same 2-minute "add a proxy host" step three times.

---

## 1. DNS + proxy hosts

Point `velo.`, `api.`, and (if using MinIO) `minio.` `DOMAIN` at your proxy, and create a proxy host for each with its own TLS cert (Let's Encrypt in NPM, a `server {}` block in nginx, etc.).

**Nginx Proxy Manager:** for each, *Proxy Hosts → Add* → Scheme `http`, Forward host/port as above, **SSL tab → request a Let's Encrypt cert + Force SSL**. Leave "Preserve host header" behaviour at NPM's default (it forwards the requested `Host`) — **MinIO needs this**: it validates the presign signature against the incoming `Host`, so `minio.DOMAIN` must reach MinIO as `minio.DOMAIN`, not rewritten to the upstream. A `403 SignatureDoesNotMatch` on images is the tell that the Host header is being rewritten.

**nginx:** for the API and MinIO hosts, disable response buffering so SSE streams flush immediately and presigned downloads stream cleanly:

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;   # api  (use :9000 for the minio host)
    proxy_set_header Host $host;         # preserve Host (required by MinIO presign)
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_buffering off;                 # SSE: don't buffer the event stream
    proxy_read_timeout 3600s;            # SSE: allow long-lived connections
}
```

## 2. `.env` — public URLs

```dotenv
WEB_URL=https://velo.DOMAIN            # app origin — Auth.js origin AND the API CORS allow-list
PUBLIC_API_URL=https://api.DOMAIN      # browser-facing API (SSE + CI command). Runtime-read — no image rebuild.
```

- `WEB_URL` **must** be the public app origin. The API only allows CORS from `WEB_URL`, and the SSE stream is cross-origin (`velo.` → `api.`), so a wrong `WEB_URL` blocks live updates with a CORS error even when everything else is right.
- `PUBLIC_API_URL` is resolved at request time (`getServerSideProps` → `resolveBrowserApiUrl`), so the **prebuilt image just works** — no rebuild needed. (Older builds baked this as `NEXT_PUBLIC_API_BASE_URL` and it couldn't be changed at runtime; that's fixed.)

The compose files already set `AUTH_URL`/`NEXTAUTH_URL` from `WEB_URL`. If you edited the NAS single-file (`docker-compose.nas.yml`), set `AUTH_URL`/`NEXTAUTH_URL` to `https://velo.DOMAIN` and both `PUBLIC_API_URL` + `NEXT_PUBLIC_API_BASE_URL` to `https://api.DOMAIN`.

## 3. Storage (bundled MinIO)

```dotenv
S3_PUBLIC_ENDPOINT=https://minio.DOMAIN   # presigned download URLs are signed for this host — MUST be the public one
MINIO_ROOT_PASSWORD=...                     # openssl rand -hex 16
```

Presigned URLs are signed with `S3_PUBLIC_ENDPOINT` and fetched by the browser directly, so it has to be the public `minio.DOMAIN` — never `NAS_IP:9000` (LAN-only + mixed content on an HTTPS page) or `localhost`. Restart `api` after changing it (presigning is API-side; plain runtime env, no rebuild).

Prefer not to expose MinIO at all? Point `S3_*` at **Cloudflare R2 / AWS S3 / B2 / Wasabi** instead and drop `docker-compose.storage.yml` — presigned URLs are then already on a public host and you skip the `minio.` proxy entirely.

## 4. OAuth callbacks (if using Google/GitHub sign-in)

Re-register each provider's callback to the public origin:

```
https://velo.DOMAIN/api/auth/callback/google
https://velo.DOMAIN/api/auth/callback/github
```

## 5. Restart and verify

Recreate the stack so the new env applies (`docker compose ... up -d`), then check:

1. **Login + navigation** at `https://velo.DOMAIN`. (These work off the single origin — if they don't, the base proxy host or `WEB_URL` is wrong.)
2. **Live run updates (SSE).** Open a run's execution screen in one tab, mark a case pass/fail, and confirm the run list/detail update **without a manual refresh**. DevTools → Network → filter `stream`: the request should go to `https://api.DOMAIN/...` and stay open (status 200, pending). If it's hitting `localhost:3001` or a LAN IP, `PUBLIC_API_URL` isn't set/applied; a CORS error means `WEB_URL` doesn't match the app origin.
3. **Evidence images.** Upload an attachment and re-open it. A blocked/`403`/mixed-content image means `S3_PUBLIC_ENDPOINT` is wrong or the `minio.` Host header is being rewritten.

---

## Known behaviours (not proxy bugs)

- **Reports don't update live, and lag ~60s even after a manual refresh.** The reports page doesn't subscribe to SSE (by design), and report data is cached in Valkey for 60s. A just-recorded result can take up to a minute to appear on the Reports page. The execution screen and run list/detail *do* update live via SSE.
- **Navigation keep-alive.** The split compose files set `KEEP_ALIVE_TIMEOUT` for their environment; behind a reverse proxy the Node keep-alive should outlast your proxy's upstream idle timeout (see the [Caddy overlay](../docker-compose.prod.yml) note, which uses `95000`). If you get periodic multi-second nav stalls, that's the knob.

## Quick reference

| Symptom | Cause | Fix |
|---|---|---|
| Evidence images blocked / mixed-content / CORS | `S3_PUBLIC_ENDPOINT=http://NAS_IP:9000` | Set it to `https://minio.DOMAIN` + add the `minio.` proxy host |
| `403 SignatureDoesNotMatch` on images | proxy rewrites the `Host` header to the upstream | Preserve the original `Host` (`proxy_set_header Host $host;`) |
| Live updates never arrive; `stream` request hits `localhost`/LAN IP | `PUBLIC_API_URL` unset/not applied | Set `PUBLIC_API_URL=https://api.DOMAIN`, recreate the web container |
| Live updates blocked by CORS | `WEB_URL` ≠ the app origin | Set `WEB_URL=https://velo.DOMAIN` |
| Reports stale for ~a minute | 60s Valkey reports cache + no SSE on reports | Expected; wait or hard-refresh after the TTL |
