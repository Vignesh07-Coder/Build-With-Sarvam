import { describe, expect, it, vi, beforeEach } from 'vitest';

const { findLearningSourceById } = vi.hoisted(() => ({ findLearningSourceById: vi.fn() }));
const { createInquiry, findInquiryByIdForUser, listInquiriesForUser } = vi.hoisted(() => ({
  createInquiry: vi.fn(),
  findInquiryByIdForUser: vi.fn(),
  listInquiriesForUser: vi.fn(),
}));
const { listNodesForInquiry } = vi.hoisted(() => ({ listNodesForInquiry: vi.fn() }));
const { createRequestScopedClient } = vi.hoisted(() => ({ createRequestScopedClient: vi.fn() }));

vi.mock('../repositories/learningSourceRepository', () => ({ findLearningSourceById }));
vi.mock('../repositories/inquiryRepository', () => ({
  createInquiry,
  findInquiryByIdForUser,
  listInquiriesForUser,
}));
vi.mock('../repositories/questionNodeRepository', () => ({ listNodesForInquiry }));
vi.mock('../integrations/supabase/client', () => ({ createRequestScopedClient }));

import { createInquiryForUser, getInquiryDetail, listInquiries } from './inquiryService';

const SOURCE = {
  id: 'source-1',
  title: 'Memory Arena Allocators',
  sourceType: 'transcript' as const,
  sourceReference: 'seed/x.txt',
  durationMinutes: 38,
};

beforeEach(() => {
  vi.clearAllMocks();
  createRequestScopedClient.mockReturnValue({});
});

describe('createInquiryForUser', () => {
  it('throws 404 when the learning source does not exist', async () => {
    findLearningSourceById.mockResolvedValue(null);

    await expect(createInquiryForUser('token', 'user-1', 'missing-source')).rejects.toMatchObject({
      statusCode: 404,
      code: 'learning_source_not_found',
    });
    expect(createInquiry).not.toHaveBeenCalled();
  });

  it('creates the inquiry for the verified user when the source exists', async () => {
    findLearningSourceById.mockResolvedValue(SOURCE);
    createInquiry.mockResolvedValue({
      id: 'inq-1',
      userId: 'user-1',
      learningSourceId: SOURCE.id,
      title: null,
      createdAt: 'now',
      updatedAt: 'now',
    });

    const result = await createInquiryForUser('token', 'user-1', SOURCE.id);

    expect(createInquiry).toHaveBeenCalledWith(expect.anything(), 'user-1', SOURCE.id);
    expect(result.userId).toBe('user-1');
  });
});

describe('listInquiries', () => {
  it('scopes the list to the verified caller', async () => {
    listInquiriesForUser.mockResolvedValue([]);

    await listInquiries('token', 'user-1');

    expect(listInquiriesForUser).toHaveBeenCalledWith(expect.anything(), 'user-1');
  });
});

describe('getInquiryDetail', () => {
  it('returns 404 (not 403) when the inquiry does not exist or is not owned by the caller', async () => {
    findInquiryByIdForUser.mockResolvedValue(null);

    await expect(getInquiryDetail('token', 'user-1', 'inq-1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'inquiry_not_found',
    });
  });

  it('rejects as 404 even if a repository bug returns a row owned by a different user (defense in depth)', async () => {
    findInquiryByIdForUser.mockResolvedValue({
      id: 'inq-1',
      userId: 'someone-else',
      learningSourceId: SOURCE.id,
      title: null,
      createdAt: 'now',
      updatedAt: 'now',
    });

    await expect(getInquiryDetail('token', 'user-1', 'inq-1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'inquiry_not_found',
    });
    expect(listNodesForInquiry).not.toHaveBeenCalled();
  });

  it('assembles the inquiry, its learning source, and its nodes for the owner', async () => {
    findInquiryByIdForUser.mockResolvedValue({
      id: 'inq-1',
      userId: 'user-1',
      learningSourceId: SOURCE.id,
      title: null,
      createdAt: 'now',
      updatedAt: 'now',
    });
    findLearningSourceById.mockResolvedValue(SOURCE);
    listNodesForInquiry.mockResolvedValue([]);

    const detail = await getInquiryDetail('token', 'user-1', 'inq-1');

    expect(detail).toEqual({ id: 'inq-1', learningSource: SOURCE, nodes: [] });
  });
});
