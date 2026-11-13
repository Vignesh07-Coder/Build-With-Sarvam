import { describe, expect, it } from 'vitest';
import { chunkSourceText, estimateTokenCount } from './sourceChunking';

describe('sourceChunking - estimateTokenCount', () => {
  it('estimates token count reasonably (~4 chars per token)', () => {
    expect(estimateTokenCount('')).toBe(0);
    expect(estimateTokenCount('1234')).toBe(1);
    expect(estimateTokenCount('12345678')).toBe(2);
    expect(estimateTokenCount('Hello World!')).toBe(3);
  });
});

describe('sourceChunking - chunkSourceText', () => {
  const sampleParagraphs = [
    'Paragraph 1: Memory arena allocators provide fast bump allocation without individual free calls.',
    'Paragraph 2: When an inquiry begins, the entire memory block is carved out up front from OS virtual memory.',
    'Paragraph 3: Fragmentation within an arena is zero because individual objects are never returned to a free list.',
    'Paragraph 4: Instead, the high-water mark or offset pointer is reset at the end of the frame or inquiry lifecycle.',
    'Paragraph 5: This makes arena allocation optimal for game loops, compilers, and request-scoped server processes.',
  ];

  it('handles empty text or whitespace gracefully', () => {
    expect(chunkSourceText('')).toEqual([]);
    expect(chunkSourceText('   \n\n  ')).toEqual([]);
  });

  it('preserves 0-indexed sequential ordering (0, 1, 2, ...)', () => {
    const text = sampleParagraphs.join('\n\n');
    // Using small target characters to force multiple chunks
    const chunks = chunkSourceText(text, { targetCharacters: 150 });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, index) => {
      expect(chunk.chunkIndex).toBe(index);
    });
  });

  it('is strictly deterministic: repeated runs produce identical chunk boundaries and content', () => {
    const text = sampleParagraphs.join('\n\n');
    const run1 = chunkSourceText(text, { targetCharacters: 180, maxCharacters: 300 });
    const run2 = chunkSourceText(text, { targetCharacters: 180, maxCharacters: 300 });

    expect(run1).toEqual(run2);
  });

  it('preserves all meaningful content without loss', () => {
    const text = sampleParagraphs.join('\n\n');
    const chunks = chunkSourceText(text, { targetCharacters: 150 });

    // Join all chunk bodies and verify every original paragraph is present
    const reassembled = chunks.map((c) => c.body).join('\n\n');

    for (const paragraph of sampleParagraphs) {
      expect(reassembled).toContain(paragraph);
    }
  });

  it('handles very short text without creating empty or fragmented chunks', () => {
    const shortText = 'Short single sentence.';
    const chunks = chunkSourceText(shortText);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.chunkIndex).toBe(0);
    expect(chunks[0]?.body).toBe(shortText);
    expect(chunks[0]?.characterCount).toBe(shortText.length);
  });

  it('handles a single giant unbroken paragraph by splitting on sentence boundaries', () => {
    const giantParagraph =
      'Sentence one is introductory. Sentence two explains the mechanism in detail. Sentence three outlines the architectural trade-offs. Sentence four concludes the section.';

    const chunks = chunkSourceText(giantParagraph, {
      targetCharacters: 60,
      maxCharacters: 90,
    });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, idx) => {
      expect(chunk.chunkIndex).toBe(idx);
      expect(chunk.characterCount).toBeLessThanOrEqual(90);
    });

    const reassembled = chunks.map((c) => c.body).join(' ');
    expect(reassembled).toContain('Sentence one is introductory.');
    expect(reassembled).toContain('Sentence four concludes the section.');
  });

  it('populates metadata with offsets and paragraph counts', () => {
    const text = sampleParagraphs.join('\n\n');
    const chunks = chunkSourceText(text, { targetCharacters: 200 });

    chunks.forEach((chunk) => {
      expect(chunk.metadata.startOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.metadata.endOffset).toBeGreaterThan(chunk.metadata.startOffset);
      expect(chunk.metadata.paragraphCount).toBeGreaterThanOrEqual(1);
      expect(chunk.tokenCount).toBeGreaterThan(0);
    });
  });
});

