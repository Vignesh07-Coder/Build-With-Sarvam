# Tattva — Sarvam Intelligence Benchmark Report (Stage 6B + 6B.1)

Status: **Confirmed observations** (actual live API calls, data below) vs. **Subjective evaluation** (explicitly labeled). This report documents real calls against the production Sarvam API — nothing here is simulated or predicted. §§0-9 are the original Stage 6B report (structural fix: plain text format, 6000-token budget). **§12 is Stage 6B.1**: the misconception-precision fix and re-run that was Stage 6B's one open blocker, now resolved — read §12 for the current final decision; §11's "CONDITIONAL PASS" verdict is superseded by §12.

Related: [INTELLIGENCE_ARCHITECTURE.md](INTELLIGENCE_ARCHITECTURE.md) · [SARVAM_MODEL_EVALUATION.md](SARVAM_MODEL_EVALUATION.md) · [PROMPT_DESIGN.md](PROMPT_DESIGN.md) · `apps/api/scripts/sarvam-benchmark.ts`

## 0. What actually happened (summary before detail)

**First pass (structured JSON output, as originally proposed in `INTELLIGENCE_ARCHITECTURE.md` §6): 0 of 5 canonical cases produced usable content.** Every call returned `content: null` regardless of token budget (tested at 1,200 and 4,000 `max_tokens`) — the model's reasoning consumed the entire budget and never emitted output.

**Root-cause investigation (7 bounded diagnostic calls)** isolated two independent, compounding causes:

1. **JSON-constrained decoding itself is unreliable on this model for multi-field outputs.** `response_format: "json_schema"` (strict or not) and `"json_object"` both failed consistently — flattening the schema, fixing nullable-field syntax, and raising `reasoning_effort` to `medium` did not help. A **plain-text response with labeled lines**, parsed server-side, is what actually works.
2. **The token budgets originally assumed (1,200–1,500) were simply too small.** `reasoning_tokens` consumed by `sarvam-105b` at `reasoning_effort: "low"` for this grounded/sourced prompt shape is itself large and *variable* — observed between ~500 and ~3,900 tokens across different probes of the same or similar prompts. When `max_tokens` is set below whatever a given run happens to need, the model is cut off mid-reasoning and emits nothing. Setting `max_tokens: 6000` resolved this reliably.

**Second pass, with both fixes applied (plain-text labeled output + `max_tokens: 6000` + a 120s client timeout): 5 of 5 canonical cases succeeded**, each with a well-formed explanation, exactly 3 distinct follow-ups, and a parseable misconception/trap assessment. Full real outputs are in §3.

**New finding from the successful run:** misconception detection has a **real false-positive problem** — 2 of 4 non-deliberate-misconception questions (TEST_01, TEST_03) were flagged "high confidence" misconceptions and had adversarial traps generated for them, despite being neutral, premise-free technical questions. Only TEST_02 correctly returned no misconception; TEST_04 (the one question with a deliberately seeded false premise) was correctly caught. See §6.

## 1. Experiment setup (actual, final)

- **Model:** `sarvam-105b` (only model benchmarked, per credit-control rules).
- **Source material:** the exact `fixtureSourceBody` excerpt already committed in `apps/web/lib/fixtures/workspace-fixtures.ts`, matching the seeded `learning_sources` row "Memory Arena Allocators: Design and Trade-offs" in `supabase/seed.sql`.
- **Output format (final, working):** plain text with labeled lines (`EXPLANATION:`, `FOLLOWUP1/2/3:`, `MISCONCEPTION:`, `TRAP:` for standard mode; `SOCRATIC1/2/3:`, `FOLLOWUP1/2/3:`, `REFERENCES:` for Research Mode), parsed server-side with a regex extractor, then validated with a Zod schema over the parsed structure. **No `response_format` is sent to the API at all** — see §5 for why.
- **Request parameters (final):** `reasoning_effort: "low"`, `temperature: 0.2`, `max_tokens: 6000`, `timeoutInSeconds: 120` (SDK request option).
- **Validation:** regex-parsed fields validated against a local Zod schema (`standardParsedSchema` / `researchModeParsedSchema` in `apps/api/scripts/sarvam-benchmark.ts`) — not written into `packages/contracts`.
- **Script:** `apps/api/scripts/sarvam-benchmark.ts` (committed, reflects the final working configuration).

