# Smile Rewards — Standalone Web App

A standalone web app showcasing a Shopify store's rewards program, powered by
the [Smile.io Backend API](https://dev.smile.io/api/introduction).

> **Status:** this branch (`main`) contains scaffolding and framework code only.
> Feature work lives on a separate branch and is submitted as a pull request.

## Architecture

```
apps/
  web/       Vite + React 19 — the UI. Never talks to Smile directly.
  api/       Hono on Vercel Functions — holds the Smile private API key.
packages/
  shared/    Zod schemas + inferred types: the API contract, defined once.
```

The split is deliberate. The Smile API key authenticates as the whole store, so
it must never reach the browser. Keeping the backend in its own deployable app
makes that boundary structural rather than a convention someone has to remember:
there is no code path by which the frontend bundle could import the key.

`packages/shared` holds Zod schemas that the API validates responses against and
the client parses them with, so the two cannot silently drift.

### Request flow

```
browser ──► /api/*  ──►  Hono backend  ──►  api.smile.io
                          (holds SMILE_API_KEY)
```

In development, Vite proxies `/api` to the backend so the browser sees one
origin and CORS never comes up. In production the same holds if the frontend
project rewrites `/api/*` to the backend deployment; otherwise set
`VITE_API_BASE_URL` on the frontend and `WEB_ORIGIN` on the backend.

## Getting started

Requires Node 20+.

```bash
npm install
```

Copy the env templates and fill them in:

```bash
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env
```

Then run everything:

```bash
npm run dev
```

- Frontend — http://localhost:5173
- Backend — http://localhost:3000/api/health

The homepage renders the backend's health status, which confirms the proxy and
the shared contract are wired up correctly.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Runs `shared` (watch), `api`, and `web` together |
| `npm run build` | Builds all workspaces in dependency order |
| `npm run typecheck` | Type-checks every workspace |
| `npm run clean` | Removes `node_modules` and build output |

`@repo/shared` compiles to `dist/`. A root `postinstall` builds it after every
`npm install`, so a fresh clone — and every Vercel build — has it available
without any extra step.

## Configuration

All secrets live on the backend. See `apps/api/.env.example` for the full list.

| Variable | Where | Notes |
| --- | --- | --- |
| `SMILE_API_KEY` | api | **Secret.** From Smile Admin. Server-side only. |
| `SMILE_CUSTOMER_ID` | api | Sample customer; stands in for an auth system. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | api | Challenge store + rate limiting. |
| `WEB_ORIGIN` | api | Frontend origin, for CORS. Unset locally. |
| `VITE_API_BASE_URL` | web | **Public** — inlined into the bundle. Usually unset. |

Anything prefixed `VITE_` is compiled into the client bundle and is public by
definition. No secret may ever carry that prefix.

## Deployment

Two Vercel projects from this one repository:

| Project | Root directory | Framework |
| --- | --- | --- |
| Frontend | `apps/web` | Vite (auto-detected) |
| Backend | `apps/api` | Hono (auto-detected, zero config) |

Both use Vercel's default build settings. Because Vercel installs npm workspaces
from the repository root, the root `postinstall` builds `@repo/shared` before
either app builds — so neither project needs a custom build command.

Vercel serves the default export of `apps/api/src/index.ts` as a Function; the
local `src/dev.ts` server is not used in production. Set each project's
environment variables in the Vercel dashboard — the backend needs the secrets,
the frontend needs none.

`apps/web/vercel.json` rewrites `/api/*` to the backend deployment so the
browser stays same-origin in production — no CORS, no preflight, and
`VITE_API_BASE_URL` stays unset. Update that destination if the backend's
domain changes.

Note that frontend preview deployments rewrite to the *production* backend,
since the destination is a fixed URL. That is an accepted trade-off for this
project; Vercel's Related Projects is the production-grade answer.

## Branching

Per the project brief, `main` holds scaffolding and framework code only. All
implementation work happens on a feature branch and is opened as a PR against
`main`, so the diff shows the code actually written for this project.
