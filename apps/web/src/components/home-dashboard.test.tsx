// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeDashboard } from '@/components/home-dashboard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { AISettings, GenerationSelection } from '@/lib/types';

vi.mock('@/components/app-providers', () => ({
  useSession: () => ({
    status: 'authenticated',
    user: { id: 'student-1', displayName: 'Student' },
  }),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api', () => ({
  createPill: vi.fn(),
  getAISettings: vi.fn(),
  updateAISettings: vi.fn(),
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
      reason: 'Add your Anthropic key in Settings.',
    },
  ]),
}));

let saved: GenerationSelection;
const clients: QueryClient[] = [];

beforeEach(() => {
  saved = { provider: 'ollama', model: 'gemma4:26b' };
  vi.mocked(api.getAISettings).mockImplementation(async () => ({
    defaultGeneration: { ...saved },
    providers: [],
    models: [],
    keysEnabled: false,
  }));
  vi.mocked(api.updateAISettings).mockImplementation(async (selection) => {
    saved = selection;
    return selection;
  });
});

afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.clearAllMocks();
  localStorage.clear();
});

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <HomeDashboard />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

async function loadedPicker() {
  const picker = screen.getByLabelText<HTMLSelectElement>('Generation model');
  await waitFor(() => expect(picker.value).toBe('ollama:gemma4:26b'));
  return picker;
}

describe('workspace generation model', () => {
  it('saves the choice through the API and restores it with a fresh query cache', async () => {
    const view = mount();
    const picker = await loadedPicker();
    fireEvent.change(picker, { target: { value: 'ollama:qwen3-vl:8b-instruct' } });
    await waitFor(() => expect(picker.value).toBe('ollama:qwen3-vl:8b-instruct'));
    expect(api.updateAISettings).toHaveBeenCalledWith({
      provider: 'ollama',
      model: 'qwen3-vl:8b-instruct',
    });
    expect(
      view.client.getQueryData<AISettings>(['user', 'student-1', 'ai-settings'])?.defaultGeneration,
    ).toEqual(saved);
    expect(localStorage.length).toBe(0);

    view.unmount();
    view.client.clear();
    mount();
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLSelectElement>('Generation model').value).toBe(
        'ollama:qwen3-vl:8b-instruct',
      ),
    );
    expect(api.updateAISettings).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Unavailable models'));
    expect(screen.getByText(/Add your Anthropic key in Settings/)).toBeTruthy();
  });

  it('waits for the save before allowing another choice or creating a Pill', async () => {
    let finish!: (selection: GenerationSelection) => void;
    vi.mocked(api.updateAISettings).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = (selection) => {
            saved = selection;
            resolve(selection);
          };
        }),
    );
    mount();
    const picker = await loadedPicker();
    fireEvent.change(picker, { target: { value: 'ollama:qwen3-vl:8b-instruct' } });
    expect(await screen.findByText('Saving your model…')).toBeTruthy();
    expect(picker.disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'New Study Pill' }).disabled).toBe(
      true,
    );
    finish({ provider: 'ollama', model: 'qwen3-vl:8b-instruct' });
    await waitFor(() => expect(picker.disabled).toBe(false));
    expect(picker.value).toBe('ollama:qwen3-vl:8b-instruct');
  });

  it('keeps the saved model on failure and allows the choice to be retried', async () => {
    vi.mocked(api.updateAISettings).mockRejectedValueOnce(new Error('Database unavailable.'));
    mount();
    const picker = await loadedPicker();
    fireEvent.change(picker, { target: { value: 'ollama:qwen3-vl:8b-instruct' } });
    expect((await screen.findByRole('alert')).textContent).toContain('Could not save your model.');
    expect(picker.value).toBe('ollama:gemma4:26b');
    await waitFor(() => expect(picker.disabled).toBe(false));
    fireEvent.change(picker, { target: { value: 'ollama:qwen3-vl:8b-instruct' } });
    await waitFor(() => expect(picker.value).toBe('ollama:qwen3-vl:8b-instruct'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.updateAISettings).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite an unavailable saved model with the displayed fallback', async () => {
    saved = { provider: 'anthropic', model: 'claude-sonnet-5-5' };
    mount();
    const picker = screen.getByLabelText<HTMLSelectElement>('Generation model');
    await waitFor(() => expect(picker.disabled).toBe(false));
    expect(picker.value).toBe('ollama:qwen3-vl:8b-instruct');
    expect(api.updateAISettings).not.toHaveBeenCalled();
    expect(saved.provider).toBe('anthropic');
  });
});