## 2. First-pass failure (structured JSON output) — factual record

| Attempt | `max_tokens` | Result |
|---|---|---|
| Canonical 5 cases, attempt 1 | 1,200 | All 5: `content: null`. `completion_tokens == max_tokens` and `reasoning_tokens == completion_tokens - 1` in every case — the model used the entire budget on reasoning, with exactly one token of room left, which was not enough for any output. |
| Canonical cases, attempt 2 | 4,000 | TEST_01: `content: null` again, same pattern (3,999 of 4,000 on reasoning). TEST_02: exceeded the SDK's default 60s timeout. Stopped per credit-control rules (do not run repeated experiments once a clear failure pattern is reproduced). |

Four bounded diagnostic calls then isolated the cause before concluding anything about model suitability:

| Diagnostic | Config | Result |
|---|---|---|
| D1 | `reasoning_effort: "none"` | **400 Bad Request**: `"Input should be 'low', 'medium' or 'high'"`. Contradicts `SARVAM_MODEL_EVALUATION.md`'s claim (sourced from Sarvam's docs) that `"none"` disables reasoning on this model — **documentation correction needed**, see §9. |
| D2 | `reasoning_effort: "low"`, no `response_format`, single short question | Success, 8.3s, 568 completion tokens (492 reasoning), correct 2-sentence answer. |
| D3 | `reasoning_effort: "low"`, minimal 1-field `json_schema` | Success, 6.0s, 418 completion tokens (339 reasoning), valid JSON. |
| D4 | `reasoning_effort: "low"`, full nested production schema, nullable fields rewritten as `anyOf` (ruling out a syntax bug) | **Failed identically** to the canonical runs — 1,499 of 1,500 tokens on reasoning, `content: null`. |

D2/D3 show the model is fast and correct on simple tasks; D4 shows the full nested `strict` JSON schema specifically breaks it, independent of nullable-field syntax.

## 3. Further isolation and the confirmed fix (3 more diagnostic calls)

| Diagnostic | Config | Result |
|---|---|---|
| D5 | `reasoning_effort: "low"`, `json_object` mode (looser, no schema), same multi-field task as D4 | **Still failed** — 1,499 of 1,500 reasoning tokens, `content: null`. Rules out `strict` schema enforcement specifically; any JSON-constrained mode fails. |
| D6 | Same task, same `reasoning_effort`, **plain text** with 5 labeled lines (simpler than the full production field set) | **Succeeded** — 1,154 of 1,451 completion tokens on reasoning, full correct content (explanation + 3 diverse follow-ups + misconception line). First working multi-field result. |
| D7 | Plain text, lean 4-label format (explanation + 3 follow-ups only, no misconception/trap), `max_tokens: 6000` | **Succeeded** — 1,659 of 1,898 tokens used (not the full budget), correct content. Confirms a sufficiently large budget resolves the issue even for the full-complexity case. |

Two earlier attempts at the 6-label plain-text format with smaller budgets (1,500 and 2,500) gave **mixed results** — one got cut off mid-answer, one failed entirely — which is what revealed that budget size, not format or field count alone, was the second real variable. This matches §0's two-cause finding exactly.

## 4. Final canonical 5-case results (actual, after the fix)

| Test | Latency | prompt_tokens | completion_tokens | reasoning_tokens | followUpCount | Parse valid |
|---|---|---|---|---|---|---|
| TEST_01 Basic conceptual | 52,812 ms | 733 | 4,297 | 3,791 | 3 | true |
| TEST_02 Deep systems reasoning | 44,723 ms | 736 | 3,289 | 2,953 | 3 | true |
| TEST_03 Edge-case analysis | 37,615 ms | 737 | 4,384 | 3,921 | 3 | true |
| TEST_04 Deliberate misconception | 26,062 ms | 739 | 2,809 | 2,420 | 3 | true |
| TEST_05 Research Mode | 26,142 ms | 526 | 2,883 | 2,523 | 3 | true |

