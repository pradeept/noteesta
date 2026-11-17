import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';
import { SamplePillJourney } from '@/components/sample-pill-journey';
import { publicPageMetadata } from '@/lib/seo';
import './sample-pill.css';

export const metadata = publicPageMetadata(
  'Photosynthesis Study Pill Demo | Noteesta',
  'Explore cited photosynthesis notes, interactive visuals, a 3D chloroplast, flashcards, and quizzes. Try the Noteesta sample without an account.',
  '/app',
);

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
