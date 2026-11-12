# Development Setup

This covers getting the Tattva monorepo running locally. Commands are given for both POSIX shells (bash/zsh) and Windows PowerShell where they differ.

## Prerequisites

| Tool | Required version | Check |
|---|---|---|
| Node.js | >= 20 | `node -v` |
| pnpm | 12.x (pinned via `packageManager` in `package.json`) | `pnpm -v` |
| Supabase CLI | latest | `npx supabase --version` (no global install required) |
| Git | any recent version | `git --version` |

### Installing pnpm

If `pnpm -v` fails:

**POSIX:**
```bash
corepack enable
corepack prepare pnpm@12.18.0 --activate
```

**Windows PowerShell** (if `corepack enable` errors with a permissions issue writing into the Node install directory — this can happen on some local Node installs):
```powershell
npm install -g pnpm
```

## 1. Install dependencies

From the repository root (installs all three workspace packages in one pass):

```bash
pnpm install
```

## 2. Configure environment variables

```bash
# POSIX
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

```powershell
# Windows PowerShell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

The defaults in `.env.example` are sufficient to run the full dev environment with no external accounts — see [`environment-variables.md`](environment-variables.md) for what each variable does and which ones are genuinely required.

## 3. Run the dev environment

Start both apps together from the root:

```bash
pnpm dev
```

This runs `apps/web` (`http://localhost:3000`) and `apps/api` (`http://localhost:4000`) in parallel via pnpm's recursive `--parallel` runner — no extra process manager is installed for this (`CLAUDE.md` §4: avoid unnecessary infrastructure/tooling).

To run just one app:

```bash
pnpm dev:web
pnpm dev:api
```

Open `http://localhost:3000` — the landing page shows a live connectivity indicator that calls `apps/api`'s `/health` endpoint through the shared API client.

## 4. Supabase (local database)

The product schema (`docs/DATABASE.md`, ADR-003) is migrated under `supabase/migrations/`. Anonymous sign-in (ADR-002) is enabled in `supabase/config.toml` for local dev.

**Start the local Supabase stack** (requires Docker Desktop running):
```bash
npx supabase start
```
This prints a local `API URL`, `anon key`, and `service_role key` — copy those into `apps/api/.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and into `apps/web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

**Create a new migration** (for schema changes beyond the initial Stage 5 migration):
```bash
npx supabase migration new <descriptive_name>
```
Edit the generated SQL file under `supabase/migrations/`.

**Apply migrations locally:**
```bash
npx supabase db reset
```
This drops and recreates the local database, re-runs every migration in `supabase/migrations/` in order (currently `20261112120000_initial_schema.sql`, the five Golden Path tables + RLS), then runs `supabase/seed.sql` (seeds the one curated `learning_sources` demo row).

**Link to a real Supabase project** (for a shared/deployed database):
```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**Stop the local stack:**
```bash
npx supabase stop
```

Never commit real Supabase credentials. `apps/api/.env` and `apps/web/.env.local` are gitignored; only the `.env.example` files are committed.

## 5. Quality checks

```bash
pnpm lint        # ESLint across all three packages
pnpm typecheck   # tsc --noEmit across all three packages
pnpm test        # Vitest across all three packages
pnpm build       # Production build of apps/web and apps/api
```

Run these before opening a pull request (see `.github/pull_request_template.md`).

## 6. Troubleshooting

- **`pnpm: command not found`** — see "Installing pnpm" above.
- **`corepack enable` fails with an EPERM/permission error on Windows** — your Node install directory isn't writable by the current user; use `npm install -g pnpm` instead.
- **Port already in use (3000 or 4000)** — another process is using it; stop it, or override `PORT` in `apps/api/.env` and `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` together.
- **API connectivity indicator shows "API unreachable"** — confirm `apps/api` is actually running (`pnpm dev:api`) and that `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` matches the port `apps/api` is listening on.
- **CORS error in the browser console** — `CORS_ORIGIN` in `apps/api/.env` must exactly match the frontend's origin (scheme + host + port).
- **TypeScript errors about `@tattva/contracts` not found** — run `pnpm install` again from the repo root; pnpm workspace symlinks are created there, not inside individual app directories.
- **Session banner shows "Demo mode — Supabase not configured"** — `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are blank in `apps/web/.env.local`; copy them from `npx supabase start`'s output (see §4).
- **`/api/v1/*` requests return `503 auth_not_configured`** — same cause on the backend: `SUPABASE_URL`/`SUPABASE_ANON_KEY` are blank in `apps/api/.env`.
- **`401 invalid_token`** — the local Supabase stack was restarted (new JWT signing material) while an old session was cached in the browser; clear local storage for `localhost:3000` or open a private window.
