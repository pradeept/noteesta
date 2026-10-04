'use client';

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CitationButton } from '@/components/citation-button';
import { FlowVisual } from '@/components/flow-visual';
import type { Citation, MaterialKey, StudyArtifact, VisualSpec } from '@/lib/types';

const tabLabels: Record<MaterialKey, string> = {
  notes: 'Notes',
  flashcards: 'Flashcards',
  mcqs: 'Multiple choice',
  trueFalse: 'True or false',
  roadmap: 'Roadmap',
};

export function StudyMaterials({
  artifact,
  selectedMaterials,
  onCitation,
  onVisual,
}: {
  artifact: StudyArtifact;
  selectedMaterials: MaterialKey[];
  onCitation: (citation: Citation) => void;
  onVisual: (visual: VisualSpec) => void;
}) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<MaterialKey>('notes');
  const tabs = useMemo(
    () => ['notes', ...selectedMaterials.filter((item) => item !== 'notes')] as MaterialKey[],
    [selectedMaterials],
  );

  return (
    <>
      <nav
        className="material-tabs bg-transparent [padding:0_0_10px] gap-[5px] rounded-[0] [border-bottom:1px_solid_var(--line)] mb-[28px] [&_button]:relative [&_button]:[isolation:isolate] [&_button]:min-h-[40px] [&_button]:[padding:9px_14px] [&_button]:rounded-[9px] [&_button]:font-[550] [&_button[aria-pressed='true']]:bg-transparent [&_button[aria-pressed='true']]:font-[650] [&_button_.tab-indicator]:absolute [&_button_.tab-indicator]:inset-[0] [&_button_.tab-indicator]:z-[-1] [&_button_.tab-indicator]:bg-accent-soft [&_button_.tab-indicator]:rounded-[9px] [&_button_.tab-indicator]:p-0 [&_button_.tab-label]:bg-transparent [&_button_.tab-label]:p-0 [&_button_.tab-label]:text-[inherit]"
        aria-label="Study materials"
      >
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab}
            aria-pressed={active === tab}
            onClick={() => setActive(tab)}
          >
            {active === tab ? (
              <motion.span
                className="tab-indicator"
                layoutId="active-material"
                transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
              />
            ) : null}
            <span className="tab-label">{tabLabels[tab]}</span>
            {tab === 'flashcards' ? <span>{artifact.flashcards.length}</span> : null}
          </button>
        ))}
      </nav>

      <motion.div
        key={active}
        initial={reduce ? false : { y: 6 }}
        animate={{ y: 0 }}
        transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {active === 'notes' ? (
          <Notes artifact={artifact} onCitation={onCitation} onVisual={onVisual} />
        ) : null}
        {active === 'flashcards' ? (
          <Flashcards artifact={artifact} onCitation={onCitation} />
        ) : null}
        {active === 'mcqs' ? <Mcqs artifact={artifact} onCitation={onCitation} /> : null}
        {active === 'trueFalse' ? <TrueFalse artifact={artifact} onCitation={onCitation} /> : null}
        {active === 'roadmap' ? (
          <Roadmap
            artifact={artifact}
            onOpen={(sectionId) => {
              setActive('notes');
              requestAnimationFrame(() => {
                document.getElementById(sectionId)?.scrollIntoView({ block: 'start' });
              });
            }}
          />
        ) : null}
      </motion.div>
    </>
  );
}

