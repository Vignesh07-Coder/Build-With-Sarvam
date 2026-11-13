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

  if (!originalQuestion.includes(falsePremiseQuote)) {
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
