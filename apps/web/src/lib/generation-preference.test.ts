// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPill } from '@/lib/api';

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  authenticatedFetch: (path: string, init?: RequestInit) => fetch(path, init),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('generation preference', () => {
  it('lets the backend resolve the account default when no override is supplied', async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ id: 'pill-1' }),
    });
    vi.stubGlobal('fetch', send);
    await createPill({
      title: 'Cells',
      subject: 'Biology',
      files: [],
      selectedMaterials: ['notes'],
      detailLevel: 'balanced',
      learnerLevel: 'intermediate',
    });
    const body = send.mock.calls[0][1].body as FormData;
    expect(body.get('generation_provider')).toBeNull();
    expect(body.get('generation_model')).toBeNull();
  });

  it('sends an explicit workspace override', async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ id: 'pill-2' }),
    });
    vi.stubGlobal('fetch', send);
    await createPill({
      title: 'Cells',
      subject: 'Biology',
      files: [],
      selectedMaterials: ['notes'],
      detailLevel: 'balanced',
      learnerLevel: 'intermediate',
      generation: { provider: 'ollama', model: 'gemma4:26b' },
    });
    const body = send.mock.calls[0][1].body as FormData;
    expect(body.get('generation_model')).toBe('gemma4:26b');
  });
});
