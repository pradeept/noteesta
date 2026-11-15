'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useReducedMotion } from 'motion/react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  BookOpenIcon,
  CheckIcon,
  CheckCircleIcon,
  CubeIcon,
  FilePdfIcon,
  HeadphonesIcon,
  ImageIcon,
  LeafIcon,
  LightningIcon,
  PathIcon,
  StackIcon,
  SunIcon,
  UploadSimpleIcon,
  XIcon,
} from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { demoPill, demoThreeDJavaScript } from '@/lib/fixtures';
import type { Citation, MaterialKey } from '@/lib/types';

const ThreeDViewer = dynamic(
  () => import('@/components/three-d-viewer').then((module) => module.ThreeDViewer),
  { loading: () => <p role="status">Opening the chloroplast…</p> },
);

const artifact = demoPill.artifact!;
type Stage = 'sources' | 'uploading' | 'materials' | 'preparing' | 'explore';
type Activity = MaterialKey | 'visual';
const activities = [
  { id: 'notes', label: 'Notes', detail: 'Three bite-sized chapters', icon: BookOpenIcon },
  { id: 'visual', label: 'Energy flow', detail: 'Follow the connections', icon: LightningIcon },
  { id: 'threeD', label: 'Interactive 3D', detail: 'Take a look inside', icon: CubeIcon },
  { id: 'flashcards', label: 'Flashcards', detail: 'Three little memory checks', icon: StackIcon },
  {
    id: 'mcqs',
    label: 'Multiple choice',
    detail: 'Put an idea to the test',
    icon: CheckCircleIcon,
  },
  {
    id: 'trueFalse',
    label: 'True or false',
    detail: 'Catch a common mix-up',
    icon: ArrowsClockwiseIcon,
  },
  { id: 'roadmap', label: 'Roadmap', detail: 'Find your way through the lesson', icon: PathIcon },
] as const;
const allMaterials = demoPill.selectedMaterials;
const stageNames = ['Add sources', 'Choose materials', 'Prepare', 'Explore'];
const preparation = [
  'Reading your three sources',
  'Connecting the key ideas',
  'Preparing your selected materials',
];
const sourceIcons = { audio: HeadphonesIcon, pdf: FilePdfIcon, image: ImageIcon };
const visualDetails = [
  {
    title: 'Light reactions',
    location: 'Thylakoid membrane',
    input: 'Light + water',
    output: 'Oxygen + ATP + NADPH',
    copy: 'Capture the sunlight. Water is split, oxygen is released, and energy is stored in ATP and NADPH.',
  },
  {
    title: 'Calvin cycle',
    location: 'Stroma',
    input: 'Carbon dioxide + ATP + NADPH',
    output: 'G3P + ADP + NADP+',
    copy: 'Put that energy to work. The Calvin cycle uses ATP and NADPH to turn carbon dioxide into G3P, a building block for sugars.',
  },
];