**Observation (factual):** none of the 5 calls used the full 6,000-token budget — actual usage ranged 2,809–4,384 completion tokens, confirming the budget was generous enough, not merely barely sufficient. Latency ranged 26–53 seconds; this is real, not simulated, and is itself a finding (see §8).

### TEST_01 — "Why does an arena allocator make bulk memory reclamation efficient compared with a general-purpose allocator?"

> **Explanation:** A general-purpose allocator tracks metadata for every individual block—headers, footers, and free-list pointers—so each deallocation must update bookkeeping structures, potentially coalesce with adjacent free blocks, and manage fragmented size classes. By contrast, the arena allocator described in the source material reserves one contiguous region up front and satisfies allocations by advancing a single "bump" pointer; because no per-object metadata is maintained, bulk reclamation is simply resetting that pointer or releasing the entire region at once. This replaces per-object cleanup with one cheap operation whose cost does not scale with the number of objects freed, but in exchange it cannot reclaim an individual object without invalidating every allocation made after it in the same arena.
>
> **Follow-ups:** (1) what makes long-lived, independently-freed workloads unsuitable for an arena, (2) the throughput cost of requiring zero-fill/guard-on-reset to prevent use-after-free, (3) when a free-list with per-size-class pools would outperform a pure arena for mixed-lifetime workloads.
>
> **Misconception flagged:** `TYPE=incomplete_mental_model; CONFIDENCE=high` — "Believing that arena allocators achieve efficient bulk reclamation by batch-processing individually tracked free blocks... rather than by eliminating per-object metadata entirely." **This is a false positive** — the question itself asserted no such belief; see §6.
> **Trap generated (as a result of the above):** a stale-pointer-aliasing scenario — well-constructed in isolation, but triggered on a question that didn't warrant one.

### TEST_02 — "What happens to memory allocation performance and fragmentation when an arena allocator is used for objects with significantly different lifetimes?"

> **Explanation:** correctly explains that independent lifetimes force either retaining dead memory until a full reset, or falling back to a secondary allocator that reintroduces metadata overhead and fragmentation — directly reflecting the source's own framing of the arena/free-list trade-off.
>
> **Follow-ups:** (1) free-list vs. general-purpose fallback trade-off, (2) what allocation/reset sequence triggers the stale-pointer bug in a correlated-lifetime context, (3) when retaining dead arena memory is preferable to fallback-allocator overhead.
>
> **Misconception:** `none`. **Trap:** `none`. Correct — no false positive here.

### TEST_03 — "What happens if an allocation request exceeds the remaining capacity of an arena while previously allocated objects are still being used?"

> **Explanation:** correctly states the allocator cannot compact/split/free-list to make room; the request must fail (or fall back to a general-purpose allocator) since there is no per-object metadata to coordinate partial reclamation.
>
> **Follow-ups:** (1) dynamic region expansion vs. the reset-pointer hazard, (2) whether a free-list fallback negates the arena's performance advantage, (3) whether a failed (non-resetting) allocation has an analogous pointer-safety hazard.
>
> **Misconception flagged:** `TYPE=incorrect_causal_relationship; CONFIDENCE=high` — "Believing that because objects are still in use, the arena can incrementally reclaim or compact their backing memory." **This is also a false positive** — the question asked "what happens," asserting no such belief; see §6.
> **Trap generated:** a well-posed scenario about resetting on overflow and invalidating live pointers — again, well-constructed but inappropriately triggered.

### TEST_04 — "Since an arena allocator frees all its memory at once, objects allocated inside it can safely outlive the arena, right?"

