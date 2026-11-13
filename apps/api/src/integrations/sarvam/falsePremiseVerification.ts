import type { MisconceptionAssessment } from './schemas';

/**
 * Independent, ground-truth verification of a high-confidence misconception
 * claim. This is deliberately separate from the structural self-consistency
 * check already enforced in schemas.ts (CONFIDENCE=high requires a non-null
 * quote) — that check only confirms the model filled in both fields, not
 * that the quote is real. This function re-checks FALSE_PREMISE_QUOTE
 * against the actual student question text and never trusts the model's
 * own CONFIDENCE claim by itself.
 */
export interface FalsePremiseVerificationResult {
  verified: boolean;
  reason: string | null;
}

/**
 * Matching pairs of wrapping quotation marks Sarvam has been observed to
 * add around an otherwise-verbatim FALSE_PREMISE_QUOTE (docs/
 * SARVAM_BENCHMARK_REPORT.md §12.4 — TEST_04's quote was genuinely a verbatim
 * substring of the student's question, but the model wrapped it in its own
 * literal `"..."`, which a plain `includes()` check then rejected as
 * non-verbatim). Stripping a *symmetric* wrapping pair before comparing is a
 * formatting-artifact fix, not a weakening of the exact-match requirement:
 * the inner text must still be an exact, verbatim substring of the
 * question, nothing is fuzzy-matched or trimmed beyond the matching
 * wrapper itself.
 */
const WRAPPING_QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'], // “ ”
  ['‘', '’'], // ‘ ’
];

/** Strips one layer of matching wrapping quotation marks, if present. Never partial-strips a lone leading/trailing quote. */
function stripWrappingQuotes(value: string): string {
  for (const [open, close] of WRAPPING_QUOTE_PAIRS) {
    if (value.length >= open.length + close.length && value.startsWith(open) && value.endsWith(close)) {
      return value.slice(open.length, value.length - close.length);
    }
  }
  return value;
}

export function verifyFalsePremiseQuote(
  originalQuestion: string,
  falsePremiseQuote: string | null,
  misconception: MisconceptionAssessment | null,
): FalsePremiseVerificationResult {
  if (!misconception || misconception.confidence !== 'high') {
    return { verified: true, reason: null };
  }

  if (!falsePremiseQuote) {
    return { verified: false, reason: 'CONFIDENCE=high was reported with no FALSE_PREMISE_QUOTE' };
  }

  const normalizedQuote = stripWrappingQuotes(falsePremiseQuote.trim());

  if (!normalizedQuote) {
    return { verified: false, reason: 'FALSE_PREMISE_QUOTE is empty once wrapping quotation marks are stripped' };
  }

  if (!originalQuestion.includes(normalizedQuote)) {
    return {
      verified: false,
      reason: 'FALSE_PREMISE_QUOTE is not an exact, verbatim substring of the student question',
    };
  }

  return { verified: true, reason: null };
}

/**
 * Applies the verification result: a high-confidence misconception that
 * fails verification is downgraded to "no misconception" and its trap is
 * discarded, so an unverified claim can never become an actionable trap —
 * regardless of what confidence the model itself asserted.
 */
export function resolveVerifiedMisconception(
  originalQuestion: string,
  falsePremiseQuote: string | null,
  misconception: MisconceptionAssessment | null,
  trap: string | null,
): {
  misconception: MisconceptionAssessment | null;
  trap: string | null;
  verification: FalsePremiseVerificationResult;
} {
  const verification = verifyFalsePremiseQuote(originalQuestion, falsePremiseQuote, misconception);

  if (verification.verified) {
    return { misconception, trap, verification };
  }

  return { misconception: null, trap: null, verification };
}
