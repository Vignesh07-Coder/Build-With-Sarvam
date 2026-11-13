import { describe, expect, it } from 'vitest';
import { ingestSourceInputSchema } from './source-ingestion';

describe('ingestSourceInputSchema', () => {
  const validPayload = {
    title: 'Distributed Systems & Consensus: Raft Protocol',
    description: 'An in-depth technical discussion of consensus and leader election.',
    sourceType: 'transcript' as const,
    durationMinutes: 45,
    sourceReference: 'https://example.com/raft-paper.pdf',
    rawBody: 'A'.repeat(500),
  };

  it('accepts a valid ingestion payload', () => {
    const result = ingestSourceInputSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects durationMinutes less than 25 (PRD §2 invariant)', () => {
    const invalid = { ...validPayload, durationMinutes: 20 };
    const result = ingestSourceInputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('at least 25 minutes');
    }
  });

  it('rejects empty title or whitespace-only title', () => {
    const invalid = { ...validPayload, title: '   ' };
    const result = ingestSourceInputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects rawBody under 100 characters', () => {
    const invalid = { ...validPayload, rawBody: 'Too short' };
    const result = ingestSourceInputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('at least 100 characters');
    }
  });

  it('rejects rawBody exceeding 500,000 characters', () => {
    const invalid = { ...validPayload, rawBody: 'A'.repeat(500001) };
    const result = ingestSourceInputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects unsupported sourceType', () => {
    const invalid = { ...validPayload, sourceType: 'podcast' };
    const result = ingestSourceInputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

