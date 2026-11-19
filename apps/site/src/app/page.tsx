import Link from 'next/link';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowUpRight';
import { BookOpenIcon } from '@phosphor-icons/react/dist/ssr/BookOpen';
import { FilePdfIcon } from '@phosphor-icons/react/dist/ssr/FilePdf';
import { FlowArrowIcon } from '@phosphor-icons/react/dist/ssr/FlowArrow';
import { GithubMark } from '@/components/icons/github-mark';
import { MicrophoneIcon } from '@phosphor-icons/react/dist/ssr/Microphone';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { SiteFooter } from '@/components/site-footer';
import { IntroVideo } from '@/components/intro-video';
import { Changelog } from '@/components/changelog';
import { demoPill } from '@/lib/fixtures';
import { publicPageMetadata, siteDescription, siteTitle } from '@/lib/seo';
import { siteUrl } from '@/lib/site-url';

const repository = 'https://github.com/pradeept/noteesta';

export const metadata = publicPageMetadata(siteTitle, siteDescription, '/');

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: 'Noteesta',
      url: siteUrl,
      description: siteDescription,
      inLanguage: 'en',
    },
    {
      '@type': ['SoftwareApplication', 'SoftwareSourceCode'],
      '@id': `${siteUrl}/#application`,
      name: 'Noteesta',
      url: siteUrl,
      description: siteDescription,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      isAccessibleForFree: true,
      codeRepository: repository,
      featureList: [
        'Source-linked notes from YouTube videos, PDFs, recordings, and handwritten notes',
        'Flashcards, quizzes, and study roadmaps',
        'Interactive visuals and optional 3D models',
        'Self-hosting with Ollama or personal provider keys',
      ],
    },
  ],
};

