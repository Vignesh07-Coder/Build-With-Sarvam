import { SarvamAIClient, SarvamAIError, SarvamAITimeoutError } from 'sarvamai';
import { env } from '../../config/env';
import {
  SarvamAuthenticationError,
  SarvamEmptyResponseError,
  SarvamProviderError,
  SarvamRateLimitError,
  SarvamTimeoutError,
} from './errors';

/**
 * Production Sarvam chat-completion wrapper (docs/ARCHITECTURE.md §6.5).
 * Parameters are fixed at the Stage 6B.1 benchmark-validated values — do
 * not change them without re-running the benchmark:
 *   model=sarvam-105b, reasoning_effort=low, temperature=0.2,
 *   max_tokens=6000, timeoutInSeconds=120, no response_format.
 *
 * No retries: a single failed call surfaces immediately as a typed error
 * (see errors.ts) for the caller to handle. Sarvam calls cost real credits
 * (the benchmark script's own "credit-control" comment), so silent/automatic
 * retrying here would multiply that cost without caller awareness; a retry
 * policy belongs at the orchestration layer that has request-level context,
 * not hidden inside this adapter.
 */

const MODEL = 'sarvam-105b' as const;
const REASONING_EFFORT = 'low' as const;
const TEMPERATURE = 0.2;
const MAX_TOKENS = 6000;
const TIMEOUT_SECONDS = 120;

export interface SarvamCompletionParams {
  systemPrompt: string;
  userMessage: string;
}

export interface SarvamCompletionResult {
  content: string;
  usage: unknown;
}

export interface SarvamChatClient {
  complete(params: SarvamCompletionParams): Promise<SarvamCompletionResult>;
}

/** Translates SDK/provider failures into the internal error taxonomy (errors.ts). Never passes a raw SDK error or logs request content. */
function translateProviderError(error: unknown): Error {
  if (error instanceof SarvamEmptyResponseError) {
    return error;
  }
  if (error instanceof SarvamAITimeoutError) {
    return new SarvamTimeoutError(error.message || undefined);
  }
  if (error instanceof SarvamAIError) {
    const statusCode = error.statusCode;
    if (statusCode === 401 || statusCode === 403) {
      return new SarvamAuthenticationError('Sarvam API rejected the configured credentials');
    }
    if (statusCode === 429) {
      return new SarvamRateLimitError();
    }
    return new SarvamProviderError(`Sarvam API request failed (status ${statusCode ?? 'unknown'})`, statusCode);
  }
  return new SarvamProviderError('Unexpected Sarvam provider error');
}

/**
 * Builds a chat client from an explicit API key. Kept separate from
 * `createSarvamChatClientFromEnv` so the adapter stays independently
 * testable without depending on process environment state.
 */
export function createSarvamChatClient(apiKey: string): SarvamChatClient {
  if (!apiKey) {
    throw new SarvamAuthenticationError('SARVAM_API_KEY is not configured');
  }

  const sdkClient = new SarvamAIClient({ apiSubscriptionKey: apiKey });

  return {
    async complete({ systemPrompt, userMessage }: SarvamCompletionParams): Promise<SarvamCompletionResult> {
      try {
        const response = await sdkClient.chat.completions(
          {
            model: MODEL,
            reasoning_effort: REASONING_EFFORT,
            temperature: TEMPERATURE,
            max_tokens: MAX_TOKENS,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
          },
          { timeoutInSeconds: TIMEOUT_SECONDS },
        );

        const content = response.choices[0]?.message?.content ?? null;
        if (!content) {
          throw new SarvamEmptyResponseError();
        }

        return { content, usage: response.usage ?? null };
      } catch (error) {
        throw translateProviderError(error);
      }
    },
  };
}

/** Reads SARVAM_API_KEY from the existing server environment config (src/config/env.ts). */
export function createSarvamChatClientFromEnv(): SarvamChatClient {
  if (!env.SARVAM_API_KEY) {
    throw new SarvamAuthenticationError('SARVAM_API_KEY is not configured');
  }
  return createSarvamChatClient(env.SARVAM_API_KEY);
}
