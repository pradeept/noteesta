import type {
  ChatAnswer,
  Collection,
  CollectionColor,
  CreatePillInput,
  LibraryEntry,
  StudyPill,
} from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';
const USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? 'demo-user';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('X-User-Id', USER_ID);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

export async function listPills(): Promise<StudyPill[]> {
  return request<StudyPill[]>('/pills');
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

export async function listCollections(): Promise<Collection[]> {
  return request<Collection[]>('/collections');
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

export async function listLibrary(): Promise<LibraryEntry[]> {
  return request<LibraryEntry[]>('/library');
}

export async function deleteLibraryOriginal(sourceId: string): Promise<LibraryEntry> {
  return request<LibraryEntry>(`/library/${sourceId}`, { method: 'DELETE' });
}

export function libraryDownloadUrl(sourceId: string): string {
  return `${API_URL}/library/${sourceId}/download`;
}

export async function getPill(id: string): Promise<StudyPill> {
  return request<StudyPill>(`/pills/${id}`);
}

export async function createPill(input: CreatePillInput): Promise<StudyPill> {
  const form = new FormData();
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
  const response = await fetch(`${API_URL}/pills/${id}/export`, {
    method: 'POST',
    headers: { 'X-User-Id': USER_ID },
  });
  if (!response.ok) throw new Error('The export could not be prepared.');
  return response.blob();
}
