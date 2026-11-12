# Tattva — Claude Code Instructions

This is the persistent project guide for Claude Code. It contains the rules and stable decisions that should apply across tasks. The product PRD defines **what Tattva should do**; this file defines **how we should build it**. Keep this file concise. Put detailed, changing specifications in `docs/` and link them here rather than duplicating them.

**Architecture documentation:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (system design, security model, Golden Path), [docs/DATABASE.md](docs/DATABASE.md) (schema, RLS, ledger strategy), [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) (endpoint surface), [docs/decisions/](docs/decisions/) (ADR-001 system architecture, ADR-002 authentication, ADR-003 database model). The original architecture task brief is preserved at `docs/architecture-brief.md`.

**Setup documentation:** [docs/development-setup.md](docs/development-setup.md) (install, env, running dev, Supabase CLI workflow, troubleshooting), [docs/environment-variables.md](docs/environment-variables.md) (full env var reference).

## 1. Product context

**Tattva's principle: Friction is the product.** Tattva is a high-friction technical learning and capability-verification platform—not a generic chatbot, short-form content platform, or conventional EdTech app. It aims to make a learner's technical inquiry, reasoning, persistence, and demonstrated understanding visible and measurable.

Long-term direction: persistent branching Knowledge Graphs; AI explanations and adaptive follow-ups; adversarial misconception checks; Research Mode; Tattva 200; a server-verified Cognitive Stamina ledger; achievements and, eventually, recruiter-facing capability signals.

The **Tattva PRD is the source of truth for product intent and feature behaviour**. Preserve its terminology and philosophy. Do not silently add, remove, or reinterpret product requirements.

## 2. Immediate objective: hackathon Crucible

Build a small, reliable, demonstrable MVP—not the entire long-term platform. Prioritize **one complete vertical slice** over disconnected screens or partially implemented features.

Target demo journey:

**Technical source/topic → learner inquiry → AI explanation → exactly three follow-ups → persistent Knowledge Graph node → Research Mode / adversarial trap → server-verified Cognitive Stamina.**

### First-slice scope

- One preselected technical topic or curated source item.
- Split-screen workspace: source material on the left, Knowledge Graph on the right.
- Learner inquiry sent to the backend.
- Backend-mediated Sarvam request and validated response.
- Explanation, exactly three adaptive follow-ups, and `is_trap` plus trap details when applicable.
- Persistent root/child nodes with explicit parent-child relationships.
- Research Mode with distinct AI behaviour.
- Server-controlled Stamina transaction, including the PRD's 3× Research Mode multiplier.
- Useful loading, empty, error, and recovery states; repeatable demo scenario.

### Defer unless explicitly brought into scope

Full Tattva 200 and unlock logic; public/multiplayer graphs; The Arena; recruiter dashboards and enterprise APIs; broad content marketplace/creator tools; full ingestion pipeline; billing and production-scale analytics.

The PRD's 25-minute minimum for eligible learning content remains a product constraint. For the hackathon, use a pre-curated source rather than building a complete ingestion pipeline.

## 3. Product invariants

1. Learning history is a **persistent graph**, not an ephemeral chat transcript. A child node must retain its parent relationship.
2. A normal inquiry response has **exactly three** adaptive follow-up questions. Enforce this server-side.
3. Adversarial evaluation is a first-class state. When a trap is raised, the UI must clearly show it and enforce the intended learner action before progression.
4. Research Mode changes the AI's behaviour: favour citations, official documentation, and Socratic questions; do not simply provide direct answers, code, or simplified summaries.
5. Research Mode uses the PRD-defined **3× Stamina multiplier**. Apply it in trusted backend logic, never in the browser.
6. Cognitive Stamina represents verified activity, not a client-editable balance. The `WalletTransactions` ledger is append-only from the application's perspective.
7. Preserve the product's emphasis on rigorous learning. Do not add engagement patterns that contradict it.
8. If a requirement is ambiguous or contradictory, surface it and record a decision; do not silently guess.

## 4. Technical architecture baseline

