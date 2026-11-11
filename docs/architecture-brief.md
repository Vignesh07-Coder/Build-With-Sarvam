# TATTVA — ARCHITECTURE DESIGN PHASE

You are working on Tattva as its founding software architect.

Read the existing `CLAUDE.md` carefully.

Also locate and study the complete Tattva Product Requirements Document.

Your task is to establish the detailed technical architecture that will govern the initial hackathon MVP.

IMPORTANT: This is an architecture and documentation task only.

Do not initialize the application.
Do not install dependencies.
Do not generate frontend components.
Do not create database migrations.
Do not implement API endpoints.

We are establishing the system design before implementation.

## 1. Architecture decisions

Use these decisions as the initial approved direction.

### Application architecture

- Next.js App Router for the frontend.
- Separate Node.js Express backend using TypeScript.
- pnpm monorepo.
- Shared Zod and TypeScript contracts.
- Supabase PostgreSQL for persistence.
- Sarvam AI accessed exclusively through the backend.

Architecture style: Modular monolith.

Do not introduce unnecessary distributed infrastructure.

### Authentication

Use Supabase Auth.

For the hackathon MVP, evaluate and document anonymous authentication as the initial sign-in experience.

Each anonymous user must receive a genuine Supabase identity.

The canonical identity must be the Supabase Auth user UUID.

The frontend obtains an authentication session and sends the access token to the Express API.

The backend must verify the token before processing authenticated requests.

Never trust user IDs supplied independently by the browser.

Document:
- Authentication lifecycle.
- Anonymous session creation.
- Token transmission.
- Backend token verification.
- Session persistence.
- Account upgrade possibilities.
- Limitations of anonymous accounts.
- RLS implications.

Verify the authentication implementation approach against current official Supabase documentation.

### Database

Use Supabase PostgreSQL.

Version the database schema through SQL migrations.

The database must support persistent learning workspaces, branching Knowledge Graphs, adaptive follow-up questions and the Cognitive Stamina ledger.

## 2. Domain model

Design the initial relational model around these entities.

### A. LearningSources

Represents curated technical learning material.

Include:
- Source identity.
- Title.
- Description.
- Source type.
- Runtime or equivalent reading duration.
- Source reference.
- Publication metadata.

The hackathon uses curated source material.

Do not build a complete content ingestion system.

Preserve the PRD's 25-minute minimum content requirement.

### B. Inquiries

Represents a student's learning workspace or inquiry session.

Each inquiry:
- Belongs to one authenticated user.
- References a learning source.
- Contains one or more question nodes.
- Has creation and update timestamps.

### C. QuestionNodes

Represents the persistent questions and explanations created during a learning session.

Each node should support:
- Node ID.
- Inquiry ID.
- Parent node ID.
- Learner question.
- AI-generated explanation.
- Research Mode state.
- Trap detection state.
- Trap metadata.
- Creation timestamp.

A root node has no parent.

A child node references its parent.

Design the relationships to support persistent branching.

### D. FollowUpQuestions

Each generated question node must have exactly three adaptive follow-up questions.

Represent these as structured relational records.

Enforce:
- Association with the originating question node.
- Position 1, 2 or 3.
- Question text.
- Selection status.
- Relevant relationship to a subsequently generated child node.

Design constraints that prevent duplicate positions and prevent invalid follow-up counts from being accepted as complete.

Remember that AI-generated output is untrusted and must be validated by the backend.

### E. WalletTransactions

This is one of the most important tables.

It represents the append-only Cognitive Stamina ledger.

Design appropriate fields for:
- Transaction ID.
- User ID.
- Related inquiry or question node.
- Transaction event type.
- Base points.
- Multiplier.
- Final points awarded.
- Idempotency key.
- Relevant metadata.
- Timestamp.

Requirements:
- Application-level immutability.
- No ordinary UPDATE or DELETE operations.
- Server-controlled transaction creation.
- Duplicate award prevention.
- Research Mode 3× multiplier.
- Auditable transaction history.

Do not invent exact Stamina award values if they are not defined in the PRD. Record them as an explicit pending product decision.

Document how the total Stamina balance is calculated.

## 3. Database architecture deliverables

Create a detailed `docs/DATABASE.md`.

Include:

1. Entity descriptions.
2. Table definitions at the logical level.
3. Primary keys.
4. Foreign keys.
5. Relationships.
6. Cardinality.
7. Unique constraints.
8. Check constraints.
9. Indexing recommendations.
10. RLS strategy.
11. Append-only ledger strategy.
12. Data ownership boundaries.
13. Referential integrity.
14. Expected query patterns.
15. Future scalability considerations.

Include a Mermaid ER diagram.

Do not create SQL migrations yet.

Clearly distinguish confirmed requirements from proposed implementation decisions.

## 4. System architecture

Create `docs/ARCHITECTURE.md`.

Explain the complete system.

Cover:

### Frontend
- Next.js App Router.
- Workspace.
- Source material panel.
- Knowledge Graph.
- Research Mode.
- Trap UI.
- Stamina display.
- Frontend API client.

### Backend
- Express application.
- Authentication middleware.
- Route handlers.
- Controllers.
- Services/use cases.
- Repositories.
- Sarvam integration adapter.
- Supabase integration.

### Shared contracts
- Zod schemas.
- TypeScript types.
- Request validation.
- Response validation.
- Contract ownership.

