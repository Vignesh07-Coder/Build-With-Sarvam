# ADR-002: Authentication — Supabase Auth with Anonymous Sign-In

## Status

Proposed (anonymous sign-in is the recommended hackathon identity strategy; `CLAUDE.md` currently states the identity model is "undecided until explicitly chosen" — this ADR is the explicit choice it calls for, and should be treated as accepted once reviewed by the team, since it directly resolves that flagged gap).

## Context

`CLAUDE.md` §4 mandates Supabase Auth but explicitly leaves the demo-user/identity strategy undecided, instructing that identity-dependent features be flagged before implementation. The architecture brief (now `docs/architecture-brief.md`) directs evaluating anonymous authentication as the initial hackathon sign-in experience, with the Supabase Auth user UUID as the canonical identity, and requires:
- the frontend to obtain a session and send the access token to the backend,
- the backend to verify that token before processing authenticated requests,
- never trusting a client-supplied user ID.

A hackathon demo cannot afford email/password or OAuth sign-up friction in front of judges; identity is needed purely to scope `inquiries`/`question_nodes`/`wallet_transactions` rows per visitor and to give RLS a real `auth.uid()` to check against.

Current Supabase documentation confirms `supabase.auth.signInAnonymously()` creates a new user with a real `auth.users` row and a normal session/access token, indistinguishable at the database level from an email-based user except for an `is_anonymous` flag included in the JWT. ([Supabase Anonymous Sign-Ins guide](https://supabase.com/docs/guides/auth/auth-anonymous))

## Decision

1. **Use Supabase Auth's native anonymous sign-in** (`supabase.auth.signInAnonymously()`) as the sole sign-in path for the hackathon MVP. On first visit, `apps/web` calls this once per browser session and persists the resulting Supabase session via the Supabase JS client's normal storage mechanism.
2. **The canonical identity is the Supabase Auth user UUID** (`auth.users.id`), exactly as the architecture brief requires. All domain tables reference this UUID directly (`inquiries.user_id`, `wallet_transactions.user_id`, etc. — [DATABASE.md](../DATABASE.md)).
3. **Token transmission:** the frontend attaches the current session's access token as `Authorization: Bearer <token>` on every `apps/api` request ([ARCHITECTURE.md §6.1](../ARCHITECTURE.md#61-authentication-verification)).
4. **Backend token verification:** the Express auth middleware verifies the bearer token against Supabase (via the Supabase server SDK's token verification, using the project's JWT secret/JWKS — exact verification call is an implementation detail to confirm against current Supabase server-SDK docs at build time, not guessed here) and derives `{ userId, isAnonymous }` from the verified claims, including the `is_anonymous` JWT field Supabase anonymous sessions carry. The backend **never** accepts a `userId` passed in a request body/header as the acting identity.
5. **Session persistence:** the Supabase JS client's default session persistence (local storage, auto-refresh) is used client-side; no custom session store is built for the hackathon.
6. **Account upgrade path (future, not required for MVP):** Supabase supports converting an anonymous user to a permanent one via `updateUser()` (email/phone) or `linkIdentity()` (OAuth), preserving the same `auth.users.id` and therefore all existing `inquiries`/`wallet_transactions` history for that identity. ([Supabase Anonymous Sign-Ins guide](https://supabase.com/docs/guides/auth/auth-anonymous)) This is explicitly deferred — not implemented in the hackathon MVP — but it is the documented reason anonymous auth is viable long-term rather than a throwaway hack.

## Anonymous authentication limitations (explicitly documented, per architecture brief requirement)

- **No cross-device/cross-browser continuity.** An anonymous identity lives in one browser's local storage; clearing storage, switching browsers, or switching devices creates a new `auth.users` row with no link to prior history, unless/until the upgrade path (above) is implemented.
- **No recovery if the session is lost.** There is no password or email to reauthenticate with; a lost anonymous session's Knowledge Graph and Stamina history become orphaned (still present in the database, but inaccessible to that learner going forward).
- **Not suitable for the PRD's long-term recruiter-facing credentialing promise** (PRD §10) as-is — an unlinked anonymous identity cannot be attributed to a real person for recruiter verification. This is acceptable for the hackathon demo (`CLAUDE.md` §2 defers recruiter dashboards entirely) but must be called out as a gap before any future milestone that depends on verified real-world identity.
- **Potential for low-friction abuse** (e.g. rapid repeated anonymous sign-ins to bypass rate limits) — mitigated only partially by the rate-limiting discussed in [ARCHITECTURE.md §6.8](../ARCHITECTURE.md#68-rate-limiting); full abuse resistance is out of scope for the hackathon.

## RLS implications

- RLS policies keyed on `auth.uid()` work identically for anonymous and permanent users — an anonymous user's `auth.uid()` is a real, stable UUID for the lifetime of that session/local-storage entry, so [DATABASE.md §10](../DATABASE.md#10-rls-strategy)'s policies (`USING (user_id = auth.uid())`) require no special-casing for anonymity.
- Where a policy needs to distinguish anonymous from permanent users (not currently needed for any MVP table, but noted for future use, e.g. restricting certain future features to verified accounts), Supabase recommends checking the JWT's `is_anonymous` claim via `auth.jwt() ->> 'is_anonymous'` in the policy expression. ([Supabase Anonymous Sign-Ins guide](https://supabase.com/docs/guides/auth/auth-anonymous))
- `learning_sources` remains readable by any authenticated role (anonymous included) since it carries no per-user ownership ([DATABASE.md §10](../DATABASE.md#10-rls-strategy)).

## Alternatives considered

| Alternative | Why rejected for the hackathon |
|---|---|
| Email/password sign-up | Adds sign-up friction directly in front of judges during a live demo; no hackathon requirement for persistent real-world identity. |
| OAuth (Google, GitHub) | Requires provider app registration/config overhead disproportionate to a 24-hour build; still more friction than anonymous for a cold demo. |
| Custom/no-auth demo user (e.g. a hardcoded UUID shared by all sessions) | Violates `CLAUDE.md` §5 ("never trust client-provided user IDs") in spirit even if not literally client-supplied, and gives RLS nothing real to check — effectively disables per-user isolation. Also collides across concurrent demo viewers. |
| Magic link | Requires email delivery configuration and introduces latency/failure modes unsuitable for a live, timed demo. |

## Consequences

- Every identity-dependent feature (inquiry ownership, Stamina ledger, RLS policies) can be implemented immediately using `auth.uid()`, with no bespoke identity table.
- The upgrade path to a permanent account is a known, documented, low-risk addition for a future milestone (same `auth.users.id`, no data migration needed).
- The team must still verify the exact current Supabase server-SDK method for backend-side token verification against live documentation at implementation time (per the architecture brief's explicit instruction), since SDK method names/signatures can change between versions.

## Risks

- If a demo session's browser storage is cleared mid-event, the presenter loses access to that session's graph — mitigated operationally by not clearing storage/using a dedicated demo browser profile during the live demo (a process risk, not an architectural one).
- Anonymous-identity abuse (ADR §"limitations" above) is a known, accepted risk for the hackathon timeframe; revisit before any production exposure.