export default function Home() {
  const sample = demoPill.artifact;

  return (
    <div className="marketing-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />
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
          <a href={`${repository}#local-setup`}>Set up locally</a>
          <a
            className="marketing-nav-repository marketing-icon-link"
            href={repository}
            aria-label="View on GitHub"
            title="View on GitHub"
          >
            <GithubMark size={24} />
          </a>
        </nav>
      </header>

      <main id="main-content">
        <section className="marketing-hero" aria-labelledby="hero-title">
          <div className="marketing-hero-copy">
            <p className="marketing-intro">Your sources. Your models. Your study workspace.</p>
            <h1 id="hero-title">
              Make sense of
              <br />
              <em>what you study.</em>
            </h1>
            <p className="marketing-lead">
              An open-source alternative to Turbo AI and Google NotebookLM. Turn YouTube videos,
              recordings, PDFs, and handwritten notes into a Study Pill with clear explanations,
              sources you can check, and practice when you need it. Self-host with local Ollama or
              bring your own API keys.
            </p>
            <div className="marketing-hero-actions">
              <a
                className="marketing-button marketing-button-primary"
                href={repository}
                aria-label="View source on GitHub"
              >
                <GithubMark size={21} />
                View source
              </a>
              <Link className="marketing-text-link" href="/app">
                Explore the sample <ArrowRightIcon size={17} aria-hidden="true" />
              </Link>
            </div>
            <p className="marketing-availability">
              Open source. <a href={`${repository}#docker`}>Docker setup</a> or{' '}
              <a href={`${repository}#local-setup`}>run locally</a>. No account needed for the
              sample.
            </p>
          </div>

          <div className="marketing-hero-art" aria-label="Preview of the photosynthesis Study Pill">
            <div className="marketing-source-strip" aria-hidden="true">
              <span>
                <MicrophoneIcon size={14} aria-hidden="true" /> Lecture recording
              </span>
              <span>
                <FilePdfIcon size={14} aria-hidden="true" /> Class slides
              </span>
              <span>
                <PencilSimpleIcon size={14} aria-hidden="true" /> Handwritten notes
              </span>
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
                    <BookOpenIcon size={18} />
                  </span>
                  <div>
                    <strong>First, the bigger picture</strong>
                    <span>Light reactions capture energy. The Calvin cycle puts it to work.</span>
                  </div>
                </div>
                <div className="marketing-window-section">
                  <span className="marketing-section-icon" aria-hidden="true">
                    <FlowArrowIcon size={18} />
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

        <section className="marketing-video" id="intro-video" aria-labelledby="video-title">
          <div className="marketing-video-heading">
            <h2 id="video-title">From scattered materials to a clearer lesson.</h2>
            <p>A 43-second product reveal. Best with sound.</p>
          </div>
          <IntroVideo />
          <div className="marketing-video-caption">
            <p id="video-description">
              See notes, source references, visuals, and practice in a sample Study Pill.
            </p>
            <details className="marketing-video-transcript">
              <summary>Read the video description</summary>
              <p>
                Instrumental electronic music accompanies a tour of the interactive sample. PDF
                slides, a lecture recording, and handwritten notes come together through the sample
                upload and preparation animation, then a completed Study Pill appears.
              </p>
              <p>
                Note chapters open, a source reference reveals its excerpt, and an energy-flow
                visual connects the light reactions to the Calvin cycle. The chloroplast model
                rotates before a flashcard reveals its answer. The film closes with “Make sense of
                what you study” and an invitation to explore the sample at noteesta.com.
              </p>
            </details>
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
                  Add a YouTube video or upload the recordings, slides, and notes you want to study
                  together. The Study Pill stays tied to those sources.
                </p>
              </div>
            </article>
            <article>
              <span className="marketing-day-time">Between classes</span>
              <div>
                <h3>Find the thread</h3>
                <p>
                  Read a structured explanation and follow its source references. Edit the notes in
                  place, highlight what matters, and revisit earlier versions.
                </p>
              </div>
            </article>
            <article>
              <span className="marketing-day-time">Before the exam</span>
              <div>
                <h3>Make it stick</h3>
                <p>
                  Explore a flow or a 3D model when it helps. Return to your notes, flashcards,
                  questions, and study roadmap for revision.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="marketing-workspace" aria-labelledby="workspace-title">
          <h2 id="workspace-title">A workspace you can make your own.</h2>
          <p className="marketing-workspace-lead">
            Deploy Noteesta on your own infrastructure. Choose how it generates, keep your notes
            editable, and give each learner a private place to study.
          </p>
          <div className="marketing-workspace-grid">
            <article>
              <h3>Choose your model</h3>
              <p>
                Generate locally with Ollama or bring your own provider key in Settings. Save a
                default model and choose a different one for each Pill. Ollama handles source
                embeddings with every provider.
              </p>
            </article>
            <article>
              <h3>Keep shaping your notes</h3>
              <p>
                Format, highlight, and edit right in the note. Changes save automatically, and
                version history lets you preview and restore earlier drafts.
              </p>
            </article>
            <article>
              <h3>A space for each learner</h3>
              <p>
                Email and password or Google sign-in protect private workspaces. Each account has
                its own Study Pills, collections, source files, and encrypted provider keys.
              </p>
            </article>
          </div>
          <p className="marketing-direction" id="our-direction">
            <strong>On the horizon</strong> Website summaries and more ways to explore ideas
            visually. Follow development in{' '}
            <a className="marketing-repository-link" href={repository}>
              <GithubMark size={16} />
              the repository
            </a>
            .
          </p>
        </section>

        <section className="marketing-close" aria-labelledby="close-title">
          <p>Start with one lesson.</p>
          <h2 id="close-title">Make room for understanding.</h2>
          <div className="marketing-close-actions">
            <a
              className="marketing-button marketing-button-light"
              href={repository}
              aria-label="View source on GitHub"
            >
              <GithubMark size={21} />
              View source
            </a>
            <a className="marketing-text-link" href={`${repository}#local-setup`}>
              Read the setup guide <ArrowUpRightIcon size={17} aria-hidden="true" />
            </a>
          </div>
        </section>
        <Changelog />
      </main>

      <SiteFooter />
    </div>
  );
}
