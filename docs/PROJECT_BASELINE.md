# Tattva — Project Baseline (Repository Audit)

**Purpose:** a factual snapshot of what is actually implemented, as of this audit, to support dividing ownership between two developers. Based on direct inspection of code, the database migration, and actual command output — not on documentation claims. Where documentation and code disagree, code wins and the disagreement is noted.

**Audit date:** 2026-11-13. **Method:** direct file inspection + `pnpm -r test`, `pnpm -r run typecheck`, `pnpm -r run lint` executed in this session (all three green — see §10).

Status legend: **IMPLEMENTED** (exists and works) · **PARTIALLY IMPLEMENTED** (some functionality exists) · **VERIFIED** (explicitly tested, with evidence) · **DOCUMENTED ONLY** (described in `docs/` but no code) · **NOT IMPLEMENTED** (no code found) · **UNKNOWN** (insufficient evidence).

---

## 1. Project status summary

Tattva is a hackathon-MVP learning platform (Next.js frontend + Express/TypeScript API + Supabase Postgres + Sarvam AI). The persistence substrate (schema, RLS, auth) and the read-side API are real and tested. The two things the product actually depends on — a live AI-generated Knowledge Graph and any source-ingestion pipeline — are **not wired together yet**: the Sarvam adapter was just built and unit-tested in isolation, but nothing calls it from an endpoint, and there is no node-creation endpoint, no persistence write path for AI output, and no transcript/document ingestion of any kind. The frontend renders entirely from hardcoded fixtures.

In one sentence: **the walls and plumbing exist; the AI engine was just bench-tested and the production adapter is unit-tested; the two are not yet connected to each other, there is no room with furniture in it (no live node generation), and there is no loading dock for new source material (no ingestion).**

---

## 2. Implemented and verified functionality

| Component | Status | Evidence |
|---|---|---|
| `GET /health` | **VERIFIED** | `apps/api/src/controllers/health.controller.ts`, `apps/api/src/routes/health.test.ts`; passes in `pnpm -r test` run (§10). |
| `GET /api/v1/me` (verified-identity echo) | **VERIFIED** | `apps/api/src/controllers/me.controller.ts`; covered by `apps/api/src/routes/api-v1.test.ts` and `apps/api/src/middleware/auth.middleware.test.ts`. |
| Auth middleware (`requireAuth`) | **VERIFIED** | `apps/api/src/middleware/auth.middleware.ts` — verifies a Supabase bearer token via `auth.getUser`, attaches `{userId, isAnonymous, accessToken}`, returns 503 if Supabase unconfigured, 401 on bad/missing token. `auth.middleware.test.ts` covers these paths with mocks. |
| `POST /api/v1/inquiries` | **VERIFIED** | `apps/api/src/controllers/inquiry.controller.ts` → `inquiryService.ts` → `inquiryRepository.ts`. Validates `learningSourceId` exists, inserts with `user_id` from the verified token. Covered by `inquiryService.test.ts` (mocked Supabase) and `api-v1.test.ts`. |
| `GET /api/v1/inquiries` | **VERIFIED** | Same files; lists caller's own inquiries, `user_id`-scoped. Tested. |
| `GET /api/v1/inquiries/:inquiryId` | **VERIFIED** | Ownership-checked (404 on mismatch, not 403); assembles inquiry + learning source + nodes. `questionNodeRepository.listNodesForInquiry` is a real, working **read-only** query (`apps/api/src/repositories/questionNodeRepository.ts`). Tested in `inquiryService.test.ts`. |
| Frontend anonymous-session bootstrap | **IMPLEMENTED** (not independently unit-tested beyond mocks) | `apps/web/lib/auth.ts` calls `supabase.auth.getSession()`/`signInAnonymously()`; `apps/web/lib/auth.test.ts` exists and passes. |
| Frontend ↔ backend wiring for inquiry create/list/get | **VERIFIED** | `apps/web/lib/api-client.ts`, `apps/web/lib/workspace-bootstrap.ts`; `api-client.test.ts` and `workspace-bootstrap.test.ts` both pass. |
| Database schema (5 tables, RLS, indexes, triggers) | **IMPLEMENTED** (schema only — not verified against a live Postgres in this audit) | `supabase/migrations/20261112120000_initial_schema.sql`. Inspected directly — see §7. No database connection was used in this audit (per restrictions), so "the migration actually applies cleanly" is **UNKNOWN**, not verified here. |
| Sarvam adapter (prompts, client, parser, false-premise verification) | **VERIFIED, in isolation only** | `apps/api/src/integrations/sarvam/{client,prompts,parser,schemas,errors,falsePremiseVerification}.ts`. 3 dedicated test files, 25 tests, all passing (`client.test.ts`, `parser.test.ts`, `falsePremiseVerification.test.ts`). Prompt wording verified byte-identical to the benchmark script. **Not wired to any route, service, or persistence** — see §4 for a real gap found in this exact module during a prior review (false-premise quote stripping). |
| `sarvam-105b` live benchmark (5/5 canonical cases) | **VERIFIED** | `apps/api/scripts/sarvam-benchmark.ts` + `apps/api/scripts/.benchmark-output.json` (real recorded API responses, not simulated). Explicitly a throwaway script, not production code. |

