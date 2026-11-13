import { describe, expect, it } from 'vitest';
import { extractSourceText, normalizeText } from './sourceExtraction';

describe('sourceExtraction - normalizeText', () => {
  it('normalizes Windows (CRLF) and legacy Mac (CR) line endings to standard LF (\\n)', () => {
    const mixed = 'Line 1\r\nLine 2\rLine 3\nLine 4';
    const normalized = normalizeText(mixed);
    expect(normalized).toBe('Line 1\nLine 2\nLine 3\nLine 4');
  });

  it('is strictly idempotent: normalize(normalize(x)) === normalize(x)', () => {
    const input = '   \uFEFFSome messy   text \r\nwith \t weird   spaces\n\n\n\nand gaps   \r\n';
    const firstPass = normalizeText(input);
    const secondPass = normalizeText(firstPass);
    expect(secondPass).toBe(firstPass);
  });

  it('strips UTF-8 Byte Order Mark (BOM)', () => {
    const withBom = '\uFEFFThis begins with a BOM';
    expect(normalizeText(withBom)).toBe('This begins with a BOM');
  });

  it('converts non-breaking spaces and Unicode whitespace variants to standard ASCII space', () => {
    const unicodeSpaces = 'Word1\u00A0Word2\u2003Word3\u3000Word4';
    expect(normalizeText(unicodeSpaces)).toBe('Word1 Word2 Word3 Word4');
  });

  it('strips non-printable control characters while preserving tabs and newlines', () => {
    const withControl = 'Valid\x00Text\x07With\x1FControl\tChars\nNext Line';
    expect(normalizeText(withControl)).toBe('ValidTextWithControl\tChars\nNext Line');
  });

  it('collapses excessive blank lines to a single blank line between paragraphs', () => {
    const excessiveGaps = 'Paragraph 1\n\n\n\n\n\nParagraph 2\n\n\nParagraph 3';
    expect(normalizeText(excessiveGaps)).toBe('Paragraph 1\n\nParagraph 2\n\nParagraph 3');
  });

  it('trims trailing whitespace from individual lines while preserving indentations', () => {
    const trailingSpaces = '    function example() {   \n        return 42;  \t\n    }   ';
    const expected = '    function example() {\n        return 42;\n    }';
    expect(normalizeText(trailingSpaces)).toBe(expected);
  });
});

describe('sourceExtraction - extractSourceText', () => {
  it('handles clean plain text input correctly', () => {
    const clean = 'A memory arena allocator pre-allocates a contiguous buffer for performance.';
    const result = extractSourceText(clean, 'document');

    expect(result.text).toBe(clean);
    expect(result.characterCount).toBe(clean.length);
    expect(result.wordCount).toBe(10);
    expect(result.lineCount).toBe(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('handles empty input gracefully', () => {
    const result = extractSourceText('', 'transcript');
    expect(result.text).toBe('');
    expect(result.characterCount).toBe(0);
    expect(result.wordCount).toBe(0);
    expect(result.lineCount).toBe(0);
    expect(result.warnings[0]).toContain('empty');
  });

  it('handles whitespace-only input gracefully', () => {
    const result = extractSourceText('   \n\t  \r\n   ', 'transcript');
    expect(result.text).toBe('');
    expect(result.characterCount).toBe(0);
    expect(result.wordCount).toBe(0);
    expect(result.warnings[0]).toContain('empty');
  });

  it('handles malformed inputs with corrupt control characters and mixed encoding', () => {
    const malformed = '\x00\x01\x02\uFEFFCorrupt \r\n\r\n\r\n\r\n stream \x1F of data   \x08';
    const result = extractSourceText(malformed, 'document');

    expect(result.text).toBe('Corrupt\n\n stream  of data');
    expect(result.characterCount).toBeGreaterThan(0);
  });

  it('strips WebVTT header artifacts from transcripts and records warning', () => {
    const vtt = 'WEBVTT - Video Transcript\n\n00:00:01.000 --> 00:00:04.000\nHello and welcome.';
    const result = extractSourceText(vtt, 'transcript');

    expect(result.text).not.toContain('WEBVTT');
    expect(result.text).toContain('Hello and welcome.');
    expect(result.warnings).toContain('Stripped WebVTT header from transcript.');
  });
});
