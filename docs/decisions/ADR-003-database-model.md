# ADR-003: Database Model — Relational Graph and Append-Only Stamina Ledger

## Status

Confirmed for the entity set and core constraints (directly specified by the PRD and architecture brief); Proposed for specific implementation choices called out below; Pending items are flagged explicitly and must not be silently decided during implementation.

## Context

Tattva's MVP must persist: a learner's workspace (`Inquiries`), a branching tree of AI-generated question/explanation pairs (`QuestionNodes`), exactly three structured adaptive follow-ups per node (`FollowUpQuestions`), and an append-only, server-controlled Cognitive Stamina ledger (`WalletTransactions`) — per the architecture brief §2 and PRD §3, §7, §10. The model must support persistent branching (not an ephemeral chat transcript, `CLAUDE.md` invariant #1), server-side enforcement of the "exactly three follow-ups" rule (`CLAUDE.md` invariant #2), and immutability of Stamina history (`CLAUDE.md` invariant #6).

## Decision

### Domain entities
Adopt the five entities and schema detailed in [DATABASE.md](../DATABASE.md): `learning_sources`, `inquiries`, `question_nodes`, `follow_up_questions`, `wallet_transactions`.

### Graph representation
Represent the Knowledge Graph as a **self-referencing adjacency list** on `question_nodes` (`parent_node_id → question_nodes.id`), rather than a separate edges table or a materialized path/closure table.

- **Why adjacency list over a separate edges table:** the graph here is strictly a tree (each node has at most one parent — PRD §3's branching model, not an arbitrary DAG), so a single nullable self-FK captures the full relationship with no extra table, and insertion is a single-row write.
- **Why not closure table / materialized path (Proposed rejection, revisit if query patterns demand it):** the hackathon's expected query pattern is "load the entire tree for one inquiry and reconstruct it client-side" ([DATABASE.md §14](../DATABASE.md#14-expected-query-patterns)), not "find all ancestors of node X" at scale — a closure table solves a problem this MVP doesn't have yet, at the cost of write complexity (every insert would need closure-table maintenance). Reconsider if a future milestone needs deep ancestor/descendant queries without loading the full tree.

### Follow-up question representation
Represent the three follow-ups as **structured relational rows** (`follow_up_questions`, one row per position 1–3), not as a JSON array column on `question_nodes`.

- **Why relational rows over JSON:** the architecture brief explicitly requires "structured relational records" with constraints preventing duplicate positions and invalid counts — a `UNIQUE (question_node_id, position)` constraint and a `CHECK (position IN (1,2,3))` are directly expressible on rows but not enforceable as cleanly inside a JSON blob. Relational rows also let `child_node_id` be tracked per follow-up independently, and let future features (e.g. per-follow-up analytics) query without JSON parsing.
- **Why the "exactly 3" count is NOT a single-table DB constraint:** counting sibling rows is a cross-row invariant, which Postgres can only express via a constraint trigger, not a plain `CHECK`. The decision is to enforce this **transactionally in the service layer** instead ([DATABASE.md §3.4](../DATABASE.md#34-follow_up_questions), [ARCHITECTURE.md §11](../ARCHITECTURE.md#11-append-only-ledger-strategy)) — the service inserts a node and its 3 follow-ups as one atomic transaction, or none at all. A Postgres constraint trigger was considered and rejected for the hackathon timeframe as added complexity with an equivalent guarantee already achievable in application code that owns the only write path to this table.

### Stamina ledger
Implement `wallet_transactions` as a genuinely **append-only** table:
- Database role grants: `INSERT`, `SELECT` only for the role the backend's privileged client uses — no `UPDATE`/`DELETE` grant exists at all, so immutability is enforced by Postgres privileges, not just application discipline.
- `UNIQUE (idempotency_key)` is the mechanical duplicate-award defense.
- The Stamina balance is **derived** via `SUM(final_points)` at read time, never stored as a mutable running total ([DATABASE.md §7](../DATABASE.md#7-total-stamina-balance-calculation)) — this directly protects the PRD's "immutable ledger" framing (PRD, Philosophical Core; PRD §10) by removing any single mutable value that could be edited to misrepresent history.
- Exact point values per event type are **Pending** — the PRD never specifies them (architecture brief §2.E explicit instruction: "Do not invent exact Stamina award values if they are not defined in the PRD"). `base_points` is modeled as a server-side configuration input, not hardcoded per call site, so the real values can be supplied as a product decision without a schema change.
- The 3× Research Mode multiplier (PRD §7) is Confirmed and is applied server-side only, read from the just-persisted `question_nodes.research_mode` flag, never from client input.

### Important constraints (summary — see [DATABASE.md](../DATABASE.md) for full detail)
- `learning_sources.duration_minutes >= 25` (PRD §2's 25-minute floor).
- `follow_up_questions`: `UNIQUE (question_node_id, position)`, `CHECK (position IN (1,2,3))`.
- `question_nodes`: self-FK `parent_node_id`, `CHECK (parent_node_id IS NULL OR parent_node_id <> id)`; exactly-one-root-per-inquiry enforced at the service layer.
- `wallet_transactions`: `UNIQUE (idempotency_key)`, `CHECK (final_points = base_points * multiplier)`, `CHECK (base_points >= 0)`, `CHECK (multiplier > 0)`, insert-only role grants.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Store the whole Knowledge Graph as a single JSON blob per inquiry | Directly contradicts the architecture brief's explicit instruction ("Do not persist the graph only as an opaque frontend blob," `CLAUDE.md` §4) and makes server-side enforcement of per-node constraints (follow-up count, trap state) effectively impossible to validate relationally. |
| Materialized path (e.g. `ltree`) for `question_nodes` | More powerful ancestor/descendant querying than needed for the hackathon's "load full tree" access pattern; adds a Postgres extension dependency and write-path complexity not justified yet. |
| A single mutable `stamina_balance` column on a user profile table, updated on each award | Reintroduces exactly the client-/race-condition-editable single point of truth the PRD's "un-fakeable ledger" principle is designed to eliminate; derived `SUM()` was chosen instead. |
| Soft-delete / versioned rows for `wallet_transactions` corrections | Unneeded for the hackathon scope (no correction scenario expected in the demo window); if ever needed, a compensating-transaction row is simpler and keeps the table genuinely append-only rather than introducing an update path that must then be specially trusted. |

## Consequences

- Reconstructing the Knowledge Graph for rendering is a client-side tree-build from a flat node list (`parent_node_id` pointers) after one `SELECT ... WHERE inquiry_id = $1` — simple and fast at hackathon data volumes ([DATABASE.md §14](../DATABASE.md#14-expected-query-patterns)).
- The "exactly 3 follow-ups" and "exactly 1 root node" invariants live in the inquiry service's transaction logic, not solely in the schema — code review and tests must treat these as first-class invariants to verify, since the database alone won't catch every violation.
- Stamina balance reads involve an aggregate query rather than a single-row lookup; acceptable at hackathon scale, flagged in [DATABASE.md §15](../DATABASE.md#15-future-scalability-considerations-out-of-mvp-scope) as a future optimization point if it ever matters.

## Risks

- Because the "exactly 3 follow-ups" invariant is enforced in application code rather than the database schema, a future code path that bypasses the inquiry service (e.g. a careless admin script) could violate it silently. Mitigation: keep all writes to `question_nodes`/`follow_up_questions` routed through the one service method; do not add a second write path without updating this ADR.
- Pending Stamina point values mean the ledger's `base_points` will initially be placeholder/configuration-driven; implementers must not invent "reasonable-sounding" numbers and ship them as if confirmed — flag the decision explicitly before launch, per the architecture brief's instruction.
