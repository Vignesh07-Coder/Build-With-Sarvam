import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SarvamAuthenticationError, SarvamEmptyResponseError, SarvamProviderError, SarvamTimeoutError } from './errors';

const { completions, MockSarvamAIError, MockSarvamAITimeoutError } = vi.hoisted(() => {
  class MockSarvamAIError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.name = 'SarvamAIError';
      this.statusCode = statusCode;
    }
  }

  class MockSarvamAITimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SarvamAITimeoutError';
    }
  }

  return { completions: vi.fn(), MockSarvamAIError, MockSarvamAITimeoutError };
});

vi.mock('sarvamai', () => ({
  SarvamAIClient: class {
    chat = { completions };
  },
  SarvamAIError: MockSarvamAIError,
  SarvamAITimeoutError: MockSarvamAITimeoutError,
}));

import { createSarvamChatClient } from './client';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createSarvamChatClient', () => {
  it('throws SarvamAuthenticationError when no API key is configured', () => {
    expect(() => createSarvamChatClient('')).toThrow(SarvamAuthenticationError);
  });

  it('returns parsed content and usage on a successful call', async () => {
    completions.mockResolvedValue({
      choices: [{ message: { content: 'EXPLANATION: ok' } }],
      usage: { total_tokens: 42 },
    });

    const client = createSarvamChatClient('test-key');
    const result = await client.complete({ systemPrompt: 'system', userMessage: 'question' });

    expect(result.content).toBe('EXPLANATION: ok');
    expect(result.usage).toEqual({ total_tokens: 42 });
    expect(completions).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'sarvam-105b',
        reasoning_effort: 'low',
        temperature: 0.2,
        max_tokens: 6000,
      }),
      { timeoutInSeconds: 120 },
    );
  });

  it('translates a provider timeout into SarvamTimeoutError', async () => {
    completions.mockRejectedValue(new MockSarvamAITimeoutError('timed out'));

    const client = createSarvamChatClient('test-key');

    await expect(client.complete({ systemPrompt: 's', userMessage: 'u' })).rejects.toBeInstanceOf(SarvamTimeoutError);
  });

  it('translates a provider authentication failure into SarvamAuthenticationError', async () => {
    completions.mockRejectedValue(new MockSarvamAIError('unauthorized', 401));

    const client = createSarvamChatClient('test-key');

    await expect(client.complete({ systemPrompt: 's', userMessage: 'u' })).rejects.toBeInstanceOf(SarvamAuthenticationError);
  });

  it('translates an unrecognized provider failure into SarvamProviderError', async () => {
    completions.mockRejectedValue(new MockSarvamAIError('server error', 500));

    const client = createSarvamChatClient('test-key');

    await expect(client.complete({ systemPrompt: 's', userMessage: 'u' })).rejects.toBeInstanceOf(SarvamProviderError);
  });

  it('rejects an unexpected (empty-content) provider response with SarvamEmptyResponseError', async () => {
    completions.mockResolvedValue({ choices: [{ message: { content: null } }], usage: null });

    const client = createSarvamChatClient('test-key');

    await expect(client.complete({ systemPrompt: 's', userMessage: 'u' })).rejects.toBeInstanceOf(SarvamEmptyResponseError);
  });

  it('rejects a provider response with no choices at all', async () => {
    completions.mockResolvedValue({ choices: [], usage: null });

    const client = createSarvamChatClient('test-key');

    await expect(client.complete({ systemPrompt: 's', userMessage: 'u' })).rejects.toBeInstanceOf(SarvamEmptyResponseError);
  });
});
