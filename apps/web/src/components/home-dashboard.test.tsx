// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeDashboard } from '@/components/home-dashboard';
import { getPreferredGeneration } from '@/lib/generation-preference';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api', () => ({
  createPill: vi.fn(),
  listPills: vi.fn().mockResolvedValue([]),
  listCollections: vi.fn().mockResolvedValue([]),
  listLibrary: vi.fn().mockResolvedValue([]),
  listGenerationOptions: vi.fn().mockResolvedValue([
    {
      provider: 'ollama',
      model: 'qwen3-vl:8b-instruct',
      label: 'Ollama · Qwen',
      available: true,
      reason: null,
    },
    {
      provider: 'ollama',
      model: 'gemma4:26b',
      label: 'Ollama · Gemma 4 26B',
      available: true,
      reason: null,
    },
    {
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      label: 'Anthropic · Sonnet 5.5',
      available: false,
      reason: 'Set ANTHROPIC_API_KEY.',
    },
  ]),
}));

afterEach(() => localStorage.clear());

describe('workspace generation model', () => {
  it('saves the selected model and explains unavailable choices', async () => {
    render(<HomeDashboard />);
    const picker = await screen.findByLabelText('Generation model');
    expect((picker as HTMLSelectElement).value).toBe('ollama:qwen3-vl:8b-instruct');
    fireEvent.change(picker, { target: { value: 'ollama:gemma4:26b' } });
    expect(getPreferredGeneration()).toEqual({ provider: 'ollama', model: 'gemma4:26b' });
    fireEvent.click(screen.getByText('Unavailable models'));
    expect(screen.getByText(/Set ANTHROPIC_API_KEY/)).toBeTruthy();
  });
});
