import pino from 'pino';
import { env } from '../config/env';

/**
 * Structured logger. Redaction list covers the secret-bearing fields this
 * app ever touches (CLAUDE.md §5: never print secrets in logs).
 */
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.SARVAM_API_KEY',
      '*.SUPABASE_SERVICE_ROLE_KEY',
      '*.SUPABASE_ANON_KEY',
    ],
    censor: '[REDACTED]',
  },
});