> **Explanation:** directly refutes the premise, quoting the source's own language about stale pointers aliasing newly-allocated memory after a reset.
>
> **Follow-ups:** (1) bookkeeping needed when mixing intra-arena and fallback pointers, (2) how the correlated-lifetime requirement constrains cross-referencing data structures, (3) why the resulting bug is hard to reproduce rather than an immediate deterministic fault.
>
> **Misconception flagged:** `TYPE=incorrect_causal_relationship; CONFIDENCE=high`, with an accurate description of the actual misconception in the question. **Correct — a true positive.**
> **Trap:** a concrete, realistic scenario — a request handler caching an arena pointer by session ID across a reset, producing silent cross-session data corruption. This is a genuine boundary-condition challenge, not a restatement of the answer — **matches the directive's quality bar for an adversarial challenge.**

### TEST_05 — Research Mode — "Derive why arena allocation can improve allocation throughput, and investigate the conditions under which this advantage disappears."

> **No direct explanation was given** — the model correctly withheld one, producing only `SOCRATIC1/2/3` and `FOLLOWUP1/2/3`, consistent with Research Mode's "no direct answers" rule.
> **Socratic questions:** probe the hidden cost a general-purpose allocator pays per free, the lifetime-correlation assumptions behind safe pointer reuse, and the two conditions that must jointly hold for arena performance to degrade relative to a free list — genuinely Socratic (they require the student to derive the answer, not just recall it).
> **References:** `none` — the model did not fabricate a citation when it had none to offer, consistent with the prompt's explicit instruction not to invent one.

## 5. Why plain text, not JSON structured output (design implication)

**`INTELLIGENCE_ARCHITECTURE.md` §4 and §6's assumption that `response_format: json_schema` is the right mechanism is not supported by this benchmark and should be revised.** The working configuration sends no `response_format` at all — it instructs the model (via the system prompt) to emit labeled plain-text lines, then parses them server-side with a regex extractor before Zod-validating the parsed structure. This is a real architectural change from what was proposed, not a benchmark-only detail:

- `packages/contracts`' `sarvamNodeResponseSchema` (proposed in `INTELLIGENCE_ARCHITECTURE.md` §6) should validate the **parsed object**, same as designed — the schema shape itself doesn't need to change.
- The **adapter's response-handling step** (`integrations/sarvam/validateResponse.ts` in `INTELLIGENCE_ARCHITECTURE.md` §8) needs a parsing step inserted before validation: raw text → regex-extracted fields → Zod validation. This is a concrete, scoped addition to that module's responsibility, not a redesign.
- `response_format` should be **dropped from the Sarvam request** entirely for `sarvam-105b` at `reasoning_effort: "low"`, based on this benchmark's evidence (D4, D5 both failed under JSON constraint; D6, D7, and the final 5/5 run all succeeded in plain text).

## 6. Evaluation rubric scores

