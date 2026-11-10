'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import {
  ApiError,
  connectSession,
  getSession,
  getServerSession,
  subscribeSession,
} from '@/lib/session';
import type { StudyPill } from '@/lib/types';

export function useSession() {
  return useSyncExternalStore(subscribeSession, getSession, getServerSession);
}

export function createQueryClient() {
  const statuses = new Map<string, StudyPill['status']>();
  const queryCache = new QueryCache({
    onError(error, query) {
      if (query.state.data !== undefined && !(error instanceof ApiError && error.status === 401)) {
        toast.error(error.message, { id: `query:${query.queryHash}` });
      }
    },
    onSuccess(data, query) {
      toast.dismiss(`query:${query.queryHash}`);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== 'object' || !('id' in item) || !('status' in item)) continue;
        const pill = item as StudyPill;
        const key = `${String(query.queryKey[1])}:${pill.id}`;
        const previous = statuses.get(key);
        statuses.set(key, pill.status);
        if (previous && ['queued', 'processing'].includes(previous)) {
          if (pill.status === 'ready')
            toast.success('Your Study Pill is ready.', { id: `complete:${key}` });
          if (pill.status === 'failed')
            toast.warning('Generation stopped. Open the Study Pill to retry.', {
              id: `complete:${key}`,
            });
        }
      }
    },
  });
  queryCache.subscribe((event) => {
    if (event.type === 'removed') statuses.clear();
  });
  return new QueryClient({
    queryCache,
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (count, error) => count < 2 && (!(error instanceof ApiError) || error.status >= 500),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: { retry: false },
    },
  });
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(createQueryClient);
  const path = usePathname();
  const needsSession =
    /^\/(workspace|pills|login|register|verify-email|verify-google-email|forgot-password|reset-password|auth)(\/|$)/u.test(
      path,
    );
  useEffect(() => {
    let previousUser = getSession().user?.id;
    // Old browser data must never be attributed to a newly authenticated user.
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('noteesta-chat:') || key.startsWith('noteesta-generation:'))
          localStorage.removeItem(key);
      }
    } catch {
      /* Storage may be disabled by the browser. */
    }
    const unsubscribe = subscribeSession(() => {
      const nextUser = getSession().user?.id;
      if (previousUser !== nextUser) {
        void client.cancelQueries();
        client.clear();
        try {
          for (const key of Object.keys(localStorage)) {
            if (key.startsWith('noteesta:v2:chat:')) localStorage.removeItem(key);
          }
        } catch {
          /* Private state still clears from memory. */
        }
        toast.dismiss();
      }
      previousUser = nextUser;
    });
    return unsubscribe;
  }, [client]);
  useEffect(() => (needsSession ? connectSession() : undefined), [needsSession]);
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        position="bottom-right"
        closeButton
        toastOptions={{
          style: { background: 'var(--panel)', color: 'var(--ink)', borderColor: 'var(--line)' },
        }}
      />
    </QueryClientProvider>
  );
}
