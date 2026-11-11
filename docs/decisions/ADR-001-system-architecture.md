# ADR-001: System Architecture — Modular Monolith with Next.js + Express + Supabase

## Status

Confirmed (baseline direction set by `CLAUDE.md` §4; this ADR records the rationale and alternatives).

## Context

Tattva's hackathon MVP (`CLAUDE.md` §2) must ship one complete vertical slice — source material → Sarvam-generated explanation and follow-ups → persistent branching Knowledge Graph → Research Mode → adversarial trap → server-verified Stamina — within a 24-hour hackathon window, built by a 4-person team (PRD §11), without introducing infrastructure the MVP doesn't need (`CLAUDE.md` §4: "Do not introduce microservices, queues, Kubernetes...").

The system must also satisfy non-negotiable trust boundaries: the browser must never call Sarvam directly or hold privileged Supabase credentials (`CLAUDE.md` §5), and the append-only Stamina ledger must only ever be written by trusted server-side logic (PRD §10).

## Decision

1. **Modular monolith**, not microservices. One deployable backend process (`apps/api`), one frontend deployable (`apps/web`), one Postgres database.
2. **Next.js App Router** for the frontend, chosen for its React Server/Client Component model, file-based routing, and team familiarity assumed from the baseline stack (`CLAUDE.md` §4).
3. **Separate Node.js + Express backend in TypeScript**, rather than colocating API logic inside Next.js API routes. This keeps Sarvam/Supabase privileged access, business rules, and validation in one clearly-owned trust boundary distinct from the frontend's deployment, and matches the explicit team-ownership split (PRD §11: a dedicated "Sarvam API Integration Lead" and a dedicated "Supabase Schema & Ledger Master").
4. **pnpm monorepo** (`apps/web`, `apps/api`, `packages/contracts`) so shared Zod/TypeScript contracts are versioned and imported identically by both apps without publishing a package.
5. **Supabase PostgreSQL** for persistence, chosen for integrated Auth + Postgres + RLS in one managed service, minimizing hackathon setup time.
6. **Sarvam AI accessed exclusively through the backend**, via a dedicated adapter module, never from the browser.

Layering inside `apps/api`: routes → controllers → services → repositories/adapters, per `CLAUDE.md` §4 and detailed in [ARCHITECTURE.md §3](../ARCHITECTURE.md#3-backend-appsapi).

## Alternatives considered

| Alternative | Why rejected for the hackathon |
|---|---|
| Next.js API routes only (no separate Express backend) | Blurs the trust boundary between frontend deployment and privileged backend logic; makes the team-ownership split (PRD §11) less clean; harder to reason about which code path can see service-role credentials. |
| Microservices (separate Sarvam service, separate ledger service) | Pure overhead for a 24-hour build with a 4-person team and one database; directly contradicted by `CLAUDE.md` §4's explicit instruction not to introduce unnecessary distributed infrastructure. |
| Firebase/Firestore instead of Supabase | Supabase's RLS + native Postgres + integrated Auth better fits the relational, constraint-heavy ledger and graph model ([DATABASE.md](../DATABASE.md)); Postgres also gives first-class transactional guarantees needed for the "node + exactly 3 follow-ups" invariant. |
| GraphQL API surface | Adds schema/tooling overhead without a corresponding hackathon benefit; the Golden Path's endpoint set ([API_CONTRACTS.md](../API_CONTRACTS.md)) is small and REST-shaped already. |
| Monorepo tool other than pnpm (Turborepo/Nx) on top | Unnecessary additional tooling for 3 packages and a 24-hour build; plain pnpm workspaces is sufficient and is the already-decided baseline (`CLAUDE.md` §4). |

## Consequences

- Shared contracts in `packages/contracts` become the single source of truth for request/response shapes ([ARCHITECTURE.md §4](../ARCHITECTURE.md#4-shared-contracts-packagescontracts)); both apps must stay in sync with it, and changes must be communicated before parallel work (`CLAUDE.md` §7).
- The Express backend is the only place that can see `SARVAM_API_KEY` and the Supabase service-role key, simplifying the security review surface to one app.
- Two Supabase client instances are needed inside `apps/api` (request-scoped vs. privileged) — documented in [ARCHITECTURE.md §6.3](../ARCHITECTURE.md#63-service-role-credentials-vs-rls--the-critical-boundary) — adding a small amount of internal complexity in exchange for a much stronger security guarantee on ordinary user data.
- Team members can work in parallel against the agreed API contracts without waiting on each other's full implementation, consistent with PRD §11's role split.

## Risks

- A modular monolith concentrates all backend logic in one process; a bug in one service (e.g. the Stamina service) runs in the same process as the rest of the API. Mitigated by keeping layers (controllers/services/repositories) strictly separated and by the Stamina write path being narrowly scoped (§6.3 of ARCHITECTURE.md).
- Two Supabase client types in one codebase is an easy place to introduce a privilege-escalation bug (accidentally using the privileged client for an ordinary read). Mitigated by restricting the privileged client's construction/import to the Stamina service module only — a convention to enforce in code review, not (yet) a compiler-enforced boundary.