| Dimension | Score | Basis |
|---|---|---|
| 1. Technical correctness | **5/5** | All 5 explanations are factually accurate, consistent with the source excerpt, and introduce no invented allocator behavior (the directive's explicit concern for TEST_03). |
| 2. Explanation depth | **4/5** | Mechanism-level throughout (bump pointer, batched reset, metadata elimination, fallback trade-offs) — not generic summaries. Not 5/5 because none of the 5 explicitly flagged uncertainty or absence of source coverage (per `INTELLIGENCE_ARCHITECTURE.md` §2.A's "acknowledge insufficient source context" instruction) — this was never tested since the source excerpt happened to cover every question asked. |
| 3. Source grounding | **5/5** | Every explanation explicitly references "the source" and in several cases quotes it directly (e.g. TEST_04 quoting "never per-object," TEST_01/03 reflecting the hybrid-fallback framing verbatim). |
| 4. Follow-up diversity | **4/5** | Across all 5 tests, the 3 follow-ups consistently probe distinct angles (e.g. TEST_01: workload fit / safety-cost trade-off / free-list comparison) rather than rephrasing one idea 3 times. Not 5/5 because a few follow-ups across different tests circle similar fallback-allocator territory — acceptable, not perfectly orthogonal. |
| 5. Follow-up usefulness | **4/5** | Follow-ups are specific and answerable from engineering reasoning, not vague ("what else is interesting about X?") — e.g. TEST_03's "would a free-list fallback negate the arena's advantage for the earlier allocations" is a genuinely useful next question. |
| 6. Misconception precision | **2/5 — explicit low score, explained below** | 1 of 1 deliberately-seeded misconceptions was correctly caught (TEST_04, true positive) — but 2 of 2 neutral, premise-free questions were also flagged "high confidence" (TEST_01, TEST_03) — a **50% false-positive rate** on clean questions in this sample. The directive and `INTELLIGENCE_ARCHITECTURE.md` §2 both treat false positives as "particularly undesirable," and this result directly fails that bar as currently prompted. |
| 7. Adversarial challenge quality | **4/5 when triggered, but triggered inappropriately** | TEST_04's trap (session-cache-reuse scenario) is exactly the kind of boundary-condition challenge the directive asks for — concrete, requires reasoning, doesn't restate the answer. TEST_01/03's traps are *also* well-constructed in isolation, but their existence at all is the problem (§6's low misconception-precision score), so this dimension's quality can't be separated from §6's failure. |
| 8. Research Mode compliance | **5/5** | Zero direct answers, zero code, zero simplified summaries. Socratic questions genuinely require derivation. No fabricated reference. Fully compliant with PRD §7 and `INTELLIGENCE_ARCHITECTURE.md` §1.E. |

**Explicit explanation for the one low score (dimension 6, and its knock-on effect on 7):** the prompt's instruction to "default to no misconception when uncertain" (per `PROMPT_DESIGN.md` §2 rule 4) was not sufficient to prevent the model from treating an open-ended, neutrally-phrased technical question as an implicit false belief. This is a prompt-calibration problem, not a model-capability problem — the model clearly *can* assess misconceptions accurately (TEST_04 proves this) — it is currently over-triggering on questions that merely invite an explanation, not ones that assert a wrong claim.

## 7. Observed failure cases (factual, consolidated)

1. **Structured JSON output (`json_schema` and `json_object`) reliably fails to produce content** on `sarvam-105b` at `reasoning_effort: "low"`/`"medium"` for this multi-field task — confirmed across 2 canonical attempts + 2 targeted diagnostics (D4, D5), 0 successes.
2. **`reasoning_effort: "none"` is rejected by the live API**, contradicting Sarvam's documented behavior as captured in `SARVAM_MODEL_EVALUATION.md` — a documentation bug, not a benchmark failure, flagged in §9.
3. **Reasoning-token consumption at `"low"` effort is large and variable** for this prompt shape (observed 492–3,921 tokens across different probes) — a fixed small `max_tokens` assumption (the original 1,200–1,500 figures in `PROMPT_DESIGN.md` §6) is unsafe; 6,000 was needed for reliable completion in this benchmark.
4. **Misconception false positives on 2 of 4 non-deliberate test questions** — see §6, dimension 6.
5. **High per-call latency** — 26–53 seconds per standard-mode call at `reasoning_effort: "low"`. Not previously documented by Sarvam (per `SARVAM_MODEL_EVALUATION.md` §2's own note that latency wasn't documented) — this benchmark is the first concrete latency data point, and it's a real UX consideration (§8).

## 8. Prompt weaknesses identified

- The misconception-detection instruction ("default to no misconception when uncertain... only report high confidence when you can name the specific error") is not strong enough to stop the model from treating an answerable, well-posed question as evidence of a hidden false belief. It needs either a stricter negative framing, worked contrastive examples (a neutral question vs. a premise-bearing one, shown side by side in the prompt — this was recommended but not yet implemented in `INTELLIGENCE_ARCHITECTURE.md` §2), or a requirement that the misconception description quote the specific part of the *student's own question* that reveals the false belief (which would make it harder to flag TEST_01/03, since neither actually asserts anything false).
- The original JSON-schema-based prompt design assumed structured output was the reliable path; it was the opposite for this model/task shape. Any future prompt redesign should start from the plain-text labeled format validated here, not reintroduce `response_format`.
- 26–53 second latency per call is long enough to need explicit loading-state UX design in the frontend (out of this phase's scope, but worth flagging for `ARCHITECTURE.md`'s failure-handling section) and affects the credit-efficiency assumptions in `INTELLIGENCE_ARCHITECTURE.md` §9 (slower calls are harder to parallelize/batch within a demo).

## 9. Recommended prompt improvements

1. **Adopt the plain-text labeled-line format validated in this report as the production contract**, with server-side regex parsing + Zod validation, replacing the `json_schema`/`strict` approach in `INTELLIGENCE_ARCHITECTURE.md` §4 and §6. This is the single highest-confidence fix validated here (5/5 success rate after adoption, vs. 0/9 attempts under any JSON-constrained mode).
2. **Set `max_tokens` to at least 4,000–6,000 for standard-mode node generation calls** (not the 1,200–1,500 figures previously assumed in `PROMPT_DESIGN.md` §6), and set an explicit client-side request timeout above the default 60s (120s used here) to accommodate the 26–53s observed latency.
3. **Tighten the misconception-detection instruction** to require the model to quote the specific clause of the student's own question that reveals the false belief, and/or add 1–2 worked contrastive examples (a neutral question that should NOT trigger, right next to one that should) directly in the system prompt — then re-benchmark TEST_01/03-style neutral questions specifically to confirm the false-positive rate drops before trusting this signal in production.
4. **Update `SARVAM_MODEL_EVALUATION.md`** to correct the `reasoning_effort: "none"` claim for `sarvam-105b` (§9 below) — not done in this report since that's a prior-stage document, but flagged so it isn't missed.
5. **Re-run this exact 5-case suite once more** after implementing fix #3, specifically to re-check TEST_01, TEST_02, and TEST_03's misconception field — this is the one open reliability question standing between "CONDITIONAL PASS" and a full "PASS."

## 10. Documentation correction needed

`SARVAM_MODEL_EVALUATION.md` §1 states `sarvam-105b` reasoning is "Hybrid; default `low`, disable with `reasoning_effort: "none"`," sourced from Sarvam's documentation pages. This benchmark's D1 result (`400`, "Input should be 'low', 'medium' or 'high'") contradicts that for this account/API version. **Recommend updating that document** before anyone relies on `"none"` being available. Not corrected in this report since this stage's scope doesn't include editing prior-stage docs, but flagged here explicitly.

## 11. Final decision

**CONDITIONAL PASS — one specific prompt improvement required before production integration; the structural blocker from the first pass is resolved.**

Rationale:
- **Not a FAIL.** With the plain-text format and a correctly-sized token budget, `sarvam-105b` produced technically correct (5/5), well-grounded (5/5), genuinely diverse (4/5) output across all 5 canonical cases, 5/5 parse-valid, including fully correct Research Mode compliance (5/5) and a high-quality adversarial challenge when appropriately triggered (TEST_04).
- **Not a full PASS**, because misconception detection — one of the PRD's five core capabilities and one explicitly called out as needing low false positives — flagged 2 of 4 neutral questions as high-confidence misconceptions in this sample. That's not a minor polish item; it would make the "Be Careful Here!!" trap UI fire on ordinary questions in the actual product, directly undermining the feature's credibility per the PRD's own stated concern.
- **CONDITIONAL PASS**, not FAIL, because: (a) the model's underlying judgment is demonstrably sound (TEST_04's true positive, with an accurate root-cause description), meaning this is very likely a prompt-calibration gap, not a capability ceiling; (b) every other capability benchmarked cleanly; (c) the fix path (§9, item 3) is concrete, scoped, and testable with the same 5-case suite before implementation proceeds.