function Sources({
  ready,
  uploading,
  onSource,
}: {
  ready: boolean;
  uploading: boolean;
  onSource?: (citation: Citation) => void;
}) {
  return (
    <div className="sample-files">
      {demoPill.sources.map((source, index) => {
        const Icon = sourceIcons[source.kind as keyof typeof sourceIcons] ?? ImageIcon;
        return (
          <div className="sample-file" key={source.id}>
            <span className={`sample-file-icon file-${source.kind}`}>
              <Icon size={23} aria-hidden="true" />
            </span>
            <div>
              <strong>{source.name}</strong>
              <span>{source.detail}</span>
            </div>
            {onSource ? (
              <button
                className="sample-button sample-small"
                type="button"
                onClick={() =>
                  onSource({
                    sourceId: source.id,
                    sourceName: source.name,
                    locator:
                      source.kind === 'audio'
                        ? '08:42'
                        : source.kind === 'pdf'
                          ? 'page 6'
                          : 'page 1',
                    excerpt: source.excerpt ?? '',
                  })
                }
              >
                View excerpt
              </button>
            ) : ready ? (
              <CheckCircleIcon className="sample-file-check" size={22} aria-label="Uploaded" />
            ) : uploading ? (
              <span className="sample-upload-track" aria-label={`Uploading ${source.name}`}>
                <span style={{ animationDelay: `${index * 100}ms` }} />
              </span>
            ) : (
              <span className="sample-file-tag">Sample</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function References({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (citation: Citation) => void;
}) {
  return (
    <div className="sample-references" aria-label="Sources for this explanation">
      <span>Check the sources</span>
      {citations.map((citation) => (
        <button
          type="button"
          key={`${citation.sourceId}-${citation.locator}`}
          onClick={() => onOpen(citation)}
        >
          {citation.sourceName} <span>· {citation.locator}</span>{' '}
          <ArrowRightIcon size={13} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function Quiz({
  question,
  choices,
  correctIndex,
  explanation,
  citations,
  answer,
  onAnswer,
  onSource,
}: {
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  citations: Citation[];
  answer: number | undefined;
  onAnswer: (answer: number | undefined) => void;
  onSource: (citation: Citation) => void;
}) {
  const correct = answer === correctIndex;
  return (
    <div className="sample-quiz">
      <span className="sample-meta">One question. Give it a go.</span>
      <h3>{question}</h3>
      <div className="sample-answers" aria-label="Answer choices">
        {choices.map((choice, index) => (
          <button
            type="button"
            key={choice}
            aria-pressed={answer === index}
            className={answer === index ? (correct ? 'answer-correct' : 'answer-incorrect') : ''}
            disabled={answer !== undefined}
            onClick={() => onAnswer(index)}
          >
            <span className="sample-answer-letter">{String.fromCharCode(65 + index)}</span>
            <span>{choice}</span>
            {answer === index ? (
              correct ? (
                <CheckIcon size={22} aria-hidden="true" />
              ) : (
                <XIcon size={22} aria-hidden="true" />
              )
            ) : null}
          </button>
        ))}
      </div>
      {answer !== undefined ? (
        <div
          className={`sample-answer-feedback ${correct ? 'is-correct' : 'is-incorrect'}`}
          role="status"
        >
          <strong>{correct ? 'Correct. You’ve got it!' : 'Not quite. Let’s untangle it.'}</strong>
          <p>{explanation}</p>
          <button
            className="sample-button sample-small"
            type="button"
            onClick={() => onAnswer(undefined)}
          >
            <ArrowsClockwiseIcon size={16} aria-hidden="true" />
            {correct ? 'Try again' : 'Try another answer'}
          </button>
        </div>
      ) : (
        <p className="sample-hint">Pick an answer to see how you did.</p>
      )}
      {answer !== undefined ? <References citations={citations} onOpen={onSource} /> : null}
    </div>
  );
}

export function SamplePillJourney() {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState<Stage>('sources');
  const [selected, setSelected] = useState<MaterialKey[]>([...allMaterials]);
  const [active, setActive] = useState<Activity>('notes');
  const [prepareStep, setPrepareStep] = useState(0);
  const [chapter, setChapter] = useState(0);
  const [visual, setVisual] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, number | undefined>>({});
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [citation, setCitation] = useState<Citation | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const activityHeading = useRef<HTMLHeadingElement>(null);
  const previousFocusKey = useRef('sources:notes');
  const stageIndex =
    stage === 'sources' || stage === 'uploading'
      ? 0
      : stage === 'materials'
        ? 1
        : stage === 'preparing'
          ? 2
          : 3;
  const available = activities.filter((item) => item.id === 'visual' || selected.includes(item.id));
  const activeIndex = available.findIndex((item) => item.id === active);
  const next = available[(activeIndex + 1) % available.length];
  const section = artifact.sections[chapter];
  const card = artifact.flashcards[cardIndex];
  const stageTitle =
    stage === 'sources' || stage === 'uploading'
      ? 'A few sources. A whole new way to study.'
      : stage === 'materials'
        ? 'How do you like to learn?'
        : stage === 'preparing'
          ? 'Connecting the dots for you.'
          : demoPill.title;

  useEffect(() => {
    const focusKey = `${stage === 'uploading' ? 'sources' : stage}:${active}`;
    if (previousFocusKey.current === focusKey) return undefined;
    previousFocusKey.current = focusKey;
    const frame = requestAnimationFrame(() =>
      (stage === 'explore' ? activityHeading.current : heading.current)?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [stage, active]);

  useEffect(() => {
    if (stage !== 'uploading' && stage !== 'preparing') return undefined;
    const timer = window.setTimeout(
      () => {
        if (stage === 'uploading') setStage('materials');
        else if (prepareStep < 2) setPrepareStep((step) => step + 1);
        else setStage('explore');
      },
      reduceMotion ? 0 : stage === 'uploading' ? 1200 : 950,
    );
    return () => window.clearTimeout(timer);
  }, [stage, prepareStep, reduceMotion]);

  useEffect(() => {
    function openHash() {
      const hash = window.location.hash.slice(1);
      const aliases: Record<string, Activity> = {
        'demo-notes': 'notes',
        'demo-visual': 'visual',
        'demo-3d': 'threeD',
        'demo-practice': 'flashcards',
        'demo-roadmap': 'roadmap',
      };
      const chapterIndex = artifact.sections.findIndex((item) => `section-${item.id}` === hash);
      const source = demoPill.sources.find((item) => `source-${item.id}` === hash);
      if (hash === 'demo-sources' || source) setSourcesOpen(true);
      if (aliases[hash] || chapterIndex >= 0 || hash === 'demo-sources' || source) {
        setSelected([...allMaterials]);
        setStage('explore');
        setActive(aliases[hash] ?? 'notes');
        if (chapterIndex >= 0) setChapter(chapterIndex);
      }
    }
    openHash();
    window.addEventListener('hashchange', openHash);
    return () => window.removeEventListener('hashchange', openHash);
  }, []);

  useEffect(() => {
    if (citation && !dialog.current?.open) dialog.current?.showModal();
  }, [citation]);

  function jumpToSample() {
    setSelected([...allMaterials]);
    setStage('explore');
    setActive('notes');
  }
  function restart() {
    setStage('sources');
    setSelected([...allMaterials]);
    setActive('notes');
    setPrepareStep(0);
    setChapter(0);
    setVisual(0);
    setCardIndex(0);
    setRevealed({});
    setAnswers({});
    setSourcesOpen(false);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  function toggleMaterial(material: MaterialKey) {
    setSelected((current) =>
      current.includes(material)
        ? current.filter((item) => item !== material)
        : [...current, material],
    );
  }
  function openChapter(index: number) {
    setChapter(index);
    setActive('notes');
  }

  return (
    <div className="sample-journey">
      <div className="sample-topline">
        <ol className="sample-steps" aria-label="Your sample journey">
          {stageNames.map((label, index) => (
            <li
              key={label}
              aria-current={stageIndex === index ? 'step' : undefined}
              data-complete={stageIndex > index}
            >
              <span>
                {stageIndex > index ? (
                  <CheckIcon size={13} weight="bold" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
        {stage === 'explore' ? (
          <button type="button" className="sample-text-button" onClick={restart}>
            <ArrowsClockwiseIcon size={16} aria-hidden="true" />
            Start again
          </button>
        ) : (
          <button type="button" className="sample-text-button" onClick={jumpToSample}>
            Jump to the sample <ArrowRightIcon size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className={`sample-intro ${stage === 'explore' ? 'sample-intro-compact' : ''}`}>
        <p className="sample-meta">
          <LeafIcon size={17} aria-hidden="true" />
          {stage === 'explore'
            ? 'Biology · Your sample Study Pill'
            : 'A little photosynthesis. A little possibility.'}
        </p>
        <h1 ref={heading} tabIndex={-1}>
          {stageTitle}
        </h1>
        <p className="sample-deck">
          {stage === 'sources' || stage === 'uploading'
            ? 'Take a lecture, some slides, and a page of scribbles. Let’s turn them into something that clicks.'
            : stage === 'materials'
              ? 'The notes are on us. Pick the extras you’d like to explore.'
              : stage === 'preparing'
                ? 'Same sources. Different ways to make sense of them.'
                : 'Read a little. Follow the energy. Test an idea. Make it yours.'}
        </p>
      </div>

      {stage === 'sources' || stage === 'uploading' ? (
        <section className="sample-upload-layout" aria-label="Upload sample sources">
          <div className="sample-upload-panel">
            <div className="sample-upload-heading">
              <span className="sample-upload-symbol">
                <UploadSimpleIcon size={29} aria-hidden="true" />
              </span>
              <div>
                <h2>Your lesson starts here.</h2>
                <p>Three different formats. One topic.</p>
              </div>
            </div>
            <Sources ready={false} uploading={stage === 'uploading'} />
            <div className="sample-upload-footer">
              <span role="status">
                {stage === 'uploading'
                  ? 'Adding your sample sources…'
                  : 'Sample files, already picked for you.'}
              </span>
              <button
                className="sample-button sample-primary"
                type="button"
                disabled={stage === 'uploading'}
                onClick={() => setStage('uploading')}
              >
                <UploadSimpleIcon size={18} aria-hidden="true" />
                {stage === 'uploading' ? 'Uploading samples…' : 'Upload sample sources'}
              </button>
            </div>
          </div>
          <aside className="sample-preview-note">
            <span className="sample-preview-icon">
              <SunIcon size={32} weight="duotone" aria-hidden="true" />
            </span>
            <h2>
              From “wait, what?”
              <br />
              to “oh, I get it.”
            </h2>
            <p>
              Follow the journey from scattered class materials to clear ideas, curious questions,
              and a chloroplast you can turn around.
            </p>
            <span className="sample-demo-disclosure">
              An interactive simulation. No real uploads, account, or saved data.
            </span>
          </aside>
        </section>
      ) : null}

      {stage === 'materials' ? (
        <section className="sample-material-picker" aria-label="Choose study materials">
          <div className="sample-included">
            <BookOpenIcon size={26} aria-hidden="true" />
            <div>
              <h2>Clear notes + a visual explanation</h2>
              <p>The foundation of every Study Pill. Always included.</p>
            </div>
            <span>
              <CheckIcon size={16} aria-hidden="true" />
              Included
            </span>
          </div>
          <div className="sample-options">
            {activities
              .filter((item) => item.id !== 'notes' && item.id !== 'visual')
              .map((item) => (
                <label
                  key={item.id}
                  htmlFor={`sample-material-${item.id}`}
                  className="sample-option"
                  data-selected={selected.includes(item.id)}
                >
                  <item.icon size={27} weight="duotone" aria-hidden="true" />
                  <span>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <input
                    type="checkbox"
                    id={`sample-material-${item.id}`}
                    checked={selected.includes(item.id)}
                    onChange={() => toggleMaterial(item.id)}
                  />
                </label>
              ))}
          </div>
          <div className="sample-picker-footer">
            <button
              className="sample-text-button"
              type="button"
              onClick={() => setStage('sources')}
            >
              <ArrowLeftIcon size={16} aria-hidden="true" />
              Back to sources
            </button>
            <button
              type="button"
              className="sample-button sample-primary"
              onClick={() => {
                setPrepareStep(0);
                setStage('preparing');
              }}
            >
              Prepare my Study Pill <ArrowRightIcon size={18} aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      {stage === 'preparing' ? (
        <section className="sample-preparing" aria-label="Preparing your sample Study Pill">
          <div className="sample-preparing-orbit" aria-hidden="true">
            <LeafIcon size={48} weight="duotone" />
          </div>
          <ol>
            {preparation.map((label, index) => (
              <li key={label} data-current={prepareStep === index} data-done={prepareStep > index}>
                <span>
                  {prepareStep > index ? <CheckIcon size={18} aria-hidden="true" /> : index + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
          <p role="status">{preparation[prepareStep]}…</p>
          <div className="sample-prepared-tags">
            {activities
              .filter((item) => item.id !== 'visual' && selected.includes(item.id))
              .map((item) => (
                <span key={item.id}>
                  <item.icon size={16} aria-hidden="true" />
                  {item.label}
                </span>
              ))}
          </div>
          <button type="button" className="sample-text-button" onClick={() => setStage('explore')}>
            Skip animation <ArrowRightIcon size={16} aria-hidden="true" />
          </button>
          <span className="sample-demo-disclosure">
            A preview of preparation, using preset sample content.
          </span>
        </section>
      ) : null}

      {stage === 'explore' ? (
        <div className="sample-explorer">
          <div className="sample-explorer-bar">
            <span>
              <CheckCircleIcon size={18} weight="fill" aria-hidden="true" />
              Your sample is ready. Take a look around.
            </span>
            <button
              type="button"
              className="sample-text-button"
              aria-expanded={sourcesOpen}
              aria-controls="sample-sources"
              onClick={() => setSourcesOpen((open) => !open)}
            >
              {sourcesOpen ? 'Hide sources' : 'View 3 sources'}
              <BookOpenIcon size={16} aria-hidden="true" />
            </button>
          </div>
          {sourcesOpen ? (
            <section
              id="sample-sources"
              className="sample-source-drawer"
              aria-label="Sample sources"
            >
              <h2>Everything starts with these.</h2>
              <Sources ready uploading={false} onSource={setCitation} />
            </section>
          ) : null}
          <div className="sample-explorer-layout">
            <nav className="sample-activity-nav" aria-label="Study activities">
              {available.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active === item.id}
                  onClick={() => setActive(item.id)}
                >
                  <item.icon
                    size={21}
                    weight={active === item.id ? 'fill' : 'regular'}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                  {active === item.id ? (
                    <ArrowRightIcon className="sample-nav-arrow" size={16} aria-hidden="true" />
                  ) : null}
                </button>
              ))}
              <p>
                One lesson.
                <br />A few ways in.
              </p>
            </nav>
            <div className="sample-activity-area" data-activity={active}>
              <div className="sample-activity-title">
                <span className="sample-meta">
                  {activities.find((item) => item.id === active)?.detail}
                </span>
                <h2 tabIndex={-1} ref={activityHeading}>
                  {activities.find((item) => item.id === active)?.label}
                </h2>
              </div>
              {active === 'notes' ? (
                <article aria-label="Study notes">
                  <div className="sample-big-idea">
                    <span>
                      <LeafIcon size={20} aria-hidden="true" />
                      The big idea
                    </span>
                    <p>{artifact.summary}</p>
                  </div>
                  <nav className="sample-chapters" aria-label="Note chapters">
                    {artifact.sections.map((item, index) => (
                      <button
                        type="button"
                        key={item.id}
                        aria-pressed={chapter === index}
                        onClick={() => setChapter(index)}
                      >
                        <span>{index + 1}</span>
                        {item.title}
                      </button>
                    ))}
                  </nav>
                  <section
                    className="sample-chapter"
                    id={`section-${section.id}`}
                    aria-live="polite"
                  >
                    <span className="sample-meta">
                      Chapter {chapter + 1} of {artifact.sections.length}
                    </span>
                    <h3>{section.title}</h3>
                    <div className="sample-prose">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.markdown}</ReactMarkdown>
                    </div>
                    <References citations={section.citations} onOpen={setCitation} />
                  </section>
                  <div className="sample-pagination">
                    <button
                      type="button"
                      className="sample-button"
                      disabled={chapter === 0}
                      onClick={() => setChapter((index) => index - 1)}
                    >
                      <ArrowLeftIcon size={17} aria-hidden="true" />
                      Previous chapter
                    </button>
                    {chapter < artifact.sections.length - 1 ? (
                      <button
                        type="button"
                        className="sample-button"
                        onClick={() => setChapter((index) => index + 1)}
                      >
                        Next chapter
                        <ArrowRightIcon size={17} aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="sample-button"
                        onClick={() => setActive('visual')}
                      >
                        See the energy flow
                        <ArrowRightIcon size={17} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </article>
              ) : null}
              {active === 'visual' ? (
                <section className="sample-visual" aria-label="Energy flow through photosynthesis">
                  <h3>Two stages. One clever exchange.</h3>
                  <p className="sample-hint">
                    Tap either stage to follow what goes in and what comes out.
                  </p>
                  <div className="sample-energy-flow">
                    <button type="button" aria-pressed={visual === 0} onClick={() => setVisual(0)}>
                      <SunIcon size={35} weight="duotone" aria-hidden="true" />
                      <strong>Light reactions</strong>
                      <span>Capture the energy</span>
                    </button>
                    <div className="sample-energy-exchange">
                      <span>ATP + NADPH →</span>
                      <span>← ADP + NADP+</span>
                    </div>
                    <button type="button" aria-pressed={visual === 1} onClick={() => setVisual(1)}>
                      <LeafIcon size={35} weight="duotone" aria-hidden="true" />
                      <strong>Calvin cycle</strong>
                      <span>Build something useful</span>
                    </button>
                  </div>
                  <div className="sample-visual-detail" aria-live="polite">
                    <span className="sample-meta">{visualDetails[visual].location}</span>
                    <h3>{visualDetails[visual].title}</h3>
                    <p>{visualDetails[visual].copy}</p>
                    <dl>
                      <div>
                        <dt>Goes in</dt>
                        <dd>{visualDetails[visual].input}</dd>
                      </div>
                      <div>
                        <dt>Comes out</dt>
                        <dd>{visualDetails[visual].output}</dd>
                      </div>
                    </dl>
                  </div>
                  <References citations={artifact.visuals[0].citations} onOpen={setCitation} />
                </section>
              ) : null}
              {active === 'threeD' ? (
                <section className="sample-model" aria-label="Interactive chloroplast">
                  <h3>{artifact.threeD?.title}</h3>
                  <p className="sample-hint">{artifact.threeD?.description}</p>
                  <ThreeDViewer javascript={demoThreeDJavaScript} title="Chloroplast model" />
                  <References citations={artifact.threeD?.citations ?? []} onOpen={setCitation} />
                </section>
              ) : null}
              {active === 'flashcards' ? (
                <section className="sample-flashcards" aria-label="Flashcards">
                  <div className="sample-card-position">
                    <span>
                      Card {cardIndex + 1} of {artifact.flashcards.length}
                    </span>
                    <span>Think it through. Then turn it over.</span>
                  </div>
                  <button
                    type="button"
                    className="sample-flashcard"
                    aria-expanded={!!revealed[card.id]}
                    onClick={() =>
                      setRevealed((current) => ({ ...current, [card.id]: !current[card.id] }))
                    }
                  >
                    <span className="sample-meta">
                      {revealed[card.id] ? 'The answer' : 'A little recall'}
                    </span>
                    <span className="sample-flashcard-copy">
                      {revealed[card.id] ? card.back : card.front}
                    </span>
                    <span className="sample-flip-label">
                      <ArrowsClockwiseIcon size={18} aria-hidden="true" />
                      {revealed[card.id] ? 'Show question' : 'Reveal answer'}
                    </span>
                  </button>
                  <div className="sample-pagination">
                    <button
                      type="button"
                      className="sample-button"
                      disabled={cardIndex === 0}
                      onClick={() => setCardIndex((index) => index - 1)}
                    >
                      <ArrowLeftIcon size={17} aria-hidden="true" />
                      Previous card
                    </button>
                    <button
                      type="button"
                      className="sample-button"
                      disabled={cardIndex === artifact.flashcards.length - 1}
                      onClick={() => setCardIndex((index) => index + 1)}
                    >
                      Next card
                      <ArrowRightIcon size={17} aria-hidden="true" />
                    </button>
                  </div>
                  {revealed[card.id] ? (
                    <References citations={card.citations} onOpen={setCitation} />
                  ) : null}
                </section>
              ) : null}
              {active === 'mcqs'
                ? artifact.mcqs.map((question) => (
                    <Quiz
                      key={question.id}
                      question={question.question}
                      choices={question.choices}
                      correctIndex={question.correctIndex}
                      explanation={question.explanation}
                      citations={question.citations}
                      answer={answers[question.id]}
                      onAnswer={(answer) =>
                        setAnswers((current) => ({ ...current, [question.id]: answer }))
                      }
                      onSource={setCitation}
                    />
                  ))
                : null}
              {active === 'trueFalse'
                ? artifact.trueFalse.map((question) => (
                    <Quiz
                      key={question.id}
                      question={question.statement}
                      choices={['True', 'False']}
                      correctIndex={question.answer ? 0 : 1}
                      explanation={question.explanation}
                      citations={question.citations}
                      answer={answers[question.id]}
                      onAnswer={(answer) =>
                        setAnswers((current) => ({ ...current, [question.id]: answer }))
                      }
                      onSource={setCitation}
                    />
                  ))
                : null}
              {active === 'roadmap' ? (
                <section className="sample-learning-path" aria-label="Study roadmap">
                  <h3>A small path to a bigger picture.</h3>
                  <p className="sample-hint">
                    Start anywhere. Come back whenever an idea needs another look.
                  </p>
                  <ol>
                    {artifact.roadmap.map((step, index) => (
                      <li key={step.id}>
                        <span className="sample-path-number">{index + 1}</span>
                        <div>
                          <h4>{step.title}</h4>
                          <p>{step.description}</p>
                          <button
                            type="button"
                            className="sample-text-button"
                            onClick={() =>
                              openChapter(
                                artifact.sections.findIndex((item) => item.id === step.sectionId),
                              )
                            }
                          >
                            Open this chapter
                            <ArrowRightIcon size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
              <div className="sample-next-activity">
                <div>
                  <span>Keep your curiosity going</span>
                  <strong>{next.detail}</strong>
                </div>
                <button type="button" className="sample-button" onClick={() => setActive(next.id)}>
                  Explore {next.label.toLowerCase()}
                  <ArrowRightIcon size={17} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
          <p className="sample-explorer-disclosure">
            You’re exploring preset sample content. Your choices stay in this visit only.
          </p>
        </div>
      ) : null}
      <dialog
        ref={dialog}
        className="sample-source-dialog"
        aria-labelledby="sample-source-title"
        onClose={() => setCitation(null)}
      >
        {citation ? (
          <>
            <div className="sample-dialog-top">
              <span className="sample-meta">A little evidence behind the idea</span>
              <button
                type="button"
                className="sample-button"
                aria-label="Close source"
                onClick={() => dialog.current?.close()}
              >
                <XIcon size={20} aria-hidden="true" />
              </button>
            </div>
            <h2 id="sample-source-title">{citation.sourceName}</h2>
            <p className="sample-hint">{citation.locator} · Sample excerpt</p>
            <blockquote>{citation.excerpt}</blockquote>
            <p className="sample-hint">
              This is an excerpt from the bundled example, rather than an original file download.
            </p>
          </>
        ) : null}
      </dialog>
    </div>
  );
}
