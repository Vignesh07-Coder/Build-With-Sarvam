# Source Material Ingestion & Processing — Integration Handover

> [!NOTE]
> **Audience**: Primary Developer (AI generation, context assembly, and node orchestration subsystem).  
> **Status**: **Completed & Verified** (Milestones 1–8).  
> **Branch**: `Kavana-Contibutions`  
> **Integration Baseline Reference**: `docs/SECOND_DEVELOPER_HANDOVER.md` §7.

---

## 1. Overview & Purpose

The second developer subsystem takes raw learning material (transcripts, markdown, technical documents) and turns it into clean, deterministic, ordered, and retrievable source context.

Per `SECOND_DEVELOPER_HANDOVER.md` §7, the Sarvam adapter's prompt builders strictly require a plain `sourceExcerpt: string`:
- `buildStandardSystemPrompt(sourceExcerpt: string)`
- `buildResearchModeSystemPrompt(sourceExcerpt: string)`

This subsystem provides the exact structured data model, lifecycle guarantees, and retrieval interface needed for your upcoming `services/sourceContext.ts` to supply that `sourceExcerpt` without needing to parse, clean, or chunk text.

---

## 2. Integration Interface (How to Retrieve Source Content)

You have two supported ways to retrieve structured source context:

### Method A: In-Process Service Call (Recommended for Backend Services)

Inside `apps/api/src/services/sourceContext.ts` (or any API service):

```typescript
import { getStructuredSourceContext } from './sourceProcessingService';
import type { StructuredSourceRecord } from '@tattva/contracts';

// In your inquiry service / sourceContext builder:
const sourceRecord: StructuredSourceRecord = await getStructuredSourceContext(
  supabaseClient,
  inquiry.learningSourceId,
);

// 1. For small sources or single-topic inquiries: use the full normalized text
const fullExcerpt = sourceRecord.content.extractedText;

// 2. For chunked retrieval: use ordered chunks
const firstChunk = sourceRecord.chunks[0].body;
const targetChunk = sourceRecord.chunks.find(c => c.chunkIndex === targetIndex)?.body;
```

### Method B: Authenticated HTTP Endpoint

```http
GET /api/v1/sources/:learningSourceId/structured
Authorization: Bearer <token>
```

**Response (HTTP 200 OK):**
```json
{
  "data": {
    "learningSourceId": "11111111-1111-4111-8111-111111111111",
    "title": "Memory Arena Allocators: Architecture & Trade-offs",
    "sourceType": "transcript",
    "sourceReference": "seed/memory-arena-allocators.txt",
    "durationMinutes": 38,
    "content": {
      "id": "22222222-2222-4222-8222-222222222222",
      "extractedText": "Normalized, cleaned full text...",
      "contentHash": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
      "processingStatus": "completed",
      "processingError": null,
      "processedAt": "2026-11-13T12:00:00.000Z",
      "createdAt": "2026-11-13T11:50:00.000Z",
      "updatedAt": "2026-11-13T12:00:00.000Z"
    },
    "chunks": [
      {
        "id": "33333333-3333-4333-8333-333333333333",
        "sourceContentId": "22222222-2222-4222-8222-222222222222",
        "chunkIndex": 0,
        "body": "An arena allocator (or bump allocator) is a memory management scheme...",
        "tokenCount": 95,
        "metadata": {
          "startOffset": 0,
          "endOffset": 380,
          "paragraphCount": 2
        },
        "createdAt": "2026-11-13T12:00:00.000Z"
      }
    ]
  }
}
```

---

## 3. Data Model & Guarantees

### A. Ordering & Integrity Guarantees
- `chunks` is strictly ordered by `chunk_index ASC` starting at `0` (`0, 1, 2, ...`).
- All chunk bodies together preserve 100% of the non-whitespace source content without truncation or omissions.
- Chunks average ~1,500 characters, respecting logical paragraph boundaries (`\n\n`) and sentence boundaries.

### B. Safe Lifecycle State Guards
- `processing_status` progresses through: `'pending' | 'processing' | 'completed' | 'failed'`.
- **Consumer Guard**: If you invoke `getStructuredSourceContext` on a source whose processing is still `pending`, `processing`, or `failed`, the call will reject with:
  ```json
  {
    "statusCode": 409,
    "code": "SOURCE_NOT_READY",
    "message": "Learning source content is not ready for consumption (current status: pending)."
  }
  ```
  This guarantees that incomplete, un-chunked, or corrupted materials are never passed to Sarvam.

---

## 4. Shared Contract Exports (`@tattva/contracts`)

All relevant contracts are defined and exported from `@tattva/contracts`:
- `StructuredSourceRecord`, `structuredSourceRecordSchema`
- `SourceContent`, `sourceContentSchema`, `sourceContentSummarySchema`
- `SourceChunk`, `sourceChunkSchema`
- `ProcessingStatus`, `processingStatusSchema`
- `IngestSourceInput`, `ingestSourceInputSchema`

---

## 5. Scope & Guardrails Compliance

- **No AI generation files were touched**: `apps/api/src/integrations/sarvam/**` remains completely unmodified.
- **Prompt compatibility verified**: Automated integration tests in `sourcePipelineIntegration.test.ts` verify that retrieved chunks and normalized text pass directly into `buildStandardSystemPrompt` and `buildResearchModeSystemPrompt` without errors.
- **All changes committed to branch**: `Kavana-Contibutions`.

