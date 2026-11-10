import type {
  ChatAnswer,
  Collection,
  CollectionColor,
  CreatePillInput,
  GenerationOption,
  LibraryEntry,
  StudyPill,
  ThreeDCode,
} from '@/lib/types';
import { getPreferredGeneration } from '@/lib/generation-preference';
import { authenticatedFetch, sessionEpoch } from '@/lib/session';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(path, init);
  const started = sessionEpoch();

  if (response.status === 204) return undefined as T;

  const body = (await response.json()) as T;
  if (started !== sessionEpoch()) throw new DOMException('Session changed', 'AbortError');
  return body;
}

export async function listPills(signal?: AbortSignal): Promise<StudyPill[]> {
  return request<StudyPill[]>('/pills', { signal });
}

export async function updatePill(
  id: string,
  changes: {
    title?: string;
    description?: string | null;
    tags?: string[];
    collectionId?: string | null;
  },
): Promise<StudyPill> {
  return request<StudyPill>(`/pills/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
}

export async function movePillsToCollection(
  pillIds: string[],
  collectionId: string | null,
): Promise<StudyPill[]> {
  return request<StudyPill[]>('/pills/bulk/collection', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pillIds, collectionId }),
  });
}

export async function listCollections(signal?: AbortSignal): Promise<Collection[]> {
  return request<Collection[]>('/collections', { signal });
}

export async function createCollection(input: {
  name: string;
  color: CollectionColor;
}): Promise<Collection> {
  return request<Collection>('/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function updateCollection(
  id: string,
  changes: { name?: string; color?: CollectionColor },
): Promise<Collection> {
  return request<Collection>(`/collections/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
}

export async function deleteCollection(id: string): Promise<void> {
  await request<void>(`/collections/${id}`, { method: 'DELETE' });
}

export async function listLibrary(signal?: AbortSignal): Promise<LibraryEntry[]> {
  return request<LibraryEntry[]>('/library', { signal });
}

export async function deleteLibraryOriginal(sourceId: string): Promise<LibraryEntry> {
  return request<LibraryEntry>(`/library/${sourceId}`, { method: 'DELETE' });
}

export async function libraryDownloadUrl(sourceId: string): Promise<string> {
  const result = await request<{ url: string }>(`/library/${sourceId}/download-url`);
  return result.url;
}

export async function getPill(id: string, signal?: AbortSignal): Promise<StudyPill> {
  return request<StudyPill>(`/pills/${id}`, { signal });
}

export async function getThreeDCode(id: string, signal?: AbortSignal): Promise<ThreeDCode> {
  return request<ThreeDCode>(`/pills/${id}/three-d`, { signal });
}

export async function createPill(input: CreatePillInput): Promise<StudyPill> {
  const form = new FormData();
  const generation = input.generation ?? getPreferredGeneration();
  if (generation) {
    form.set('generation_provider', generation.provider);
    form.set('generation_model', generation.model);
  }
  form.set('title', input.title);
  form.set('subject', input.subject);
  form.set('youtube_url', input.youtubeUrl ?? '');
  form.set('selected_materials', JSON.stringify(input.selectedMaterials));
  form.set('detail_level', input.detailLevel);
  form.set('learner_level', input.learnerLevel);
  form.set('target_exam_date', input.targetExamDate ?? '');
  form.set('study_hours_per_day', input.studyHoursPerDay?.toString() ?? '');
  input.files.forEach((file) => form.append('files', file));

  return request<StudyPill>('/pills', { method: 'POST', body: form });
}

export async function listGenerationOptions(signal?: AbortSignal): Promise<GenerationOption[]> {
  return request<GenerationOption[]>('/models', { signal });
}

export async function askPill(id: string, question: string): Promise<ChatAnswer> {
  return request<ChatAnswer>(`/pills/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
}

export async function retryPill(id: string): Promise<StudyPill> {
  return request<StudyPill>(`/pills/${id}/retry`, { method: 'POST' });
}

export async function exportPill(id: string): Promise<Blob> {
  const response = await authenticatedFetch(`/pills/${id}/export`, { method: 'POST' });
  return response.blob();
}
