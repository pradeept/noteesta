// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AISettingsPage } from '@/components/ai-settings';
import * as api from '@/lib/api';
import type { AISettings } from '@/lib/types';

vi.mock('@/components/app-providers', () => ({
  useSession: () => ({ user: { id: 'alice', displayName: 'Alice' } }),
}));
vi.mock('@/lib/api', () => ({
  getAISettings: vi.fn(),
  saveProviderKey: vi.fn(),
  removeProviderKey: vi.fn(),
  testProviderKey: vi.fn(),
  updateAISettings: vi.fn(),
}));

let client: QueryClient;
let data: AISettings;
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  data = {
    defaultGeneration: { provider: 'ollama', model: 'qwen' },
    keysEnabled: true,
    providers: [
      {
        provider: 'openai',
        label: 'OpenAI',
        configured: false,
        suffix: null,
        updatedAt: null,
        testedModels: [],
      },
    ],
    models: [
      {
        provider: 'ollama',
        model: 'qwen',
        label: 'Ollama · Qwen',
        available: true,
        reason: null,
        tier: 'local',
      },
      {
        provider: 'openai',
        model: 'gpt-6-astra',
        label: 'OpenAI · GPT-6 Astra',
        available: true,
        reason: null,
        tier: 'flagship',
      },
    ],
  };
  vi.mocked(api.getAISettings).mockImplementation(async () => structuredClone(data));
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.resetAllMocks();
  localStorage.clear();
});
function mount() {
  return render(
    <QueryClientProvider client={client}>
      <AISettingsPage />
    </QueryClientProvider>,
  );
}

it('adds a key without retaining plaintext in browser storage or mutation caches', async () => {
  vi.mocked(api.saveProviderKey).mockImplementation(async () => {
    data.providers[0].configured = true;
    data.providers[0].suffix = '1234';
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Add key' }));
  const input = screen.getByLabelText('OpenAI API key') as HTMLInputElement;
  expect(input.type).toBe('password');
  fireEvent.change(input, { target: { value: 'personal-secret-1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
  await screen.findByText('Key saved · ••••1234');
  expect(api.saveProviderKey).toHaveBeenCalledWith('openai', 'personal-secret-1234');
  expect(screen.queryByLabelText('OpenAI API key')).toBeNull();
  expect(JSON.stringify(client.getQueryCache().getAll())).not.toContain('personal-secret-1234');
  expect(client.getMutationCache().getAll()).toHaveLength(0);
  expect(localStorage.length).toBe(0);
});

it('tests saved keys and confirms removal with fresh connection status', async () => {
  data.providers[0].configured = true;
  data.providers[0].suffix = '1234';
  vi.mocked(api.testProviderKey).mockImplementation(async () => {
    data.providers[0].testedModels = ['gpt-6-astra'];
    return { connected: true };
  });
  vi.mocked(api.removeProviderKey).mockImplementation(async () => {
    data.providers[0].configured = false;
    data.providers[0].suffix = null;
    data.providers[0].testedModels = [];
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Test connection' }));
  await screen.findByText('Connection tested');
  expect(api.testProviderKey).toHaveBeenCalledWith('openai', 'gpt-6-astra');
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  expect(api.removeProviderKey).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await screen.findByText('No personal key');
  expect(api.removeProviderKey).toHaveBeenCalledWith('openai');
});

it('saves the account default and invalidates model availability', async () => {
  vi.mocked(api.updateAISettings).mockImplementation(async (selection) => {
    data.defaultGeneration = selection;
    return selection;
  });
  client.setQueryData(['user', 'alice', 'models'], []);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  mount();
  const select = await screen.findByLabelText('Generation model');
  fireEvent.change(select, { target: { value: 'openai:gpt-6-astra' } });
  await waitFor(() =>
    expect(api.updateAISettings).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt-6-astra' }),
  );
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['user', 'alice', 'models'] }),
  );
});

it('shows configuration and provider errors without losing the settings page', async () => {
  data.keysEnabled = false;
  const view = mount();
  const add = await screen.findByRole('button', { name: 'Add key' });
  expect((add as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/administrator configures key encryption/)).toBeTruthy();
  view.unmount();
  client.clear();
  data.keysEnabled = true;
  data.providers[0].configured = true;
  vi.mocked(api.testProviderKey).mockRejectedValue(new Error('The provider rejected your key.'));
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Test connection' }));
  expect((await screen.findByRole('alert')).textContent).toContain('provider rejected');
});
