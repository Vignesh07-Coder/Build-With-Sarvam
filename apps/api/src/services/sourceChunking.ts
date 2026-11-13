/**
 * Source content chunking and segmentation service (Milestone 5).
 *
 * Implements deterministic, ordered segmentation of normalized source text
 * into discrete units suitable for AI context windowing.
 *
 * Segmentation strategy:
 * 1. Semantic paragraph & section boundary splitting (double newlines `\n\n`).
 * 2. Target window sizing:
 *    - targetChunkCharacters: ~1,500 chars (aligned with INTELLIGENCE_ARCHITECTURE.md §3)
 *    - maxChunkCharacters: 3,000 chars (hard ceiling)
 * 3. Break-point fallback hierarchy:
 *    - Paragraph / Section boundary (`\n\n`)
 *    - Sentence boundary (`. `, `? `, `! `) for oversized blocks
 *    - Word boundary (` `) for long unpunctuated runs
 * 4. Determinism & Integrity:
 *    - Exact repeatability: chunk(text) produces identical chunk arrays across runs
 *    - 0-indexed sequential ordering (`chunkIndex: 0, 1, 2...`)
 *    - Meaningful content preservation: all non-whitespace content is retained without loss
 *    - Token estimation: heuristic (~4 characters per token for English technical text)
 */

export interface ChunkOptions {
  /** Target character size per chunk. Defaults to 1500 chars. */
  targetCharacters?: number;
  /** Maximum character size per chunk. Defaults to 3000 chars. */
  maxCharacters?: number;
  /** Optional overlap between consecutive chunks to preserve contextual continuity. Defaults to 0. */
  overlapCharacters?: number;
}

export interface ChunkUnit {
  chunkIndex: number;
  body: string;
  tokenCount: number;
  characterCount: number;
  metadata: {
    startOffset: number;
    endOffset: number;
    paragraphCount: number;
  };
}

/**
 * Estimates token count for English/technical text (~4 characters per token).
 */
export function estimateTokenCount(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

/**
 * Splits an excessively long text block (e.g. giant single paragraph)
 * along sentence or word boundaries to respect maxCharacters.
 */
function splitOversizedParagraph(paragraph: string, maxCharacters: number): string[] {
  if (paragraph.length <= maxCharacters) {
    return [paragraph];
  }

  const subChunks: string[] = [];
  // Split on sentence boundaries while keeping the delimiter
  const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [paragraph];

  let currentBlock = '';

  for (const sentence of sentences) {
    if (sentence.length > maxCharacters) {
      // Sentence itself exceeds maxCharacters: split on whitespace words
      if (currentBlock.length > 0) {
        subChunks.push(currentBlock.trim());
        currentBlock = '';
      }

      const words = sentence.split(/\s+/);
      let wordBlock = '';
      for (const word of words) {
        if ((wordBlock + ' ' + word).trim().length > maxCharacters) {
          if (wordBlock.length > 0) {
            subChunks.push(wordBlock.trim());
          }
          wordBlock = word;
        } else {
          wordBlock = wordBlock.length > 0 ? `${wordBlock} ${word}` : word;
        }
      }
      if (wordBlock.length > 0) {
        currentBlock = wordBlock;
      }
    } else if ((currentBlock + ' ' + sentence).trim().length > maxCharacters) {
      if (currentBlock.length > 0) {
        subChunks.push(currentBlock.trim());
      }
      currentBlock = sentence;
    } else {
      currentBlock = currentBlock.length > 0 ? `${currentBlock} ${sentence}` : sentence;
    }
  }

  if (currentBlock.trim().length > 0) {
    subChunks.push(currentBlock.trim());
  }

  return subChunks;
}

/**
 * Chunks normalized source text into ordered, deterministic segments.
 */
export function chunkSourceText(
  normalizedText: string,
  options: ChunkOptions = {},
): ChunkUnit[] {
  if (!normalizedText || normalizedText.trim().length === 0) {
    return [];
  }

  const targetChars = options.targetCharacters ?? 1500;
  const maxChars = options.maxCharacters ?? 3000;

  // 1. Break text into logical paragraphs (double newlines)
  const rawParagraphs = normalizedText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // 2. Expand any oversized paragraphs
  const atomicBlocks: string[] = [];
  for (const p of rawParagraphs) {
    if (p.length > maxChars) {
      atomicBlocks.push(...splitOversizedParagraph(p, maxChars));
    } else {
      atomicBlocks.push(p);
    }
  }

  // 3. Accumulate blocks into chunks up to target/max characters
  const chunks: ChunkUnit[] = [];
  let currentBodies: string[] = [];
  let currentLength = 0;
  let runningOffset = 0;

  for (let i = 0; i < atomicBlocks.length; i++) {
    const block = atomicBlocks[i]!;
    const prospectiveLength = currentLength === 0 ? block.length : currentLength + 2 + block.length;

    // If adding this block exceeds target characters and we already have content:
    if (prospectiveLength > targetChars && currentBodies.length > 0) {
      const chunkBody = currentBodies.join('\n\n');
      const startOffset = runningOffset;
      const endOffset = startOffset + chunkBody.length;

      chunks.push({
        chunkIndex: chunks.length,
        body: chunkBody,
        tokenCount: estimateTokenCount(chunkBody),
        characterCount: chunkBody.length,
        metadata: {
          startOffset,
          endOffset,
          paragraphCount: currentBodies.length,
        },
      });

      runningOffset = endOffset + 2; // account for paragraph break separator
      currentBodies = [block];
      currentLength = block.length;
    } else {
      currentBodies.push(block);
      currentLength = prospectiveLength;
    }
  }

  // Push remaining accumulated content
  if (currentBodies.length > 0) {
    const chunkBody = currentBodies.join('\n\n');
    const startOffset = runningOffset;
    const endOffset = startOffset + chunkBody.length;

    chunks.push({
      chunkIndex: chunks.length,
      body: chunkBody,
      tokenCount: estimateTokenCount(chunkBody),
      characterCount: chunkBody.length,
      metadata: {
        startOffset,
        endOffset,
        paragraphCount: currentBodies.length,
      },
    });
  }

  return chunks;
}

