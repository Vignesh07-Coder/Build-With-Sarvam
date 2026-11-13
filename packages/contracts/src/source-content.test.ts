import { describe, expect, it } from 'vitest';
import {
  processingStatusSchema,
  sourceChunkSchema,
  sourceContentSchema,
  sourceContentSummarySchema,
} from './source-content';

describe('source-content schemas', () => {
  it('validates processingStatusSchema values correctly', () => {
    expect(processingStatusSchema.parse('pending')).toBe('pending');
    expect(processingStatusSchema.parse('processing')).toBe('processing');
    expect(processingStatusSchema.parse('completed')).toBe('completed');
    expect(processingStatusSchema.parse('failed')).toBe('failed');
    expect(() => processingStatusSchema.parse('unknown')).toThrow();
  });

  it('validates a complete sourceContent record', () => {
    const valid = {
      id: '11111111-1111-4111-8111-111111111111',
      learningSourceId: '22222222-2222-4222-8222-222222222222',
      rawBody: 'Full transcript text...',
      contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      processingStatus: 'completed',
      processingError: null,
      processedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(sourceContentSchema.parse(valid)).toEqual(valid);
    expect(sourceContentSummarySchema.parse(valid)).not.toHaveProperty('rawBody');
  });

  it('validates sourceChunkSchema constraints', () => {
    const chunk = {
      id: '33333333-3333-4333-8333-333333333333',
      sourceContentId: '11111111-1111-4111-8111-111111111111',
      chunkIndex: 0,
      body: 'Segment text',
      tokenCount: 150,
      metadata: { heading: 'Introduction' },
      createdAt: new Date().toISOString(),
    };

    expect(sourceChunkSchema.parse(chunk)).toEqual(chunk);

    // Negative chunk index should fail
    expect(() =>
      sourceChunkSchema.parse({
        ...chunk,
        chunkIndex: -1,
      }),
    ).toThrow();
  });
});

