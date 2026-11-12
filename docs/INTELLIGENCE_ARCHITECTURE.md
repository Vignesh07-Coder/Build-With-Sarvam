# Tattva — Sarvam Intelligence Architecture

Status key: **Confirmed** (PRD / `CLAUDE.md` / existing docs), **Proposed** (this document's recommendation, not yet implemented), **Pending** (open product decision — do not implement silently), **Empirically corrected** (the Stage 6B/6B.1 benchmark disproved the original assumption — see §6).

Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE.md](DATABASE.md) · [API_CONTRACTS.md](API_CONTRACTS.md) · [SARVAM_MODEL_EVALUATION.md](SARVAM_MODEL_EVALUATION.md) · [PROMPT_DESIGN.md](PROMPT_DESIGN.md)

This document designs — but does not implement — the Sarvam-backed intelligence layer behind Tattva's Knowledge Graph. It extends [ARCHITECTURE.md §3](ARCHITECTURE.md#3-backend-apps-api) ("Sarvam integration adapter") and §7 ("Request lifecycle") with the specifics of what that adapter generates and how. No node-generation endpoint, migration, or frontend change is made here (per the directive's STRICT RESTRICTIONS).

## 1. Five capabilities, one generation call

Tattva's PRD describes five distinct intelligence behaviors (deep explanation, adaptive follow-ups, misconception detection, adversarial challenges, Research Mode). These are **not five separate Sarvam calls per node** — that would multiply credit cost by 5x for no benefit, since each behavior needs the same question/source/graph context as input. Consistent with the single-call shape already documented in [ARCHITECTURE.md §7](ARCHITECTURE.md#7-request-lifecycle-submitting-a-technical-question) ("SA->SA: Build system+user prompt" → one `SA-->S: Raw Sarvam response`), all five capabilities are produced by **one structured completion per node**, differentiated by which fields the model populates:

```
                         ┌─────────────────────────────┐
                         │   ONE Sarvam chat-completion  │
                         │   call per question_node      │
                         └───────────────┬───────────────┘
                                          │  plain text, labeled sections, parsed
                                          │  server-side (Empirically corrected — §6)
                                          ▼
        ┌──────────────┬──────────────┬───────────────┬────────────────┬─────────────────┐
        │ A. Explanation│ B. 3 Follow- │ C. Misconcep-  │ D. Adversarial  │ E. Research Mode │
        │  (deep, source│   ups across │  tion assess-  │   challenge     │   variant        │
        │   grounded)   │   3 distinct │  ment          │  (only if C is  │  (replaces A, no │
        │               │   dimensions │                │   actionable)   │   direct answer) │
        └──────────────┴──────────────┴───────────────┴────────────────┴─────────────────┘
```