Stage 6C is not started, per the directive.

## 12. Stage 6B.1 — misconception-precision fix and re-run (supersedes §11)

This section addresses §9 item 3 and §11's stated blocker: a fix-and-reverify pass on the misconception false-positive rate, using the exact same 5 canonical cases and the exact same `sarvam-105b` model/parameters, with no change to `response_format`, `max_tokens`, or `timeoutInSeconds`.

### 12.1 The fix

Added to the standard-mode system prompt (`apps/api/scripts/sarvam-benchmark.ts`, `STANDARD_SYSTEM_PROMPT`):

1. A new mandatory output field, `FALSE_PREMISE_QUOTE`, placed before `MISCONCEPTION` in the labeled-line format: `"none"`, or an exact verbatim substring copied from the student's question that itself asserts or assumes something false.
2. A hard rule: `CONFIDENCE=high` is only permitted when `FALSE_PREMISE_QUOTE` is non-`"none"`. A question that merely asks "what happens if...", "why does...", or explores an edge case is explicitly named as *not* a misconception by itself.
3. One worked positive example (a question with a genuine false premise, with its exact quote shown) and one worked negative example (an edge-case question, `FALSE_PREMISE_QUOTE: none`) placed directly in the system prompt, immediately after the rule.
4. A matching change to the benchmark script's validation: the local Zod schema now `.refine()`s that `CONFIDENCE=high` never appears without a non-`"none"` `falsePremiseQuoteRaw`, and the script separately records whether that quote is an actual verbatim substring of the student's question (`falsePremiseQuoteVerbatim`), as an automated check on the model's own honesty about "quoting," not just its presence.

