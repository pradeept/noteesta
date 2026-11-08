import type { GenerationSelection } from '@/lib/types';

const userId = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? 'demo-user';
const key = `noteesta-generation:${userId}`;

export function getPreferredGeneration(): GenerationSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (
      value &&
      typeof value === 'object' &&
      'provider' in value &&
      'model' in value &&
      ['ollama', 'openai', 'anthropic'].includes(String(value.provider)) &&
      typeof value.model === 'string'
    )
      return value as GenerationSelection;
  } catch {
    // Ignore an outdated or invalid local preference.
  }
  return null;
}

export function setPreferredGeneration(value: GenerationSelection): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The active page still keeps the selection when storage is unavailable.
  }
}
