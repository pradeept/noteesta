import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';
import { demoPill } from '@/lib/fixtures';

export const metadata: Metadata = {
  title: 'Noteesta — Make sense of what you study',
  description:
    'Noteesta turns your chosen class materials into a Study Pill: clear notes, source references, visuals, and optional ways to practise.',
  alternates: { canonical: '/', types: { 'text/markdown': '/llm' } },
  openGraph: {
    title: 'Noteesta — Make sense of what you study',
    description:
      'From scattered class materials to a Study Pill you can read, understand, and revisit.',
    type: 'website',
    url: '/',
  },
};

export default function Home() {
  const sample = demoPill.artifact;

  return (
    <div className="marketing-page">
      <a className="marketing-skip" href="#main-content">
        Skip to content
      </a>
      <header className="marketing-header">
        <Link className="marketing-wordmark" href="/" aria-label="Noteesta home">
          <span className="marketing-mark" aria-hidden="true">
            n
          </span>
          <span>noteesta</span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#our-direction">What comes next</a>
          <Link className="marketing-nav-demo" href="/app">
            Explore the sample <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>

      <main id="main-content">
        <section className="marketing-hero" aria-labelledby="hero-title">
          <div className="marketing-hero-copy">
            <p className="marketing-intro">A clearer way to learn from what you already have.</p>
            <h1 id="hero-title">
              Make sense of
              <br />
              <em>what you study.</em>
            </h1>
            <p className="marketing-lead">
              A lecture recording, a PDF, a page of handwritten notes. Bring the pieces together in
              one Study Pill with readable notes, references you can follow, and practice when you
              need it.
            </p>
            <div className="marketing-hero-actions">
              <Link className="marketing-button marketing-button-primary" href="/app">
                Explore a sample Study Pill <span aria-hidden="true">↗</span>
              </Link>
              <a className="marketing-text-link" href="#how-it-works">
                See how it fits your day <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="marketing-availability">
              A read-only example. No account or upload needed.
            </p>
          </div>

          <div className="marketing-hero-art" aria-label="Preview of the photosynthesis Study Pill">
            <div className="marketing-source-strip" aria-hidden="true">
              <span>Lecture recording</span>
              <span>Class slides</span>
              <span>Handwritten notes</span>
            </div>
            <div className="marketing-product-window">
              <div className="marketing-window-top">
                <span className="marketing-window-brand">
                  noteesta <b>/</b> Biology
                </span>
                <span className="marketing-window-dots" aria-hidden="true">
                  ● ● ●
                </span>
              </div>
              <div className="marketing-window-body">
                <div className="marketing-window-label">Study Pill · Example</div>
                <h2>{demoPill.title}</h2>
                <p>{sample?.summary}</p>
                <div className="marketing-window-rule" />
                <div className="marketing-window-section">
                  <span className="marketing-section-icon" aria-hidden="true">
                    ↗
                  </span>
                  <div>
                    <strong>First, the bigger picture</strong>
                    <span>Light reactions capture energy. The Calvin cycle puts it to work.</span>
                  </div>
                </div>
                <div className="marketing-window-section">
                  <span className="marketing-section-icon" aria-hidden="true">
                    ◎
                  </span>
                  <div>
                    <strong>Energy flow through photosynthesis</strong>
                    <span>A visual connected to the selected sources.</span>
                  </div>
                </div>
                <div className="marketing-window-footer">
                  <span>Sources linked throughout</span>
                  <span>Notes · Visuals · Practice</span>
                </div>
              </div>
            </div>
            <div className="marketing-art-caption">
              A real example from Noteesta’s sample content
            </div>
          </div>
        </section>

        <section className="marketing-day" id="how-it-works" aria-labelledby="day-title">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">For an ordinary study day</p>
            <h2 id="day-title">
              Less gathering.
              <br />
              More understanding.
            </h2>
          </div>
          <div className="marketing-day-list">
            <article>
              <span className="marketing-day-time">After class</span>
              <div>
                <h3>Gather the pieces</h3>
                <p>
                  Choose the recording, slides, or notes you want to study together. The Study Pill
                  stays tied to those sources.
                </p>
              </div>
            </article>
            <article>
              <span className="marketing-day-time">Between classes</span>
              <div>
                <h3>Find the thread</h3>
                <p>
                  Read a structured explanation, follow a source reference, and see a flow visual
                  when it clarifies the idea.
                </p>
              </div>
            </article>
            <article>
              <span className="marketing-day-time">Before the exam</span>
              <div>
                <h3>Make it stick</h3>
                <p>
                  Return to the note, then use the flashcards, questions, or roadmap you selected
                  for revision.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="marketing-walkthrough" aria-labelledby="walkthrough-title">
          <div className="marketing-walkthrough-copy">
            <p className="marketing-kicker">Watch the product</p>
            <h2 id="walkthrough-title">See Noteesta in action.</h2>
            <p>
              Watch the Noteesta demo, then explore the read-only Study Pill to follow its sources,
              notes, visual explanation, and practice at your own pace.
            </p>
            <Link className="marketing-text-link" href="/app">
              Open the example note <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="marketing-video-frame">
            <iframe
              className="marketing-video"
              src="https://www.youtube.com/embed/_2Bphk7JLCk"
              title="Noteesta - Hacktoberfest 2026 demo video"
              width="960"
              height="540"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
            <a
              className="marketing-video-link"
              href="https://youtu.be/_2Bphk7JLCk"
              target="_blank"
              rel="noreferrer"
            >
              Watch on YouTube <span aria-hidden="true">↗</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </section>

        <section className="marketing-vision" id="our-direction" aria-labelledby="vision-title">
          <div className="marketing-vision-top">
            <p className="marketing-kicker">Where Noteesta is going</p>
            <span>Study Pills are the beginning.</span>
          </div>
          <h2 id="vision-title">
            Knowledge keeps growing.
            <br />
            <em>Learning should grow with it.</em>
          </h2>
          <p className="marketing-vision-lead">
            Noteesta is becoming a family of tools for learning and studying. The aim is to help
            people turn information into understanding they can inspect, practise, and explain.
          </p>
          <div className="marketing-vision-grid">
            <article>
              <span>Available in the current product</span>
              <h3>Learn from your sources</h3>
              <p>
                Study Pills bring supported class materials into notes with references, flow
                visuals, and optional revision tools.
              </p>
            </article>
            <article>
              <span>Planned next</span>
              <h3>Learn from the web</h3>
              <p>
                Bring a website or library documentation link and get a useful summary of the
                concepts it explains.
              </p>
            </article>
            <article>
              <span>Exploring for the future</span>
              <h3>See ideas take shape</h3>
              <p>
                Interactive 3D concept artifacts with Three.js, quick visual prototypes, and
                eventually immersive ways to learn.
              </p>
            </article>
          </div>
        </section>

        <section className="marketing-origin" aria-labelledby="origin-title">
          <div className="marketing-origin-image">
            <Image
              src="/noteesta-story.jpg"
              alt="Illustration of two students studying together at a desk"
              width={1400}
              height={584}
              sizes="(max-width: 800px) 100vw, 55vw"
              loading="eager"
            />
          </div>
          <div className="marketing-origin-copy">
            <p className="marketing-kicker">The beginning</p>
            <h2 id="origin-title">Made for people I know.</h2>
            <p>
              Noteesta started as a study pal for my two sisters, who were juggling class
              references, handwritten notes, and videos. Their day-to-day experience still shapes
              the first product—and the care behind what comes next.
            </p>
          </div>
        </section>

        <section className="marketing-close" aria-labelledby="close-title">
          <p>Start with one lesson.</p>
          <h2 id="close-title">See what a Study Pill feels like.</h2>
          <Link className="marketing-button marketing-button-light" href="/app">
            Explore the sample <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