No other request parameter changed: `reasoning_effort: "low"`, `temperature: 0.2`, `max_tokens: 6000`, `timeoutInSeconds: 120`, `response_format` omitted — identical to §1's final Stage 6B setup.

### 12.2 Re-run results (actual, real API calls, 2026-11-12)

| Test | Latency | completion_tokens | reasoning_tokens | followUpCount | Parse valid | Misconception result |
|---|---|---|---|---|---|---|
| TEST_01 Basic conceptual | 35,810 ms | 3,244 | 2,892 | 3 | true | `none` — **correct (fixed; was a false positive in §4)** |
| TEST_02 Deep systems reasoning | 48,784 ms | 4,752 | 4,370 | 3 | true | `none` — correct (was already correct in §4) |
| TEST_03 Edge-case analysis | 23,216 ms | 2,406 | 2,091 | 3 | true | `none` — **correct (fixed; was a false positive in §4)** |
| TEST_04 Deliberate misconception | 31,132 ms | 3,542 | 3,050 | 3 | true | `CONFIDENCE=high`, quote verbatim — **correct (true positive, preserved)** |
| TEST_05 Research Mode | 18,219 ms | 1,973 | 1,600 | 3 | true | n/a (Research Mode has no misconception field) |

**5 of 5 schema-valid, 5 of 5 exactly 3 follow-ups — same structural result as §4.** The only targeted change is in misconception precision:

