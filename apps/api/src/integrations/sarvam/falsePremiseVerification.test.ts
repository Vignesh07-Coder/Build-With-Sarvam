import { describe, expect, it } from 'vitest';
import { resolveVerifiedMisconception, verifyFalsePremiseQuote } from './falsePremiseVerification';
import type { MisconceptionAssessment } from './schemas';

const HIGH_CONFIDENCE_MISCONCEPTION: MisconceptionAssessment = {
  type: 'invalid_generalization',
  confidence: 'high',
  description: 'Assumes batched freeing means memory can never be reclaimed.',
};

const LOW_CONFIDENCE_MISCONCEPTION: MisconceptionAssessment = {
  type: 'edge_case_misunderstanding',
  confidence: 'low',
  description: 'Minor imprecision.',
};

describe('verifyFalsePremiseQuote', () => {
  it('passes a neutral question with no misconception', () => {
    const result = verifyFalsePremiseQuote(
      'What happens if an allocation request exceeds the remaining capacity of the arena?',
      null,
      null,
    );

    expect(result).toEqual({ verified: true, reason: null });
  });

  it('passes a valid false-premise quote that is an exact substring of the question', () => {
    const question = "Since the allocator never frees individual blocks, there's no way memory usage could ever shrink, right?";
    const quote = "there's no way memory usage could ever shrink";

    const result = verifyFalsePremiseQuote(question, quote, HIGH_CONFIDENCE_MISCONCEPTION);

    expect(result).toEqual({ verified: true, reason: null });
  });

  it('rejects an invalid false-premise quote that does not appear verbatim in the question', () => {
    const question = 'Why does an arena allocator make bulk memory reclamation efficient?';
    const fabricatedQuote = 'memory can never be reclaimed';

    const result = verifyFalsePremiseQuote(question, fabricatedQuote, HIGH_CONFIDENCE_MISCONCEPTION);

    expect(result.verified).toBe(false);
    expect(result.reason).toContain('not an exact, verbatim substring');
  });

  it('rejects a high-confidence misconception reported with no quote at all', () => {
    const result = verifyFalsePremiseQuote('Any question text.', null, HIGH_CONFIDENCE_MISCONCEPTION);

    expect(result.verified).toBe(false);
  });

  it('does not require verification for a low/medium confidence misconception', () => {
    const result = verifyFalsePremiseQuote('Any question text.', null, LOW_CONFIDENCE_MISCONCEPTION);

    expect(result).toEqual({ verified: true, reason: null });
  });

  // Regression for the Stage 6B.1 benchmark finding (docs/SARVAM_BENCHMARK_REPORT.md §12.4):
  // Sarvam sometimes wraps FALSE_PREMISE_QUOTE in its own literal quotation marks even though the
  // quoted text itself is a genuine, exact substring of the student's question. A naive
  // `includes()` check then incorrectly rejects a true positive (e.g. TEST_04's
  // `"objects allocated inside it can safely outlive the arena"`), discarding a legitimate trap.
  it('verifies a genuinely verbatim quote even when the model wraps it in double quotation marks', () => {
    const question =
      'Since an arena allocator frees all its memory at once, objects allocated inside it can safely outlive the arena, right?';
    const modelWrappedQuote = '"objects allocated inside it can safely outlive the arena"';

    const result = verifyFalsePremiseQuote(question, modelWrappedQuote, HIGH_CONFIDENCE_MISCONCEPTION);

    expect(result).toEqual({ verified: true, reason: null });
  });

  it('verifies a genuinely verbatim quote wrapped in single quotation marks', () => {
    const question = 'Since the allocator never frees individual blocks, memory usage can never shrink, right?';
    const modelWrappedQuote = "'memory usage can never shrink'";

    const result = verifyFalsePremiseQuote(question, modelWrappedQuote, HIGH_CONFIDENCE_MISCONCEPTION);

    expect(result).toEqual({ verified: true, reason: null });
  });

  it('still rejects a fabricated quote even after stripping wrapping quotation marks', () => {
    const question = 'Why does an arena allocator make bulk memory reclamation efficient?';
    const fabricatedWrappedQuote = '"memory can never be reclaimed"';

    const result = verifyFalsePremiseQuote(question, fabricatedWrappedQuote, HIGH_CONFIDENCE_MISCONCEPTION);

    expect(result.verified).toBe(false);
  });

  it('rejects a quote that is only wrapping quotation marks with nothing inside', () => {
    const result = verifyFalsePremiseQuote('Any question text.', '""', HIGH_CONFIDENCE_MISCONCEPTION);

    expect(result.verified).toBe(false);
  });
});

describe('resolveVerifiedMisconception', () => {
  it('keeps the misconception and trap when the quote verifies', () => {
    const question = "Since the allocator never frees individual blocks, there's no way memory usage could ever shrink, right?";
    const quote = "there's no way memory usage could ever shrink";
    const trap = 'Consider resetting the arena — does memory usage change?';

    const result = resolveVerifiedMisconception(question, quote, HIGH_CONFIDENCE_MISCONCEPTION, trap);

    expect(result.misconception).toEqual(HIGH_CONFIDENCE_MISCONCEPTION);
    expect(result.trap).toBe(trap);
    expect(result.verification.verified).toBe(true);
  });

  it('strips the misconception and trap when the quote does not verify, regardless of the model confidence claim', () => {
    const question = 'Why does an arena allocator make bulk memory reclamation efficient?';
    const fabricatedQuote = 'memory can never be reclaimed';
    const trap = 'a trap the model should not have been allowed to raise';

    const result = resolveVerifiedMisconception(question, fabricatedQuote, HIGH_CONFIDENCE_MISCONCEPTION, trap);

    expect(result.misconception).toBeNull();
    expect(result.trap).toBeNull();
    expect(result.verification.verified).toBe(false);
  });
});