Use this baseline unless the repository already has a sound working choice or a task explicitly changes it. Do not change the stack casually. Record material changes in an ADR.

| Area | Default |
|---|---|
| Language / package manager | TypeScript / pnpm |
| Repository | pnpm-workspace monorepo |
| Web | Next.js App Router, React, Tailwind CSS |
| Knowledge Graph | `@xyflow/react` |
| API | Node.js + Express |
| Shared contracts | TypeScript + Zod workspace package |
| Database | PostgreSQL via Supabase; SQL migrations |
| AI | Sarvam AI, called only by the backend |
| Tests / quality | Vitest, TypeScript strict mode, ESLint, Prettier |

### Boundaries

- `apps/web`: UI, browser interactions, graph rendering, and frontend API client.
- `apps/api`: HTTP API, validation, business rules, AI orchestration, persistence, and trusted Stamina operations.
- `packages/contracts`: shared Zod schemas and inferred TypeScript types.
- `supabase/`: SQL migrations, seed data, Supabase configuration.
- `docs/`: setup, architecture, API/database conventions, decisions, and team ownership.

Keep this a **modular monolith**. Do not introduce microservices, queues, Kubernetes, or infrastructure the MVP does not need. Do not create empty placeholder files or abstractions without a present use.

### Request flow

`Browser (Next.js) → Express API → service/use case → Sarvam adapter and/or Supabase repository → validated response → browser`

The browser calls the API; it never calls Sarvam directly. The API owns business rules and privileged writes. Keep controllers thin; services own use-case logic; repositories/adapters isolate persistence and external providers. Keep layers pragmatic.

Use `/api/v1` for product API routes. A basic health check may be `/health`.

### Shared contracts

`packages/contracts` is the authoritative interface between web and API.

- Define runtime schemas with Zod; infer TypeScript types from them.
- Validate untrusted HTTP input and AI output on the server.
- Do not duplicate important API types in `web` and `api`.
- Keep Sarvam-specific formats inside its adapter; translate to Tattva's internal contract.
- Treat model output as untrusted. A prompt does not guarantee valid JSON or the required number of follow-ups.
- Shared contract changes must be communicated before parallel implementation.

### Database and identity

- Supabase PostgreSQL is the persistence layer; versioned SQL migrations are the auditable schema source.
- Model graph parent-child relationships explicitly; do not persist the graph only as an opaque frontend blob.
- Treat Stamina ledger entries as immutable. Application code must not update/delete entries to rewrite history.
- Award eligibility, points, multipliers, and ledger writes are trusted backend operations.
- Apply least privilege and RLS wherever browser-accessible Supabase resources exist.
- **Do not expose a Supabase secret/service-role key to the browser.**
- Authentication and demo-user strategy: **[ADR-002](docs/decisions/ADR-002-authentication.md) is implemented** — Supabase anonymous sign-in (canonical identity = Supabase Auth user UUID, backend-verified token on every request, documented upgrade path and limitations).

### Sarvam integration

- All provider calls belong in `apps/api` behind a dedicated adapter.
- Keep prompts, provider request construction, parsing, validation, retry/error handling outside React components.
- Handle malformed output, missing fields, wrong follow-up count, timeouts, rate limits, and provider errors explicitly.
- Verify current model names, endpoints, and capabilities against official Sarvam documentation when implementing the integration; do not guess.
- Do not log credentials or unnecessary learner/source data.
- A controlled demo fixture may make the trap scenario repeatable, but keep it separate from live AI behaviour and never present a mock as a live model result.

## 5. Security rules — non-negotiable

- Never hardcode credentials, tokens, passwords, or private keys. Never commit real `.env` files; commit safe `.env.example` files only.
- Never expose `SARVAM_API_KEY`, Supabase secret/service-role credentials, or private configuration through `NEXT_PUBLIC_*` or browser bundles.
- Use public Supabase keys in the browser only for explicitly intended operations protected by correct RLS. Route privileged product writes through the API.
- Validate environment variables at the relevant app boundary. Optional integration credentials must not prevent the basic health check from starting.
- Never print secrets in logs, errors, screenshots, or documentation.
- Do not trust client-provided user IDs, Stamina amounts, multipliers, roles, or trap-completion claims.
- Use parameterized database operations. Do not weaken CORS, RLS, or other safeguards just to make a demo work.