**Full automated test count (this session):** 56 tests across 11 files in 3 packages — `packages/contracts` (3), `apps/api` (44), `apps/web` (9) — all passing. `apps/web` has no `supabase` workspace package to typecheck/lint/test separately beyond what's listed; the 4th workspace project (`Build-With-Sarvam` root, if counted) has no test script.

---

## 3. Partially implemented functionality

| Component | Status | What exists | What's missing |
|---|---|---|---|
| Knowledge Graph (nodes/edges) | **PARTIALLY IMPLEMENTED** | Rendering is real and functional: `apps/web/components/knowledge-graph/KnowledgeGraphCanvas.tsx` uses `@xyflow/react`, computes layout (`apps/web/lib/graph-layout.ts`), handles loading/error/empty states (`GraphStates.tsx`). The `question_nodes`/`follow_up_questions` DB schema and a real read endpoint exist. | It only ever renders `apps/web/lib/fixtures/workspace-fixtures.ts` (`fixtureNodes`), per `apps/web/app/page.tsx:9-13`. No node is ever created by a real user action — `Workspace.tsx:46-48` (`handleComposerSubmit`) and `:65-70` (`handleSubmitTrap`) both just run a fake `setTimeout`-based "not connected" flow (`NOT_CONNECTED_MESSAGE`, `Workspace.tsx:13-14`). |
| Research Mode | **PARTIALLY IMPLEMENTED** | UI toggle is real (`apps/web/components/research-mode/ResearchModeToggle.tsx`), flips local state and placeholder text. The Sarvam adapter's Research Mode prompt + parser are implemented and tested (`prompts.ts`, `parser.ts`). | Toggle state is never sent anywhere — no request carries `researchMode`, because there is no node-creation endpoint. The "how Socratic output maps into the non-nullable `ai_explanation` column" decision is explicitly undecided (flagged in the adapter's own commit history and in `docs/INTELLIGENCE_ARCHITECTURE.md` §6's mapping table). |
| Misconception detection / adversarial trap ("Be Careful Here!!") | **PARTIALLY IMPLEMENTED** | `TrapPanel.tsx` is a real, working UI component (form, disabled states, resolved state). The adapter's parsing + independent false-premise verification exist and are tested. | `Workspace.tsx:65-70` fakes submission with `setTimeout`; no `POST /api/v1/question-nodes/:nodeId/trap-attempts` exists. Nothing currently calls the adapter's verification logic from a request path. |
| Stamina / wallet display | **PARTIALLY IMPLEMENTED** (display only) | `StaminaDisplay.tsx` renders a real `StaminaState` shape. `wallet_transactions` table, RLS, and append-only grants exist in the migration (`REVOKE UPDATE, DELETE ... GRANT SELECT, INSERT TO service_role` — lines 235-236). | Always renders `fixtureStamina` (`apps/web/app/page.tsx:13`). No `GET /api/v1/stamina/me`, no award-writing service, no application code ever reads or writes this table. |
| Source Material panel | **PARTIALLY IMPLEMENTED** (display only) | `SourceViewer.tsx` renders title/description/body in a real layout with metadata badge. | Renders `fixtureSource`/`fixtureSourceBody` only (hardcoded strings in `workspace-fixtures.ts`). The seeded `learning_sources.source_reference` value (`'seed/memory-arena-allocators.txt'`) is a text pointer only — no file at that path was found, no fetch-by-reference endpoint exists. |
| Auth / user management | **PARTIALLY IMPLEMENTED** (anonymous-only) | Supabase anonymous sign-in, backend token verification, ownership checks throughout — solid and tested. | No non-anonymous auth path (email/password, OAuth) exists or is claimed to exist. This matches `ADR-002`'s documented scope (anonymous-only for the hackathon), so it is a scoped decision, not an oversight — listed here because "auth and user management" was explicitly asked about. |

