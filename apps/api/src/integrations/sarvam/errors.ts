/**
 * Internal error taxonomy for the Sarvam adapter (docs/ARCHITECTURE.md §6.5).
 * Every failure crossing the adapter boundary — provider-side or parsing —
 * surfaces as one of these, never a raw SDK error or Zod error, so callers
 * (the future node-orchestration service) can map to API_CONTRACTS.md §4
 * status codes (`502`/`422`) without depending on `sarvamai` internals.
 */
export class SarvamAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SarvamAdapterError';
  }
}

/** The provider call exceeded the configured timeout (120s, validated). */
export class SarvamTimeoutError extends SarvamAdapterError {
  constructor(message = 'Sarvam request timed out') {
    super(message);
    this.name = 'SarvamTimeoutError';
  }
}

/** The configured SARVAM_API_KEY was rejected or is missing. */
export class SarvamAuthenticationError extends SarvamAdapterError {
  constructor(message = 'Sarvam API authentication failed') {
    super(message);
    this.name = 'SarvamAuthenticationError';
  }
}

/** The provider rate-limited this request. */
export class SarvamRateLimitError extends SarvamAdapterError {
  constructor(message = 'Sarvam API rate limit exceeded') {
    super(message);
    this.name = 'SarvamRateLimitError';
  }
}

/** Any other non-2xx provider failure. */
export class SarvamProviderError extends SarvamAdapterError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'SarvamProviderError';
    this.statusCode = statusCode;
  }
}

/** The provider returned a 2xx with no usable message content. */
export class SarvamEmptyResponseError extends SarvamAdapterError {
  constructor(message = 'Sarvam returned no response content') {
    super(message);
    this.name = 'SarvamEmptyResponseError';
  }
}

/**
 * Raised by the parser when the labelled-output contract is violated:
 * missing/duplicate labels, empty required fields, or a structurally
 * malformed field (e.g. an unparseable MISCONCEPTION line). Never thrown
 * for a verified-but-unwanted answer — only for a response Tattva cannot
 * safely interpret at all.
 */
export class SarvamParseError extends SarvamAdapterError {
  public readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]) {
    super(message);
    this.name = 'SarvamParseError';
    this.issues = issues;
  }
}
