'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

type ViewerAction = 'reset' | 'zoom-in' | 'zoom-out';

const subscribeToOrigin = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => '';

function documentForScene(origin: string, javascript: string): string {
  const code = javascript.replace(/<\/script/gi, '<\\/script');
  const policy = [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${origin}`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#scene{width:100%;height:100%;margin:0;overflow:hidden}#scene{position:relative}.scene-label{position:absolute;transform:translate(-50%,-50%);padding:4px 8px;border-radius:6px;background:#fffdf2e8;color:#243222;font:600 12px system-ui;white-space:nowrap;pointer-events:none;box-shadow:0 2px 10px #0002}canvas{display:block}</style></head><body><div id="scene"></div><script src="${origin}/three-artifact-runtime.js"></script><script>${code}</script><script>try{window.NoteestaThreeRuntime.start(buildArtifact)}catch(error){window.parent.postMessage({type:'noteesta-3d',status:'error'},'*')}</script></body></html>`;
}

export function ThreeDViewer({ javascript, title }: { javascript: string; title: string }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const origin = useSyncExternalStore(subscribeToOrigin, getOrigin, getServerOrigin);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const document = useMemo(
    () => (origin ? documentForScene(origin, javascript) : undefined),
    [origin, javascript],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframe.current?.contentWindow || event.data?.type !== 'noteesta-3d')
        return;
      if (event.data.status === 'ready' || event.data.status === 'error')
        setState(event.data.status);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [document]);

  function control(action: ViewerAction) {
    iframe.current?.contentWindow?.postMessage({ type: 'noteesta-3d-control', action }, '*');
  }

  return (
    <div className="three-d-viewer">
      <div className="three-d-frame-wrap">
        {document ? (
          <iframe
            ref={iframe}
            title={title}
            srcDoc={document}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : null}
        {state !== 'ready' ? (
          <p className="three-d-frame-status" role="status">
            {state === 'error'
              ? 'This 3D model could not render in your browser. Use the description and sources below.'
              : 'Loading interactive model…'}
          </p>
        ) : null}
      </div>
      <div className="three-d-controls">
        <p>Drag to rotate · right-drag or two fingers to pan · scroll or pinch to zoom</p>
        <div>
          <button type="button" onClick={() => control('zoom-out')} aria-label="Zoom 3D model out">
            −
          </button>
          <button type="button" onClick={() => control('zoom-in')} aria-label="Zoom 3D model in">
            +
          </button>
          <button type="button" onClick={() => control('reset')}>
            Reset view
          </button>
        </div>
      </div>
    </div>
  );
}
