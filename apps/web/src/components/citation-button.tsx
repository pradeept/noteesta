'use client';

import type { Citation } from '@/lib/types';

export function CitationButton({
  citation,
  index,
  onOpen,
}: {
  citation: Citation;
  index: number;
  onOpen: (citation: Citation) => void;
}) {
  return (
    <button
      type="button"
      className="citation-button"
      aria-label={`Open source ${index}: ${citation.sourceName}, ${citation.locator}`}
      onClick={() => onOpen(citation)}
    >
      {index}
    </button>
  );
}
