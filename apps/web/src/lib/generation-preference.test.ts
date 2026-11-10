// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPill } from '@/lib/api';
import { getPreferredGeneration, setPreferredGeneration } from '@/lib/generation-preference';

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  authenticatedFetch: (path: string, init?: RequestInit) => fetch(path, init),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('generation preference', () => {
  it('uses the saved workspace choice for Study Pills created from other views', async () => {
    setPreferredGeneration({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
    expect(getPreferredGeneration()).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
    });

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
    expect(body.get('generation_provider')).toBe('anthropic');
    expect(body.get('generation_model')).toBe('claude-sonnet-5-5');
  });

  it('lets an explicit workspace choice override the saved choice', async () => {
    setPreferredGeneration({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
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
