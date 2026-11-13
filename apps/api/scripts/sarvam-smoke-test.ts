// Production-adapter smoke test (Stage 1, Part 1.5): exercises the REAL
// apps/api/src/integrations/sarvam/ modules end-to-end against the live
// Sarvam API — client -> prompts -> parser -> falsePremiseVerification.
// Never writes to Supabase, never creates an inquiry/question_node, never
// prints the API key or any authorization header. No retries.
//
// Run with: pnpm --filter @tattva/api exec tsx scripts/sarvam-smoke-test.ts
import { createSarvamChatClientFromEnv } from '../src/integrations/sarvam/client';
import { SarvamAdapterError } from '../src/integrations/sarvam/errors';
import { resolveVerifiedMisconception } from '../src/integrations/sarvam/falsePremiseVerification';
import { parseResearchModeSarvamResponse, parseStandardSarvamResponse } from '../src/integrations/sarvam/parser';
import { buildResearchModeSystemPrompt, buildStandardSystemPrompt } from '../src/integrations/sarvam/prompts';

// Same curated excerpt already seeded as the one `learning_sources` row
// (apps/web/lib/fixtures/workspace-fixtures.ts `fixtureSourceBody`) — reused
// here, not duplicated as new fixture content.
const SOURCE_EXCERPT = `
Arena allocation trades flexibility for throughput. Instead of tracking individual
block metadata the way a general-purpose allocator does, an arena allocator reserves
one contiguous region up front and satisfies allocations by advancing a single
"bump" pointer. Freeing is batched: the whole arena is reset or released at once,
never per-object.

This works well when object lifetimes are correlated — a request handler, a single
frame of a game loop, a parser pass over one file. It works badly when lifetimes are
independent, because there is no way to reclaim an individual object's memory
without invalidating every allocation made after it in the same arena.

A free-list allocator reintroduces per-object reclamation by threading freed blocks
into a linked list keyed by size class, at the cost of metadata overhead and
fragmentation as blocks of mismatched sizes accumulate. Hybrid designs use arenas for
short-lived, correlated allocations and fall back to a general-purpose allocator or a
size-class free list for everything else.

The failure mode to watch for: holding a pointer into an arena past the arena's
reset point. Because the arena's bump pointer is just rewound, the memory is not
zeroed or protected — a stale pointer silently aliases whatever is allocated next,
producing memory-safety bugs that are very difficult to reproduce.
`.trim();

const STANDARD_QUESTION = 'Why does an arena allocator make bulk memory reclamation efficient compared with a general-purpose allocator?';
const RESEARCH_QUESTION = 'Derive why arena allocation can improve allocation throughput, and investigate the conditions under which this advantage disappears.';

async function runStandardMode(): Promise<void> {
  console.log('\n=== Standard Mode ===');
  console.log(`Question: ${STANDARD_QUESTION}`);

  const client = createSarvamChatClientFromEnv();
  const started = Date.now();
  const { content, usage } = await client.complete({
    systemPrompt: buildStandardSystemPrompt(SOURCE_EXCERPT),
    userMessage: STANDARD_QUESTION,
  });
  const latencyMs = Date.now() - started;

  const parsed = parseStandardSarvamResponse(content);
  const resolved = resolveVerifiedMisconception(STANDARD_QUESTION, parsed.falsePremiseQuote, parsed.misconception, parsed.trap);

  console.log(`Latency: ${latencyMs}ms`);
  console.log(`Usage: ${JSON.stringify(usage)}`);
  console.log(`Explanation length: ${parsed.explanation.length} chars`);
  console.log(`Follow-up count: ${parsed.followUps.length} (must be 3)`);
  console.log(`Misconception reported by model: ${parsed.misconception ? `${parsed.misconception.type} (${parsed.misconception.confidence})` : 'none'}`);
  console.log(`False-premise verification: verified=${resolved.verification.verified}${resolved.verification.reason ? ` reason="${resolved.verification.reason}"` : ''}`);
  console.log(`Misconception after independent verification: ${resolved.misconception ? `${resolved.misconception.type} (${resolved.misconception.confidence})` : 'none'}`);
  console.log(`Trap after independent verification: ${resolved.trap ? 'present' : 'none'}`);

  if (parsed.followUps.length !== 3) {
    throw new Error(`Expected exactly 3 follow-ups, got ${parsed.followUps.length}`);
  }
}

async function runResearchMode(): Promise<void> {
  console.log('\n=== Research Mode ===');
  console.log(`Question: ${RESEARCH_QUESTION}`);

  const client = createSarvamChatClientFromEnv();
  const started = Date.now();
  const { content, usage } = await client.complete({
    systemPrompt: buildResearchModeSystemPrompt(SOURCE_EXCERPT),
    userMessage: RESEARCH_QUESTION,
  });
  const latencyMs = Date.now() - started;

  const parsed = parseResearchModeSarvamResponse(content);

  console.log(`Latency: ${latencyMs}ms`);
  console.log(`Usage: ${JSON.stringify(usage)}`);
  console.log(`Socratic question count: ${parsed.socraticQuestions.length} (must be 3)`);
  console.log(`Follow-up count: ${parsed.followUps.length} (must be 3)`);
  console.log(`References: ${parsed.references ?? 'none'}`);

  if (parsed.socraticQuestions.length !== 3 || parsed.followUps.length !== 3) {
    throw new Error('Expected exactly 3 Socratic questions and exactly 3 follow-ups');
  }
}

async function main(): Promise<void> {
  console.log('Sarvam production-adapter smoke test (Stage 1). No Supabase writes, no inquiries/nodes created, no retries.');

  await runStandardMode();
  await runResearchMode();

  console.log('\nSmoke test completed: both modes parsed and validated successfully against the production adapter.');
}

main().catch((error) => {
  if (error instanceof SarvamAdapterError) {
    console.error(`\nSmoke test failed: ${error.name}: ${error.message}`);
  } else {
    console.error('\nSmoke test failed:', error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