function Notes({
  artifact,
  onCitation,
  onVisual,
}: {
  artifact: StudyArtifact;
  onCitation: (citation: Citation) => void;
  onVisual: (visual: VisualSpec) => void;
}) {
  return (
    <div className="reading-content leading-[1.85] [&_h2]:mt-[40px] [&_h2]:text-[1.35em] [&_h2]:font-[650] [&_h2]:tracking-[-0.025em] [&_h3]:text-[1.1em] [&_h3]:font-[650] [&_h3]:[margin:28px_0_12px] [&_p]:max-w-[70ch] [&_strong]:font-[650] [&_pre]:overflow-x-auto [&_pre]:bg-surface [&_pre]:p-4.5 [&_pre]:rounded-[10px] [&_pre]:text-[0.85em] [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:[border-collapse:collapse] [&_table]:text-[0.9em] [&_th]:[padding:10px_14px] [&_th]:[border-bottom:1px_solid_var(--line)] [&_th]:text-left [&_td]:[padding:10px_14px] [&_td]:[border-bottom:1px_solid_var(--line)] [&_td]:text-left [&_blockquote]:[margin-inline:0] [&_blockquote]:[padding:16px_20px] [&_blockquote]:bg-surface [&_blockquote]:rounded-[10px] max-[761px]:text-[length:var(--reading-size,_17px)]">
      <div className="summary-block bg-surface [padding:24px_26px] rounded-xl [&_.summary-label]:flex [&_.summary-label]:gap-2 [&_.summary-label]:text-[13px] [&_.summary-label]:font-[650] [&_.summary-label]:mb-[10px] [&_p]:text-[0.94em] [&_p]:leading-[1.75] max-[761px]:[padding:20px]">
        <span className="summary-label [&::before]:[content:'✦'] [&::before]:text-[16px]">
          The big idea
        </span>
        <p>{artifact.summary}</p>
      </div>
      {artifact.sections.map((section, sectionIndex) => (
        <section id={section.id} key={section.id}>
          <h2>{section.title}</h2>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.markdown}</ReactMarkdown>
          {sectionIndex === 1 && artifact.visuals[0] ? (
            <FlowVisual
              visual={artifact.visuals[0]}
              onExpand={() => onVisual(artifact.visuals[0])}
            />
          ) : null}
          <div className="section-citations" aria-label={`Sources for ${section.title}`}>
            <span>Sources</span>
            {section.citations.map((citation, index) => (
              <CitationButton
                key={`${citation.sourceId}-${citation.locator}-${index}`}
                citation={citation}
                index={index + 1}
                onOpen={onCitation}
              />
            ))}
          </div>
        </section>
      ))}
      <footer className="notes-footer mt-[42px] pt-[20px]">
        <span>Built only from this Study Pill&apos;s sources.</span>
        <span>Check a citation whenever the detail matters.</span>
      </footer>
    </div>
  );
}

