# Tattva

**The immutable ledger of human cognitive labor.** Friction is the product.

Tattva is a high-friction technical learning and capability-verification platform built for the REVA University hackathon. See `CLAUDE.md` for the persistent engineering rules and `docs/` for the full architecture.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — persistent engineering rules and baseline architecture
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design, security model, Golden Path
- [`docs/DATABASE.md`](docs/DATABASE.md) — schema, RLS, ledger strategy
- [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md) — endpoint surface
- [`docs/decisions/`](docs/decisions/) — Architecture Decision Records
- [`docs/development-setup.md`](docs/development-setup.md) — get the dev environment running
- [`docs/environment-variables.md`](docs/environment-variables.md) — full env var reference

## Monorepo layout

```text
apps/web/          Next.js App Router frontend
apps/api/           Express + TypeScript backend
packages/contracts/  Shared Zod schemas and inferred TypeScript types
supabase/            Supabase CLI config, migrations, seed data
```

## Quick start

```bash
pnpm install
pnpm dev
```

See [`docs/development-setup.md`](docs/development-setup.md) for prerequisites, environment setup, and troubleshooting (Windows and POSIX shells both covered).

## Team ownership

See `CLAUDE.md` §7 for the current contributor-to-area mapping.

---

_jeetenge bhai.._