- **TEST_01** (`"Why does an arena allocator make bulk memory reclamation efficient compared with a general-purpose allocator?"`): `FALSE_PREMISE_QUOTE: none`, `MISCONCEPTION: none`. The explanation, follow-ups, and overall content are consistent with §4's TEST_01 in quality — only the misconception field changed, from an incorrect high-confidence flag to the correct `none`.
- **TEST_03** (`"What happens if an allocation request exceeds the remaining capacity of an arena while previously allocated objects are still being used?"`): `FALSE_PREMISE_QUOTE: none`, `MISCONCEPTION: none`. Same pattern — the edge-case question is no longer misclassified as a misconception.
- **TEST_04** (`"Since an arena allocator frees all its memory at once, objects allocated inside it can safely outlive the arena, right?"`): `FALSE_PREMISE_QUOTE: "objects allocated inside it can safely outlive the arena"`, `MISCONCEPTION: TYPE=invalid_generalization; CONFIDENCE=high`. This quote is a genuine, exact substring of the question — the automated `falsePremiseQuoteVerbatim` check reported `false` only because the model wrapped its quote in its own literal quotation marks (`"..."`); stripping those confirms it is a true verbatim match. This is a cosmetic parser gap (the benchmark script's substring check should strip wrapping quote marks before comparing), not a prompt or model failure — flagged in §12.4, not a blocker.
- A new trap was generated for TEST_04: a request-handler scenario where a buffer allocated in one request outlives an arena reset and is then aliased by a new allocation in the next request — a concrete boundary-condition scenario, consistent with §6 dimension 7's quality bar, not a restatement of the answer.
- **TEST_02** continued to correctly return `none`, unchanged from §4 — confirms the fix did not introduce an over-correction (a new false negative) on a case that was already correct.

### 12.3 Updated rubric score — dimension 6 (misconception precision)

| Dimension | Stage 6B score (§6) | Stage 6B.1 score | Basis for the change |
|---|---|---|---|
| 6. Misconception precision | 2/5 | **5/5** | 4 of 4 non-seeded questions (TEST_01, TEST_02, TEST_03, and TEST_05 has no misconception field) now correctly report no misconception; the 1 of 1 deliberately-seeded case (TEST_04) is still correctly caught with an accurate type/description and a genuine quoted false premise. 0 false positives, 0 false negatives in this 5-case sample — a full reversal from §6's 50% false-positive rate. |
| 7. Adversarial challenge quality | 4/5 when triggered, but triggered inappropriately (§6) | **5/5** | The trap now only fires on TEST_04, where it is warranted; TEST_01/TEST_03 no longer generate spurious traps. The one trap generated (TEST_04) remains a concrete, non-trivial boundary-condition scenario. |

All other dimensions (1, 2, 3, 4, 5, 8) are unchanged from §6 — this fix was scoped specifically to misconception detection and did not touch the explanation, follow-up, or Research Mode prompt text.

### 12.4 Residual non-blocking finding

The benchmark script's `falsePremiseQuoteVerbatim` check does not strip the model's own wrapping quotation marks before comparing against the student's question text, producing a `false` reading for TEST_04 even though the quote is genuinely verbatim once those marks are removed (confirmed by a one-line manual check). This is a benchmark-script scoring artifact, not a prompt or model defect — recommend stripping leading/trailing `"`/`'` characters from the extracted quote before the substring comparison if this check is carried into a production telemetry/validation path. Does not affect the PASS decision below.

### 12.5 Final decision — supersedes §11

**PASS.**

Rationale:
- §11's CONDITIONAL PASS named exactly one blocker: misconception false positives (2 of 4 neutral questions). This re-run, with the targeted fix in §12.1 and no other change, resolved it — 0 false positives and the one true positive preserved, across the same 5 canonical cases.
- Every other dimension scored in §6 remains at 4/5 or 5/5, unchanged.
- The structural blocker from the original first pass (§0, §2) — 0/5 usable content under JSON-constrained output — was already resolved in Stage 6B and remains resolved here (5/5 schema-valid, identical request shape).
- No new failure mode was introduced: TEST_02, the one case that was already correct in §6, remained correct here, showing the fix tightened precision without over-correcting into false negatives.
- Documentation (`INTELLIGENCE_ARCHITECTURE.md`, `PROMPT_DESIGN.md`, `SARVAM_MODEL_EVALUATION.md`) has been updated to carry forward the plain-text format, the 6000-token budget, the 120s timeout, the confirmed `reasoning_effort` values (`"low"`/`"medium"`/`"high"` only, no `"none"`), and the quote-first misconception rule as the validated basis for production implementation.

This benchmark-only script and its findings are not production code. Implementing `packages/contracts` additions, the Sarvam adapter modules, and the node-generation endpoint (`INTELLIGENCE_ARCHITECTURE.md` §11, steps 2-4) remains out of scope for Stage 6B/6B.1 and requires separate authorization to begin.
