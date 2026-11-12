import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health';

describe('healthResponseSchema', () => {
  it('accepts the exact expected health payload', () => {
    const result = healthResponseSchema.safeParse({ status: 'ok', service: 'tattva-api' });
    expect(result.success).toBe(true);
  });

  it('rejects a payload with the wrong status value', () => {
    const result = healthResponseSchema.safeParse({ status: 'degraded', service: 'tattva-api' });
    expect(result.success).toBe(false);
  });

  it('rejects a payload missing the service field', () => {
    const result = healthResponseSchema.safeParse({ status: 'ok' });
    expect(result.success).toBe(false);
  });
});