function Flashcards({
  artifact,
  onCitation,
}: {
  artifact: StudyArtifact;
  onCitation: (citation: Citation) => void;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const reduce = useReducedMotion();
  const card = artifact.flashcards[index];
  if (!card) return <EmptyMaterial label="flashcards" />;

  function move(next: number) {
    setIndex(
      (current) => (current + next + artifact.flashcards.length) % artifact.flashcards.length,
    );
    setRevealed(false);
  }

  return (
    <section className="practice-panel" aria-labelledby="flashcard-heading">
      <div className="practice-heading">
        <div>
          <p>
            {index + 1} of {artifact.flashcards.length}
          </p>
          <h2 id="flashcard-heading">Recall it in your own words</h2>
        </div>
        <span>{revealed ? 'Answer' : 'Question'}</span>
      </div>
      <button type="button" className="flashcard" onClick={() => setRevealed((value) => !value)}>
        <motion.span
          key={`${index}-${revealed}`}
          initial={reduce ? false : { y: 8 }}
          animate={{ y: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
        >
          {revealed ? card.back : card.front}
        </motion.span>
        <small>
          {revealed ? 'Click to see the question' : 'Think first, then reveal the answer'}
        </small>
      </button>
      <div className="practice-actions">
        <button
          type="button"
          className="secondary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold"
          onClick={() => move(-1)}
          aria-label="Previous flashcard"
        >
          <ArrowLeftIcon size={17} /> Previous
        </button>
        <button
          type="button"
          className="primary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold shadow-none"
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? 'Show question' : 'Reveal answer'}
        </button>
        <button
          type="button"
          className="secondary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold"
          onClick={() => move(1)}
          aria-label="Next flashcard"
        >
          Next <ArrowRightIcon size={17} />
        </button>
      </div>
      {revealed ? <MaterialCitations citations={card.citations} onCitation={onCitation} /> : null}
    </section>
  );
}

function Mcqs({
  artifact,
  onCitation,
}: {
  artifact: StudyArtifact;
  onCitation: (citation: Citation) => void;
}) {
  const question = artifact.mcqs[0];
  const [answer, setAnswer] = useState<number | null>(null);
  if (!question) return <EmptyMaterial label="multiple-choice questions" />;

  return (
    <section className="practice-panel" aria-labelledby="mcq-heading">
      <div className="practice-heading">
        <div>
          <p>Knowledge check</p>
          <h2 id="mcq-heading">{question.question}</h2>
        </div>
      </div>
      <div className="quiz-options">
        {question.choices.map((choice, index) => {
          const selected = answer === index;
          const correct = answer !== null && index === question.correctIndex;
          return (
            <button
              type="button"
              key={choice}
              className={correct ? 'correct' : selected ? 'incorrect' : ''}
              onClick={() => setAnswer(index)}
              aria-pressed={selected}
            >
              <span>{String.fromCharCode(65 + index)}</span>
              {choice}
              {correct ? <CheckIcon size={18} weight="bold" aria-label="Correct" /> : null}
            </button>
          );
        })}
      </div>
      {answer !== null ? (
        <div className="answer-feedback" role="status">
          <strong>
            {answer === question.correctIndex
              ? 'That is right.'
              : `The answer is ${String.fromCharCode(65 + question.correctIndex)}.`}
          </strong>
          <p>{question.explanation}</p>
          <MaterialCitations citations={question.citations} onCitation={onCitation} />
        </div>
      ) : null}
    </section>
  );
}

function TrueFalse({
  artifact,
  onCitation,
}: {
  artifact: StudyArtifact;
  onCitation: (citation: Citation) => void;
}) {
  const question = artifact.trueFalse[0];
  const [answer, setAnswer] = useState<boolean | null>(null);
  if (!question) return <EmptyMaterial label="true or false questions" />;

  return (
    <section className="practice-panel" aria-labelledby="tf-heading">
      <div className="practice-heading">
        <div>
          <p>True or false</p>
          <h2 id="tf-heading">{question.statement}</h2>
        </div>
      </div>
      <div className="binary-options">
        <button
          type="button"
          className="secondary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold"
          onClick={() => setAnswer(true)}
        >
          True
        </button>
        <button
          type="button"
          className="secondary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold"
          onClick={() => setAnswer(false)}
        >
          False
        </button>
      </div>
      {answer !== null ? (
        <div className="answer-feedback" role="status">
          <strong>{answer === question.answer ? 'Correct.' : 'Take another look.'}</strong>
          <p>{question.explanation}</p>
          <MaterialCitations citations={question.citations} onCitation={onCitation} />
        </div>
      ) : null}
    </section>
  );
}

function Roadmap({
  artifact,
  onOpen,
}: {
  artifact: StudyArtifact;
  onOpen: (sectionId: string) => void;
}) {
  if (!artifact.roadmap.length) return <EmptyMaterial label="roadmap" />;
  return (
    <section className="practice-panel" aria-labelledby="roadmap-heading">
      <div className="practice-heading">
        <div>
          <p>A sensible order</p>
          <h2 id="roadmap-heading">Study this lesson in three passes</h2>
        </div>
      </div>
      <ol className="roadmap-list">
        {artifact.roadmap.map((item, index) => (
          <li key={item.id}>
            <span>{index + 1}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
            <button type="button" onClick={() => onOpen(item.sectionId)}>
              Open notes
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MaterialCitations({
  citations,
  onCitation,
}: {
  citations: Citation[];
  onCitation: (citation: Citation) => void;
}) {
  return (
    <div className="material-citations">
      <span>Check the source</span>
      {citations.map((citation, index) => (
        <CitationButton
          key={`${citation.sourceId}-${citation.locator}-${index}`}
          citation={citation}
          index={index + 1}
          onOpen={onCitation}
        />
      ))}
    </div>
  );
}

function EmptyMaterial({ label }: { label: string }) {
  return (
    <section className="empty-material">
      <h2>No {label} yet</h2>
      <p>Regenerate this Study Pill and include this material.</p>
    </section>
  );
}
