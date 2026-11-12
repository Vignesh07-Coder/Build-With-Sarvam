# Implementation Status

Classifies every Golden Path feature as **IMPLEMENTED**, **PARTIALLY IMPLEMENTED**, **MOCK DATA**, or **NOT IMPLEMENTED**, per the Stage 5 audit requirement. Written before Stage 5's changes (Phase 1 audit) and updated after them (this version) — see git history for the pre-Stage-5 snapshot if needed.

## Frontend workspace (`apps/web`)

| Feature | Status | Notes |
|---|---|---|
| Source Material panel | **MOCK DATA** | Renders `fixtureSource`/`fixtureSourceBody` (`lib/fixtures/workspace-fixtures.ts`). No ingestion/body-fetch endpoint exists; out of Stage 5 scope. |
| Knowledge Graph (nodes/edges) | **MOCK DATA** | Renders `fixtureNodes` via `@xyflow/react`. No node-creation endpoint exists yet (deferred to the Sarvam-integration milestone, per this stage's strict scope boundaries). |
| Root question node / child nodes | **MOCK DATA** (rendering) + **IMPLEMENTED** (persistence substrate) | The `question_nodes`/`follow_up_questions` tables, RLS, and a read path (`GET /api/v1/inquiries/:inquiryId`) are real and persisted; nothing currently writes a node, so the graph above still renders fixtures. |
| Follow-up questions | **MOCK DATA** (rendering) + **IMPLEMENTED** (schema) | Same as above — `follow_up_questions` schema/constraints exist and are read-path ready; no write path yet. |
| Research Mode toggle | **PARTIALLY IMPLEMENTED** | UI toggle flips theme and would set `researchMode` on the (not-yet-existing) node-creation request; no backend node endpoint consumes it yet. |
| Trap UI | **MOCK DATA** | `TrapPanel` + `handleSubmitTrap` use a local `setTimeout` to fake "submitted" — no `POST /api/v1/question-nodes/:nodeId/trap-attempts` exists (explicitly deferred, out of Stage 5 scope). |
| Cognitive Stamina display | **MOCK DATA** | Renders `fixtureStamina`. `wallet_transactions` schema/RLS/append-only grants exist; no `GET /api/v1/stamina/me` or award-writing service exists yet (explicitly deferred). |
| Inquiry composer | **MOCK DATA** (submission) | Submitting a question still hits the `NOT_CONNECTED_MESSAGE` fallback in `Workspace.tsx` — no node-creation endpoint to call. |
| Authenticated identity | **IMPLEMENTED** | `lib/auth.ts` establishes/reuses a real Supabase anonymous session; `SessionStatus` surfaces it. Never a client-invented user ID. |
| Inquiry creation/retrieval | **IMPLEMENTED** | `lib/workspace-bootstrap.ts` creates/reuses one real, persisted `inquiries` row per browser identity against the seeded demo `learning_sources` row, via the real API. |

## Backend (`apps/api`)

| Feature | Status | Notes |
|---|---|---|
| `GET /health` | **IMPLEMENTED** | Pre-existing, unchanged. |
| Auth middleware (`requireAuth`) | **IMPLEMENTED** | Verifies a Supabase Auth bearer token via `auth.getUser`; attaches `{ userId, isAnonymous, accessToken }`; never trusts a client-supplied user id; returns `503` if Supabase isn't configured, `401` on missing/invalid/expired tokens. |
| `GET /api/v1/me` | **IMPLEMENTED** | Echoes the verified identity only. |
| `POST /api/v1/inquiries` | **IMPLEMENTED** | Validates `learningSourceId` (format + existence), inserts via the request-scoped (RLS-protected) client with `user_id` from the verified token. |
| `GET /api/v1/inquiries` | **IMPLEMENTED** | Added in Stage 5 beyond the original `API_CONTRACTS.md` draft — see that doc's note. Lists the caller's own inquiries. |
| `GET /api/v1/inquiries/:inquiryId` | **IMPLEMENTED** | Ownership-checked (404, not 403, on mismatch/missing); assembles inquiry + learning source + nodes (nodes array empty until node-creation exists). |
| `POST /api/v1/inquiries/:inquiryId/nodes` | **NOT IMPLEMENTED** | Explicitly out of Stage 5 scope (no Sarvam integration, no dynamic question generation yet). |
| `POST /api/v1/question-nodes/:nodeId/trap-attempts` | **NOT IMPLEMENTED** | Explicitly out of scope (trap evaluation deferred). |
| `GET /api/v1/stamina/me` | **NOT IMPLEMENTED** | Explicitly out of scope (Stamina awarding logic deferred). |

## Database (`supabase/`)

| Feature | Status | Notes |
|---|---|---|
| `learning_sources` table + RLS + seed | **IMPLEMENTED** | One curated row seeded (Memory Arena Allocators, matching the frontend fixture's content). |
| `inquiries` table + RLS + indexes | **IMPLEMENTED** | Owner-only select/insert; no update/delete policy (immutable once created). |
| `question_nodes` table + RLS + root-uniqueness | **IMPLEMENTED** (schema) | Single-root-per-inquiry enforced by a partial unique index; no rows are ever written yet (no node-creation endpoint). |
| `follow_up_questions` table + RLS + position constraints | **IMPLEMENTED** (schema) | `UNIQUE(question_node_id, position)`, `CHECK(position IN (1,2,3))`; the cross-row "exactly 3" invariant is explicitly a future service-layer responsibility (ADR-003), not enforced here. |
| `wallet_transactions` table + append-only grants | **IMPLEMENTED** (schema) | `REVOKE UPDATE, DELETE` from all roles including `service_role`; owner-only `SELECT`; no `INSERT`/`UPDATE`/`DELETE` policy for `authenticated`. No application code writes here yet. |

## What remains blocked without a live Supabase project

All of the above was verified by: `pnpm typecheck`, `pnpm lint`, and `pnpm test` (30 tests total across `packages/contracts`, `apps/api`, `apps/web`), all passing, with the Supabase-dependent code paths covered by mocking `@supabase/supabase-js` and the repository layer. **No test here ran against an actual Postgres instance** — that requires a real or local (`npx supabase start`, Docker) Supabase project, which was not available in this environment. Specifically still blocked:

1. Running `npx supabase db reset` against a real local Postgres to confirm the migration applies cleanly and the seed is idempotent.
2. End-to-end verification: a browser establishing a real anonymous session, calling the real API, and a row actually landing in Postgres.
3. Confirming RLS actually rejects cross-user access at the database level (only verified at the service/application layer here, via mocks).

See the Stage 5 final report for the exact manual steps to unblock these.
