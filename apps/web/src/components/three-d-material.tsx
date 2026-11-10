'use client';

import { useThreeD } from '@/lib/queries';
import { CitationButton } from '@/components/citation-button';
import { ThreeDViewer } from '@/components/three-d-viewer';
import { demoThreeDJavaScript } from '@/lib/fixtures';
import type { Citation, ThreeDMetadata } from '@/lib/types';

export function ThreeDMaterial({
  pillId,
  metadata,
  isDemo,
  onCitation,
}: {
  pillId: string;
  metadata?: ThreeDMetadata | null;
  isDemo: boolean;
  onCitation: (citation: Citation) => void;
}) {
  const query = useThreeD(pillId, !isDemo && metadata?.status === 'ready');
  const javascript = isDemo ? demoThreeDJavaScript : query.data?.javascript;
  const error = query.error?.message;

  if (!metadata || metadata.status === 'unavailable') {
    return (
      <section className="three-d-material" aria-label="Interactive 3D model">
        <h2>Interactive 3D</h2>
        <p>{metadata?.reason ?? 'No 3D model is available. Regenerate this Pill to try again.'}</p>
      </section>
    );
  }

  return (
    <section className="three-d-material" aria-label="Interactive 3D model">
      <h2>{metadata.title ?? 'Interactive 3D'}</h2>
      <p>{metadata.description}</p>
      {javascript ? (
        <ThreeDViewer javascript={javascript} title={metadata.title ?? 'Interactive 3D model'} />
      ) : (
        <p role="status">{error || 'Loading saved 3D model…'}</p>
      )}
      {metadata.citations.length ? (
        <div className="material-citations">
          <span>Sources</span>
          {metadata.citations.map((citation, index) => (
            <CitationButton
              key={`${citation.sourceId}-${citation.locator}`}
              citation={citation}
              index={index + 1}
              onOpen={onCitation}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
