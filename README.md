<div align="center">
  <img src="apps/web/public/velo-mark.svg" alt="Velo" width="104" height="104" />
  <h1>Velo</h1>
  <p><strong>Open-source, self-hosted test management that does less, on purpose.</strong></p>
  <p>Write test scenarios, run them, see where you stand — without the bloat of enterprise QA suites.</p>
  <p>
    <a href="https://github.com/code-by-gunnar/velo-test-management/tags"><img src="https://img.shields.io/github/v/tag/code-by-gunnar/velo-test-management?sort=semver&label=release&color=5B5BD6" alt="Latest release" /></a>
    <a href="https://github.com/code-by-gunnar/velo-test-management/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/code-by-gunnar/velo-test-management/ci.yml?branch=master&label=CI" alt="CI status" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" /></a>
    <a href="#quick-start-prebuilt-images"><img src="https://img.shields.io/badge/self--hosted-Docker-2496ED?logo=docker&logoColor=white" alt="Self-hosted with Docker" /></a>
    <a href="#stack"><img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" alt="Next.js 16" /></a>
    <a href="#stack"><img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 16" /></a>
    <a href="https://ko-fi.com/gunnarfinkeldeh"><img src="https://img.shields.io/badge/Ko--fi-buy_me_a_coffee-FF5E5B?logo=ko-fi&logoColor=white" alt="Support on Ko-fi" /></a>
  </p>
</div>

---

Velo is a focused test-management tool you host yourself. It covers the core of manual QA — writing cases, running them, tracking defects, reporting — and deliberately stops there. No per-seat billing, no sprawling integration marketplace, no sales call to try it. Clone it and go.

## What it does

- **Write cases fast.** A keyboard-first editor. Traditional steps or native Given-When-Then, set per project.
- **Run them live.** Execution updates over SSE, not polling. Pass, fail, or block with one key; attach evidence; file a Linear defect with the screenshots already on it.
- **See where you stand.** Pass rates and trends the moment someone records a verdict.
- **Bring your own AI.** Paste a Linear issue and your own key — Claude, OpenAI, or a local model — turns the acceptance criteria into cases. JUnit and Allure ingest from any CI.

Everything runs on your infrastructure. Analytics, error tracking, and email stay off until you switch them on; nothing phones home by default.

## Quick start (prebuilt images)

