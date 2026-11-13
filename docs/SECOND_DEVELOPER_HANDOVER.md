# Tattva — Second Developer Handover: Source Material Ingestion & Processing

Status key (matching the rest of this doc set): **Confirmed**, **Proposed**, **Pending**, **Decision required** (new in this document — means: do not implement until the primary developer/team signs off).

Related: [PROJECT_BASELINE.md](PROJECT_BASELINE.md) (the audit this handover is built from) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE.md](DATABASE.md) · [INTELLIGENCE_ARCHITECTURE.md](INTELLIGENCE_ARCHITECTURE.md) · [CLAUDE.md](../CLAUDE.md)

---

## 1. Project context

Tattva is a two-person hackathon-MVP build: one Next.js frontend, one Express/TypeScript backend, one Supabase Postgres database, Sarvam AI for generation. The project is split into two independent subsystems for this phase:

- **Primary developer:** AI generation, context assembly, node orchestration, persistence of AI output, Research Mode, misconception/trap generation — everything downstream of "we have a clean text excerpt to show the model."
- **Second developer (this document's audience):** everything upstream of that — taking learning material and turning it into clean, structured, retrievable source data the AI side can consume.

The boundary between the two is a single, narrow interface (§7). Both sides must be able to build independently without blocking on each other, which is the entire reason this document exists.

---

## 2. Current repository baseline (summary — full detail in PROJECT_BASELINE.md)

Verified by direct inspection + `pnpm -r test` / `typecheck` / `lint` (all green, see `docs/PROJECT_BASELINE.md` §10):

- `learning_sources` table exists (`supabase/migrations/20261112120000_initial_schema.sql:10-19`): `id`, `title`, `description`, `source_type` (`'video'|'document'|'transcript'`), `duration_minutes` (`>= 25` check), `source_reference` (plain text pointer, not a resolvable path to any file in this repo), `published_at`, `created_at`. **No body/content-text column, no processing-status column, no chunk table, no timestamp-segment structure.**
- Exactly one row exists, inserted by hand in `supabase/seed.sql` — no ingestion code produced it.
- `apps/api/src/repositories/learningSourceRepository.ts` exposes exactly one function, `findLearningSourceById` — **read-only**, and its own comment states the MVP "never inserts/updates this table from `apps/api`."
- The one piece of actual source text in the repo is a hardcoded TypeScript string, duplicated in two places: `apps/web/lib/fixtures/workspace-fixtures.ts:20-42` (`fixtureSourceBody`) and independently in `apps/api/scripts/sarvam-benchmark.ts:51-73` (`SOURCE_EXCERPT`, used only by a throwaway benchmark script).
- The Sarvam adapter (built and unit-tested by the primary developer) takes a plain `sourceExcerpt: string` parameter (`apps/api/src/integrations/sarvam/prompts.ts`) — it does not know or care how that string was produced.
- **No upload endpoint, no transcript/document extraction, no text cleaning, no chunking/segmentation, no timestamp preservation, no processing-status tracking exist anywhere in this repository.** This matches `docs/DATABASE.md` §A's own statement: "there is no ingestion pipeline," and `CLAUDE.md` §2's explicit hackathon-scope decision to "use a pre-curated source rather than building a complete ingestion pipeline."

This is confirmed, not assumed — see `PROJECT_BASELINE.md` §6 for the full inspection trail.

---

## 3. Her exact ownership

The second developer owns the full **Learning Material → Processing → Structured Source Context** pipeline:

| # | Area | Current state (from inspection) | Needs implementation? |
|---|---|---|---|
| 1 | Learning material ingestion | Nothing exists (manual SQL insert only) | **Yes** |
| 2 | Input validation | Nothing exists | **Yes** |
| 3 | Transcript/document text extraction | Nothing exists | **Yes**, scoped to the approved input format(s) — see §4's decision requirement |
| 4 | Text cleaning and normalization | Nothing exists | **Yes** |
| 5 | Content segmentation and chunking | Nothing exists; `docs/INTELLIGENCE_ARCHITECTURE.md` §10 lists chunking strategy as explicitly unresolved | **Yes** |
| 6 | Timestamp and source-reference preservation | `source_reference` is a flat, single string per source today; no segment-level structure | **Yes**, where the input format actually carries timestamps (plain text/markdown won't; a timestamped transcript format would) |
| 7 | Structured source storage | `learning_sources` has no body/chunk columns | **Yes** — additive schema proposal, not a rewrite of the existing table (§6, §9) |
| 8 | Source-processing status and metadata | No status column exists anywhere | **Yes** |
| 9 | Source-specific APIs and backend services | `learningSourceRepository.ts` is read-only; no service layer exists for this domain | **Yes** |
| 10 | Independent unit and integration tests | N/A — new code | **Yes**, following the existing project convention (co-located `*.test.ts`, Vitest, mocked Supabase client — see `apps/api/src/services/inquiryService.test.ts` as the pattern to follow) |

All ten areas require new implementation. None of them currently overlap code the primary developer owns, provided the integration boundary in §7 is respected.

---

## 4. Explicit out-of-scope boundaries — STRICT GUARDRAILS

**This section is mandatory. Do not modify or implement anything listed below without explicit primary-developer approval.**

### A. AI generation infrastructure — DO NOT MODIFY
- `apps/api/src/integrations/sarvam/` (all files: `client.ts`, `prompts.ts`, `parser.ts`, `schemas.ts`, `errors.ts`, `falsePremiseVerification.ts`, and their tests)
- The Sarvam client, prompt templates, AI response parser, raw Sarvam Zod schemas, false-premise verification
- `apps/api/scripts/sarvam-benchmark.ts`, `apps/api/scripts/sarvam-smoke-test.ts`
- AI model configuration (model name, `reasoning_effort`, `temperature`, `max_tokens`, timeout)
- Research Mode generation logic

### B. AI context engineering — DO NOT IMPLEMENT OR MODIFY
- `services/sourceContext.ts`, `services/graphContext.ts` (neither exists yet — **do not create them**; they are the primary developer's to build, per `docs/INTELLIGENCE_ARCHITECTURE.md` §8)
- Graph ancestry construction, parent/grandparent context, rolling ancestry summaries
- AI context-window management
- **Source excerpt selection for an individual question** (i.e., deciding *which* chunk(s) answer a specific student question)

**Important distinction, stated explicitly because it is the crux of the boundary:** the second developer produces structured source material and chunks, available to be queried. The primary developer owns *selecting and assembling* what actually gets sent to Sarvam for any given question. Producing chunks is in scope; deciding which chunk answers which question is not.

### C. Node generation and orchestration — DO NOT MODIFY OR IMPLEMENT
- `services/inquiryOrchestration.ts` (does not exist yet — do not create it)
- Question-node generation, follow-up generation, misconception detection, adversarial trap generation, Research Mode orchestration
- `POST /api/v1/inquiries/:inquiryId/nodes` (not implemented yet — do not implement it)
- Any node-generation controller
- `question_nodes` / `follow_up_questions` persistence logic (`apps/api/src/repositories/questionNodeRepository.ts` is currently read-only — do not add write functions to it)

### D. Existing database ownership boundaries — DO NOT MODIFY
- The existing `inquiries`, `question_nodes`, `follow_up_questions`, `wallet_transactions` table definitions, columns, or constraints
- Existing RLS policies on those four tables
- `supabase/migrations/20261112120000_initial_schema.sql` as it currently stands — **do not edit this file**

Source-specific database additions (new table(s), or new columns on `learning_sources`) **may be proposed** as part of her work (see §8, Milestone 2), but **must be reviewed and approved by the primary developer before implementation** — ship them as a new, separate migration file, never by editing the existing one.

### E. Other excluded functionality — DO NOT IMPLEMENT
- Stamina/wallet services (`wallet_transactions` writes, balance computation)
- Trap-attempt endpoints
- Knowledge Graph generation or rendering logic
- Any frontend Knowledge Graph redesign
- AI orchestration or frontend AI integration
- Any DeepSeek fallback (not implemented, not in scope for either developer right now)

### F. Shared files — do not independently modify
- `packages/contracts/src/*` (existing schemas: `health.ts`, `api-error.ts`, `me.ts`, `learning-source.ts`, `question-node.ts`, `inquiry.ts`)
- `apps/api/src/middleware/auth.middleware.ts` and other existing middleware
- `apps/web/lib/workspace-types.ts`
- Root configuration (`tsconfig.base.json`, `pnpm-workspace.yaml`, root `package.json`, ESLint/Prettier configs)
- Existing API route conventions/structure (`apps/api/src/routes/index.ts`'s existing mounts)

**If a shared-file change becomes necessary** (e.g. a new field needed on `learningSourceSummarySchema`, or a new route needing to be mounted in `routes/index.ts`), **document the exact proposed change and request approval before making it.** Do not make the change and ask afterward.

---

## 5. Existing files and functionality to reuse

Inspected directly; these are the real starting points, not assumptions:

- **`apps/api/src/repositories/learningSourceRepository.ts`** — the existing read pattern to follow for a *new* `learningSourceRepository`-adjacent write path (same request-scoped-Supabase-client convention, same row→domain-type mapping style). Do not add writes to this exact file without checking whether the primary developer wants it split; proposing a new file (e.g. `sourceProcessingRepository.ts`) alongside it is the safer default (see §9).
- **`packages/contracts/src/learning-source.ts`** — the existing `sourceTypeSchema` (`'video'|'document'|'transcript'`) and `learningSourceSummarySchema`. Any new contract for processing status/chunks should be a **new file** in this package (e.g. `source-processing.ts`), additive, not a rewrite of this one.
- **`apps/api/src/config/env.ts`** — the existing Zod-validated, optional-at-parse-time environment convention (mirrors how `SARVAM_API_KEY`/`SUPABASE_*` are handled). Any new env var (e.g. for a storage bucket or upload size limit) should follow this exact pattern.
- **`apps/api/src/services/inquiryService.test.ts`** and **`apps/api/src/middleware/auth.middleware.test.ts`** — the project's established testing convention: Vitest, `vi.mock`/`vi.hoisted` for mocking `@supabase/supabase-js` and repository modules, no real database connection in tests. Follow this, not a new testing approach.
- **`apps/api/src/types/api.ts`** (`ApiError`, `ApiSuccess<T>`, `ApiErrorBody`) — the existing error/response envelope shape; any new controller must use these, not invent a new error shape.
- **`apps/api/src/middleware/errorHandler.ts` / `notFound.ts` / `requestLogger.ts`** — existing cross-cutting middleware; a new route mounted under `/api/v1` automatically inherits these, nothing to reimplement.
- **`docs/API_CONTRACTS.md` §0** — the existing conventions for success/error envelopes, status codes, and validation (`{data: ...}` / `{error: {code, message, details}}`) that any new source-processing endpoint must follow for consistency.

Nothing else in the repository is directly reusable for this subsystem — `PROJECT_BASELINE.md` §6 confirmed no ingestion scaffolding exists anywhere.

---

## 6. Proposed architecture (Proposed — not final; chunking/storage specifics are a Decision required, §11)

```
Learning material (approved input format(s), §11)
        │
        ▼
 Ingestion entry point (new — upload endpoint or a seed-time CLI/script,
 depending on the MVP decision in §11)
        │

 Input validation (format, size limits, required metadata)
        │
        ▼
 Extraction (format-specific: plain text passthrough, or a document/
 transcript parser, scoped to whatever format(s) are approved)
        │
        ▼
 Text cleaning & normalization (whitespace, encoding, basic artifact removal)
        │
        ▼
 Segmentation / chunking (deterministic — by paragraph, section, or
 timestamp boundary, depending on format; strategy itself is Pending
 per docs/INTELLIGENCE_ARCHITECTURE.md §10 and must be decided, not guessed)
        │
        ▼
 Structured persistence (learning_sources + a new chunk-level table —
 schema proposed in §8 Milestone 2, requires approval)
        │
        ▼
 Retrieval API (read endpoints returning structured source + chunks,
 for the primary developer's sourceContext.ts to consume — NOT built
 by this subsystem)
```

This mirrors the existing layered convention already used in `apps/api` (`docs/ARCHITECTURE.md` §3: route → controller → service → repository) — a new source-processing service should sit at the same layer as `inquiryService.ts`, not bypass it.

---

## 7. Integration contract (Proposed — requires primary-developer review before implementation)

**The one hard constraint, already fixed and not to be touched:** the Sarvam adapter's prompt builders accept `sourceExcerpt: string` (`apps/api/src/integrations/sarvam/prompts.ts`, `buildStandardSystemPrompt(sourceExcerpt: string)` / `buildResearchModeSystemPrompt(sourceExcerpt: string)`). The second developer must never change this function signature.

**What the second developer's subsystem must produce, so the primary developer's (not-yet-built) `sourceContext.ts` can turn it into that one string:** a retrievable, structured record — not a final schema, this is a proposal for review — containing, where applicable to the approved input format:

| Field | Purpose |
|---|---|
| Source identifier | Matches `learning_sources.id` — the existing FK target, unchanged |
| Extracted text (full, cleaned) | The normalized full text for the source, for small sources where no chunk selection is needed |
| Chunk identifier | Stable id per segment, for selection and for `child_node_id`-style downstream referencing if ever needed |
| Chunk content | The segment's cleaned text |
| Chunk ordering | An explicit sequence number — chunk order must be deterministic and stable across re-processing |
| Timestamp information (when available) | Only for formats that carry it (e.g. a timestamped transcript); plain text/markdown will have none, and that is acceptable, not a defect |
| Source reference | Preserves/extends the existing `source_reference` column's role — a pointer back to the original material or segment |
| Processing status | e.g. `pending` / `processing` / `ready` / `failed`, so the primary developer's context-selection code can safely check "is this source actually usable yet" before calling Sarvam |
| Relevant metadata | Format, language, any extraction warnings — free-form, additive |

**This table is a proposal for what the contract should contain, not an approved schema.** The exact column/table design, naming, and JSON vs. relational shape must be reviewed against `docs/DATABASE.md`'s existing conventions (relational rows preferred over JSON blobs for anything the service layer needs to query or constrain, per `ADR-003`'s own rationale) before any migration is written.

**Explicitly not part of this contract:** which chunk(s) get selected for a specific question, how much ancestor context accompanies them, or anything about prompt construction — all of that is primary-developer territory (§4.B).

---

## 8. End-to-end implementation milestones

Scoped to the hackathon MVP. No vector database, embedding pipeline, RAG framework, distributed queue, microservice, or external processing platform is justified by anything found in this audit — all of the above is achievable with synchronous Node.js code and Postgres, consistent with `CLAUDE.md` §4's "modular monolith, no infrastructure the MVP doesn't need."

### Milestone 1 — Requirements and supported input formats
- **Objective:** settle exactly which input format(s) this subsystem must handle for the hackathon demo.
- **Functionality:** none yet — this is a decision milestone.
- **Expected output:** a short written decision (can be an ADR or a note in this document's §11) naming the approved format(s).
- **Dependencies:** none.
- **Tests:** none.
- **Acceptance criteria:** the decision in §11 is answered with sign-off, not left as "all formats."

### Milestone 2 — Data model and storage design
- **Objective:** propose the additive schema for structured source storage and processing status.
- **Exact functionality:** a new migration file (e.g. `supabase/migrations/<timestamp>_source_processing.sql`) proposing a new table (working name: `source_chunks`, or similar) plus any new nullable columns on `learning_sources` (e.g. `processing_status`, `body` or equivalent) — **proposed, not applied, until reviewed.**
- **Expected files:** one new migration file; a corresponding section added to `docs/DATABASE.md` (new, additive section — do not rewrite existing sections).
- **Dependencies:** Milestone 1's format decision (chunk shape depends on whether timestamps exist).
- **Tests:** none at this stage (schema review only).
- **Acceptance criteria:** primary developer has reviewed and approved the migration before it is applied.

### Milestone 3 — Ingestion mechanism
- **Objective:** build the entry point that gets material into the system.
- **Exact functionality:** depends on Milestone 1's decision — either (a) a backend upload endpoint (`apps/api/src/routes/`, a new router, mounted additively in `routes/index.ts` with approval per §4.F) accepting the approved format(s), or (b) a privileged seed-time script analogous to `supabase/seed.sql`'s existing manual pattern, if live upload is judged out of scope for the hackathon.
- **Expected files/modules:** new repository (`apps/api/src/repositories/sourceProcessingRepository.ts` or similar — new file, does not touch the existing read-only `learningSourceRepository.ts`), new service (`apps/api/src/services/sourceProcessingService.ts` or similar), new controller/route if the upload-endpoint option is chosen.
- **Dependencies:** Milestone 2's schema approved and migrated.
- **Tests:** unit tests for validation branches (missing file, oversized input, unsupported format) following the `inquiryService.test.ts` mocking pattern.
- **Acceptance criteria:** material can enter the system through the agreed mechanism and lands in the new storage, unprocessed.

### Milestone 4 — Extraction and normalization
- **Objective:** turn raw input into clean text.
- **Exact functionality:** format-specific extraction (trivial for plain text/markdown; a real parser only if a richer format is approved in Milestone 1), plus normalization (consistent whitespace/line-ending handling, encoding normalization, removal of obvious transcript artifacts like speaker-label noise if applicable).
- **Expected files/modules:** `apps/api/src/services/sourceExtraction.ts` (or split per-format if multiple formats are approved).
- **Dependencies:** Milestone 1's format decision; Milestone 3's ingestion mechanism to get raw input in the first place.
- **Tests:** unit tests with fixture inputs (clean, messy, malformed/corrupt) — verifying normalization is idempotent (`normalize(normalize(x)) === normalize(x)`).
- **Acceptance criteria:** text extracted from each approved format is clean and consistent across repeated runs of the same input.

### Milestone 5 — Chunking and segmentation
- **Objective:** deterministically split normalized text into ordered, retrievable units.
- **Exact functionality:** a chunking strategy (paragraph-based, section-based, or timestamp-boundary-based, depending on format — this is the exact decision `docs/INTELLIGENCE_ARCHITECTURE.md` §10 flags as unresolved and explicitly says not to guess). Must preserve ordering and, where the format has them, timestamps/offsets.
- **Expected files/modules:** `apps/api/src/services/sourceChunking.ts`.
- **Dependencies:** Milestone 4's clean text; a chunking-strategy decision (flag as needing sign-off if not already settled in Milestone 1).
- **Tests:** unit tests verifying deterministic output (same input → same chunk boundaries every run), ordering is preserved, and edge cases (very short source, a single giant unbroken paragraph) don't crash or silently drop content.
- **Acceptance criteria:** chunk ordering is stable and verified by test, not just "looks right."

### Milestone 6 — Persistence and retrieval
- **Objective:** store structured chunks and expose them for reading.
- **Exact functionality:** repository functions to write chunks + processing status (per Milestone 2's approved schema), and a read function/endpoint shaped to the integration contract in §7.
- **Expected files/modules:** finishes `sourceProcessingRepository.ts`; a new, narrowly-scoped read endpoint if the primary developer's future `sourceContext.ts` is expected to call over HTTP rather than reuse the repository directly in-process (this choice itself may need a short discussion — flag it, don't assume).
- **Dependencies:** Milestones 2, 3, 5.
- **Tests:** repository tests (mocked Supabase client, per the existing project convention) covering write-then-read round-trips and ordering on retrieval.
- **Acceptance criteria:** a chunk written by this subsystem can be read back with the same content, order, and metadata.

### Milestone 7 — Processing status and error handling
- **Objective:** make failures visible and safe, never silent.
- **Exact functionality:** status transitions (`pending → processing → ready` / `failed`), with a failure path that records what went wrong (not a swallowed exception) and never leaves a half-written source (partial chunks with no status marking it unusable).
- **Expected files/modules:** extends the service layer from Milestones 3-6; no new files necessarily required.
- **Dependencies:** all prior milestones.
- **Tests:** unit tests simulating extraction failure, chunking failure, and a DB write failure mid-persistence — verifying status ends up `failed`, not silently `ready` with incomplete data.
- **Acceptance criteria:** a deliberately malformed input never ends up marked `ready`.

### Milestone 8 — Testing and verification
- **Objective:** confirm the whole pipeline end-to-end, in isolation.
- **Exact functionality:** an integration-style test (still using mocked Supabase, consistent with every other test in this repository — no live database test currently exists anywhere in the project, per `PROJECT_BASELINE.md` §11, and introducing the first one is a larger decision than this subsystem alone should make unilaterally) that runs a fixture input through ingestion → extraction → chunking → persistence → retrieval and asserts the final shape matches §7's contract.
- **Dependencies:** Milestones 1-7 complete.
- **Tests:** the integration test itself, plus confirming `pnpm --filter @tattva/api test`, `typecheck`, and `lint` all stay green (the existing, already-passing baseline from `PROJECT_BASELINE.md` §10 must not regress).
- **Acceptance criteria:** full pipeline test passes; no existing test, typecheck, or lint result regresses.

### Milestone 9 — Integration readiness
- **Objective:** hand off a stable, documented interface to the primary developer.
- **Exact functionality:** no new code — a short written note (can extend §7 of this document, or a new `docs/SOURCE_PROCESSING_CONTRACT.md` if it grows large) confirming the actual, implemented shape of the retrieval interface, any deviations from §7's proposal (and why), and example output.
- **Dependencies:** Milestone 8 complete.
- **Tests:** none — documentation only.
- **Acceptance criteria:** the primary developer can read this note and start `sourceContext.ts` without needing to read the second developer's implementation code.

---

## 9. File ownership and Git strategy

**Branching:** a dedicated feature branch, e.g. `feat/source-ingestion`, branched from the current integration branch — never committing directly to whatever branch the primary developer is actively working on.

**Files she should inspect before starting** (already identified and read during this audit — exact paths, not assumed):
- `supabase/migrations/20261112120000_initial_schema.sql` (read-only reference — do not edit)
- `supabase/seed.sql` (read-only reference for the existing manual-insert pattern)
- `apps/api/src/repositories/learningSourceRepository.ts`
- `packages/contracts/src/learning-source.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/services/inquiryService.ts` and `inquiryService.test.ts` (the layering + testing convention to mirror)
- `apps/api/src/types/api.ts`
- `apps/api/src/routes/index.ts` (to understand — not yet to edit — how a new router would be mounted)
- `docs/DATABASE.md`, `docs/API_CONTRACTS.md` §0, `docs/ARCHITECTURE.md` §3-4
- `docs/INTELLIGENCE_ARCHITECTURE.md` §3, §10 (the exact "chunking strategy is Pending" and bounded-context sections her work feeds into)
- `apps/api/src/integrations/sarvam/prompts.ts` (read-only — to see the exact `sourceExcerpt: string` signature her output must ultimately feed, without touching the file)

**Proposed new files** (all net-new; none collide with an existing path found in this repository):
- `supabase/migrations/<new-timestamp>_source_processing.sql` (new migration, additive only — subject to approval per §4.D)
- `packages/contracts/src/source-processing.ts` (new contract file — subject to approval per §4.F before merging, since it's a shared package)
- `apps/api/src/repositories/sourceProcessingRepository.ts`
- `apps/api/src/services/sourceProcessingService.ts`
- `apps/api/src/services/sourceExtraction.ts`
- `apps/api/src/services/sourceChunking.ts`
- `apps/api/src/controllers/sourceProcessing.controller.ts` (only if the upload-endpoint ingestion path is chosen in Milestone 1)
- `apps/api/src/routes/sourceProcessing.routes.ts` (same condition; mounting it into `routes/index.ts` requires the §4.F approval step since that file is shared)
- Corresponding `*.test.ts` files co-located with each of the above, per the existing convention.

**Independent commits:** each milestone (§8) should be its own commit or small commit series, not one large commit at the end — consistent with `CLAUDE.md` §6's "prefer small, reviewable changes."

**Coordination checkpoints (mandatory, not optional):**
1. Before Milestone 2's migration is applied — schema review.
2. Before any `packages/contracts` change is merged — contract review (both developers depend on this package, per `CLAUDE.md` §4: "shared contract changes must be communicated before parallel implementation").
3. Before Milestone 9 is called done — a joint walkthrough of the actual retrieval interface against §7's proposed contract, confirming the primary developer's `sourceContext.ts` can consume it as-is.

---

## 10. Testing and acceptance criteria

Follow the existing project testing convention exactly: Vitest, co-located `*.test.ts` files, `vi.mock`/`vi.hoisted` to mock `@supabase/supabase-js` (never a live database connection in tests — no test in this repository does that today, per `PROJECT_BASELINE.md` §10-11).

Minimum coverage expected, mapped to Milestones §8:
- Input validation: valid input, missing required fields, unsupported format, oversized input.
- Extraction/normalization: clean input, messy input, malformed/corrupt input, idempotency of normalization.
- Chunking: deterministic ordering, edge cases (very short source, no natural break points).
- Persistence/retrieval: write-then-read round-trip, ordering preserved on read.
- Error handling: a deliberate failure at each pipeline stage results in a `failed` status, never a silently-incomplete `ready` source.
- Full pipeline integration test (Milestone 8).

**Acceptance criteria for the subsystem overall** (restated from the task's Definition of Done, §12 below, for traceability) — every item must be independently demonstrable with a passing test, not just "the code is written."

---

## 11. Decisions requiring primary developer / team approval

These are explicitly **not** decided in this document, per the instruction not to invent or silently settle architectural decisions:

1. **Minimum viable input format(s) for the hackathon MVP.** The repository today has exactly one real example source, and it is plain text (`fixtureSourceBody`, a `.trim()`'d template string — no markup, no timestamps). **Recommendation to put forward for approval, not a decision made here:** scope the MVP to plain text / Markdown transcripts only, since that is the only format any existing fixture or seed data actually uses, and it requires no binary parsing library at all. Treating `'video'`/`'document'` as supported `source_type` values without a corresponding extraction implementation would be scope creep beyond what any existing evidence justifies. **This must be explicitly approved, not assumed, before Milestone 1 is considered closed.**
2. **The exact chunking strategy** (paragraph-based vs. section-based vs. something else) — `docs/INTELLIGENCE_ARCHITECTURE.md` §10 already flags this as unresolved; this handover does not resolve it either, only assigns its resolution to Milestone 5.
3. **The exact new-table/new-column schema** for structured source storage (Milestone 2) — proposed shape only in §7; must be reviewed against `docs/DATABASE.md`'s conventions before any migration is written or applied.
4. **Whether ingestion is a live upload endpoint or a privileged seed-time script** for the hackathon demo — both are plausible given the existing pattern (`supabase/seed.sql`'s manual insert is the only precedent today); Milestone 3 names this as an open choice, not a default.
5. **Whether the primary developer's future `sourceContext.ts` consumes this subsystem's output via direct repository/service call (in-process) or via an HTTP endpoint** — flagged in Milestone 6, not decided here, since it affects whether a controller/route is even needed.
6. **Any `packages/contracts` addition** (new `source-processing.ts` schema) — per §4.F, must be reviewed before merge since both developers depend on that package.
7. **Whether a `references`-style column or any other addition mentioned elsewhere in `docs/INTELLIGENCE_ARCHITECTURE.md` §7 should be coordinated into the same migration window** — out of this subsystem's scope to decide unilaterally, since that column belongs to the AI-generation side's data (§4.D boundary).

---

## 12. Definition of done

The source-processing subsystem is complete only when **all** of the following hold, each backed by a passing test, not a claim:

- [ ] Learning material can enter through the agreed ingestion mechanism (§11 decision #4 resolved and implemented).
- [ ] The approved content format(s) (§11 decision #1) can be extracted.
- [ ] Extracted text is normalized correctly and idempotently (Milestone 4 tests pass).
- [ ] Content is segmented deterministically (Milestone 5 tests pass).
- [ ] Chunk ordering is preserved and verified (Milestone 5/6 tests pass).
- [ ] Timestamps and source references are preserved where the approved format actually carries them (not fabricated where it doesn't).
- [ ] Structured content can be persisted and retrieved (Milestone 6 tests pass).
- [ ] Processing failures are handled safely — no silently-incomplete source is ever marked `ready` (Milestone 7 tests pass).
- [ ] Tests cover both normal and malformed inputs across every pipeline stage (§10).
- [ ] The output conforms to the agreed integration contract (§7, confirmed in Milestone 9's written handoff note).
- [ ] **No file listed in §4 (A-F) has been modified.** This is a hard gate, verifiable with `git diff` against the base branch before merge.
- [ ] `pnpm -r test`, `pnpm -r run typecheck`, `pnpm -r run lint` remain green across the whole monorepo (the existing baseline from `PROJECT_BASELINE.md` §10 must not regress).

---

**Document status:** documentation only — no source file, migration, contract, or dependency was created or modified in producing this handover. The only file changed by this task is `docs/SECOND_DEVELOPER_HANDOVER.md` itself.
