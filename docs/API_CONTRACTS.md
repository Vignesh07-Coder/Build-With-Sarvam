# Tattva — API Contracts

Status key: **Confirmed**, **Proposed**, **Pending** (see [ARCHITECTURE.md](ARCHITECTURE.md) for the definitions). This document specifies the API surface for the hackathon Golden Path.

Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE.md](DATABASE.md) · [implementation-status.md](implementation-status.md)

**Stage 5 implementation note:** `GET /health`, `GET /api/v1/me`, `POST /api/v1/inquiries`, and `GET /api/v1/inquiries/:inquiryId` below are now implemented exactly as specified (see `apps/api/src/routes`). `POST /api/v1/inquiries/:inquiryId/nodes`, the trap-attempts endpoint, and `GET /api/v1/stamina/me` remain **Pending implementation** — explicitly out of Stage 5's scope. One endpoint not originally drafted here was added: **`GET /api/v1/inquiries`** (list the caller's own inquiries, §3a below), because the Stage 5 task brief required a "list inquiries belonging to the authenticated user" capability and [DATABASE.md §14](DATABASE.md#14-expected-query-patterns) already documents the matching query pattern (`WHERE user_id = $1 ORDER BY created_at DESC`).

## 0. Conventions (Proposed)

- **Base path:** `/api/v1` for all product routes; `GET /health` is unversioned.
- **Auth:** unless marked "Public", every route requires `Authorization: Bearer <supabase-access-token>`. The backend verifies this token independently (`CLAUDE.md` §4) — it never trusts a client-supplied user ID.
- **Content type:** `application/json` for all request/response bodies.
- **Success envelope:**
  ```json
  { "data": { /* endpoint-specific payload */ } }
  ```
- **Error envelope:**
  ```json
  { "error": { "code": "string_error_code", "message": "human-readable message", "details": { } } }
  ```
  `details` is optional and typically carries Zod field errors on `400`.
- **Status codes used:** `200` (read success), `201` (resource created), `400` (request validation failure), `401` (missing/invalid auth), `403` (reserved — generally avoided in favor of `404` to not leak existence of others' resources), `404` (not found / not owned by caller), `409` (conflict, e.g. duplicate idempotency key surfaced as non-error — see §5), `422` (semantically invalid, e.g. AI output failed validation after retry), `429` (rate limited), `502` (upstream Sarvam failure), `500` (unexpected server error).
- **Validation:** every request body/param is parsed against a `packages/contracts` Zod schema before reaching a service. Every response body is shaped to a corresponding response schema.

## 1. `GET /health`

**Purpose:** Liveness/readiness check for deployment and local dev. Public.

- **Auth:** none.
- **Request:** no body/params.
- **Response `200`:**
  ```json
  { "status": "ok", "service": "tattva-api" }
  ```
  **Reconciliation note:** this is a flat shape, not the `{ "data": ... }` envelope used by versioned `/api/v1` routes. Stage 3 (repository infrastructure) fixed this exact payload explicitly; §0's general envelope convention applies only to `/api/v1/*` routes, consistent with `/health` already being called out there as unversioned. The implementation at `apps/api/src/controllers/health.controller.ts` and the shared contract at `packages/contracts/src/health.ts` are the source of truth for this endpoint's shape.
- **Validation:** none required.
- **Errors:** none expected in normal operation; if critical configuration is missing the process should fail to start rather than serve a degraded `/health` (Confirmed, `CLAUDE.md` §5 — "optional integration credentials must not prevent the basic health check from starting" implies required ones may legitimately block startup).
- **Database interactions:** none.
- **Authorization:** none.

## 2. `POST /api/v1/inquiries`

**Purpose:** Create a new learning workspace (inquiry) for the authenticated user against a curated `learning_sources` row.

- **Auth:** required.
- **Request body:**
  ```json
  { "learningSourceId": "uuid" }
  ```
- **Response `201`:**
  ```json
  {
    "data": {
      "id": "uuid",
      "userId": "uuid",
      "learningSourceId": "uuid",
      "title": "string | null",
      "createdAt": "iso8601",
      "updatedAt": "iso8601"
    }
  }
  ```
- **Validation:** `learningSourceId` must be a valid UUID and must reference an existing `learning_sources` row (service-layer existence check, not just format).
- **Expected errors:** `400` (bad/missing `learningSourceId`), `404` (`learningSourceId` does not exist), `401` (auth failure).
- **Database interactions:** `INSERT` into `inquiries` with `user_id` taken from the verified token, **never** from the request body ([DATABASE.md §12](DATABASE.md#12-data-ownership-boundaries)).
- **Authorization:** any authenticated user (including anonymous) may create an inquiry for themselves; there is no additional authorization check beyond "is authenticated."

## 3a. `GET /api/v1/inquiries`

**Purpose:** List the authenticated user's own inquiries (dashboard listing). Added in Stage 5 — see the implementation note above.

- **Auth:** required.
- **Request:** no body/params.
- **Response `200`:**
  ```json
  { "data": [ { "id": "uuid", "userId": "uuid", "learningSourceId": "uuid", "title": "string | null", "createdAt": "iso8601", "updatedAt": "iso8601" } ] }
  ```
- **Validation:** none beyond auth.
- **Expected errors:** `401` only, under normal operation.
- **Database interactions:** `SELECT ... WHERE user_id = $1 ORDER BY created_at DESC` via the request-scoped (RLS-protected) client ([DATABASE.md §14](DATABASE.md#14-expected-query-patterns)).
- **Authorization:** implicit — always scoped to the caller's own `user_id`.

## 3. `GET /api/v1/inquiries/:inquiryId`

**Purpose:** Load a single inquiry's full persistent Knowledge Graph (all `question_nodes` + their `follow_up_questions`) plus its source reference, for the workspace view.

- **Auth:** required.
- **Request:** `inquiryId` path param (UUID).
- **Response `200`:**
  ```json
  {
    "data": {
      "id": "uuid",
      "learningSource": {
        "id": "uuid",
        "title": "string",
        "sourceType": "string",
        "sourceReference": "string",
        "durationMinutes": 25
      },
      "nodes": [
        {
          "id": "uuid",
          "parentNodeId": "uuid | null",
          "userQuestion": "string",
          "aiExplanation": "string",
          "researchMode": false,
          "isTrap": false,
          "trapMetadata": null,
          "trapResolvedAt": "iso8601 | null",
          "followUps": [
            { "id": "uuid", "position": 1, "questionText": "string", "isSelected": false, "childNodeId": "uuid | null" }
          ],
          "createdAt": "iso8601"
        }
      ]
    }
  }
  ```
- **Validation:** `inquiryId` must be a valid UUID.
- **Expected errors:** `400` (malformed UUID), `404` (inquiry doesn't exist **or** doesn't belong to the caller — identical response to avoid leaking existence), `401`.
- **Database interactions:** `SELECT` on `inquiries` (ownership check), `question_nodes`, `follow_up_questions`, `learning_sources`, scoped by the request-scoped (RLS-protected) client.
- **Authorization:** `inquiries.user_id` must equal the caller's verified user ID.

## 4. `POST /api/v1/inquiries/:inquiryId/nodes`

**Purpose:** Submit a learner question (root question, or a question following a selected follow-up) and generate the next `question_node` via Sarvam AI.

- **Auth:** required.
- **Request body:**
  ```json
  {
    "question": "string, 1..N chars",
    "parentNodeId": "uuid | null",
    "selectedFollowUpId": "uuid | null",
    "researchMode": false
  }
  ```
  `parentNodeId: null` and `selectedFollowUpId: null` together indicate a root-node submission (only valid once per inquiry — see [DATABASE.md §3.3](DATABASE.md#33-question_nodes)). A non-null `selectedFollowUpId` indicates the question was generated by selecting that follow-up; the service resolves `parentNodeId` from it rather than trusting a client-supplied value for already-selected follow-ups (Proposed — defends against a client claiming a different parent than the follow-up it selected).
- **Response `201`:** a single node in the same shape as one entry of the `nodes` array in §3, plus any Stamina effect summary:
  ```json
  {
    "data": {
      "node": { "...": "as in GET /inquiries/:id" },
      "staminaAwarded": { "eventType": "followup_selected", "finalPoints": 0 } 
    }
  }
  ```
  `staminaAwarded` is `null` when no ledger event applies to this call (exact point values Pending, [DATABASE.md §6](DATABASE.md#6-pending-product-decisions-do-not-guess)).
- **Validation:** `question` non-empty and length-capped (exact cap Proposed, e.g. 2000 chars, to bound prompt size — §6.6 of ARCHITECTURE.md); `parentNodeId`/`selectedFollowUpId` UUID format when present; service-layer check that at most one root node exists per inquiry; service-layer check that the Sarvam response contains exactly 3 follow-ups before persisting ([DATABASE.md §3.4](DATABASE.md#34-follow_up_questions)).
- **Expected errors:** `400` (validation failure, or attempting a second root node), `404` (inquiry/parent node not found or not owned), `409` (`parentNodeId`'s trap is unresolved — see §5 below, request rejected until trap is resolved), `502` (Sarvam call failed), `422` (Sarvam output failed schema validation after any configured retry).
- **Database interactions:** ownership check on `inquiries`; transactional `INSERT` of one `question_nodes` row + exactly 3 `follow_up_questions` rows; conditional `INSERT` into `wallet_transactions` via the privileged client.
- **Authorization:** `inquiries.user_id` must equal caller; if `parentNodeId` is supplied, that node must belong to the same inquiry.

## 5. `POST /api/v1/question-nodes/:nodeId/trap-attempts`

**Purpose:** Submit the learner's resolution to a "Be Careful Here!!" adversarial trap, unblocking further graph progression on survival (PRD §5).

- **Auth:** required.
- **Request body:**
  ```json
  { "response": "string, 1..N chars" }
  ```
- **Response `200` (survived):**
  ```json
  {
    "data": {
      "result": "survived",
      "trapResolvedAt": "iso8601",
      "staminaAwarded": { "eventType": "trap_survived", "finalPoints": 0 }
    }
  }
  ```
- **Response `200` (not yet sufficient — Proposed, since grading mechanism is Pending per [ARCHITECTURE.md §8](ARCHITECTURE.md#8-adversarial-trap-lifecycle)):**
  ```json
  { "data": { "result": "retry", "feedback": "string" } }
  ```
- **Validation:** `response` non-empty; `nodeId` must reference a node with `isTrap = true` and `trapResolvedAt IS NULL`.
- **Expected errors:** `400` (empty response, or node is not currently in a trap state), `404` (node not found/not owned), `502`/`422` (grading call to Sarvam fails/returns unparseable output, if the chosen grading mechanism calls Sarvam — Pending per ARCHITECTURE.md §8).
- **Database interactions:** `SELECT` + ownership check on `question_nodes`; on survival, `UPDATE question_nodes SET trap_resolved_at = now()` (the one narrowly-scoped exception to node immutability — Proposed, since this is a status transition, not a rewrite of history) and `INSERT` into `wallet_transactions`.
- **Authorization:** the node's inquiry must belong to the caller.

## 6. `GET /api/v1/stamina/me`

**Purpose:** Return the authenticated user's current Cognitive Stamina balance and optionally recent ledger history, for the Stamina display.

- **Auth:** required.
- **Request:** no body; optional query param `?history=true` to include recent transactions (Proposed).
- **Response `200`:**
  ```json
  {
    "data": {
      "balance": 0,
      "recentTransactions": [
        {
          "id": "uuid",
          "eventType": "node_completed_research_mode",
          "basePoints": 0,
          "multiplier": 3.0,
          "finalPoints": 0,
          "createdAt": "iso8601"
        }
      ]
    }
  }
  ```
  `recentTransactions` is `[]` when `history` is not requested.
- **Validation:** none beyond auth.
- **Expected errors:** `401` only, under normal operation.
- **Database interactions:** `SELECT SUM(final_points) ... WHERE user_id = $1` ([DATABASE.md §7](DATABASE.md#7-total-stamina-balance-calculation)); optional `SELECT ... ORDER BY created_at DESC LIMIT N` for history.
- **Authorization:** implicit — always scoped to the caller's own `user_id`; there is no parameterized "view another user's Stamina" route in the MVP (the PRD's recruiter-facing query capability, PRD §10, is explicitly deferred per `CLAUDE.md` §2).

## 7. Consistency with the domain model

Every endpoint above reads or writes only the five entities defined in [DATABASE.md](DATABASE.md): `learning_sources`, `inquiries`, `question_nodes`, `follow_up_questions`, `wallet_transactions`. No endpoint references Tattva 200, Arena, or badge entities, consistent with their deferral in [ARCHITECTURE.md §10.9](ARCHITECTURE.md#109-explicitly-deferred-not-mvp).

## 8. Golden Path coverage

The six endpoints above are sufficient to execute the full Golden Path end to end: create an inquiry (§2), load it (§3), submit the root question and subsequent follow-up-driven questions (§4), resolve a trap (§5), and observe the Stamina effect (§6) — matching [ARCHITECTURE.md §10.3](ARCHITECTURE.md#103-required-endpoints).
