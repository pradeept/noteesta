// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { keys, usePills, useWorkspaceMutations } from '@/lib/queries';
import * as api from '@/lib/api';
import type { StudyPill } from '@/lib/types';

const identity = vi.hoisted(() => ({ user: { id: 'student-1' } as { id: string } | null }));
vi.mock('@/components/app-providers', () => ({ useSession: () => identity }));
vi.mock('@/lib/api', () => ({
  listPills: vi.fn(),
  createPill: vi.fn(),
  retryPill: vi.fn(),
  deleteCollection: vi.fn(),
  updatePill: vi.fn(),
  movePillsToCollection: vi.fn(),
  updateCollection: vi.fn(),
  createCollection: vi.fn(),
  deleteLibraryOriginal: vi.fn(),
  askPill: vi.fn(),
  exportPill: vi.fn(),
  libraryDownloadUrl: vi.fn(),
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  identity.user = { id: 'student-1' };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 30_000 } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
});

it('deduplicates observers and namespaces private data by user', async () => {
  vi.mocked(api.listPills).mockResolvedValue([]);
  renderHook(
    () => {
      usePills();
      return usePills();
    },
    { wrapper },
  );
  await waitFor(() => expect(client.getQueryData(keys.pills('student-1'))).toEqual([]));
  expect(api.listPills).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(keys.pills('student-2'))).toBeUndefined();
  expect(vi.mocked(api.listPills).mock.calls[0][0]).toBeInstanceOf(AbortSignal);
});

it('does not fetch private data before session initialization', async () => {
  identity.user = null;
  const hook = renderHook(() => usePills(), { wrapper });
  expect(hook.result.current.fetchStatus).toBe('idle');
  expect(api.listPills).not.toHaveBeenCalled();
});

it('updates list/detail caches and invalidates only dependent domains after retry', async () => {
  const pill = { id: 'pill-1', status: 'queued' } as StudyPill;
  vi.mocked(api.retryPill).mockResolvedValue(pill);
  client.setQueryData(keys.pills('student-1'), [{ ...pill, status: 'failed' }]);
  client.setQueryData(['user', 'student-1', 'three-d', 'pill-1'], { javascript: 'old scene' });
  client.setQueryData(['user', 'student-1', 'models'], []);
  const hook = renderHook(() => useWorkspaceMutations(), { wrapper });
  await act(async () => {
    await hook.result.current.retry.mutateAsync('pill-1');
  });
  expect(client.getQueryData(keys.pill('student-1', 'pill-1'))).toEqual(pill);
  expect(client.getQueryData(keys.pills('student-1'))).toEqual([pill]);
  expect(client.getQueryState(['user', 'student-1', 'three-d', 'pill-1'])?.isInvalidated).toBe(
    true,
  );
  expect(client.getQueryState(['user', 'student-1', 'models'])?.isInvalidated).toBe(false);
});

it('invalidates source and pill queries after deleting an original', async () => {
  vi.mocked(api.deleteLibraryOriginal).mockResolvedValue({ sourceId: 'source-1' } as Awaited<
    ReturnType<typeof api.deleteLibraryOriginal>
  >);
  client.setQueryData(keys.library('student-1'), []);
  client.setQueryData(keys.pills('student-1'), []);
  client.setQueryData(keys.pill('student-1', 'pill-1'), { id: 'pill-1' });
  const hook = renderHook(() => useWorkspaceMutations(), { wrapper });
  await act(async () => {
    await hook.result.current.removeOriginal.mutateAsync('source-1');
  });
  expect(client.getQueryState(keys.library('student-1'))?.isInvalidated).toBe(true);
  expect(client.getQueryState(keys.pill('student-1', 'pill-1'))?.isInvalidated).toBe(true);
});