### External integrations
- Sarvam AI.
- Supabase Auth.
- Supabase PostgreSQL.

Explain what each integration does and which layer owns it.

### Request lifecycle

Document the complete lifecycle of an inquiry:

1. Student opens a learning workspace.
2. Student submits a technical question.
3. Frontend sends an authenticated request.
4. Backend verifies identity.
5. Backend validates the request.
6. Inquiry service executes.
7. Sarvam AI generates structured output.
8. Backend validates the AI response.
9. Database persists the question node and follow-up questions.
10. Stamina transaction is created where applicable.
11. Backend returns validated data.
12. Frontend updates the persistent Knowledge Graph.

Explain how failures are handled at each stage.

Include Mermaid diagrams for:
- System architecture.
- Inquiry request sequence.
- Adversarial trap lifecycle.
- Research Mode lifecycle.

## 5. API architecture

Create `docs/API_CONTRACTS.md`.

Define the initial API surface.

At minimum, consider:

```text
GET    /health

POST   /api/v1/inquiries
GET    /api/v1/inquiries/:inquiryId

POST   /api/v1/inquiries/:inquiryId/nodes

POST   /api/v1/question-nodes/:nodeId/trap-attempts

GET    /api/v1/stamina/me
```

For each endpoint document:
- Purpose.
- Authentication requirements.
- Request structure.
- Response structure.
- Validation.
- Expected errors.
- Database interactions.
- Authorization requirements.

Use consistent response and error conventions.

Do not implement these endpoints.

Make sure the API design supports the Golden Path described in CLAUDE.md.

## 6. Security architecture

Create a dedicated security section within `docs/ARCHITECTURE.md`.

Address:

- Authentication verification.
- Authorization.
- User data isolation.
- Supabase RLS.
- Server-side API credentials.
- Sarvam key protection.
- Service-role/secret key protection.
- Prompt injection considerations.
- AI output validation.
- Rate limiting.
- Stamina manipulation prevention.
- Idempotency.
- Sensitive information in logs.

Be particularly careful about the interaction between service-role credentials and RLS.

If the backend uses privileged credentials, explicitly explain which security guarantees are then enforced by the backend rather than RLS.

Prefer request-scoped user-authorized database operations for ordinary user data access, with privileged server-side operations narrowly restricted to trusted workflows.

Never expose privileged keys to the frontend.

## 7. Hackathon Golden Path

Create a dedicated section describing the smallest complete working vertical slice.

The intended journey:

Technical Source
    ↓
Inquiry
    ↓
Sarvam AI
    ↓
Structured Explanation
    ↓
Three Follow-up Questions
    ↓
Persistent Knowledge Graph
    ↓
Research Mode
    ↓
Adversarial Trap
    ↓
Trap Completion
    ↓
Verified Stamina Transaction

Identify:
- Minimum functionality.
- Required tables.
- Required endpoints.
- Required UI components.
- Required integrations.
- Acceptance criteria.
- Failure scenarios.
- Deterministic demo requirements.

Explicitly separate MVP requirements from future features.

## 8. Architecture Decision Records

Create:

`docs/decisions/ADR-001-system-architecture.md`

Record:
- Modular monolith.
- Next.js frontend.
- Express API.
- Supabase PostgreSQL.
- Shared contracts.
- Rationale and alternatives.

Create:

`docs/decisions/ADR-002-authentication.md`

Record:
- Supabase Auth.
- Hackathon identity strategy.
- Anonymous authentication evaluation.
- Security implications.
- Future account upgrade path.

Create:

`docs/decisions/ADR-003-database-model.md`

Record:
- Domain entities.
- Graph representation.
- Follow-up question representation.
- Stamina ledger.
- Important constraints.

Each ADR should contain:
- Status.
- Context.
- Decision.
- Alternatives considered.
- Consequences.
- Risks.

## 9. Update CLAUDE.md

Make only minimal changes to the existing CLAUDE.md.

Link the new architecture documents from its relevant sections.

Do not duplicate entire architectural specifications inside CLAUDE.md.

It must remain a concise persistent instruction source.

If a proposed architecture decision conflicts with an existing instruction, identify the conflict rather than silently changing it.

## 10. Documentation quality requirements

The documents must be detailed enough for a different engineer to implement the system without repeatedly interpreting the PRD.

Use:
- Mermaid diagrams.
- Relational tables.
- Clear terminology.
- Explicit constraints.
- Concrete request flows.
- Clear responsibility boundaries.

Do not write generic software architecture prose.

Tie every major design decision to an actual Tattva requirement.

Do not silently invent product behaviour.

Mark uncertain decisions as:
- Confirmed.
- Proposed.
- Pending.

## 11. Final verification

After creating the documentation:

1. Verify all Mermaid diagrams are syntactically reasonable.
2. Check consistency between the documents.
3. Check that API contracts agree with the domain model.
4. Check that the security model agrees with the authentication model.
5. Check that every important database relationship is explained.
6. Check that CLAUDE.md links to the correct files.

Do not generate application code or SQL migrations.

## FINAL DELIVERABLE

Provide a completion report containing:

- Final documentation tree.
- Architecture decisions.
- Database relationship summary.
- Authentication strategy.
- API endpoint summary.
- Security model.
- Remaining unresolved decisions.
- Recommended next implementation milestone.

Stop after architecture documentation is complete.

Our objective is to establish a precise technical blueprint before beginning repository implementation.