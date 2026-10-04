import { describe, expect, it } from 'vitest';
import { demoPill } from '@/lib/fixtures';

describe('demo Study Pill', () => {
  it('keeps every generated learning item tied to a known source', () => {
    const sourceIds = new Set(demoPill.sources.map((source) => source.id));
    const artifact = demoPill.artifact;

    expect(artifact).toBeDefined();
    const citedItems = [
      ...(artifact?.sections ?? []),
      ...(artifact?.visuals ?? []),
      ...(artifact?.flashcards ?? []),
      ...(artifact?.mcqs ?? []),
      ...(artifact?.trueFalse ?? []),
    ];

    for (const item of citedItems) {
      expect(item.citations.length).toBeGreaterThan(0);
      expect(item.citations.every((citation) => sourceIds.has(citation.sourceId))).toBe(true);
    }
  });

  it('only exposes tabs selected for the Study Pill', () => {
    expect(demoPill.selectedMaterials).toEqual([
      'notes',
      'flashcards',
      'mcqs',
      'trueFalse',
      'roadmap',
    ]);
  });
});
