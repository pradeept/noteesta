'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import { useSession } from '@/components/app-providers';
import * as api from '@/lib/api';
import { sessionEpoch } from '@/lib/session';
import type { Collection, CreatePillInput, StudyPill } from '@/lib/types';

export const keys = {
  root: (userId?: string) => ['user', userId] as const,
  pills: (userId?: string) => ['user', userId, 'pills'] as const,
  pill: (userId: string | undefined, id: string) => ['user', userId, 'pill', id] as const,
  collections: (userId?: string) => ['user', userId, 'collections'] as const,
  library: (userId?: string) => ['user', userId, 'library'] as const,
};
const active = (pill: StudyPill) => ['queued', 'processing'].includes(pill.status);

export function usePills() {
  const { user } = useSession();
  return useQuery({
    queryKey: keys.pills(user?.id),
    enabled: Boolean(user),
    queryFn: ({ signal }) => api.listPills(signal),
    refetchInterval: (query) => (query.state.data?.some(active) ? 5000 : false),
  });
}

export function usePill(id: string, enabled = true) {
  const { user } = useSession();
  const client = useQueryClient();
  return useQuery({
    queryKey: keys.pill(user?.id, id),
    enabled: Boolean(user) && enabled,
    queryFn: async ({ signal }) => {
      const pill = await api.getPill(id, signal);
      client.setQueryData<StudyPill[]>(keys.pills(user?.id), (items) =>
        items?.map((item) => (item.id === pill.id ? pill : item)),
      );
      return pill;
    },
    refetchInterval: (query) => (query.state.data && active(query.state.data) ? 2000 : false),
  });
}

export function useCollections() {
  const { user } = useSession();
  return useQuery({
    queryKey: keys.collections(user?.id),
    enabled: Boolean(user),
    queryFn: ({ signal }) => api.listCollections(signal),
  });
}

export function useLibrary(enabled = true) {
  const { user } = useSession();
  return useQuery({
    queryKey: keys.library(user?.id),
    enabled: Boolean(user) && enabled,
    queryFn: ({ signal }) => api.listLibrary(signal),
  });
}

export function useModels() {
  const { user } = useSession();
  return useQuery({
    queryKey: [...keys.root(user?.id), 'models'],
    enabled: Boolean(user),
    queryFn: ({ signal }) => api.listGenerationOptions(signal),
    staleTime: 300_000,
  });
}

export function useAISettings() {
  const { user } = useSession();
  return useQuery({
    queryKey: [...keys.root(user?.id), 'ai-settings'],
    enabled: Boolean(user),
    queryFn: ({ signal }) => api.getAISettings(signal),
  });
}

export function useThreeD(id: string, enabled: boolean) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...keys.root(user?.id), 'three-d', id],
    enabled: Boolean(user) && enabled,
    queryFn: ({ signal }) => api.getThreeDCode(id, signal),
  });
}

// Event callbacks can update the shared cache without retaining another copy in component state.
export function useCachedSetter<T>(key: readonly unknown[]): Dispatch<SetStateAction<T[]>> {
  const client = useQueryClient();
  return (value) => {
    client.setQueryData<T[]>(key, (current) =>
      typeof value === 'function' ? value(current ?? []) : value,
    );
  };
}

export function useWorkspaceMutations() {
  const { user } = useSession();
  const client = useQueryClient();
  const invalidate = async (...domains: string[]) => {
    await Promise.all(
      domains.map((domain) =>
        client.invalidateQueries({ queryKey: [...keys.root(user?.id), domain] }),
      ),
    );
  };
  const savePill = (pill: StudyPill) => {
    client.setQueryData(keys.pill(user?.id, pill.id), pill);
    client.setQueryData<StudyPill[]>(keys.pills(user?.id), (items) => [
      pill,
      ...(items ?? []).filter((item) => item.id !== pill.id),
    ]);
  };
  const guarded = async <T>(callback: () => Promise<T>) => {
    const started = sessionEpoch();
    const result = await callback();
    if (started !== sessionEpoch()) throw new DOMException('Session changed', 'AbortError');
    return result;
  };
  const create = useMutation({
    mutationFn: (input: CreatePillInput) => guarded(() => api.createPill(input)),
    onSuccess: (pill) => {
      savePill(pill);
      void invalidate('pills', 'library');
    },
  });
  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Parameters<typeof api.updatePill>[1] }) =>
      guarded(() => api.updatePill(id, changes)),
    onSuccess: (pill) => {
      savePill(pill);
      void invalidate('pills', 'collections');
    },
  });
  const retry = useMutation({
    mutationFn: (id: string) => guarded(() => api.retryPill(id)),
    onSuccess: (pill) => {
      savePill(pill);
      void invalidate('pills', 'three-d');
    },
  });
  const move = useMutation({
    mutationFn: ({ ids, collectionId }: { ids: string[]; collectionId: string | null }) =>
      guarded(() => api.movePillsToCollection(ids, collectionId)),
    onSuccess: (pills) => {
      pills.forEach(savePill);
      void invalidate('pills', 'collections');
    },
  });
  const removeCollection = useMutation({
    mutationFn: (id: string) => guarded(() => api.deleteCollection(id)),
    onSuccess: () => invalidate('pills', 'pill', 'collections'),
  });
  const saveCollection = useMutation({
    mutationFn: (input: { id?: string; name: string; color: Collection['color'] }) =>
      guarded(() =>
        input.id ? api.updateCollection(input.id, input) : api.createCollection(input),
      ),
    onSuccess: () => invalidate('collections'),
  });
  const removeOriginal = useMutation({
    mutationFn: (id: string) => guarded(() => api.deleteLibraryOriginal(id)),
    onSuccess: () => invalidate('library', 'pills', 'pill'),
  });
  const chat = useMutation({
    mutationFn: ({ id, question }: { id: string; question: string }) =>
      guarded(() => api.askPill(id, question)),
  });
  const exportPack = useMutation({ mutationFn: (id: string) => guarded(() => api.exportPill(id)) });
  const download = useMutation({
    mutationFn: (id: string) => guarded(() => api.libraryDownloadUrl(id)),
  });
  return {
    create,
    update,
    retry,
    move,
    removeCollection,
    saveCollection,
    removeOriginal,
    chat,
    exportPack,
    download,
  };
}