## 6. Code and Git conventions

- Prefer readable, conventional, maintainable code over clever abstractions.
- Use TypeScript strict mode; avoid `any`. If unavoidable, isolate it and explain why.
- Keep React components focused on UI; keep business logic in feature/service modules.
- Use `camelCase` for variables/functions and `PascalCase` for components/types. Choose descriptive filenames.
- Avoid circular dependencies, oversized files, duplicate configuration, and unrelated refactors.
- Add dependencies only when they provide clear value; use pnpm and the committed lockfile consistently.
- Never delete existing work, migrations, or user data without explicit authorization.
- Use focused feature branches, e.g. `feat/workspace-ui`, `feat/sarvam-integration`, `feat/database-ledger`, `feat/demo-content`, `fix/<description>`.

## 7. Team ownership

| Contributor | Primary area |
|---|---|
| Member 1 | Web UI, workspace, graph rendering and interaction states |
| Member 2 | Sarvam integration, prompts/evaluation, API-side AI behaviour |
| Member 3 | Supabase schema, migrations, RLS, repositories, Stamina ledger |
| Member 4 | Curated seed material, test scenarios, repeatable demo, presentation |

The project lead coordinates architecture, shared contracts, cross-module integration, and final review. Agree on API contracts before parallel frontend/backend work. Avoid simultaneous edits to the same files. Integrate continuously rather than waiting until the end.

## 8. Claude Code working protocol

### Before editing

1. Inspect the actual repository, relevant files, scripts, and Git status. Never assume the repo is empty or overwrite existing work.
2. Read only the relevant PRD sections and design docs for the task; do not reread unrelated material.
3. Reuse sound existing conventions. For multi-file or architecture-affecting work, give a brief plan first.
4. Separate confirmed requirements from assumptions. Make small, reversible choices only when needed; record material decisions.

### During and after implementation

- Work only on the requested scope; do not start the next milestone automatically.
- When implementation is requested, make repository changes rather than stopping at advice.
- Prefer small, reviewable changes. Diagnose command failures and make a reasonable repair attempt; do not conceal failures.
- If an account, credential, or external service is unavailable, implement the safe boundary and state the exact manual step. Never fabricate integration success.
- Ask only when a genuinely blocking product decision cannot be resolved from the PRD or existing code; otherwise make a conservative documented choice.
- Run relevant tests/checks, then inspect the diff for regressions, unrelated edits, and secrets.
- Update docs when setup, contracts, architecture, or behaviour changes.
- Report what changed, what was actually verified, what remains blocked, and the next milestone. Never claim an unrun check passed.

### Context efficiency

- Keep this file focused on durable rules; put detailed/evolving specs in `docs/` and reference them here.
- Inspect targeted files instead of dumping entire directories, lockfiles, generated output, or unrelated source.
- Keep plans and completion reports concise and specific. Do not repeat the full product vision on every task.

## 9. Source-of-truth order

1. User's latest explicit instruction for the current task.
2. Tattva PRD for product intent and behaviour.
3. Accepted ADRs and approved technical design docs for implementation decisions.
4. This file for persistent engineering rules and baseline architecture.
5. Existing code as evidence of current implementation—not automatic proof of intended behaviour.

If these conflict, explain the conflict and propose the smallest decision needed. Do not silently reconcile it.

## 10. Definition of done

Work is done only when the requested scope is implemented, relevant contracts remain consistent, appropriate validation/error handling exists, relevant checks have actually been run and reported, necessary docs are updated, no secrets/unrelated changes were introduced, and another team member can understand the result.

**North star:** build the smallest reliable system that proves Tattva's central idea, with clear boundaries the team can extend under hackathon time pressure.
