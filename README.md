<div align="center">
  <img src="apps/web/public/velo-mark.svg" alt="Velo" width="56" height="56" />
  <h1>Velo</h1>
  <p><strong>Open-source, self-hosted test management that does less, on purpose.</strong></p>
  <p>Write test scenarios, run them, see where you stand — without the bloat of enterprise QA suites.</p>
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

Set the three required secrets in `.env` — the stack won't start without them:

```bash
AUTH_SECRET=          # openssl rand -base64 32   shared web+api session secret
INTERNAL_API_SECRET=  # openssl rand -hex 32      web→api server-to-server auth
APP_DB_PASSWORD=      # openssl rand -hex 16      non-superuser app DB role
VELO_VERSION=beta     # image tag to pull — see note below
```

Then bring up the full stack — this **pulls** `ghcr.io/code-by-gunnar/velo-{api,web}:${VELO_VERSION}`, no build:

```bash
docker compose -f docker-compose.yml -f docker-compose.app.yml up -d
```

- Web → http://localhost:3000
- API → http://localhost:3001

Migrations run automatically on API boot. Open the web app, create the first account, and you're in. With no SMTP set, Velo runs in **console mode**: one-time codes and reset links print to `docker compose logs api`, and workspace invite links show up in the members UI for copy-paste.

> **Beta images.** Published releases are currently prerelease (`X.Y.Z-beta.N`). `VELO_VERSION=beta` always tracks the latest prerelease build; pin an exact version (e.g. `VELO_VERSION=1.0.0-beta.1`) for anything you care about staying stable. Check the current version in the running app under Settings → General, or `GET /health`.
>
> GHCR publishes packages as private by default; the maintainer flips them to public as a one-time step shortly after the first release. If `docker compose ... up -d` fails to pull with an authentication/403 error, the images may not be public yet — [build from source](#build-from-source-contributors) in the meantime, or try again shortly.

### Portainer / Synology / any Compose-based panel

Paste `docker-compose.yml` and `docker-compose.app.yml` in as the stack's compose files (multi-file / "additional compose files" support varies by panel — Portainer's stack editor and Synology Container Manager's "Project" both accept multiple YAML files), and paste the contents of your filled-in `.env` into the stack's environment-variables box. No repository checkout or build step is needed on the host itself.

## Configuration

The three secrets above are all that's required. Everything else is optional and lives in [`.env.example`](.env.example):

| What | Env | Notes |
|---|---|---|
| Email | `SMTP_HOST`, … | Any SMTP provider. Omit for console mode. |
| Linear + AI-key encryption | `ENCRYPTION_KEY` | `openssl rand -hex 32`. Needed to connect Linear or store AI keys at rest. |
| AI (env fallback) | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Or add per-workspace keys in Settings → Integrations. |
| Evidence attachments | Cloudflare R2 credentials | For screenshot/log uploads during execution. |
| Error tracking / analytics | `SENTRY_DSN`, `POSTHOG_KEY` | Off (no phone-home) when unset. |

### Production

Layer the production overlay for TLS and public subdomains via Caddy (still pulls the prebuilt images by default):

```bash
docker compose -f docker-compose.yml -f docker-compose.app.yml -f docker-compose.prod.yml up -d
```

The production checklist — DNS, public URLs, OAuth callbacks — is in the header of `docker-compose.prod.yml`.

## Build from source (contributors)

If you're working on Velo itself, or want images built from a checkout instead of GHCR, add the build overlay — it replaces the `image:` pulls with local `build:` context for both services:

```bash
docker compose -f docker-compose.yml -f docker-compose.app.yml -f docker-compose.build.yml up -d --build
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
