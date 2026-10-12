'use client';

import { ArrowRightIcon, ArrowsOutSimpleIcon } from '@phosphor-icons/react';
import type { VisualSpec } from '@/lib/types';

export function FlowVisual({ visual, onExpand }: { visual: VisualSpec; onExpand: () => void }) {
  const hasContent =
    visual.kind === 'bar' ? Boolean(visual.data?.length) : Boolean(visual.nodes?.length);
  if (!hasContent) return null;

  return (
    <figure className="visual-block">
      <div className="visual-heading">
        <div>
          <p className="visual-title">{visual.title}</p>
          <p className="visual-kind">{visualLabel(visual.kind)}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onExpand}
          aria-label="Enlarge visual"
        >
          <ArrowsOutSimpleIcon size={18} />
        </button>
      </div>
      <button
        type="button"
        className="visual-open-button"
        onClick={onExpand}
        aria-label={`Enlarge ${visual.title}`}
      >
        <VisualCanvas visual={visual} />
      </button>
      <figcaption>{visual.description}</figcaption>
    </figure>
  );
}

export function VisualCanvas({ visual }: { visual: VisualSpec }) {
  if (visual.kind === 'bar' && visual.data?.length) {
    const maximum = Math.max(...visual.data.map((item) => Math.abs(item.value)), 1);
    return (
      <div className="bar-canvas" role="img" aria-label={visual.description}>
        {visual.data.slice(0, 6).map((item) => (
          <div className="bar-row" key={item.label}>
            <span>{item.label}</span>
            <i aria-hidden="true">
              <b style={{ width: `${Math.max(3, (Math.abs(item.value) / maximum) * 100)}%` }} />
            </i>
            <strong>
              {item.value.toLocaleString()}
              {item.unit ? ` ${item.unit}` : ''}
            </strong>
          </div>
        ))}
      </div>
    );
  }

  const nodes = (visual.nodes ?? []).slice(0, 6);
  if (!nodes.length) return null;
  const long = nodes.length > 3;

  return (
    <div
      className={long ? 'flow-canvas long' : 'flow-canvas'}
      role="img"
      aria-label={visual.description}
    >
      {nodes.map((node, index) => {
        const next = nodes[index + 1];
        const labels = next
          ? (visual.edges ?? [])
              .filter(
                (edge) =>
                  (edge.from === node.id && edge.to === next.id) ||
                  (edge.from === next.id && edge.to === node.id),
              )
              .map((edge) => edge.label)
          : [];
        return (
          <div className="visual-sequence-item" key={node.id}>
            <span className={index % 2 ? 'flow-node secondary' : 'flow-node'}>
              <strong>{node.label}</strong>
              <small>{node.detail}</small>
            </span>
            {next ? (
              <span className="flow-connector" aria-hidden="true">
                <span>{labels.join(' · ') || 'Next'}</span>
                <ArrowRightIcon size={18} weight="bold" />
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function visualLabel(kind: VisualSpec['kind']) {
  if (kind === 'bar') return 'Source data chart';
  if (kind === 'timeline') return 'Timeline';
  return 'Concept map';
}
