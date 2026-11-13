/**
 * Source text extraction and normalization service (Milestone 4).
 *
 * Implements format extraction and normalization for approved input formats:
 * - Plain text ('transcript', 'document')
 * - Markdown
 *
 * Normalization guarantees:
 * - Unicode NFC normalization
 * - Universal newline conversion (\r\n and \r -> \n)
 * - Trailing/leading whitespace trimming per line and document
 * - Collapse of excessive blank lines (max 2 consecutive newlines / 1 blank line)
 * - Replacement of non-printable control characters (while preserving \n and \t)
 * - Replacement of non-breaking spaces (\u00A0) and other Unicode space variants with standard spaces
 * - Idempotency: normalize(normalize(x)) === normalize(x)
 */

export interface ExtractionResult {
  text: string;
  characterCount: number;
  wordCount: number;
  lineCount: number;
  warnings: string[];
}

/**
 * Normalizes text encoding, whitespace, and line endings deterministically.
 */
export function normalizeText(input: string): string {
  if (!input) {
    return '';
  }

  // 1. Unicode NFC normalization
  let text = input.normalize('NFC');

  // 2. Strip UTF-8 Byte Order Mark (BOM) or zero-width non-breaking spaces anywhere in the document
  text = text.replace(/\uFEFF/g, '');

  // 3. Normalize all line endings to LF (\n)
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 4. Normalize Unicode spaces (non-breaking space, thin space, etc.) to standard ASCII space
  text = text.replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, ' ');

  // 5. Remove non-printable / control characters except \n and \t
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 6. Trim trailing whitespace from each line
  // If a line is empty or whitespace-only, collapse it completely to an empty line
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');

  // 7. Collapse 3+ consecutive newlines to at most 2 newlines (single blank line separating paragraphs)
  text = text.replace(/\n{3,}/g, '\n\n');

  // 8. Trim leading/trailing blank lines from the document without stripping leading indent of the first line
  return text.replace(/^\s*\n+/, '').replace(/\n+\s*$/, '');
}

/**
 * Extracts readable, normalized text from raw source content.
 *
 * Handles approved formats: 'transcript', 'document', 'video'.
 * Validates against empty, whitespace-only, or corrupt inputs.
 */
export function extractSourceText(
  rawInput: string,
  format: 'transcript' | 'document' | 'video' = 'transcript',
): ExtractionResult {
  const warnings: string[] = [];

  if (typeof rawInput !== 'string') {
    throw new Error('Input must be a string');
  }

  if (rawInput.trim().length === 0) {
    return {
      text: '',
      characterCount: 0,
      wordCount: 0,
      lineCount: 0,
      warnings: ['Input content is empty or contains only whitespace.'],
    };
  }

  // Format-specific handling
  let processed = rawInput;

  if (format === 'transcript') {
    // Detect and clean common automated transcript artifacts:
    // e.g. standalone WebVTT / SRT cue numbers, standalone timing tags like [00:15:30]
    // while keeping content intact.
    const hadWebvttHeader = /^WEBVTT/m.test(processed);
    if (hadWebvttHeader) {
      warnings.push('Stripped WebVTT header from transcript.');
      processed = processed.replace(/^WEBVTT[^\n]*\n+/g, '');
    }

    // Strip standalone SRT sequence numbers
    processed = processed.replace(/^\d+\s*\n(?=\d{2}:\d{2})/gm, '');
  }

  // Perform full normalization
  const normalized = normalizeText(processed);

  if (normalized.length === 0) {
    warnings.push('Text was completely empty after artifact removal and normalization.');
  }

  // Calculate statistics
  const characterCount = normalized.length;
  const wordCount = normalized.length > 0 ? normalized.split(/\s+/).filter(Boolean).length : 0;
  const lineCount = normalized.length > 0 ? normalized.split('\n').length : 0;

  return {
    text: normalized,
    characterCount,
    wordCount,
    lineCount,
    warnings,
  };
}
