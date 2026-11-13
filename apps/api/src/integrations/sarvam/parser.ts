import { SarvamParseError } from './errors';
import {
  misconceptionConfidenceSchema,
  misconceptionTypeSchema,
  sarvamResearchModeRawResponseSchema,
  sarvamStandardRawResponseSchema,
  type MisconceptionAssessment,
  type SarvamResearchModeRawResponse,
  type SarvamStandardRawResponse,
} from './schemas';

/**
 * Parser for the validated plain-text labelled-line wire format (NOT JSON —
 * `response_format` is unreliable on sarvam-105b, per docs/PROMPT_DESIGN.md
 * §4). Promoted from the parsing logic in
 * `apps/api/scripts/sarvam-benchmark.ts`, hardened to reject rather than
 * silently tolerate: missing labels, duplicate labels, and empty required
 * fields are all parse failures, not warnings.
 */

const NONE_SENTINEL = 'none';

const STANDARD_LABELS = [
  'EXPLANATION',
  'FOLLOWUP1',
  'FOLLOWUP2',
  'FOLLOWUP3',
  'FALSE_PREMISE_QUOTE',
  'MISCONCEPTION',
  'TRAP',
] as const;

const RESEARCH_MODE_LABELS = ['SOCRATIC1', 'SOCRATIC2', 'SOCRATIC3', 'FOLLOWUP1', 'FOLLOWUP2', 'FOLLOWUP3', 'REFERENCES'] as const;

function extractLabelOccurrences(raw: string, label: string): string[] {
  const pattern = new RegExp(`^${label}:[ \\t]*(.*)$`, 'gm');
  return [...raw.matchAll(pattern)].map((match) => (match[1] ?? '').trim());
}

/**
 * Extracts exactly one value per required label. Missing a label, or a
 * label appearing more than once, is a hard failure — never filled in with
 * a default or silently taking the first/last occurrence.
 *
 * Typed generically over the literal `labels` tuple (rather than
 * `Record<string, string>`) so that, once `issues` is empty, every key is a
 * genuinely required, always-present property — not an index-signature
 * lookup `noUncheckedIndexedAccess` would otherwise treat as possibly
 * `undefined` at every call site.
 */
function extractRequiredLabels<const Labels extends readonly string[]>(
  raw: string,
  labels: Labels,
): Record<Labels[number], string> {
  const issues: string[] = [];
  const values = {} as Record<Labels[number], string>;

  for (const label of labels) {
    const occurrences = extractLabelOccurrences(raw, label);
    if (occurrences.length === 0) {
      issues.push(`Missing required label: ${label}`);
      continue;
    }
    if (occurrences.length > 1) {
      issues.push(`Duplicate label: ${label} appears ${occurrences.length} times`);
      continue;
    }
    values[label as Labels[number]] = occurrences[0] ?? '';
  }

  if (issues.length > 0) {
    throw new SarvamParseError('Sarvam response failed label extraction', issues);
  }

  return values;
}

function parseNoneableField(value: string): string | null {
  return value.toLowerCase() === NONE_SENTINEL ? null : value;
}

/**
 * Parses the compound `MISCONCEPTION: TYPE=...; CONFIDENCE=...; DESCRIPTION=...`
 * field. Any deviation from this structure (unknown type/confidence value,
 * missing component, empty description) is a parse failure — this function
 * never guesses a value the model did not clearly provide.
 */
function parseMisconceptionField(value: string): MisconceptionAssessment | null {
  if (value.toLowerCase() === NONE_SENTINEL) return null;

  const typeMatch = value.match(/TYPE=([A-Za-z_]+)/);
  const confidenceMatch = value.match(/CONFIDENCE=([A-Za-z]+)/);
  const descriptionMatch = value.match(/DESCRIPTION=(.*)$/s);

  if (!typeMatch || !confidenceMatch || !descriptionMatch) {
    throw new SarvamParseError('Sarvam response failed label extraction', [`Malformed MISCONCEPTION field: "${value}"`]);
  }

  const rawType = typeMatch[1] ?? '';
  const rawConfidence = confidenceMatch[1] ?? '';
  const typeResult = misconceptionTypeSchema.safeParse(rawType.toLowerCase());
  const confidenceResult = misconceptionConfidenceSchema.safeParse(rawConfidence.toLowerCase());
  const description = (descriptionMatch[1] ?? '').trim();

  const issues: string[] = [];
  if (!typeResult.success) issues.push(`Unknown MISCONCEPTION TYPE: "${rawType}"`);
  if (!confidenceResult.success) issues.push(`Unknown MISCONCEPTION CONFIDENCE: "${rawConfidence}"`);
  if (!description) issues.push('Empty MISCONCEPTION DESCRIPTION');

  if (issues.length > 0 || !typeResult.success || !confidenceResult.success) {
    throw new SarvamParseError('Sarvam response failed label extraction', issues);
  }

  return { type: typeResult.data, confidence: confidenceResult.data, description };
}

export function parseStandardSarvamResponse(raw: string): SarvamStandardRawResponse {
  const fields = extractRequiredLabels(raw, STANDARD_LABELS);

  const candidate = {
    explanation: fields.EXPLANATION,
    followUps: [fields.FOLLOWUP1, fields.FOLLOWUP2, fields.FOLLOWUP3] as [string, string, string],
    falsePremiseQuote: parseNoneableField(fields.FALSE_PREMISE_QUOTE),
    misconception: parseMisconceptionField(fields.MISCONCEPTION),
    trap: parseNoneableField(fields.TRAP),
  };

  const result = sarvamStandardRawResponseSchema.safeParse(candidate);
  if (!result.success) {
    throw new SarvamParseError(
      'Sarvam standard-mode response failed schema validation',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  return result.data;
}

export function parseResearchModeSarvamResponse(raw: string): SarvamResearchModeRawResponse {
  const fields = extractRequiredLabels(raw, RESEARCH_MODE_LABELS);

  const candidate = {
    socraticQuestions: [fields.SOCRATIC1, fields.SOCRATIC2, fields.SOCRATIC3] as [string, string, string],
    followUps: [fields.FOLLOWUP1, fields.FOLLOWUP2, fields.FOLLOWUP3] as [string, string, string],
    references: parseNoneableField(fields.REFERENCES),
  };

  const result = sarvamResearchModeRawResponseSchema.safeParse(candidate);
  if (!result.success) {
    throw new SarvamParseError(
      'Sarvam Research Mode response failed schema validation',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  return result.data;
}