- **A (Explanation)** and **B (Follow-ups)** are always present in a standard-mode response — they are the PRD's non-negotiable baseline (`CLAUDE.md` invariant #2: exactly three follow-ups).
- **C (Misconception detection)** runs on every call but is usually a negative result (`present: false`). It is explicitly *not* a separate API call — a second call purely to "check for misconceptions" would double cost for a signal the model can produce alongside the explanation at near-zero marginal token cost, since it is already reasoning about the question's premises to write the explanation.
- **D (Adversarial challenge)** is populated **only** when C reports a meaningful, actionable misconception (see §2's false-positive guardrail) — otherwise it is `null`. This keeps the "Be Careful Here!!" state rare and meaningful, per the PRD's concern that over-triggering it would cheapen the signal.
- **E (Research Mode)** is not a sixth capability bolted onto the same response — it is a **different system prompt variant** selected server-side before the call is made (from the node's `research_mode` flag, never from client-parsed free text, per `ARCHITECTURE.md §6.6`). Under Research Mode, the model is instructed to leave the `explanation` field empty/absent and instead populate a `researchMode` block with Socratic counter-questions and citations — it is the same one-call-per-node shape with a different instruction layer and a different populated subset of the schema.

This design directly serves §8 of the directive (credit efficiency): **one Sarvam call per graph node**, regardless of how many of the five capabilities that node's response ends up surfacing.

## 2. Misconception detection and false-positive avoidance

The PRD is explicit that misconception detection must distinguish genuine conceptual errors from merely unusual phrasing, and that false positives are "particularly undesirable" (directive §2.C). The prompt design (see [PROMPT_DESIGN.md](PROMPT_DESIGN.md)) enforces this with two mechanisms, not left to the model's judgment alone:

1. **A confidence field is mandatory in the schema** (`misconception.confidence: "low" | "medium" | "high"`). The adapter only treats a misconception as actionable (i.e., eligible to produce an adversarial challenge, D above) when confidence is `"high"` **and** a `type` from a closed, documented taxonomy is given (incorrect assumption, incomplete mental model, invalid generalization, incorrect causal relationship, edge-case misunderstanding — directive §2.C's own list). A `"low"`/`"medium"` finding is recorded in the response for observability but does not trigger the trap UI.
2. **The system prompt explicitly instructs the model to prefer `present: false`** when uncertain, and gives worked positive/negative examples (benchmark case 4, §5) rather than relying on a bare instruction. This is a prompt-engineering guardrail, not a code-level one. **Confirmed by Stage 6B.1**: the first benchmark pass (bare instruction only) false-positived on 2 of 4 non-seeded questions; adding a mandatory "quote the exact false-premise substring from the student's own question before `confidence: high` is allowed" rule plus one worked positive/negative example eliminated both false positives while still catching the one deliberately-seeded case, in a 5-case re-run. See [SARVAM_BENCHMARK_REPORT.md](SARVAM_BENCHMARK_REPORT.md) for full output. Any production prompt must carry this quote-first rule forward, not just the bare preference instruction.

Backend validation (§6) enforces the *shape* of this guardrail (confidence must be one of the three enum values, type must be from the closed list) — it cannot enforce the *judgment* behind it, which is why benchmark case 4 exists.

## 3. Recursive Knowledge Graph generation: bounded context strategy

The generation lifecycle matches the directive's diagram exactly: root question → explanation + 3 follow-ups → student selects one → new child node → new explanation + 3 new follow-ups → recursive exploration, using `question_nodes.parent_node_id` self-reference already defined in [DATABASE.md §3.3](DATABASE.md#33-question_nodes) — no schema change needed for the tree shape itself.

**The problem this section solves:** naively, each new node's prompt would need to include the *entire* ancestor chain back to the root to preserve conceptual continuity. In a two-hour session (PRD §3) that chain could be 10+ levels deep, and context size (and therefore cost) would grow without bound as the student goes deeper — directly contradicting §8's credit-efficiency requirement.

**Proposed bounded-context assembly**, built fresh per call from already-persisted data (no new "running context" column needed — it's reconstructed, not stored):

| Context element | Source | Included how |
|---|---|---|
| Learning source | `learning_sources.source_reference` (+ a pre-chunked excerpt relevant to the current question — chunking strategy is Pending, see §10) | Always included, as the grounding reference for A (Explanation) |
| Current question | The learner's submitted text or the selected follow-up's `question_text` | Always included |
| Immediate parent | The parent `question_node`'s `user_question` + `ai_explanation` | Included **verbatim, truncated** to a configured character cap (Proposed: ~1,500 chars) if the node has a parent |
| Grandparent (depth 2) | The parent's parent, same shape | Included **verbatim, truncated** only if present — this is the hard depth cutoff |
| Older ancestry (depth 3+) | Everything above the grandparent | **Not sent verbatim.** Represented as a single rolling one-paragraph synthesis (Proposed: generated once per node as a cheap side-effect of that node's own completion, stored — see §10 Pending decision on whether this needs a new column — and passed down to children as an opaque "prior context" string rather than re-derived from the full chain each time) |
| Selected follow-up | `follow_up_questions.question_text` for the chosen one, if applicable | Included when the question originated from a follow-up selection, so the model knows which of its 3 prior branches the student picked |
| Research Mode state | `question_nodes.research_mode` the service is about to write for this node | Always included — determines which system-prompt variant is selected (§1.E) |

This bounds total context growth to **O(1) per additional depth level** past 2 (a fixed-size rolling summary plus two fully-verbatim recent nodes), rather than O(depth). The exact truncation character cap and whether the rolling summary is itself persisted or recomputed on demand are **Pending** — small, reversible tuning decisions to make once real token costs are measured against `sarvam-105b`'s 128K window (comfortably sufficient either way, per [SARVAM_MODEL_EVALUATION.md](SARVAM_MODEL_EVALUATION.md) §2).

```
Context sent to Sarvam for node N (depth ≥ 3):

┌─────────────────────────────────────────────┐
│ System prompt (persona, mode, output schema)  │
├─────────────────────────────────────────────┤
│ Source excerpt (bounded)                      │
├─────────────────────────────────────────────┤
│ Rolling ancestry summary (depth 3+, 1 para)   │
├─────────────────────────────────────────────┤
│ Grandparent: question + explanation (trunc.)  │
├─────────────────────────────────────────────┤
│ Parent: question + explanation (trunc.)       │
├─────────────────────────────────────────────┤
│ Selected follow-up (if any) + current question│
└─────────────────────────────────────────────┘
```

## 4. Why not RAG / embeddings for the source material

Not evaluated further here: the PRD's Golden Path uses a single pre-curated 25-minute source per inquiry (`CLAUDE.md` §2's "first-slice scope"), small enough to chunk deterministically (e.g. by transcript timestamp or document section) rather than requiring a vector-search layer. Introducing embeddings/RAG would be a new AI dependency the directive's STRICT RESTRICTIONS explicitly tell us not to add "unnecessarily" — revisit only if/when multi-source inquiries are in scope.

## 5. Benchmark design

Per the directive, five canonical cases against **Memory Arena Allocators** as the initial source (already used in our verified smoke test, giving us a real content anchor):

1. **Basic conceptual understanding** — "What is an arena allocator?" Expect: clear explanation, 3 follow-ups spanning distinct dimensions (e.g. lifetime/safety, alignment/boundaries, fragmentation/trade-offs — directive's own example), `misconception.present: false`.
2. **Deep systems-level reasoning** — "How does arena allocation interact with cache locality and false sharing in a multithreaded allocator?" Expect: explanation reaches mechanism-level depth (not a summary), explicitly distinguishes source-supported claims from the model's general knowledge (directive §2.A), identifies trade-offs.
3. **Technical edge-case analysis** — "What happens if an arena allocator's region is exhausted mid-allocation?" Expect: explanation addresses the actual failure mode (growth strategy, allocation failure, or fallback), not a generic "it handles it gracefully."
4. **Deliberate misconception detection** — a question built around a known-false premise (e.g. "Since arena allocators free memory per-object just faster than malloc, I can still call free() on individual allocations, right?"). Expect: `misconception.present: true`, `confidence: "high"`, a `type` from the closed taxonomy, and a `D` (adversarial challenge) populated with a concrete counterexample — **and** a paired negative case (an unusually-phrased but *correct* question) that must come back `present: false`, to directly test the false-positive guardrail from §2.
5. **Socratic Research Mode** — the same case-1 question submitted with `research_mode: true`. Expect: no direct explanation text, Socratic counter-questions, and (when available) genuine references (e.g. to a specific allocator implementation or paper) rather than direct answers — per PRD §7's "raw academic citations... or Socratic counter-questions."

### Evaluation rubric (Proposed, qualitative — not automated scoring in this phase)

| Dimension | What "pass" looks like |
|---|---|
| Technical correctness | No factually wrong claims about arena allocator mechanics |
| Source grounding | Explanation distinguishes source-supported content from general knowledge (directive §2.A) when the source excerpt doesn't cover a point |
| Explanation depth | Mechanism-level, not a summary; identifies at least one real trade-off or assumption |
| Follow-up diversity | 3 follow-ups cover 3 genuinely distinct conceptual dimensions, not paraphrases of each other (directive §2.B) |
| Misconception precision | Case 4's positive case triggers correctly; its negative-case pair does **not** false-positive |
| Trap quality | The adversarial challenge is a real boundary condition/counterexample, not a restatement of the correct answer (directive §2.D: "do not simply reveal the correct answer") |
| Research Mode compliance | Zero direct answers/code/simplified summaries present when `research_mode: true` (PRD §7) |
| Structured output validity | Response parses against the Zod schema (§6) on the first attempt, no retry needed |

Running this suite is a **manual, bounded exercise** (5 cases × 1 model = 5 calls, or 5 × 2 models = 10 if both the primary and fallback need validation) — not an automated benchmark harness, per the directive's explicit "do not perform expensive model comparisons automatically" (§5) and "do not run expensive model benchmarks" (§10).

## 6. Structured response contract (Proposed Zod schema)

**Empirically corrected (Stage 6B, confirmed again in 6B.1):** the original plan below assumed `response_format: json_schema` (or `json_object`) would be the transport mechanism for this shape. Live testing against `sarvam-105b` showed both reliably return `content: null` for a multi-field schema like this one, regardless of strictness, nullable-field syntax, or `reasoning_effort` level — see [SARVAM_BENCHMARK_REPORT.md](SARVAM_BENCHMARK_REPORT.md). **The validated transport is plain text with labeled lines** (`EXPLANATION:`, `FOLLOWUP1:`/`2`/`3`, `FALSE_PREMISE_QUOTE:`, `MISCONCEPTION:`, `TRAP:`, or `SOCRATIC1..3`/`REFERENCES:` under Research Mode), extracted server-side with a line-anchored regex parser, and only then validated against the Zod shape below. `response_format` should be omitted from the request entirely; do not pass `json_schema` or `json_object` to `sarvam-105b` for this call shape. The logical field shape (what gets validated, and what it maps to in the database) is unaffected — only the wire transport and the parsing step in `integrations/sarvam/validateResponse.ts` (§8) change.

Compatible with the existing `trapMetadataSchema` in `packages/contracts/src/question-node.ts` (reused as-is, not redefined) and the existing `question_nodes`/`follow_up_questions` tables. This is the **Sarvam-adapter-internal validation schema** described in [ARCHITECTURE.md §4](ARCHITECTURE.md#4-shared-contracts-packagescontracts) — distinct from, and validated before, the public API response contract.

```ts
// Proposed — apps/api/src/integrations/sarvam/ (not implemented in this phase)

const misconceptionTypeSchema = z.enum([
  'incorrect_assumption',
  'incomplete_mental_model',
  'invalid_generalization',
  'incorrect_causal_relationship',
  'edge_case_misunderstanding',
]);

const misconceptionAssessmentSchema = z.object({
  present: z.boolean(),
  type: misconceptionTypeSchema.nullable(),
  confidence: z.enum(['low', 'medium', 'high']).nullable(),
  description: z.string().nullable(),
});

const referenceSchema = z.object({
  title: z.string(),
  url: z.string().url().nullable(), // nullable: a citation may name a doc/paper without a resolvable URL
});

const researchModeOutputSchema = z.object({
  socraticQuestions: z.array(z.string()).min(1),
  references: z.array(referenceSchema),
});

export const sarvamNodeResponseSchema = z.object({
  explanation: z.string().nullable(), // null when researchMode is populated instead (§1.E)
  followUps: z.array(z.string()).length(3), // exactly 3 — CLAUDE.md invariant #2
  misconception: misconceptionAssessmentSchema,
  trap: trapMetadataSchema.nullable(), // reused from packages/contracts/src/question-node.ts, only non-null when misconception is high-confidence + actionable (§2)
  references: z.array(referenceSchema).nullable(), // standard-mode optional citations, independent of Research Mode
  researchMode: researchModeOutputSchema.nullable(), // populated only when the Research Mode prompt variant was used
});
```

**Mapping to existing tables ([DATABASE.md §3](DATABASE.md#3-table-definitions-logical-level)):**

| Schema field | Target column | Change needed? |
|---|---|---|
| `explanation` | `question_nodes.ai_explanation` | None — existing column. Under Research Mode, the Socratic/citation content is rendered into this same text column (see §7's migration note) rather than left empty, so the node always has readable content in the graph UI. |
| `followUps[0..2]` | 3 `follow_up_questions` rows, `position` 1–3 | None — existing table, already modeled for exactly 3 |
| `misconception` (low/medium confidence, non-actionable) | Not persisted as a dedicated column | **Pending decision**, not a required migration: the PRD doesn't require storing non-trap misconception signals; discard after the response is mapped, or persist in `question_nodes.trap_metadata`-adjacent telemetry only if a future observability need justifies a new column. Do not invent this column now. |
| `trap` (actionable misconception) | `question_nodes.is_trap` + `trap_metadata` | None — existing columns, existing shape (`trapMetadataSchema` already matches: `misconceptionType`, `scenario`, `resolutionRequired`) |
| `references` / `researchMode.references` | — | **One new nullable column recommended**, see §7 |
| `researchMode.socraticQuestions` | Folded into `ai_explanation` text (formatted as the Socratic prompts) | None if folded; a dedicated column is **not** recommended — Socratic questions are conceptually the node's "explanation" under this mode, not a side channel |

## 7. Required database changes

**One migration is identified as worth making, not made in this phase** (per STRICT RESTRICTIONS — "do not change existing database migrations"):

- **`question_nodes.references jsonb nullable`** — to hold `referenceSchema[]` for both standard-mode optional citations (directive §2.A can surface external context) and Research Mode citations (PRD §7's "raw academic citations, links to official documentation"). Without this column, references would have to be embedded as markdown links inside `ai_explanation`, which is a viable zero-migration fallback for the hackathon Golden Path (**Proposed default**, since `CLAUDE.md` §2 favors the smallest reliable system) but loses structure (e.g. can't render a distinct "References" UI section later without re-parsing the explanation text).

No other column, table, or RLS policy change is required — misconception/trap/follow-up/research-mode state all map onto existing columns per §6's table.

## 8. Backend architecture boundaries (design only)

Extending [ARCHITECTURE.md §3](ARCHITECTURE.md#3-backend-apps-api), the Sarvam intelligence layer decomposes into these **not-yet-implemented** modules, each with one responsibility:

| Module (Proposed location) | Responsibility | Must NOT do |
|---|---|---|
| `integrations/sarvam/client.ts` | Thin wrapper around the `sarvamai` SDK: model selection (primary/fallback from [SARVAM_MODEL_EVALUATION.md](SARVAM_MODEL_EVALUATION.md)), `reasoning_effort` selection by task weight, timeout/retry policy | Build prompts, touch the database, know about `question_nodes` shape |
| `integrations/sarvam/prompts.ts` | System + user prompt templates per [PROMPT_DESIGN.md](PROMPT_DESIGN.md), including the Research Mode variant | Call the network, validate responses |
| `services/sourceContext.ts` | Loads and bounds the `learning_sources` excerpt relevant to a question (§3's chunking — chunking strategy itself is Pending) | Know about Sarvam's request/response shape |
| `services/graphContext.ts` | Assembles the bounded ancestry context (§3's table: parent, grandparent, rolling summary) from already-persisted `question_nodes` rows | Call Sarvam directly, persist anything |
| `integrations/sarvam/validateResponse.ts` | **Empirically corrected scope**: first extracts labeled fields from Sarvam's plain-text response (line-anchored regex parser, §6), then validates the parsed structure against `sarvamNodeResponseSchema`; a failure at either step is a handled provider error per [ARCHITECTURE.md §7.1](ARCHITECTURE.md#71-failure-handling-at-each-stage), never silently patched | Map to the public API contract, write to the database |
| `services/inquiryOrchestration.ts` | Coordinates: ownership check → `sourceContext` + `graphContext` → Sarvam call → `validateResponse` → maps to public contract → hands off to persistence | Construct prompts, touch Sarvam request/response shapes directly |
| `repositories/questionNodeRepository.ts` | The one atomic transaction: `INSERT question_nodes` + 3 `INSERT follow_up_questions` (+ conditional `wallet_transactions`, per existing Stamina service boundary) | Call Sarvam, validate AI output |

This mirrors the controller → service → repository layering already established in `ARCHITECTURE.md §3`, with the Sarvam-specific pieces (`client`, `prompts`, `validateResponse`) isolated exactly as that document already specifies ("the only module that knows Sarvam's request/response shape"). **AI generation and database persistence remain two separate operations** (directive §7): `inquiryOrchestration` only hands validated, internal-contract-shaped data to the repository — the repository never calls Sarvam, and the Sarvam modules never touch Supabase.

## 9. Credit efficiency summary

Concrete mechanisms (expanded from §1's one-call-per-node baseline):

1. **One Sarvam call per node**, all five capabilities in one structured response (§1) — not five calls.
2. **Bounded ancestry context** (§3) — O(1) context growth past depth 2, not O(depth).
3. **`reasoning_effort` selected by task weight** — **Empirically corrected**: `sarvam-105b` only accepts `"low"`, `"medium"`, `"high"` (a live `400` rejects `"none"`); reasoning cannot be fully disabled on this model, so even cheap/low-stakes regenerations should use `"low"` rather than attempting to disable reasoning. The benchmark validated `"low"` end-to-end for the full node-generation shape at `max_tokens: 6000` ([SARVAM_MODEL_EVALUATION.md](SARVAM_MODEL_EVALUATION.md) §5). `deepseekv4.1-flash-1017`'s documented `"none"` support remains unverified live.
4. **No automatic retries on validation failure** — a malformed Sarvam response is surfaced as a handled `502`/`422` error to the user (existing `ARCHITECTURE.md §7.1` behavior), not silently retried, which would double cost on every transient glitch. A single bounded retry with a stricter re-prompt is explicitly marked "Proposed" (not default) in the existing architecture doc and should stay that way unless benchmark results (§5) show it's needed.
5. **No duplicate submissions** — existing idempotency/ownership checks already prevent a double-click or network retry from producing two Sarvam calls for the same logical event.
6. **Explicit `max_tokens`** on every call — **Empirically confirmed**: 6000 for the full node-generation shape on `sarvam-105b` at `reasoning_effort: "low"`. Observed `reasoning_tokens` consumption ranged ~1600–4370 across the 5 canonical benchmark cases; a lower budget risks the model being cut off mid-reasoning with zero emitted content (the exact failure mode that caused the original 0/5 benchmark result before this was raised). Also set `timeoutInSeconds: 120` on the request — the SDK's 60s default was observed to trip at this token budget.
7. **Model selection by task complexity** — the primary/fallback split in [SARVAM_MODEL_EVALUATION.md](SARVAM_MODEL_EVALUATION.md) exists specifically so cheap calls don't have to use the expensive model.

## 10. Unresolved decisions (Pending — do not guess, decide before implementation)

- **Source chunking strategy.** How `source_reference` content is split and which chunk(s) are relevant to a given question — timestamp-based for video, section-based for documents? Not specified by the PRD.
- **Rolling ancestry summary.** Whether it's persisted (new column) or recomputed per-request from the parent chain up to the cutoff. Recomputing avoids a migration but costs more tokens on deep branches; persisting costs a migration but is cheaper per call past depth 3. **Proposed for the hackathon: recompute, since most demo sessions won't exceed depth 3–4 and a migration adds risk for a case that may not be exercised live.**
- **`references` column (§7).** Add now (reversible, additive migration) vs. fold into `ai_explanation` text for the hackathon and revisit post-MVP.
- **Exact truncation character caps** (§3's ~1,500-char figure) — a starting guess, not validated against actual `sarvam-105b` token costs; tune after the benchmark pass (§5).
- **`max_tokens` per call type** — **Resolved by benchmarking** (§9.6): 6000 for the full node-generation shape at `reasoning_effort: "low"`. Still open: the budget for cheaper/lower-stakes call types (e.g. a single follow-up regeneration), which were not part of the 5 canonical benchmark cases and have not been measured.
- **Whether a bounded retry-on-validation-failure is worth the extra cost** — Pending per §9.4, tied to how often validation actually fails in the benchmark pass.

## 11. Implementation sequence (Proposed, after this document and the two related ones are reviewed)

1. Run the 5-case benchmark (§5) manually against the primary model to validate prompt design and the structured schema before writing any production code.
2. Implement `packages/contracts` additions for `sarvamNodeResponseSchema` (and `references` column, if that Pending decision is resolved to "yes") as a reviewed, standalone change.
3. Implement the Sarvam adapter modules (§8) behind the existing `apps/api/src/integrations/sarvam/` placeholder, bottom-up: `client.ts` → `prompts.ts` → `validateResponse.ts`.
4. Implement `POST /api/v1/inquiries/:inquiryId/nodes` (already specified in [API_CONTRACTS.md §4](API_CONTRACTS.md#4-post-apiv1inquiriesinquiryidnodes), currently "Pending implementation") wired to the new orchestration service.
5. Only then: trap-attempts endpoint, Stamina wiring for the new event types, frontend integration — each as its own reviewed milestone, per `CLAUDE.md` §8's "work only on the requested scope."