You need [Docker](https://docs.docker.com/get-docker/) with Compose v2. That's it — no build, no Node toolchain.

```bash
git clone https://github.com/code-by-gunnar/velo-test-management.git
cd velo-test-management
cp .env.example .env
```

Set the four required secrets in `.env` (the stack won't start without them), plus the image tag to pull:

```bash
AUTH_SECRET=          # openssl rand -base64 32   shared web+api session secret
INTERNAL_API_SECRET=  # openssl rand -hex 32      web→api server-to-server auth
APP_DB_PASSWORD=      # openssl rand -hex 16      non-superuser app DB role
MINIO_ROOT_PASSWORD=  # openssl rand -hex 16      bundled object-storage password
VELO_VERSION=beta     # not a secret — image tag to pull (defaults to beta; see note below)
```

(Using your own S3/R2 instead of bundled MinIO? Drop `-f docker-compose.storage.yml` from the command below — then `MINIO_ROOT_PASSWORD` isn't needed. See [Configuration](#configuration).)

Then bring up the full stack — this **pulls** `ghcr.io/code-by-gunnar/velo-{api,web}:${VELO_VERSION}`, no build:

```bash
docker compose -f docker-compose.yml -f docker-compose.app.yml -f docker-compose.storage.yml up -d
```

- Web → http://localhost:3000
- API → http://localhost:3001

Migrations run automatically on API boot. Open the web app, create the first account, and you're in. With no SMTP set, Velo runs in **console mode**: one-time codes and reset links print to `docker compose logs api`, and workspace invite links show up in the members UI for copy-paste.

The `docker-compose.storage.yml` overlay bundles a **MinIO** object store so evidence attachments, avatars, and CI payloads work out of the box — no cloud account. Prefer your own S3/R2? See [Configuration](#configuration).

> **Beta images.** Published releases are currently prerelease (`X.Y.Z-beta.N`). `VELO_VERSION=beta` always tracks the latest prerelease build; pin an exact version (e.g. `VELO_VERSION=1.0.0-beta.1`) for anything you care about staying stable. Check the current version in the running app under Settings → General, or `GET /health`.
>
> GHCR publishes packages as private by default; the maintainer flips them to public as a one-time step shortly after the first release. If `docker compose ... up -d` fails to pull with an authentication/403 error, the images may not be public yet — [build from source](#build-from-source-contributors) in the meantime, or try again shortly.

### NAS / single-file panels (Dockhand, Portainer, Synology Container Manager)

Two ways, depending on your panel:

**Multi-file panels** (Portainer's stack editor, Synology Container Manager "Project"): paste `docker-compose.yml`, `docker-compose.app.yml`, and `docker-compose.storage.yml` as the stack's compose files, and put your filled-in `.env` values in the stack's environment-variables box. No checkout or build on the host. Set `MINIO_ROOT_PASSWORD` (openssl rand -hex 16) and `S3_PUBLIC_ENDPOINT=http://<nas-ip>:9000` so evidence uploads work and download URLs are reachable from your browser.

**Single-file panels, or any panel whose env box doesn't feed Compose interpolation** (e.g. Dockhand — a missing `${...}` variable fails with `required variable ... is missing a value`): use [`docker-compose.nas.yml`](docker-compose.nas.yml) instead. It's one self-contained file with **no `${}` interpolation** — open it and replace the five `CAPS` placeholders: `NAS_IP`, the three app secrets, and `REPLACE_MINIO_PASS` (the storage password). Some appear more than once and every copy must match — the app secrets across `api`+`web`, the MinIO password across `api`+`minio`+`minio-init`. Paste and deploy; bundled MinIO storage is wired in.

> Set `NEXT_PUBLIC_API_BASE_URL` / `AUTH_URL` / `S3_PUBLIC_ENDPOINT` to your NAS's LAN address, not `localhost` — your browser connects to the NAS directly. The NAS file already does this via the `NAS_IP` placeholder, and keeps `KEEP_ALIVE_TIMEOUT=100` so navigation stays snappy (raise it only if you front the app with a reverse proxy).

## Configuration

The three secrets above are all that's required. Everything else is optional and lives in [`.env.example`](.env.example):

| What | Env | Notes |
|---|---|---|
| Email | `SMTP_HOST`, … | Any SMTP provider. Omit for console mode. |
| Linear + AI-key encryption | `ENCRYPTION_KEY` | `openssl rand -hex 32`. Needed to connect Linear or store AI keys at rest. |
| AI (env fallback) | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Or add per-workspace keys in Settings → Integrations. |
| Evidence attachments | *(bundled MinIO)* | Works out of the box. To use cloud instead, drop `docker-compose.storage.yml` and set `S3_*` (R2 / AWS S3 / B2 / Wasabi) — legacy `R2_*` also honored. |
| Error tracking / analytics | `SENTRY_DSN`, `POSTHOG_KEY` | Off (no phone-home) when unset. |

### Production

Two overlays put Velo on a public HTTPS domain — pick whichever fits your host (both still pull the prebuilt images by default):

**Cloudflare Tunnel** — no open ports, no TLS certs to manage; `cloudflared` dials out to Cloudflare. Ideal for a home NAS, a box behind CGNAT, or anywhere you can't port-forward. Full walkthrough: [`docs/deploy-cloudflare-tunnel.md`](docs/deploy-cloudflare-tunnel.md).

```bash
docker compose -f docker-compose.yml -f docker-compose.app.yml \
  -f docker-compose.storage.yml -f docker-compose.cloudflared.yml up -d
```

**Caddy** — a classic reverse proxy you control end-to-end with automatic Let's Encrypt TLS. Needs a public IP and DNS A records for `app.`/`api.` subdomains. Checklist is in the header of [`docker-compose.prod.yml`](docker-compose.prod.yml).

```bash
docker compose -f docker-compose.yml -f docker-compose.app.yml -f docker-compose.prod.yml up -d
```

Both paths need the same public-URL wiring (`WEB_URL`, `PUBLIC_API_URL`), OAuth callback re-registration, and — for remote browsers reaching bundled MinIO — a public `S3_PUBLIC_ENDPOINT` (or use Cloudflare R2). SSE live-updates survive either proxy out of the box (20s heartbeat).

## Build from source (contributors)

If you're working on Velo itself, or want images built from a checkout instead of GHCR, add the build overlay — it replaces the `image:` pulls with local `build:` context for both services:

```bash
docker compose -f docker-compose.yml -f docker-compose.app.yml -f docker-compose.storage.yml -f docker-compose.build.yml up -d --build
```

Same `.env` and required secrets as the quick start above. Add `-f docker-compose.prod.yml` too if you're also layering the Caddy overlay.

## Local development

To work on Velo itself, run the databases in Docker and the apps on your machine:

```bash
docker compose up -d                        # bare postgres + valkey
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm dev                                     # web :3000, api :3001
```

Requires Node 22 and pnpm. Run the checks with `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test`.

## Stack

Next.js 16 (Pages Router) · Fastify 5 · PostgreSQL 16 (RLS) · Valkey · Auth.js v5 · Cloudflare R2 · BullMQ · pnpm workspaces.

## License

[MIT](LICENSE) © Gunnar Finkeldeh
