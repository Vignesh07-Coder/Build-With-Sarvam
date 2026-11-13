import { describe, expect, it } from 'vitest';
import { SarvamParseError } from './errors';
import { parseResearchModeSarvamResponse, parseStandardSarvamResponse } from './parser';

const VALID_STANDARD_RESPONSE = `EXPLANATION: Arena allocators bump a single pointer, so bulk reclamation just rewinds it.
FOLLOWUP1: How does alignment affect the bump pointer?
FOLLOWUP2: What happens to fragmentation in a free-list allocator?
FOLLOWUP3: How do hybrid allocators decide when to fall back?
FALSE_PREMISE_QUOTE: none
MISCONCEPTION: none
TRAP: none`;

const VALID_STANDARD_RESPONSE_WITH_MISCONCEPTION = `EXPLANATION: Arena allocators bump a single pointer, so bulk reclamation just rewinds it.
FOLLOWUP1: How does alignment affect the bump pointer?
FOLLOWUP2: What happens to fragmentation in a free-list allocator?
FOLLOWUP3: How do hybrid allocators decide when to fall back?
FALSE_PREMISE_QUOTE: there's no way memory usage could ever shrink
MISCONCEPTION: TYPE=invalid_generalization; CONFIDENCE=high; DESCRIPTION=Assumes batched freeing means memory can never be reclaimed.
TRAP: Consider resetting the arena after the batch completes - does memory usage change?`;

const VALID_RESEARCH_MODE_RESPONSE = `SOCRATIC1: What invariant does the bump pointer rely on?
SOCRATIC2: What happens if that invariant is violated?
SOCRATIC3: How would you detect the violation?
FOLLOWUP1: How does alignment affect the bump pointer?
FOLLOWUP2: What happens to fragmentation in a free-list allocator?
FOLLOWUP3: How do hybrid allocators decide when to fall back?
REFERENCES: none`;

describe('parseStandardSarvamResponse', () => {
  it('parses a valid response with no misconception', () => {
    const result = parseStandardSarvamResponse(VALID_STANDARD_RESPONSE);

    expect(result.explanation).toContain('bump a single pointer');
    expect(result.followUps).toHaveLength(3);
    expect(result.falsePremiseQuote).toBeNull();
    expect(result.misconception).toBeNull();
    expect(result.trap).toBeNull();
  });

  it('parses exactly three follow-up questions', () => {
    const result = parseStandardSarvamResponse(VALID_STANDARD_RESPONSE);

    expect(result.followUps).toEqual([
      'How does alignment affect the bump pointer?',
      'What happens to fragmentation in a free-list allocator?',
      'How do hybrid allocators decide when to fall back?',
    ]);
  });

  it('parses a valid response with a high-confidence misconception and structured trap', () => {
    const result = parseStandardSarvamResponse(VALID_STANDARD_RESPONSE_WITH_MISCONCEPTION);

    expect(result.falsePremiseQuote).toBe("there's no way memory usage could ever shrink");
    expect(result.misconception).toEqual({
      type: 'invalid_generalization',
      confidence: 'high',
      description: 'Assumes batched freeing means memory can never be reclaimed.',
    });
    expect(result.trap).not.toBeNull();
  });

  it('rejects a response missing a required label', () => {
    const missingFollowUp3 = VALID_STANDARD_RESPONSE.replace(
      'FOLLOWUP3: How do hybrid allocators decide when to fall back?\n',
      '',
    );

    expect(() => parseStandardSarvamResponse(missingFollowUp3)).toThrow(SarvamParseError);
    try {
      parseStandardSarvamResponse(missingFollowUp3);
    } catch (error) {
      expect(error).toBeInstanceOf(SarvamParseError);
      expect((error as SarvamParseError).issues.some((issue) => issue.includes('FOLLOWUP3'))).toBe(true);
    }
  });

  it('rejects a response with a duplicate label', () => {
    const duplicated = `${VALID_STANDARD_RESPONSE}\nEXPLANATION: a second explanation line`;

    expect(() => parseStandardSarvamResponse(duplicated)).toThrow(SarvamParseError);
    try {
      parseStandardSarvamResponse(duplicated);
    } catch (error) {
      expect((error as SarvamParseError).issues.some((issue) => issue.includes('Duplicate label: EXPLANATION'))).toBe(true);
    }
  });

  it('rejects a response with an empty required field', () => {
    const emptyExplanation = VALID_STANDARD_RESPONSE.replace(
      'EXPLANATION: Arena allocators bump a single pointer, so bulk reclamation just rewinds it.',
      'EXPLANATION:',
    );

    expect(() => parseStandardSarvamResponse(emptyExplanation)).toThrow(SarvamParseError);
  });

  it('rejects malformed, unparseable output entirely', () => {
    expect(() => parseStandardSarvamResponse('this is not a labelled response at all')).toThrow(SarvamParseError);
  });

  it('rejects a malformed MISCONCEPTION field value', () => {
    const malformedMisconception = VALID_STANDARD_RESPONSE.replace('MISCONCEPTION: none', 'MISCONCEPTION: not a structured field');

    expect(() => parseStandardSarvamResponse(malformedMisconception)).toThrow(SarvamParseError);
  });

  it('rejects CONFIDENCE=high reported without a FALSE_PREMISE_QUOTE', () => {
    const inconsistent = VALID_STANDARD_RESPONSE.replace(
      'MISCONCEPTION: none',
      'MISCONCEPTION: TYPE=invalid_generalization; CONFIDENCE=high; DESCRIPTION=some claim',
    );

    expect(() => parseStandardSarvamResponse(inconsistent)).toThrow(SarvamParseError);
  });
});

describe('parseResearchModeSarvamResponse', () => {
  it('parses a valid Research Mode response', () => {
    const result = parseResearchModeSarvamResponse(VALID_RESEARCH_MODE_RESPONSE);

    expect(result.socraticQuestions).toHaveLength(3);
    expect(result.followUps).toHaveLength(3);
    expect(result.references).toBeNull();
  });

  it('rejects a Research Mode response missing a required label', () => {
    const missingSocratic = VALID_RESEARCH_MODE_RESPONSE.replace('SOCRATIC2: What happens if that invariant is violated?\n', '');

    expect(() => parseResearchModeSarvamResponse(missingSocratic)).toThrow(SarvamParseError);
  });
});