---

## 4. Documented-only functionality (design exists, zero code)

These appear in `docs/INTELLIGENCE_ARCHITECTURE.md` and/or `docs/API_CONTRACTS.md` as "Proposed"/"Pending" but have **no corresponding file in the repository**:

| Component | Status | Where documented |
|---|---|---|
| `services/sourceContext.ts` (loads/bounds a source excerpt for a question) | **DOCUMENTED ONLY** | `docs/INTELLIGENCE_ARCHITECTURE.md` §8, §10 (chunking strategy explicitly "Pending") |
| `services/graphContext.ts` (bounded ancestry context assembly) | **DOCUMENTED ONLY** | `docs/INTELLIGENCE_ARCHITECTURE.md` §3, §8 |
| `services/inquiryOrchestration.ts` (ownership → context → Sarvam → validate → persist) | **DOCUMENTED ONLY** | `docs/INTELLIGENCE_ARCHITECTURE.md` §8 |
| `POST /api/v1/inquiries/:inquiryId/nodes` | **DOCUMENTED ONLY** | `docs/API_CONTRACTS.md` §4 (full request/response shape specified, zero implementation) |
| `POST /api/v1/question-nodes/:nodeId/trap-attempts` | **DOCUMENTED ONLY** | `docs/API_CONTRACTS.md` §5 |
| `GET /api/v1/stamina/me` + Stamina-awarding service | **DOCUMENTED ONLY** | `docs/API_CONTRACTS.md` §6, `docs/DATABASE.md` §6-7 (exact point values explicitly "Pending — do not guess") |
| `question_nodes.references` column | **DOCUMENTED ONLY** (recommended, not applied) | `docs/INTELLIGENCE_ARCHITECTURE.md` §7 — explicitly "not made in this phase" |
| Transcript/source ingestion pipeline | **DOCUMENTED ONLY, as "explicitly deferred"** | `CLAUDE.md` §2: "use a pre-curated source rather than building a complete ingestion pipeline"; `docs/DATABASE.md` §A: "there is no ingestion pipeline" (stated directly, not a gap description — this is the documented intended state for the hackathon). |

**Known residual defect, carried forward from a prior review of the Sarvam adapter** (not re-verified by re-running against live Sarvam in this audit, but reproduced against the real recorded benchmark output on disk): `apps/api/src/integrations/sarvam/falsePremiseVerification.ts`'s `verifyFalsePremiseQuote` does a raw `originalQuestion.includes(falsePremiseQuote)` check. The one real, live, deliberately-seeded true-positive case in the benchmark (`TEST_04` in `apps/api/scripts/.benchmark-output.json`) has the model wrapping its quote in literal `"..."` characters, which the original question text does not contain — so this exact real case would fail verification today. `docs/SARVAM_BENCHMARK_REPORT.md` §12.4 names this exact issue and recommends stripping wrapping quote marks before comparison; that fix has not been applied in `falsePremiseVerification.ts`. Flagged here as a known, reproducible gap for whoever picks up Sarvam integration next — not re-confirmed via a new live API call in this audit (no external API calls were made), but confirmed by replaying the already-recorded `rawContent` through the current parser + verifier.

---

## 5. Missing functionality (no implementation, no explicit design doc either)

- **Any transcript/document ingestion or ETL** — no upload endpoint, no file parser, no text extraction, no chunking/segmentation code anywhere in the repository. Confirmed by: `learning_sources` schema has no body/content-text column, no status column, no processing-metadata column (`supabase/migrations/20261112120000_initial_schema.sql:10-19`); `grep`-level inspection of `apps/api/src` and `apps/web/lib` found no file matching ingestion/transcript/extraction/chunking naming.
- **Timestamp preservation for source material** — `learning_sources` has no per-segment timestamp column; the one seeded row's body lives only as a hardcoded string in a frontend fixture file, with no timestamp structure at all.
- **A node-creation endpoint of any kind.**
- **A Stamina-awarding service of any kind** (ledger schema exists; nothing writes to it).
- **Trap-attempt evaluation.**
- **Any non-anonymous authentication.**

