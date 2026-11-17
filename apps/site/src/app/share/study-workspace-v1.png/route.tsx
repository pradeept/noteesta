import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
const size = { width: 1200, height: 630 };

const fontFiles = Promise.all([
  readFile(join(process.cwd(), 'node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf')),
  readFile(join(process.cwd(), 'node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf')),
]);

export async function GET() {
  const [regular, bold] = await fontFiles;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '52px 64px',
        background: '#173222',
        color: '#f8faf7',
        fontFamily: 'Geist',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: '#e8f1e8',
            color: '#173222',
            fontSize: 36,
            fontWeight: 700,
          }}
        >
          n
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em' }}>noteesta</div>
        <div style={{ marginLeft: 'auto', fontSize: 23, color: '#c0d5c2' }}>
          Open source. Self-hosted. Yours.
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 43,
          fontSize: 82,
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: '-0.035em',
        }}
      >
        <div>Make sense of</div>
        <div style={{ color: '#c0d5c2' }}>what you study.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28, fontSize: 30 }}>
        <div>An open-source alternative to</div>
        <div>Turbo AI &amp; Google NotebookLM.</div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 'auto',
          paddingTop: 22,
          borderTop: '1px solid #526659',
          fontSize: 23,
          color: '#c0d5c2',
        }}
      >
        <div>Source-linked notes · Visuals · Practice</div>
        <div>noteesta.com</div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Geist', data: regular, weight: 400, style: 'normal' },
        { name: 'Geist', data: bold, weight: 700, style: 'normal' },
      ],
    },
  );
}
