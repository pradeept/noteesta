import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';
import { SamplePillJourney } from '@/components/sample-pill-journey';
import './sample-pill.css';

export const metadata: Metadata = {
  title: 'Example Study Pill — Photosynthesis | Noteesta',
  description:
    'Try a simulated upload, choose your study materials, and explore cited photosynthesis notes, interactive visuals, a 3D chloroplast, and practice.',
  alternates: { canonical: '/app', types: { 'text/markdown': '/llm' } },
  openGraph: {
    title: 'Explore a Noteesta Study Pill',
    description:
      'From sample sources to a Study Pill. Take the journey, then explore at your pace.',
    type: 'website',
    url: '/app',
  },
};

export default function PublicDemo() {
  return (
    <div className="demo-page sample-page">
      <a className="marketing-skip" href="#demo-main">
        Skip to the sample
      </a>
      <header className="demo-header sample-header">
        <Link className="marketing-wordmark" href="/" aria-label="Noteesta home">
          <span className="marketing-mark" aria-hidden="true">
            n
          </span>
          <span>noteesta</span>
        </Link>
        <span className="sample-badge">The interactive demo</span>
      </header>
      <main id="demo-main" tabIndex={-1}>
        <SamplePillJourney />
      </main>
      <SiteFooter />
    </div>
  );
}
