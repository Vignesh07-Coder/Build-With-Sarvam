# Tattva — Sarvam Model Evaluation

Status key: **Confirmed** (verified against official Sarvam documentation, fetched 2026-11-12), **Proposed** (this document's recommendation), **Pending** (open decision), **Empirically corrected** (contradicted by a live API call during Stage 6B benchmarking — see §5).

Related: [INTELLIGENCE_ARCHITECTURE.md](INTELLIGENCE_ARCHITECTURE.md) · [PROMPT_DESIGN.md](PROMPT_DESIGN.md)

Source: https://docs.sarvam.ai/api/getting-started/models/openweight, https://docs.sarvam.ai/api/getting-started/pricing, https://docs.sarvam.ai/api/token-factory/chat-completions (fetched live, not assumed from memory or training data).

## 1. Candidate models (serverless — available on our hackathon key without a provisioning request)

All prices are ₹ per 1,000,000 tokens, excluding GST, identical across plans. Reasoning tokens bill as output tokens.

| Model ID | Context | Reasoning | Structured output | Input ₹/1M | Cached input ₹/1M | Output ₹/1M | Notes |
|---|---|---|---|---|---|---|---|
| `sarvam-105b` | 128K, text only | Hybrid; default `low`. **Empirically corrected**: `reasoning_effort: "none"` is rejected live with `400 Bad Request` ("Input should be 'low', 'medium' or 'high'") — only those three values are accepted; reasoning cannot actually be disabled on this model. | `response_format`: `json_schema`/`json_object` is **Empirically corrected** — both reliably return `content: null` for our multi-field schema regardless of strictness or effort level; plain-text labeled output + server-side parsing is the validated approach (§5) | 15 | 5 | 60 | "Flagship model for complex reasoning, coding, and agentic workflows." Already verified working in our smoke test and in the 5-case benchmark (Stage 6B/6B.1). |
| `sarvam-105b-conversations` | 32K | Not documented | Not documented | 15 | 5 | 60 | V1-only conversational variant, post-trained for real-time dialogue/voice agents — not a fit for structured node generation. |
| `glm5.3` | 1M, text only | Always on, default `max`, **cannot be disabled** | `response_format` supported | 126 | 20 | 390 | "Strongest reasoning" per Sarvam's own docs — but every call pays for max-effort reasoning whether we need it or not. |
| `glm5.3-flash` | 1M, text + image | Always on, default `high`, **cannot be disabled** | `response_format` supported | 13.5 | 2.5 | 45 | Lowest per-token price of any open-weight chat model on the page. Mandatory reasoning still applies to every call. |
| `gemma4` | 256K, text + image | Off by default; only thinks if `reasoning_effort` is explicitly set | `response_format` supported | 35 | 10 | 90 | "Fastest answers... skips reasoning by default" per Sarvam's docs (no numeric latency given). Not reasoning-oriented — weak fit for explanation depth. |
| `deepseekv4.1-flash-1017` | 1M, text + image | Default `high`, documented as disableable with `reasoning_effort: "none"` — **not independently verified live**; given the identical claim for `sarvam-105b` turned out false, treat as unconfirmed until tested | `response_format` supported — not benchmarked; given `sarvam-105b`'s structured-output failure, assume the same plain-text fallback may be needed until tested | 14 | 0.25 | 55 | Cheapest cached-input price of any candidate by a wide margin (₹0.25 vs ₹2.5–20 elsewhere) — directly relevant to our bounded-context reuse strategy (§3). |

Provisioned-throughput models (`deepseekv4-pro`, `kimi-k3.1-pro`, `qwen38-27b`) require an organisation-level enablement request from Sarvam and are **excluded** — the hackathon key returns `400`/`404` for them, and requesting access burns time we don't have (§8 of the directive: do not spend credits on large-scale experiments).

## 2. Evaluation against our criteria

- **Reasoning capability.** `glm5.3` is documented as Sarvam's strongest reasoning model, but at 8.4x the input price and 6.5x the output price of `sarvam-105b`, with no ability to turn reasoning off for simpler calls (follow-up phrasing, misconception triage). `sarvam-105b` is a flagship-tier model with hybrid reasoning we can dial up or down per call.
- **Context window.** `sarvam-105b`'s 128K context comfortably covers our bounded-context strategy (source excerpt + ≤2 ancestor nodes + rolling summary, §3 of INTELLIGENCE_ARCHITECTURE.md) — we are not building a full-transcript-in-context product, so the 1M windows on the GLM/DeepSeek models are headroom we don't need to pay for.
- **Structured output / JSON reliability.** All five serverless candidates support `response_format`; Sarvam's own docs call `json_schema` with `strict: true` the "recommended" mechanism. No model-specific caveat was found for `sarvam-105b` or `deepseekv4.1-flash-1017`. One documented pitfall applies to a *different*, non-candidate model: `qwen38-27b` emits schema content into the reasoning trace (content `null`) when thinking is on — not our concern since that model is excluded.
- **Reasoning-token overhead.** This is the deciding factor against `glm5.3`/`glm5.3-flash`: their reasoning cannot be disabled, so every explanation call — even a short follow-up-only regeneration — pays full reasoning-token cost. `sarvam-105b` and `deepseekv4.1-flash-1017` both let us set `reasoning_effort: "none"` for low-stakes calls.
- **Pricing at hackathon scale.** With ₹500 (or ~500 "credits," figure as stated in the PRD) for the full 24-hour event, `sarvam-105b` at ₹15 in / ₹60 out is ~8x cheaper per output token than `glm5.3` and comparable to `deepseekv4.1-flash-1017`. `glm5.3-flash` is nominally cheaper per token than `sarvam-105b` but its mandatory reasoning overhead works against that advantage for short calls.
- **Serverless availability.** All five are Serverless (no provisioning step, no waiting on Sarvam support during the hackathon window) — Confirmed from the pricing page.
- **SDK compatibility.** All candidates are called through the same `sarvamai` SDK `client.chat.completions()` method already verified in our smoke test (`apps/api/scripts/sarvam-smoke-test.ts`); only the `model` string and `reasoning_effort` value change. No SDK-level incompatibility found for any candidate.
- **Latency.** Not documented for any model by Sarvam. We cannot select on this axis without running our own timed calls, which the directive explicitly tells us not to spend credits on. Treat as an operational risk (§9 of the final report) to be measured empirically once implementation starts, not assumed here.

## 3. Recommendation

### Primary model: `sarvam-105b`

- Already verified live against our key (smoke test, `apps/api/scripts/sarvam-smoke-test.ts`) — zero additional validation risk before Phase 2 implementation.
- Explicitly documented by Sarvam as the flagship model for "complex reasoning, coding, and agentic workflows" — matches the depth bar Tattva's PRD sets ("technical depth, not generic summaries").
- `json_schema` with `strict: true` is Sarvam's own recommended structured-output path, directly usable for our unified response contract (§6 of INTELLIGENCE_ARCHITECTURE.md).
- Hybrid reasoning lets us raise `reasoning_effort` for deep-explanation/misconception/trap generation and drop it to `"none"` for cheap, low-stakes calls (e.g. a follow-up re-roll), which no GLM candidate allows.
- 128K context is enough headroom for the bounded-context strategy without paying for a 1M window we won't use.

### Economical fallback: `deepseekv4.1-flash-1017`

- Reasoning can be disabled per-call (`reasoning_effort: "none"`) for simple, low-risk generations (e.g. regenerating a single follow-up, or a lightweight misconception pre-screen) where `sarvam-105b`'s baseline cost isn't justified.
- Output price (₹55/1M) is close to `sarvam-105b` (₹60/1M), so switching doesn't meaningfully change the cost model — it's a fallback for *availability* (rate-limit headroom, provider error on the primary) more than for cost, per §8's instruction not to invent pricing-driven micro-optimizations we can't verify.
- Dramatically cheaper cached input (₹0.25/1M vs ₹5/1M on `sarvam-105b`) is a genuine advantage if we end up caching large, repeated source-context blocks — worth revisiting once real token volumes are known, but not a reason to make it primary today, since `sarvam-105b`'s overall track record (already working, documented flagship status) outweighs a caching discount we haven't measured yet.
- Same `response_format` / `sarvamai` SDK surface as the primary model — switching is a one-line adapter config change, not a new integration.

### Explicitly not selected

- `glm5.3` — best raw reasoning per Sarvam's docs, but 6.5–8.4x the price of `sarvam-105b` with no way to turn off reasoning overhead. Reconsider only if `sarvam-105b` output quality proves insufficient during benchmark testing (§5 below).
- `glm5.3-flash` — cheapest nominal price, but mandatory reasoning on every call and no track record against our actual prompts yet. Candidate fallback if `deepseekv4.1-flash-1017`'s reasoning-disabled output proves too shallow during benchmarking.
- `gemma4` — reasoning is opt-in and the model's own positioning ("fastest answers... skips reasoning by default") is oriented toward speed over depth; a weaker fit for Tattva's "technical depth, not generic summaries" requirement.
- `sarvam-105b-conversations` — purpose-built for real-time dialogue/voice, 32K context, not documented for structured JSON output. Wrong tool for node generation.
- Provisioned-throughput models (`deepseekv4-pro`, `kimi-k3.1-pro`, `qwen38-27b`) — require an enablement request we don't have time for in a 24-hour hackathon window.

## 4. Unresolved / to verify empirically (not guessed here)

- **Latency** for `deepseekv4.1-flash-1017` under real prompt sizes — not documented by Sarvam, and not yet benchmarked (only `sarvam-105b` was benchmarked in Stage 6B/6B.1). `sarvam-105b` latency is now measured — see §5.
- **Exact hackathon credit unit** — the PRD states "500 Sarvam API credits"; the pricing page prices everything in ₹/1M tokens. Whether "credit" = ₹1 or some other conversion is not stated in either source and must be confirmed with the hackathon organizers/Sarvam dashboard before finalizing a per-call budget, not assumed here.

## 5. Empirically confirmed request format (Stage 6B / 6B.1 benchmark, `sarvam-105b` only)

The following corrects §1's and §2's original documentation-sourced assumptions, which turned out to be wrong when tested live. Full detail and raw outputs: [SARVAM_BENCHMARK_REPORT.md](SARVAM_BENCHMARK_REPORT.md).

- **`reasoning_effort`**: only `"low"`, `"medium"`, `"high"` are accepted. `"none"` returns a live `400 Bad Request`. Reasoning cannot be disabled on `sarvam-105b` — every call pays some reasoning-token cost.
- **`response_format`**: do not use `json_schema` (strict or non-strict) or `json_object` for a multi-field response on this model — both reliably returned `content: null` across every reasoning-effort level tested. Use plain text with labeled lines (`EXPLANATION:`, `FOLLOWUP1:`, etc.) and parse server-side with a regex extractor, then validate the parsed structure with Zod. This is a correction to INTELLIGENCE_ARCHITECTURE.md §4/§6, which originally proposed `json_schema`/`strict: true` as the response contract mechanism.
- **`max_tokens`**: set to at least 6000 for a full explanation + 3 follow-ups + misconception + trap response. Observed `reasoning_tokens` consumption at `reasoning_effort: "low"` for this grounded/sourced prompt shape ranged from ~1600 to ~4370 tokens across the 5 canonical benchmark cases — far larger and more variable than the ~1200–1500 originally assumed in PROMPT_DESIGN.md §6. An insufficient budget causes the model to be cut off mid-reasoning and emit zero content.
- **Request timeout**: set `timeoutInSeconds: 120` (second argument to `client.chat.completions()`) — the SDK's default 60s timeout was observed to trip at the 6000-token budget; real latencies for this prompt shape ranged ~18–49 seconds per call.
- **Latency** (measured, `sarvam-105b`, `reasoning_effort: "low"`, `max_tokens: 6000`): 18.2s–48.8s per call across the 5 canonical benchmark cases, correlated with reasoning-token volume, not prompt length.