---

## 6. Existing source-ingestion and processing capabilities (detailed, per explicit request)

This section answers the specific question of whether source ingestion/processing can be assigned as independent work.

- **How sources enter the system today:** exactly one way — a hand-written SQL `INSERT ... ON CONFLICT` in `supabase/seed.sql`, run via `supabase db reset`. There is no second path (no admin UI, no upload form, no script that parses a file into a row).
- **Supported input formats:** the `source_type` check constraint allows `'video' | 'document' | 'transcript'` (`supabase/migrations/...sql:14`), but only `'transcript'` has ever been used, and nothing in the codebase distinguishes behavior by type — it's an unused enum today beyond the one seeded value.
- **Does a transcript already exist?** A plain-text excerpt exists only as a TypeScript string constant, `apps/web/lib/fixtures/workspace-fixtures.ts:20-42` (`fixtureSourceBody`), duplicated by value (not by reference) inside `apps/api/scripts/sarvam-benchmark.ts:51-73` (`SOURCE_EXCERPT`) — two independent copies of the same text, a duplication risk flagged in §9. The `source_reference` column value (`'seed/memory-arena-allocators.txt'`) is a path string only; **no such file exists in the repository** — it is a documentation-style pointer, not a resolvable asset.
- **Is transcript extraction implemented?** No. There is no code that takes a video/audio/document and produces text.
- **Does text cleaning exist?** No dedicated cleaning/normalization function was found anywhere.
- **Does chunking or segmentation exist?** No. `docs/INTELLIGENCE_ARCHITECTURE.md` §10 explicitly lists "source chunking strategy" as an unresolved, undecided question — not implemented, not even fully designed.
- **Are timestamps/source references preserved?** No per-segment timestamp structure exists at all; `source_reference` is a single flat string per source, not a structured citation/offset format.
- **Is processing metadata/status stored?** No. The `learning_sources` table has no status, no processing-state, no error, no `processed_at`-style column — only descriptive metadata (`title`, `description`, `source_type`, `duration_minutes`, `source_reference`, `published_at`, `created_at`).
- **Is there any existing service/utility that could be reused for ingestion?** None found. The closest adjacent code is `apps/api/src/repositories/learningSourceRepository.ts`, which is a **read-only** `findLearningSourceById` lookup — explicitly documented in its own comment as "the hackathon MVP never inserts/updates this table from `apps/api` — curated rows are seeded only." It is not a starting point for ingestion logic; a second developer would be building this from zero, with no scaffolding beyond the row shape itself and the Zod contract (`packages/contracts/src/learning-source.ts`).

