import { describe, expect, it, vi, beforeEach } from 'vitest';

const { createInquiry, getMe, listInquiries } = vi.hoisted(() => ({
  createInquiry: vi.fn(),
  getMe: vi.fn(),
  listInquiries: vi.fn(),
}));
const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn() }));

vi.mock('./api-client', () => ({ createInquiry, getMe, listInquiries }));
vi.mock('./auth', () => ({ getAccessToken }));

import { DEMO_LEARNING_SOURCE_ID, ensureDemoInquiry } from './workspace-bootstrap';

const ME = { data: { user: { id: 'user-1', isAnonymous: true } } };

beforeEach(() => {
  vi.clearAllMocks();
  getAccessToken.mockResolvedValue('token');
  getMe.mockResolvedValue(ME);
});

describe('ensureDemoInquiry', () => {
  it('reuses an existing inquiry for the demo learning source instead of creating a new one', async () => {
    listInquiries.mockResolvedValue({
      data: [{ id: 'inq-existing', userId: 'user-1', learningSourceId: DEMO_LEARNING_SOURCE_ID, title: null, createdAt: '', updatedAt: '' }],
    });

    const result = await ensureDemoInquiry();

    expect(result).toEqual({ inquiryId: 'inq-existing', userId: 'user-1', isAnonymous: true });
    expect(createInquiry).not.toHaveBeenCalled();
  });

  it('creates a new inquiry when none exists yet for the demo source', async () => {
    listInquiries.mockResolvedValue({ data: [] });
    createInquiry.mockResolvedValue({
      data: { id: 'inq-new', userId: 'user-1', learningSourceId: DEMO_LEARNING_SOURCE_ID, title: null, createdAt: '', updatedAt: '' },
    });

    const result = await ensureDemoInquiry();

    expect(createInquiry).toHaveBeenCalledWith(DEMO_LEARNING_SOURCE_ID);
    expect(result.inquiryId).toBe('inq-new');
  });
});
