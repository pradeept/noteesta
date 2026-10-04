'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FileArrowUpIcon,
  LinkIcon,
  XIcon,
  PillIcon,
  CheckCircleIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'motion/react';
import type { CreatePillInput, MaterialKey } from '@/lib/types';

const optionalMaterials: Array<{ value: MaterialKey; label: string; description: string }> = [
  { value: 'flashcards', label: 'Flashcards', description: 'Short recall prompts' },
  { value: 'mcqs', label: 'Multiple choice', description: 'Questions with explanations' },
  { value: 'trueFalse', label: 'True or false', description: 'Fast misconception checks' },
  { value: 'roadmap', label: 'Study roadmap', description: 'A sensible learning order' },
];

export function CreatePillDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CreatePillInput) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [materials, setMaterials] = useState<MaterialKey[]>(['notes', 'flashcards', 'mcqs']);
  const [detailLevel, setDetailLevel] = useState<CreatePillInput['detailLevel']>('balanced');
  const [learnerLevel, setLearnerLevel] = useState<CreatePillInput['learnerLevel']>('intermediate');
  const [targetExamDate, setTargetExamDate] = useState('');
  const [studyHoursPerDay, setStudyHoursPerDay] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const reduce = useReducedMotion();

  function addFiles(incoming: File[]) {
    setFiles((current) => [
      ...current,
      ...incoming.filter(
        (file) =>
          !current.some(
            (existing) =>
              existing.name === file.name &&
              existing.size === file.size &&
              existing.lastModified === file.lastModified,
          ),
      ),
    ]);
    setError('');
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function toggleMaterial(material: MaterialKey) {
    setMaterials((current) =>
      current.includes(material)
        ? current.filter((item) => item !== material)
        : [...current, material],
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length && !youtubeUrl.trim()) {
      setError('Add at least one file or a YouTube link.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onCreate({
        title: title.trim(),
        subject: subject.trim(),
        youtubeUrl: youtubeUrl.trim() || undefined,
        files,
        selectedMaterials: materials,
        detailLevel,
        learnerLevel,
        targetExamDate: targetExamDate || undefined,
        studyHoursPerDay: studyHoursPerDay ? Number(studyHoursPerDay) : undefined,
      });
      setTitle('');
      setSubject('');
      setYoutubeUrl('');
      setFiles([]);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Study Pill could not be created.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog border-0 [box-shadow:var(--shadow)] rounded-2xl create-dialog w-[min(720px,_calc(100%_-_32px))] overflow-hidden max-h-[calc(100dvh_-_48px)] [&_form]:flex [&_form]:flex-col [&_form]:max-h-[calc(100dvh_-_48px)] [&_.dialog-header]:[padding:26px_30px_22px] [&_.dialog-header]:flex-none [&_.dialog-kicker]:flex [&_.dialog-kicker]:items-center [&_.dialog-kicker]:gap-[7px] [&_.dialog-kicker]:text-xs [&_.dialog-kicker]:font-semibold [&_.dialog-kicker]:mb-[10px] [&_.dialog-header_h2]:text-[26px] [&_.dialog-header_h2]:font-semibold [&_.create-description]:mt-[9px] [&_.create-description]:text-[13px] [&_.create-description]:text-muted [&_.create-description]:leading-[1.6] [&_.dialog-footer]:flex-none [&_.dialog-footer]:bg-surface [&_.dialog-footer]:[padding:18px_30px] [&_.dialog-footer_>_p]:max-w-[29ch] [&_.dialog-footer_>_p]:leading-[1.6] [&_.dialog-footer_>_p]:text-xs max-[761px]:max-h-[calc(100dvh_-_24px)] max-[761px]:[&_form]:max-h-[calc(100dvh_-_24px)] max-[761px]:w-[calc(100%_-_24px)] max-[761px]:[&_.dialog-header]:p-5.5 max-[761px]:[&_.dialog-header_h2]:text-[23px] max-[761px]:[&_.dialog-footer]:[padding:16px_22px] max-[761px]:[&_.dialog-footer]:gap-3"
      aria-labelledby="create-pill-title"
      onCancel={onClose}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <motion.form
        onSubmit={submit}
        aria-busy={submitting}
        initial={false}
        animate={{ y: open ? 0 : 12, opacity: open ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="dialog-header">
          <div>
            <p className="dialog-kicker">
              <PillIcon size={19} weight="duotone" /> New Study Pill
            </p>
            <h2 id="create-pill-title">What are you learning?</h2>
            <p className="create-description">
              Bring your sources. We’ll help you make sense of them.
            </p>
          </div>
          <button
            type="button"
            className="icon-button min-w-[36px] min-h-[36px] rounded-[9px]"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon size={19} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]" data-modal-scroll>
        <fieldset
          disabled={submitting}
          className="dialog-body create-body m-0 border-0 [padding:26px_30px_30px] gap-7 max-[761px]:p-5.5 max-[761px]:gap-6"
        >
          <section className="form-section min-w-0 [&_+_.form-section]:[border-top:1px_solid_var(--line)] [&_+_.form-section]:pt-[26px] [&_h3]:[margin:0_0_16px] [&_h3]:text-[16px] [&_h3]:tracking-[-0.015em] [&_h3]:font-[650]">
            <h3>Give it a name</h3>
            <div className="field-row gap-4.5 max-[761px]:[grid-template-columns:1fr] max-[761px]:gap-3.5">
              <label
                htmlFor="pill-title"
                className="field gap-[9px] text-[13px] font-[550] min-w-0"
              >
                <span>Title</span>
                <input
                  id="pill-title"
                  required
                  maxLength={100}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Cell biology, lecture 4"
                />
              </label>
              <label
                htmlFor="pill-subject"
                className="field gap-[9px] text-[13px] font-[550] min-w-0"
              >
                <span>Subject</span>
                <input
                  id="pill-subject"
                  required
                  maxLength={60}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Biology"
                />
              </label>
            </div>

            <details className="optional-settings mt-[18px] [&_summary]:cursor-pointer [&_summary]:text-muted [&_summary]:text-xs [&_summary]:[padding:6px_0] [&_summary_span]:ml-[7px] [&_summary_span]:text-[11px] [&_.field-row]:mt-[14px]">
              <summary>
                Add a study schedule <span>Optional</span>
              </summary>
              <div className="field-row gap-4.5 max-[761px]:[grid-template-columns:1fr] max-[761px]:gap-3.5">
                <label
                  htmlFor="target-exam-date"
                  className="field gap-[9px] text-[13px] font-[550] min-w-0"
                >
                  <span>
                    Target exam date <small>(optional)</small>
                  </span>
                  <input
                    id="target-exam-date"
                    type="date"
                    value={targetExamDate}
                    onChange={(event) => setTargetExamDate(event.target.value)}
                  />
                </label>
                <label
                  htmlFor="study-hours-per-day"
                  className="field gap-[9px] text-[13px] font-[550] min-w-0"
                >
                  <span>
                    Study hours per day <small>(optional)</small>
                  </span>
                  <input
                    id="study-hours-per-day"
                    type="number"
                    min="0.25"
                    max="16"
                    step="0.25"
                    value={studyHoursPerDay}
                    onChange={(event) => setStudyHoursPerDay(event.target.value)}
                    placeholder="1.5"
                  />
                </label>
              </div>
            </details>
          </section>
          <section className="form-section min-w-0 [&_+_.form-section]:[border-top:1px_solid_var(--line)] [&_+_.form-section]:pt-[26px] [&_h3]:[margin:0_0_16px] [&_h3]:text-[16px] [&_h3]:tracking-[-0.015em] [&_h3]:font-[650]">
            <h3>
              Add your sources{' '}
              <span className="required-label text-[11px] font-medium text-muted ml-[7px]">
                Required
              </span>
            </h3>
            <p className="section-help [margin:-7px_0_18px] text-muted text-[13px] leading-[1.65]">
              Combine files and a YouTube lesson in the same Study Pill.
            </p>
            <div className="source-inputs bg-transparent p-0">
              <label
                htmlFor="source-files"
                className={
                  dragging
                    ? 'upload-zone bg-surface min-h-[108px] p-5.5 gap-4 border-(--muted) rounded-xl [&_strong]:font-semibold [&_strong]:text-sm [&_small]:text-xs [&_small]:leading-[1.5] [&_small]:mt-[6px] [&.dragging]:border-accent [&.dragging]:bg-accent-soft [&.dragging]:[outline:2px_solid_var(--accent)] [&.dragging]:[outline-offset:3px] [&:focus-within]:border-accent [&:focus-within]:bg-accent-soft [&:focus-within]:[outline:2px_solid_var(--accent)] [&:focus-within]:[outline-offset:3px] dragging'
                    : 'upload-zone bg-surface min-h-[108px] p-5.5 gap-4 border-(--muted) rounded-xl [&_strong]:font-semibold [&_strong]:text-sm [&_small]:text-xs [&_small]:leading-[1.5] [&_small]:mt-[6px] [&.dragging]:border-accent [&.dragging]:bg-accent-soft [&.dragging]:[outline:2px_solid_var(--accent)] [&.dragging]:[outline-offset:3px] [&:focus-within]:border-accent [&:focus-within]:bg-accent-soft [&:focus-within]:[outline:2px_solid_var(--accent)] [&:focus-within]:[outline-offset:3px]'
                }
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!submitting) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (!submitting) addFiles(Array.from(event.dataTransfer.files));
                }}
              >
                <FileArrowUpIcon size={24} weight="duotone" />
                <span>
                  <strong>Drop your files here, or browse</strong>
                  <small>PDF, slides, notes, images, audio, or video</small>
                </span>
                <input
                  id="source-files"
                  type="file"
                  multiple
                  accept="audio/*,video/*,image/*,.pdf,.doc,.docx,.ppt,.pptx,.txt,.md"
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
              </label>
              {files.length ? (
                <ul
                  className="file-list gap-[0] mt-[12px] [&_li]:items-center [&_li]:[padding:8px_0] [&_li]:text-xs [&_li]:[border-bottom:1px_solid_var(--line)] [&_li_>_span]:overflow-hidden [&_li_>_span]:text-ellipsis [&_li_>_span]:whitespace-nowrap [&_li_>_span]:[flex:1] [&_li_>_small]:flex-none"
                  aria-label="Selected files"
                >
                  {files.map((file) => (
                    <li key={`${file.name}-${file.lastModified}`}>
                      <span>{file.name}</span>
                      <small>{formatBytes(file.size)}</small>
                      <button
                        type="button"
                        className="icon-button min-w-[36px] min-h-[36px] rounded-[9px]"
                        aria-label={`Remove ${file.name}`}
                        onClick={() =>
                          setFiles((current) => current.filter((item) => item !== file))
                        }
                      >
                        <XIcon size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="source-divider [margin:18px_0] text-xs">
                <span>and / or</span>
              </div>
              <label
                htmlFor="youtube-url"
                className="field gap-[9px] text-[13px] font-[550] min-w-0 youtube-field"
              >
                <span>YouTube link</span>
                <span className="input-with-icon">
                  <LinkIcon size={17} aria-hidden="true" />
                  <input
                    id="youtube-url"
                    type="url"
                    value={youtubeUrl}
                    onChange={(event) => setYoutubeUrl(event.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </span>
              </label>
            </div>
          </section>
          <section className="form-section min-w-0 [&_+_.form-section]:[border-top:1px_solid_var(--line)] [&_+_.form-section]:pt-[26px] [&_h3]:[margin:0_0_16px] [&_h3]:text-[16px] [&_h3]:tracking-[-0.015em] [&_h3]:font-[650]">
            <fieldset className="material-fieldset [&_legend]:text-[16px] [&_legend]:font-[650] [&_>_p]:flex [&_>_p]:items-start [&_>_p]:gap-[7px] [&_>_p]:text-xs [&_>_p]:leading-[1.6] [&_>_p]:[margin:8px_0_18px]">
              <legend>Build your study kit</legend>
              <p className="included-notes [&_svg]:flex-none [&_svg]:text-accent [&_svg]:mt-[1px]">
                <CheckCircleIcon size={18} weight="fill" /> Cited notes and useful visuals are
                always included.
              </p>
              <div className="material-grid gap-2.5 max-[761px]:[grid-template-columns:1fr] max-[761px]:gap-3.5">
                {optionalMaterials.map((material) => (
                  <label
                    key={material.value}
                    htmlFor={`material-${material.value}`}
                    className={
                      materials.includes(material.value)
                        ? 'check-choice [border:1px_solid_var(--line)] p-3.5 items-center gap-3 rounded-[10px] [&.selected]:bg-accent-soft [&.selected]:[border-color:color-mix(in_oklch,_var(--accent),_var(--line)_60%)] [&_input]:m-0 [&_input]:p-0 [&_input]:w-[18px] [&_input]:h-[18px] [&_input]:min-h-[18px] [&_strong]:font-semibold [&_strong]:text-[13px] [&_small]:text-[11px] [&_small]:leading-[1.55] selected'
                        : 'check-choice [border:1px_solid_var(--line)] p-3.5 items-center gap-3 rounded-[10px] [&.selected]:bg-accent-soft [&.selected]:[border-color:color-mix(in_oklch,_var(--accent),_var(--line)_60%)] [&_input]:m-0 [&_input]:p-0 [&_input]:w-[18px] [&_input]:h-[18px] [&_input]:min-h-[18px] [&_strong]:font-semibold [&_strong]:text-[13px] [&_small]:text-[11px] [&_small]:leading-[1.55]'
                    }
                  >
                    <input
                      id={`material-${material.value}`}
                      type="checkbox"
                      checked={materials.includes(material.value)}
                      onChange={() => toggleMaterial(material.value)}
                    />
                    <span>
                      <strong>{material.label}</strong>
                      <small>{material.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
          <section className="form-section min-w-0 [&_+_.form-section]:[border-top:1px_solid_var(--line)] [&_+_.form-section]:pt-[26px] [&_h3]:[margin:0_0_16px] [&_h3]:text-[16px] [&_h3]:tracking-[-0.015em] [&_h3]:font-[650]">
            <h3>Make it yours</h3>
            <div className="field-row gap-4.5 max-[761px]:[grid-template-columns:1fr] max-[761px]:gap-3.5">
              <label
                htmlFor="detail-level"
                className="field gap-[9px] text-[13px] font-[550] min-w-0"
              >
                <span>Detail level</span>
                <select
                  id="detail-level"
                  value={detailLevel}
                  onChange={(event) =>
                    setDetailLevel(event.target.value as CreatePillInput['detailLevel'])
                  }
                >
                  <option value="concise">Concise</option>
                  <option value="balanced">Balanced</option>
                  <option value="detailed">Detailed</option>
                </select>
              </label>
              <label
                htmlFor="learner-level"
                className="field gap-[9px] text-[13px] font-[550] min-w-0"
              >
                <span>Learner level</span>
                <select
                  id="learner-level"
                  value={learnerLevel}
                  onChange={(event) =>
                    setLearnerLevel(event.target.value as CreatePillInput['learnerLevel'])
                  }
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
            </div>
          </section>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </fieldset>
        </div>

        <div className="dialog-footer">
          <p>
            {files.length
              ? `${files.length} ${files.length === 1 ? 'file' : 'files'} selected`
              : 'Add a file or a YouTube link to begin.'}
            {youtubeUrl.trim() ? ' • YouTube lesson added' : ''}
          </p>
          <button
            type="submit"
            className="primary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold shadow-none"
            disabled={submitting}
          >
            <SparkleIcon size={18} weight="duotone" />
            {submitting ? 'Starting...' : 'Create Study Pill'}
          </button>
        </div>
      </motion.form>
    </dialog>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