**Conclusion for ownership planning:** source ingestion/processing is a genuinely greenfield module. It does not currently overlap any other in-flight work (the Sarvam adapter consumes a plain string, however that string is produced — see `apps/api/src/integrations/sarvam/prompts.ts`'s `sourceExcerpt: string` parameter), so it is a clean, independent boundary, but whoever owns it should expect to design the schema additions (processing status, body storage, chunk metadata) from scratch, since §C above found nothing to reuse and `docs/DATABASE.md` §A explicitly states "there is no ingestion pipeline."

---

## 7. Architecture and module ownership map

### Frontend (`apps/web`)
- `app/` — `page.tsx` (single page, renders fixtures), `layout.tsx`, `globals.css`.
- `components/workspace/` — `Workspace.tsx` (top-level orchestration, currently fixture-driven), `NodeDetailPanel.tsx`.
- `components/knowledge-graph/` — `KnowledgeGraphCanvas.tsx`, `QuestionGraphNode.tsx`, `GraphStates.tsx`.
- `components/{source-viewer,research-mode,stamina,trap,inquiry,shared}/` — one component family per feature area.
- `lib/` — `auth.ts`, `api-client.ts`, `workspace-bootstrap.ts`, `workspace-types.ts` (independent duplicate of API shapes — see §9), `graph-layout.ts`, `fixtures/workspace-fixtures.ts`, `supabase/client.ts`.

### Backend (`apps/api`)
- `routes/` → `controllers/` → `services/` → `repositories/`|`integrations/` (thin-controller layering, consistently followed).
- `repositories/`: `learningSourceRepository.ts` (read-only), `inquiryRepository.ts` (read/write), `questionNodeRepository.ts` (**read-only**, no write function exists yet).
- `integrations/supabase/`: `client.ts` — three client constructors (`createRequestScopedClient`, `createAnonVerificationClient`, `getAdminClient`), cleanly separated by trust level.
- `integrations/sarvam/`: `client.ts`, `prompts.ts`, `parser.ts`, `schemas.ts`, `errors.ts`, `falsePremiseVerification.ts` — all new, all unit-tested, **zero Supabase/contracts coupling** (verified by grep in a prior review), **not called from anywhere else in the codebase yet**.
- `middleware/`: `auth.middleware.ts`, `errorHandler.ts`, `notFound.ts`, `requestLogger.ts`.
- `config/env.ts`: single source of environment validation (Zod), optional-at-startup for Sarvam/Supabase credentials.

### Shared contracts (`packages/contracts`)
- `health.ts`, `api-error.ts`, `me.ts`, `learning-source.ts`, `question-node.ts`, `inquiry.ts` — all Zod schemas with inferred types, re-exported from `index.ts`. **No Sarvam-raw-output schema lives here** (deliberately — those live API-internal in `integrations/sarvam/schemas.ts`, per the prior task's explicit design decision not to confuse raw model output with persisted shapes).

### Database (`supabase/`)
Five tables, all inspected directly in `supabase/migrations/20261112120000_initial_schema.sql`: `learning_sources`, `inquiries`, `question_nodes`, `follow_up_questions`, `wallet_transactions`. Full RLS on all five; `wallet_transactions` additionally has `UPDATE`/`DELETE` revoked at the grant level for every role including `service_role` (lines 235-236) — a real, verified-by-reading-the-SQL immutability guarantee, not just a policy.

### Integration boundaries (confirmed by inspection, not just by doc claim)
- Browser → `apps/api` only (no direct browser→Sarvam, no direct browser→privileged-Supabase-client path found).
- `apps/api` → Supabase via two distinct client types (request-scoped vs. admin); admin client (`getAdminClient`) exists but is **called from nowhere** in the current codebase.
- `apps/api` → Sarvam via the new adapter; **not called from any controller/service**.

---

## 8. Recommended independent development boundaries

Based strictly on what exists today and has no current in-flight dependency:

1. **Source ingestion & processing** (second developer, as under consideration) — genuinely greenfield (§6). Needs: new `learning_sources` columns (body storage, processing status), a chunking/segmentation module, and a decision on supported input formats. Its only contract with the rest of the system is "produce a text excerpt the Sarvam adapter can take as its `sourceExcerpt: string` parameter" (`apps/api/src/integrations/sarvam/prompts.ts`) — a narrow, stable interface.
2. **Node-generation orchestration** (`services/sourceContext.ts`, `graphContext.ts`, `inquiryOrchestration.ts`, the node-creation endpoint, and the `questionNodeRepository` write path) — depends on the Sarvam adapter (done) and, once ingestion lands, on its output shape, but can be built against the *current* fixture-string shape in the meantime without blocking on ingestion.
3. **Stamina/wallet service** — depends only on `wallet_transactions` (exists) and knowing which events to award for (needs node-generation to exist first to have real trigger points, but the ledger-write mechanics can be built and tested against the `question_nodes` schema immediately).
4. **Frontend wiring of the above to real endpoints** — currently blocked behind #2 existing; the UI components themselves (`KnowledgeGraphCanvas`, `TrapPanel`, `StaminaDisplay`) are already built and only need real data piped in, not rewritten.

**Boundary least likely to collide:** #1 (ingestion) and #2 (orchestration) touch different files almost entirely today — the only shared surface is the as-yet-unbuilt call from orchestration into whatever ingestion produces. Assigning them to two different people is low-risk *if* the text-excerpt interface is agreed first (even informally) so neither side blocks the other.

---

## 9. Known integration dependencies, duplicate implementations, and risks

- **Duplicate data shapes:** `apps/web/lib/workspace-types.ts` independently re-declares `LearningSource`, `FollowUpQuestion`, `QuestionNode`, etc., rather than importing from `@tattva/contracts` — the file's own comment explains this is because contracts doesn't yet define the inquiry/node domain fully for the frontend's needs, but it is a real drift risk: the two shapes must be kept in sync by hand. Worth resolving before the orchestration work lands a real node shape.
- **Duplicate source text:** the "Memory Arena Allocators" excerpt exists as a literal string in both `apps/web/lib/fixtures/workspace-fixtures.ts` and (a second, independently-typed copy of) `apps/api/scripts/sarvam-benchmark.ts`. Harmless today (benchmark script is throwaway), but a reminder that no single source-of-truth for source text exists yet — exactly what ingestion work needs to fix.
- **Database/API coordination needed:** any node-creation endpoint requires a **transactional** insert of 1 `question_nodes` row + exactly 3 `follow_up_questions` rows (`docs/DATABASE.md` §11 point 5) — Supabase-js has no native multi-table transaction primitive, so this will likely need a Postgres function/RPC, which is a migration change requiring coordination with whoever owns the schema.
- **Unresolved design decision blocking Research Mode end-to-end:** how Socratic/Research Mode output maps into the non-nullable `question_nodes.ai_explanation` column is explicitly undecided (§4, §3-partial table) — whoever builds the node-creation endpoint cannot avoid making or escalating this decision.
- **Admin Supabase client is unused and unverified end-to-end:** `getAdminClient()` exists and is intended for the future Stamina service, but nothing exercises it; its first real caller should budget time to verify it actually bypasses RLS as expected against a live project (not verified in this audit — no DB connection was used).
- **No live-database verification exists anywhere in this repository's history** (per `docs/implementation-status.md`'s own prior note, consistent with this audit's findings): migrations have not been run against a real/local Supabase instance in any audit on record. This remains an open risk for whoever's work depends on RLS actually behaving as designed.

---

## 10. Verification evidence and commands

All three commands below were executed in this session, in the repository root, with no modifications made to any file as a result:

```
pnpm -r test
  packages/contracts: Test Files 1 passed (1) · Tests 3 passed (3)
  apps/api:           Test Files 7 passed (7) · Tests 44 passed (44)
  apps/web:           Test Files 3 passed (3) · Tests 9 passed (9)

pnpm -r run typecheck
  packages/contracts: Done (0 errors)
  apps/api:            Done (0 errors)
  apps/web:            Done (0 errors)

pnpm -r run lint
  packages/contracts: Done (0 problems)
  apps/api:            Done (0 problems)
  apps/web:            Done (0 problems)
```

No database command was run (no local Supabase instance was started; `supabase db reset` was **not** executed in this audit, per the read-only restriction). No external network/API call was made. No file was created other than this document.

---

## 11. Uncertainties requiring human review

1. **Whether the migration actually applies cleanly against a real Postgres instance** — never verified in this repository's history per `docs/implementation-status.md`, and not verified in this audit either (no DB was started). Status of "schema is correct" is based on direct SQL reading only, not execution — **UNKNOWN**, not VERIFIED.
2. **Whether RLS policies actually reject cross-user access at the database level** — same caveat; only inferred from reading the policy SQL, never executed against live Postgres.
3. **Whether the Sarvam adapter's false-premise-quote bug (§4) is still live** — confirmed by replaying recorded data through current code, but not re-confirmed by a new live Sarvam call (no external API calls were made in this audit, per restriction).
4. **Exact division of "source ingestion" scope** — this audit found zero existing scaffolding, which means the second developer's actual task size (format support, chunking strategy, storage schema) is still an open product decision per `docs/INTELLIGENCE_ARCHITECTURE.md` §10 ("Pending — do not guess"), not something this audit can resolve on its own.
5. **`workspace-types.ts` vs. `@tattva/contracts` divergence (§9)** — whether to unify these before new frontend work begins is a judgment call for the team, not resolved here.

---

**Files inspected for this audit:** `CLAUDE.md`; `docs/{API_CONTRACTS,ARCHITECTURE(partial — not fully read),DATABASE,INTELLIGENCE_ARCHITECTURE,PROMPT_DESIGN,SARVAM_BENCHMARK_REPORT,SARVAM_MODEL_EVALUATION,implementation-status}.md`; `supabase/{migrations/20261112120000_initial_schema.sql,seed.sql}`; all of `apps/api/src/**` relevant to routes/controllers/services/repositories/middleware/integrations/config (listed in §7); `apps/api/scripts/{sarvam-benchmark.ts,sarvam-smoke-test.ts,.benchmark-output.json}`; all of `apps/web/app/**`, `apps/web/components/**`, `apps/web/lib/**`; `packages/contracts/src/**`; `package.json` files for `apps/api`, `apps/web`; `apps/web/AGENTS.md`.
