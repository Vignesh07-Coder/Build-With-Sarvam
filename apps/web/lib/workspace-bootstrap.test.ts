import { describe, expect, it, vi, beforeEach } from 'vitest';

const { createInquiry, getMe, listInquiries } = vi.hoisted(() => ({
  createInquiry: vi.fn(),
  getMe: vi.fn(),
  listInquiries: vi.fn(),
}));
const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn() }));

vi.mock('./api-client', () => ({ createInquiry, getMe, listInquiries }));
vi.mock('./auth', () => ({ getAccessToken }));

const ME = { data: { user: { id: 'user-1', isAnonymous: true } } };

/**
 * `ensureDemoInquiry` caches its in-flight/resolved promise at module scope
 * (see workspace-bootstrap.ts) specifically so concurrent callers share one
 * attempt instead of racing duplicate `inquiries` inserts. Each test here
 * resets modules and re-imports to get a fresh cache, except the dedup test
 * itself, which deliberately relies on that shared module state.
 */
async function freshEnsureDemoInquiry() {
  vi.resetModules();
  const mod = await import('./workspace-bootstrap');
  return mod.ensureDemoInquiry;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAccessToken.mockResolvedValue('token');
  getMe.mockResolvedValue(ME);
});

describe('ensureDemoInquiry', () => {
  it('reuses an existing inquiry for the demo learning source instead of creating a new one', async () => {
    const ensureDemoInquiry = await freshEnsureDemoInquiry();
    const { DEMO_LEARNING_SOURCE_ID } = await import('./workspace-bootstrap');
    listInquiries.mockResolvedValue({
      data: [{ id: 'inq-existing', userId: 'user-1', learningSourceId: DEMO_LEARNING_SOURCE_ID, title: null, createdAt: '', updatedAt: '' }],
    });

    const result = await ensureDemoInquiry();

    expect(result).toEqual({ inquiryId: 'inq-existing', userId: 'user-1', isAnonymous: true });
    expect(createInquiry).not.toHaveBeenCalled();
  });

  it('creates a new inquiry when none exists yet for the demo source', async () => {
    const ensureDemoInquiry = await freshEnsureDemoInquiry();
    const { DEMO_LEARNING_SOURCE_ID } = await import('./workspace-bootstrap');
    listInquiries.mockResolvedValue({ data: [] });
    createInquiry.mockResolvedValue({
      data: { id: 'inq-new', userId: 'user-1', learningSourceId: DEMO_LEARNING_SOURCE_ID, title: null, createdAt: '', updatedAt: '' },
    });

    const result = await ensureDemoInquiry();

    expect(createInquiry).toHaveBeenCalledWith(DEMO_LEARNING_SOURCE_ID);
    expect(result.inquiryId).toBe('inq-new');
  });

  it('shares one in-flight attempt across concurrent callers instead of creating a duplicate inquiry', async () => {
    const ensureDemoInquiry = await freshEnsureDemoInquiry();
    listInquiries.mockResolvedValue({ data: [] });
    createInquiry.mockResolvedValue({
      data: { id: 'inq-new', userId: 'user-1', learningSourceId: 'source-x', title: null, createdAt: '', updatedAt: '' },
    });

    // Simulates React's dev-mode double effect invocation racing the check.
    const [first, second] = await Promise.all([ensureDemoInquiry(), ensureDemoInquiry()]);

    expect(first).toEqual(second);
    expect(createInquiry).toHaveBeenCalledTimes(1);
    expect(listInquiries).toHaveBeenCalledTimes(1);
  });
});
