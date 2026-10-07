import type { Metadata } from 'next';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SiteFooter } from '@/components/site-footer';
import { demoPill } from '@/lib/fixtures';
import type { Citation } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Example Study Pill — Photosynthesis | Noteesta',
  description:
    'Explore a read-only Noteesta Study Pill with source-linked photosynthesis notes, an energy-flow visual, flashcards, and practice questions.',
  alternates: { canonical: '/app', types: { 'text/markdown': '/llm' } },
  openGraph: {
    title: 'Explore a Noteesta Study Pill',
    description:
      'A real read-only example: photosynthesis notes, references, a visual, and practice.',
    type: 'website',
    url: '/app',
  },
};

function CitationLinks({ citations }: { citations: Citation[] }) {
  return (
    <div className="demo-citations" aria-label="Sources for this section">
      <span>From</span>
      {citations.map((citation) => (
        <a key={`${citation.sourceId}-${citation.locator}`} href={`#source-${citation.sourceId}`}>
          {citation.sourceName} · {citation.locator}
        </a>
      ))}
    </div>
  );
}

export default function PublicDemo() {
  const pill = demoPill;
  const artifact = pill.artifact;
  if (!artifact) return null;

  return (
    <div className="demo-page">
      <a className="marketing-skip" href="#demo-main">
        Skip to the example note
      </a>
      <header className="demo-header">
        <Link className="marketing-wordmark" href="/" aria-label="Noteesta home">
          <span className="marketing-mark" aria-hidden="true">
            n
          </span>
          <span>noteesta</span>
        </Link>
        <nav aria-label="Demo navigation">
          <Link href="/">About Noteesta</Link>
          <a href="/llm" type="text/markdown">
            For LLMs: start here
          </a>
        </nav>
      </header>
      <main id="demo-main" className="demo-main">
        <div className="demo-opening">
          <div>
            <p className="demo-label">Explore the product · Read-only example</p>
            <h1>{pill.title}</h1>
            <p className="demo-deck">{pill.description}</p>
          </div>
          <div className="demo-opening-note">
            <strong>This is a sample Study Pill.</strong>
            <span>
              You can browse its notes, references, visual, and revision material. Nothing here
              uploads, saves, or calls an API.
            </span>
          </div>
        </div>

        <div className="demo-layout">
          <aside className="demo-index" aria-label="On this page">
            <p>In this Study Pill</p>
            <a href="#demo-sources">Selected sources</a>
            <a href="#demo-notes">The notes</a>
            <a href="#demo-visual">A visual explanation</a>
            <a href="#demo-practice">Practice and roadmap</a>
            <span>Biology · Example content</span>
          </aside>
          <div className="demo-content">
            <section
              id="demo-sources"
              className="demo-sources"
              aria-labelledby="demo-sources-title"
            >
              <div className="demo-section-head">
                <h2 id="demo-sources-title">It starts with selected sources.</h2>
                <p>The example combines one recording, slides, and handwritten notes.</p>
              </div>
              <div className="demo-source-list">
                {pill.sources.map((source) => (
                  <article key={source.id} id={`source-${source.id}`}>
                    <span className="demo-source-icon" aria-hidden="true">
                      {source.kind === 'audio' ? '◉' : source.kind === 'pdf' ? '▤' : '▧'}
                    </span>
                    <div className="demo-source-copy">
                      <h3>{source.name}</h3>
                      <p>{source.detail}</p>
                      {source.excerpt ? (
                        <details>
                          <summary>Read cited excerpt</summary>
                          <p>{source.excerpt}</p>
                        </details>
                      ) : null}
                    </div>
                    <span className="demo-source-kind">{source.kind}</span>
                  </article>
                ))}
              </div>
            </section>

            <article id="demo-notes" className="demo-note" aria-labelledby="demo-notes-title">
              <div className="demo-document-heading">
                <span>Study note</span>
                <h2 id="demo-notes-title">Understand the lesson, one idea at a time.</h2>
                <p>{artifact.summary}</p>
              </div>
              {artifact.sections.map((section) => (
                <section
                  key={section.id}
                  id={`section-${section.id}`}
                  className="demo-note-section"
                >
                  <h3>{section.title}</h3>
                  <div className="demo-prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.markdown}</ReactMarkdown>
                  </div>
                  <CitationLinks citations={section.citations} />
                </section>
              ))}
            </article>

            <section id="demo-visual" className="demo-visual" aria-labelledby="demo-visual-title">
              <div className="demo-section-head">
                <span>Visual explanation</span>
                <h2 id="demo-visual-title">{artifact.visuals[0]?.title}</h2>
                <p>{artifact.visuals[0]?.description}</p>
              </div>
              <div
                className="demo-flow"
                role="img"
                aria-label="Light reactions in the thylakoid membrane supply ATP and NADPH to the Calvin cycle in the stroma. ADP and NADP plus return to the light reactions."
              >
                <div>
                  <strong>Light reactions</strong>
                  <span>Thylakoid membrane</span>
                </div>
                <div className="demo-flow-arrows">
                  <span className="demo-flow-wide">ATP + NADPH →</span>
                  <span className="demo-flow-small">ATP + NADPH ↓</span>
                  <span className="demo-flow-wide">← ADP + NADP+</span>
                  <span className="demo-flow-small">↑ ADP + NADP+</span>
                </div>
                <div>
                  <strong>Calvin cycle</strong>
                  <span>Stroma</span>
                </div>
              </div>
              {artifact.visuals[0] ? (
                <CitationLinks citations={artifact.visuals[0].citations} />
              ) : null}
            </section>

            <section
              id="demo-practice"
              className="demo-practice"
              aria-labelledby="demo-practice-title"
            >
              <div className="demo-section-head">
                <span>When you are ready to revise</span>
                <h2 id="demo-practice-title">See what stayed with you.</h2>
                <p>
                  The original Study Pill can include the practice material a student selects. These
                  examples stay entirely on this page.
                </p>
              </div>
              <div className="demo-practice-grid">
                <div className="demo-practice-block">
                  <h3>Flashcards</h3>
                  {artifact.flashcards.map((card) => (
                    <details key={card.id}>
                      <summary>{card.front}</summary>
                      <p>{card.back}</p>
                    </details>
                  ))}
                </div>
                <div className="demo-practice-block">
                  <h3>Quick check</h3>
                  {artifact.mcqs.map((question) => (
                    <details key={question.id}>
                      <summary>{question.question}</summary>
                      <ul>
                        {question.choices.map((choice, index) => (
                          <li key={choice}>
                            {choice}
                            {index === question.correctIndex ? ' ✓' : ''}
                          </li>
                        ))}
                      </ul>
                      <p>{question.explanation}</p>
                    </details>
                  ))}
                  {artifact.trueFalse.map((question) => (
                    <details key={question.id}>
                      <summary>{question.statement}</summary>
                      <p>
                        {question.answer ? 'True.' : 'False.'} {question.explanation}
                      </p>
                    </details>
                  ))}
                </div>
              </div>
              <div className="demo-roadmap">
                <h3>A small path through the lesson</h3>
                <ol>
                  {artifact.roadmap.map((step) => (
                    <li key={step.id}>
                      <a href={`#section-${step.sectionId}`}>{step.title}</a>
                      <span>{step.description}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
            <div className="demo-end">
              <p>
                That is one example. Noteesta is being built as a family of thoughtful learning
                tools.
              </p>
              <Link href="/">
                Read the Noteesta story <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
