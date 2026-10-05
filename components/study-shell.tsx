'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { AlertDialog } from 'radix-ui';
import {
  BooksIcon,
  PillIcon,
  ChatCircleDotsIcon,
  DownloadSimpleIcon,
  GearSixIcon,
  FolderOpenIcon,
  ListIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PlusIcon,
  SidebarSimpleIcon,
  SparkleIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { Brand } from '@/components/brand';
import { CollectionNavigation } from '@/components/collection-navigation';
import { CreatePillDialog } from '@/components/create-pill-dialog';
import { FileLibraryDialog } from '@/components/file-library-dialog';
import { PillMetadataEditor } from '@/components/pill-metadata-editor';
import { ReadingSettingsDialog, ThemePicker } from '@/components/appearance-controls';
import { VisualCanvas } from '@/components/flow-visual';
import { SourceIcon } from '@/components/source-icon';
import { StudyMaterials } from '@/components/study-materials';
import { WikipediaFactCard } from '@/components/wikipedia-fact-card';
import {
  askPill,
  createPill,
  deleteCollection,
  exportPill,
  getPill,
  listCollections,
  listPills,
  movePillsToCollection,
  retryPill,
  updatePill,
} from '@/lib/api';
import { demoPill } from '@/lib/fixtures';
import type {
  ChatAnswer,
  Citation,
  Collection,
  CreatePillInput,
  StudyPill,
  VisualSpec,
} from '@/lib/types';

const enableDemo = process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA !== 'false';

export function StudyShell({ initialPillId }: { initialPillId: string }) {
  const router = useRouter();
  const [pills, setPills] = useState<StudyPill[]>([]);
  const [activeId, setActiveId] = useState(initialPillId);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [libraryError, setLibraryError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fileLibraryOpen, setFileLibraryOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [citation, setCitation] = useState<Citation | null>(null);
  const [visual, setVisual] = useState<VisualSpec | null>(null);
  const [readingSize, setReadingSize] = useState(17);
  const [readerBackground, setReaderBackground] = useState(() =>
    typeof document !== 'undefined'
      ? (document.documentElement.dataset.readerBackground ?? 'canvas')
      : 'canvas',
  );
  const [palette, setPalette] = useState(() =>
    typeof document !== 'undefined'
      ? (document.documentElement.dataset.palette ?? 'grove')
      : 'grove',
  );
  const [collections, setCollections] = useState<Collection[]>([]);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePill = pills.find((pill) => pill.id === activeId);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3600);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listPills()
      .then((items) => {
        if (cancelled) return;
        setPills(
          initialPillId === demoPill.id && enableDemo
            ? [...items.filter((item) => item.id !== demoPill.id), demoPill]
            : items,
        );
        setLibraryError('');
      })
      .catch(() => {
        if (cancelled) return;
        if (initialPillId === demoPill.id && enableDemo) setPills([demoPill]);
        setLibraryError(
          'The library could not connect to the API. You can still explore the example.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingLibrary(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialPillId]);

  useEffect(() => {
    listCollections()
      .then(setCollections)
      .catch(() => setLibraryError('Collections could not be loaded. Try refreshing the page.'));
  }, []);

  useEffect(() => {
    if (!activePill || !['queued', 'processing'].includes(activePill.status)) return;
    const timer = setTimeout(async () => {
      try {
        const updated = await getPill(activePill.id);
        setPills((current) => current.map((pill) => (pill.id === updated.id ? updated : pill)));
        if (updated.status === 'ready') notify('Your Study Pill is ready.');
        if (updated.status === 'failed')
          notify('Generation stopped. Open the Study Pill to retry.');
      } catch {
        setLibraryError('Progress could not be refreshed. Retrying shortly.');
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [activePill, notify]);

  async function handleCreate(input: CreatePillInput) {
    const pill = await createPill(input);
    setPills((current) => [pill, ...current.filter((item) => item.id !== pill.id)]);
    setActiveId(pill.id);
    router.push(`/pills/${pill.id}`);
    setMobileOpen(false);
    notify('Study Pill created. Your sources are being processed.');
  }

  async function handleExport() {
    if (!activePill) return;
    try {
      const blob = activePill.isDemo ? demoMarkdown(activePill) : await exportPill(activePill.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = activePill.isDemo
        ? 'photosynthesis-notes.md'
        : `${slug(activePill.title)}.zip`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(activePill.isDemo ? 'Demo notes downloaded as Markdown.' : 'Study pack downloaded.');
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'The export could not be prepared.');
    }
  }

  async function handleRetry() {
    if (!activePill || activePill.isDemo) return;
    try {
      const updated = await retryPill(activePill.id);
      setPills((current) => current.map((pill) => (pill.id === updated.id ? updated : pill)));
      notify('Generation queued again.');
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Generation could not be retried.');
    }
  }

  async function handleSaveMetadata(changes: {
    title: string;
    description: string | null;
    tags: string[];
  }) {
    if (!activePill) return;
    if (activePill.isDemo) {
      setPills((current) =>
        current.map((pill) =>
          pill.id === activePill.id
            ? {
                ...pill,
                title: changes.title,
                description: changes.description ?? undefined,
                tags: changes.tags,
              }
            : pill,
        ),
      );
      notify('Study Pill details updated in this example.');
      return;
    }
    const updated = await updatePill(activePill.id, changes);
    setPills((current) => current.map((pill) => (pill.id === updated.id ? updated : pill)));
    notify('Study Pill details saved.');
  }

  async function handleMovePills(ids: string[], collectionId: string | null) {
    const updated = await movePillsToCollection(ids, collectionId);
    const byId = new Map(updated.map((pill) => [pill.id, pill]));
    setPills((current) => current.map((pill) => byId.get(pill.id) ?? pill));
    notify(
      collectionId ? 'Study Pills moved to collection.' : 'Study Pills removed from collection.',
    );
  }

  async function handleDeleteCollection(id: string) {
    await deleteCollection(id);
    setCollections((current) => current.filter((collection) => collection.id !== id));
    setPills((current) =>
      current.map((pill) =>
        pill.collectionId === id ? { ...pill, collectionId: undefined } : pill,
      ),
    );
    notify('Collection deleted. Its Study Pills remain in your library.');
  }

  function choosePalette(value: string) {
    setPalette(value);
    document.documentElement.dataset.palette = value;
    localStorage.setItem('noteesta-palette', value);
  }

  function chooseReaderBackground(value: string) {
    setReaderBackground(value);
    document.documentElement.dataset.readerBackground = value;
    localStorage.setItem('noteesta-reader-background', value);
  }

  function selectPill(id: string) {
    setActiveId(id);
    setMobileOpen(false);
    router.push(`/pills/${id}`);
  }

  if (!activePill && loadingLibrary) {
    return (
      <main
        className="empty-shell relative flex items-center justify-center min-h-dvh bg-canvas [padding:100px_40px] [&_>_.brand]:absolute [&_>_.brand]:top-[32px] [&_>_.brand]:left-[40px] [&_>_div:last-of-type]:w-[min(600px,_100%)] [&_>_div:last-of-type]:items-center [&_>_div:last-of-type]:pb-[0] [&_>_div:last-of-type]:text-center [&_h1]:text-[40px] [&_h1]:font-semibold [&_h1]:max-w-[none] [&_h1]:leading-[1.18] [&_>_div:last-of-type_>_p]:max-w-[52ch] [&_>_div:last-of-type_>_p]:[margin-inline:auto] [&_>_div:last-of-type_>_svg]:bg-accent-soft [&_>_div:last-of-type_>_svg]:rounded-[14px] [&_>_div:last-of-type_>_svg]:p-4.5 [&_>_div:last-of-type_>_svg]:[box-sizing:content-box] [&_>_div:last-of-type_>_svg]:mb-3 [&_.inline-error]:mt-6 [&_.inline-error]:max-w-[48ch] max-[761px]:[padding:100px_24px] max-[761px]:[&_>_.brand]:top-[24px] max-[761px]:[&_>_.brand]:left-[24px] max-[761px]:[&_h1]:text-[34px] loading-shell"
        aria-busy="true"
      >
        <Brand />
        <div>
          <PillIcon size={38} weight="duotone" />
          <h1>Opening your study space</h1>
          <p>Checking for Study Pills and their latest generation status.</p>
          <div className="document-skeleton" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      </main>
    );
  }

  if (!activePill) {
    const hasPills = pills.length > 0;
    return (
      <main className="empty-shell relative flex items-center justify-center min-h-dvh bg-canvas [padding:100px_40px] [&_>_.brand]:absolute [&_>_.brand]:top-[32px] [&_>_.brand]:left-[40px] [&_>_div:last-of-type]:w-[min(600px,_100%)] [&_>_div:last-of-type]:items-center [&_>_div:last-of-type]:pb-[0] [&_>_div:last-of-type]:text-center [&_h1]:text-[40px] [&_h1]:font-semibold [&_h1]:max-w-[none] [&_h1]:leading-[1.18] [&_>_div:last-of-type_>_p]:max-w-[52ch] [&_>_div:last-of-type_>_p]:[margin-inline:auto] [&_>_div:last-of-type_>_svg]:bg-accent-soft [&_>_div:last-of-type_>_svg]:rounded-[14px] [&_>_div:last-of-type_>_svg]:p-4.5 [&_>_div:last-of-type_>_svg]:[box-sizing:content-box] [&_>_div:last-of-type_>_svg]:mb-3 [&_.inline-error]:mt-6 [&_.inline-error]:max-w-[48ch] max-[761px]:[padding:100px_24px] max-[761px]:[&_>_.brand]:top-[24px] max-[761px]:[&_>_.brand]:left-[24px] max-[761px]:[&_h1]:text-[34px]">
        <Brand />
        <div>
          <PillIcon size={38} weight="duotone" />
          <h1>{hasPills ? 'Study Pill not found' : 'Start with one lesson'}</h1>
          <p>
            {hasPills
              ? 'This Study Pill is no longer in your library. Return home to choose another one.'
              : 'Add a recording, document, image, video, or YouTube link. Noteesta will keep every answer tied to your sources.'}
          </p>
          <div className="empty-actions flex flex-wrap justify-center gap-3 items-center mt-4 [&_.primary-button]:mt-[0]">
            <Link
              href="/"
              className="secondary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold"
            >
              View your library
            </Link>
            {!hasPills ? (
              <button
                type="button"
                className="primary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold shadow-none"
                onClick={() => setCreateOpen(true)}
              >
                <PlusIcon size={18} /> New Study Pill
              </button>
            ) : null}
            {!hasPills && enableDemo ? (
              <button
                type="button"
                className="secondary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold"
                onClick={() => {
                  router.push(`/pills/${demoPill.id}`);
                }}
              >
                See example
              </button>
            ) : null}
          </div>
          {libraryError ? <p className="inline-error">{libraryError}</p> : null}
        </div>
        <CreatePillDialog
          key={`create-${createOpen ? 'open' : 'closed'}`}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
        />
      </main>
    );
  }

  return (
    <div
      className={`app-shell ${focusMode ? 'focus-mode max-[761px]:[&_.document-layout]:w-full max-[761px]:[&_.document-layout]:[padding:28px_22px_96px]' : ''} ${chatOpen ? 'chat-open min-[1280px]:pr-[var(--chat-width)] [&_.chat-trigger]:hidden min-[1280px]:[&_.document-layout]:w-[min(780px,_calc(100%_-_64px))] min-[1280px]:[&_.section-trail]:hidden min-[1280px]:[&_.focus-toggle]:text-[0px] min-[1280px]:[&_.focus-toggle]:gap-0' : ''}`}
    >
      <a className="skip-link" href="#study-document">
        Skip to notes
      </a>
      <aside
        className={
          mobileOpen
            ? 'sidebar [padding:28px_16px_20px] mobile-open'
            : 'sidebar [padding:28px_16px_20px]'
        }
        aria-label="Study Pill library"
      >
        <div className="sidebar-head">
          <Brand />
          <button
            type="button"
            className="mobile-close icon-button min-w-[36px] min-h-[36px] rounded-[9px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close library"
          >
            <XIcon size={19} />
          </button>
        </div>
        <button
          type="button"
          className="primary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold shadow-none new-pill mt-[30px]"
          onClick={() => setCreateOpen(true)}
        >
          <PlusIcon size={18} weight="bold" /> New Study Pill
        </button>
        <div className="library-list mt-[30px]">
          <CollectionNavigation
            pills={pills}
            collections={collections}
            activeId={activePill?.id ?? ''}
            onSelect={selectPill}
            onCollectionCreated={(collection) =>
              setCollections((current) => [...current, collection])
            }
            onCollectionUpdated={(updated) =>
              setCollections((current) =>
                current.map((collection) => (collection.id === updated.id ? updated : collection)),
              )
            }
            onCollectionDeleted={handleDeleteCollection}
            onMove={handleMovePills}
          />
          {loadingLibrary ? <LibrarySkeleton /> : null}
          {enableDemo ? (
            <button
              type="button"
              className="example-link mt-4 text-muted quiet-button"
              onClick={() => {
                setPills((current) =>
                  current.some((pill) => pill.id === demoPill.id)
                    ? current
                    : [...current, demoPill],
                );
                setActiveId(demoPill.id);
                setMobileOpen(false);
              }}
            >
              <BooksIcon size={17} /> See example
            </button>
          ) : null}
        </div>
        {activePill.status === 'queued' || activePill.status === 'processing' ? (
          <WikipediaFactCard />
        ) : null}
        <div className="sidebar-footer [&_strong]:font-semibold">
          <span className="avatar" aria-hidden="true">
            ST
          </span>
          <div>
            <strong>Your study space</strong>
            <small>Private by default</small>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close library"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <main
        className="workspace"
        id="study-document"
        tabIndex={-1}
        style={{ '--reading-size': `${readingSize}px` } as React.CSSProperties}
      >
        <header className="topbar bg-canvas [backdrop-filter:none] [padding:14px_32px] max-[761px]:[padding:10px_18px]">
          <div className="topbar-leading [&_p]:flex [&_p]:items-center [&_p]:min-w-0 [&_.breadcrumb-current]:text-ink [&_.breadcrumb-current]:font-semibold [&_.breadcrumb-current]:max-w-[24ch] [&_.breadcrumb-current]:overflow-hidden [&_.breadcrumb-current]:text-ellipsis [&_.breadcrumb-current]:whitespace-nowrap max-[761px]:[&_p]:hidden">
            <button
              type="button"
              className="mobile-menu icon-button min-w-[36px] min-h-[36px] rounded-[9px]"
              onClick={() => setMobileOpen(true)}
              aria-label="Open library"
            >
              <ListIcon size={20} />
            </button>
            <p>
              <Link href="/">My Study Pills</Link>
              <b>/</b>
              <span className="breadcrumb-current">{activePill.subject}</span>
            </p>
          </div>
          <div className="topbar-actions">
            <ThemePicker value={palette} onChange={choosePalette} />
            <button
              type="button"
              className="quiet-button file-library-trigger"
              onClick={() => setFileLibraryOpen(true)}
            >
              <FolderOpenIcon size={18} /> <span>Source library</span>
            </button>
            <button
              type="button"
              className="quiet-button focus-toggle"
              onClick={() => setFocusMode((value) => !value)}
              aria-pressed={focusMode}
            >
              <SidebarSimpleIcon size={18} /> {focusMode ? 'Exit focus' : 'Focus mode'}
            </button>
            <button
              type="button"
              className="icon-button min-w-[36px] min-h-[36px] rounded-[9px]"
              onClick={() => setSettingsOpen(true)}
              aria-label="Reading settings"
              title="Reading settings"
            >
              <GearSixIcon size={19} />
            </button>
            <button
              type="button"
              className="secondary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold export-button"
              onClick={handleExport}
              disabled={activePill.status !== 'ready'}
            >
              <DownloadSimpleIcon size={18} /> Export
            </button>
          </div>
        </header>

        {libraryError ? (
          <div className="connection-note" role="status">
            {libraryError}
          </div>
        ) : null}
        {activePill.status === 'queued' || activePill.status === 'processing' ? (
          <ProcessingView pill={activePill} />
        ) : activePill.status === 'failed' ? (
          <FailedView pill={activePill} onRetry={handleRetry} />
        ) : activePill.artifact ? (
          <div className="document-layout">
            <article className="document-column max-w-[75ch] [&_>_h1]:text-[38px] [&_>_h1]:font-[650] [&_>_h1]:[margin:20px_0_12px] [&_>_h1]:leading-[1.16] [&_>_h1]:tracking-[-0.035em] [&_>_h1]:[overflow-wrap:anywhere] max-[761px]:[&_>_h1]:text-[30px]">
              <div className="document-meta gap-3.5 [&_span:first-child]:bg-surface [&_span:first-child]:text-muted [&_span:first-child]:rounded-[999px] [&_span:first-child]:[padding:5px_11px] [&_span:first-child]:font-[550] [&_span_+_span::before]:hidden">
                <span>{activePill.subject}</span>
                <span>
                  {Math.max(
                    3,
                    Math.round(
                      activePill.artifact.sections.reduce(
                        (count, section) => count + section.markdown.split(/\s+/).length,
                        0,
                      ) / 210,
                    ),
                  )}{' '}
                  min read
                </span>
                {activePill.isDemo ? <span>Demo lesson</span> : null}
              </div>
              <PillMetadataEditor
                key={`metadata-${activePill.id}`}
                title={activePill.title}
                description={activePill.description}
                tags={activePill.tags}
                onSave={handleSaveMetadata}
              />
              <div
                className="source-strip [margin:24px_0_32px] [&_button]:bg-surface [&_button]:border-0 [&_button]:min-h-[36px] [&_button]:rounded-lg [&_button]:[padding:8px_12px]"
                aria-label="Sources in this Study Pill"
              >
                {activePill.sources.map((source) => (
                  <button
                    type="button"
                    key={source.id}
                    onClick={() =>
                      setCitation({
                        sourceId: source.id,
                        sourceName: source.name,
                        locator: source.detail,
                        excerpt: source.excerpt ?? 'This source is ready for grounded retrieval.',
                      })
                    }
                  >
                    <SourceIcon kind={source.kind} size={16} />
                    <span>{source.name}</span>
                  </button>
                ))}
              </div>
              <StudyMaterials
                key={`materials-${activePill.id}`}
                artifact={activePill.artifact}
                selectedMaterials={activePill.selectedMaterials}
                onCitation={setCitation}
                onVisual={setVisual}
              />
              <footer className="pill-footer">
                <span>Ready to study</span>
                {typeof activePill.processingDurationSeconds === 'number' ? (
                  <span>
                    Processing time · {formatDuration(activePill.processingDurationSeconds)}
                  </span>
                ) : null}
                {!activePill.isDemo ? (
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={activePill.sources.some(
                      (source) => source.kind !== 'youtube' && source.originalAvailable === false,
                    )}
                    title={
                      activePill.sources.some(
                        (source) => source.kind !== 'youtube' && source.originalAvailable === false,
                      )
                        ? 'The original source was removed, so this Pill cannot be regenerated.'
                        : undefined
                    }
                    onClick={() => setRegenerateOpen(true)}
                  >
                    Regenerate Pill
                  </button>
                ) : null}
              </footer>
            </article>
            <nav
              className="section-trail w-[180px] max-h-[calc(100dvh_-_140px)] overflow-y-auto [border-left:0] p-0 gap-[4px] [&_span]:text-xs [&_span]:mb-3 [&_a]:[padding:8px_10px] [&_a]:leading-[1.5] [&_a]:text-xs max-[1280px]:hidden"
              aria-label="On this page"
            >
              <span>On this page</span>
              {activePill.artifact.sections.map((section) => (
                <a key={section.id} href={`#${section.id}`}>
                  {section.title}
                </a>
              ))}
            </nav>
          </div>
        ) : null}
      </main>

      <button
        type="button"
        className="chat-trigger border-0 [box-shadow:0_4px_8px_oklch(0.24_0.04_148_/_0.18)] [padding:12px_20px]"
        onClick={() => setChatOpen(true)}
        aria-label="Got a doubt? Ask this Study Pill"
      >
        <ChatCircleDotsIcon size={21} weight="fill" />
        <span>Got a doubt? 🤔</span>
      </button>

      <CreatePillDialog
        key={`create-${createOpen ? 'open' : 'closed'}`}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
      <CitationDialog citation={citation} onClose={() => setCitation(null)} />
      <VisualDialog visual={visual} onClose={() => setVisual(null)} />
      <ReadingSettingsDialog
        open={settingsOpen}
        readingSize={readingSize}
        readerBackground={readerBackground}
        onSize={setReadingSize}
        onBackground={chooseReaderBackground}
        onClose={() => setSettingsOpen(false)}
      />
      <FileLibraryDialog
        key={`library-${fileLibraryOpen ? 'open' : 'closed'}`}
        open={fileLibraryOpen}
        onClose={() => setFileLibraryOpen(false)}
      />
      <AlertDialog.Root open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="radix-dialog-content">
            <AlertDialog.Title className="radix-dialog-title">
              Regenerate this Study Pill?
            </AlertDialog.Title>
            <AlertDialog.Description className="radix-dialog-description">
              Noteesta will process the sources again and replace the generated notes and practice
              questions. This can take a few minutes.
            </AlertDialog.Description>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <button type="button" className="secondary-button">
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button type="button" className="primary-button" onClick={() => void handleRetry()}>
                  Regenerate
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <ChatPanel
        key={`chat-${activePill.id}`}
        open={chatOpen}
        pill={activePill}
        onClose={() => setChatOpen(false)}
        onCitation={setCitation}
      />
      <div className="toast" role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function ProcessingView({ pill }: { pill: StudyPill }) {
  return (
    <section className="processing-view" aria-live="polite">
      <SparkleIcon size={30} weight="duotone" />
      <p>{pill.stage ?? 'Preparing your sources'}</p>
      <h1>{pill.title}</h1>
      <ul className="processing-sources" aria-label="Sources being processed">
        {pill.sources.map((source) => (
          <li key={source.id}>
            <SourceIcon kind={source.kind} size={15} />
            <span>{source.name}</span>
          </li>
        ))}
      </ul>
      <div className="progress-line" aria-label={`${pill.progress}% complete`}>
        <span style={{ width: `${pill.progress}%` }} />
      </div>
      <small>{pill.progress}% complete. You can leave this page and come back.</small>
      <div className="document-skeleton" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
    </section>
  );
}

function FailedView({ pill, onRetry }: { pill: StudyPill; onRetry: () => void }) {
  return (
    <section className="failed-view">
      <h1>Generation stopped</h1>
      <p>{pill.error ?? 'A source could not be processed. Your uploads are still available.'}</p>
      <button
        type="button"
        className="primary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold shadow-none"
        onClick={onRetry}
      >
        Retry generation
      </button>
    </section>
  );
}

function LibrarySkeleton() {
  return (
    <div className="library-skeleton" aria-label="Loading library">
      <i />
      <i />
      <i />
    </div>
  );
}

function CitationDialog({ citation, onClose }: { citation: Citation | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useDialog(ref, Boolean(citation), onClose);
  return (
    <dialog
      ref={ref}
      className="dialog border-0 [box-shadow:var(--shadow)] rounded-2xl citation-dialog"
      aria-labelledby="citation-title"
    >
      {citation ? (
        <>
          <div className="dialog-header">
            <div>
              <p className="dialog-kicker">Source reference</p>
              <h2 id="citation-title">{citation.sourceName}</h2>
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
          <div className="dialog-body">
            <span className="source-locator">{citation.locator}</span>
            <blockquote>{citation.excerpt}</blockquote>
            <p className="dialog-help">
              This excerpt is the evidence attached to the generated statement.
            </p>
          </div>
        </>
      ) : null}
    </dialog>
  );
}

function VisualDialog({ visual, onClose }: { visual: VisualSpec | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useDialog(ref, Boolean(visual), onClose);
  return (
    <dialog
      ref={ref}
      className="dialog border-0 [box-shadow:var(--shadow)] rounded-2xl visual-dialog"
      aria-labelledby="visual-title"
    >
      {visual ? <VisualDialogContent key={visual.id} visual={visual} onClose={onClose} /> : null}
    </dialog>
  );
}

function VisualDialogContent({ visual, onClose }: { visual: VisualSpec; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  return (
    <>
      <div className="dialog-header">
        <div>
          <p className="dialog-kicker">Source-grounded visual</p>
          <h2 id="visual-title">{visual.title}</h2>
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
      <div className="visual-preview">
        <div className="visual-zoom" style={{ transform: `scale(${zoom})` }}>
          <VisualCanvas visual={visual} />
        </div>
      </div>
      <div className="dialog-footer visual-controls">
        <p>{Math.round(zoom * 100)}%</p>
        <div>
          <button
            type="button"
            className="icon-button min-w-[36px] min-h-[36px] rounded-[9px]"
            onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}
            aria-label="Zoom out"
          >
            <MagnifyingGlassMinusIcon />
          </button>
          <button
            type="button"
            className="icon-button min-w-[36px] min-h-[36px] rounded-[9px]"
            onClick={() => setZoom((value) => Math.min(2, value + 0.25))}
            aria-label="Zoom in"
          >
            <MagnifyingGlassPlusIcon />
          </button>
        </div>
      </div>
    </>
  );
}

function ChatPanel({
  open,
  pill,
  onClose,
  onCitation,
}: {
  open: boolean;
  pill: StudyPill;
  onClose: () => void;
  onCitation: (citation: Citation) => void;
}) {
  const [question, setQuestion] = useState('');
  const chatStorageKey = `noteesta-chat:${pill.id}`;
  const serializedTurns = useSyncExternalStore(
    useCallback((callback) => subscribeToChat(chatStorageKey, callback), [chatStorageKey]),
    useCallback(() => readChatSnapshot(chatStorageKey), [chatStorageKey]),
    () => '[]',
  );
  const turns = useMemo(() => parseChatTurns(serializedTurns), [serializedTurns]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [loading, reduce, turns]);

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => trigger?.focus();
  }, [open]);

  function saveTurns(nextTurns: Array<{ question: string; answer: ChatAnswer }>) {
    try {
      localStorage.setItem(chatStorageKey, JSON.stringify(nextTurns));
      window.dispatchEvent(new Event(`noteesta-chat-change:${chatStorageKey}`));
      setError('');
    } catch {
      setError('This chat could not be saved in this browser.');
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    const submittedQuestion = question.trim();
    setQuestion('');
    setPendingQuestion(submittedQuestion);
    setLoading(true);
    setError('');
    try {
      const result = pill.isDemo
        ? {
            answer:
              'ATP and NADPH carry energy from the light reactions to the Calvin cycle. The Calvin cycle uses them while fixing carbon dioxide into G3P.',
            citations: pill.artifact?.sections[1]?.citations ?? [],
            grounded: true,
          }
        : await askPill(pill.id, submittedQuestion);
      saveTurns([...turns, { question: submittedQuestion, answer: result }]);
    } catch (cause) {
      setQuestion(submittedQuestion);
      setError(cause instanceof Error ? cause.message : 'The question could not be answered.');
    } finally {
      setPendingQuestion('');
      setLoading(false);
    }
  }

  return (
    <motion.aside
      className={
        open
          ? 'chat-panel w-[var(--chat-width)] shadow-none [transform:none] [transition:visibility_0s] bg-canvas max-[1280px]:[box-shadow:-8px_0_24px_oklch(0.2_0.025_148_/_0.1)] max-[1280px]:[border-left:0] max-[761px]:w-[min(400px,_100%)] open'
          : 'chat-panel w-[var(--chat-width)] shadow-none [transform:none] [transition:visibility_0s] bg-canvas max-[1280px]:[box-shadow:-8px_0_24px_oklch(0.2_0.025_148_/_0.1)] max-[1280px]:[border-left:0] max-[761px]:w-[min(400px,_100%)]'
      }
      initial={false}
      animate={{ x: open ? 0 : '102%' }}
      transition={{ duration: reduce ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
      aria-hidden={!open}
      inert={open ? undefined : true}
      aria-label="Got a doubt? Ask this Study Pill"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="chat-header min-h-[100px] p-6 [&_p]:flex [&_p]:items-center [&_p]:gap-[7px] [&_p]:text-xs [&_p]:font-[550] [&_p]:[margin:0_0_7px] [&_h2]:m-0 [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.025em] max-[761px]:p-5.5">
        <div>
          <p>
            <ChatCircleDotsIcon size={16} weight="duotone" /> Your study companion
          </p>
          <h2>Got a doubt? 🤔</h2>
          <span className="block text-xs text-muted mt-1">Saved on this device</span>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          {turns.length ? (
            <button
              type="button"
              className="quiet-button flex min-h-[36px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-2 text-xs text-muted hover:bg-accent-soft"
              onClick={() => saveTurns([])}
              aria-label="Clear chat history"
              title="Clear chat history"
            >
              <TrashIcon size={15} />
              Clear
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button min-w-[36px] min-h-[36px] rounded-[9px]"
            onClick={onClose}
            aria-label="Close chat"
          >
            <XIcon />
          </button>
        </div>
      </div>
      <div
        className="chat-body p-6 overflow-y-auto max-[761px]:p-5.5"
        role="log"
        aria-label="Chat history"
        aria-live="polite"
        aria-relevant="additions"
      >
        {turns.length === 0 ? (
          <div className="chat-intro mt-[20px] [&_>_svg]:block [&_>_svg]:[padding:12px] [&_>_svg]:[box-sizing:content-box] [&_>_svg]:rounded-xl [&_>_svg]:bg-accent-soft [&_>_svg]:mb-[18px] [&_strong]:text-lg [&_strong]:font-semibold [&_p]:text-sm [&_p]:leading-[1.7] [&_p]:[margin:10px_0_24px]">
            <ChatCircleDotsIcon size={28} weight="duotone" />
            <strong>Make the tricky bits click.</strong>
            <p>
              Ask a question, explore a connection, or get a simpler explanation. Answers link back
              to your sources.
            </p>
            <div className="chat-suggestions grid gap-2 [&_button]:[border:1px_solid_var(--line)] [&_button]:bg-canvas [&_button]:[padding:12px_14px] [&_button]:rounded-[9px] [&_button]:text-ink [&_button]:text-left [&_button]:text-[13px] [&_button]:cursor-pointer [&_button:hover]:border-accent [&_button:hover]:bg-surface">
              {[
                'Explain the main ideas simply',
                'What should I remember?',
                'How do these concepts connect?',
              ].map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={() => {
                    setQuestion(suggestion);
                    inputRef.current?.focus();
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {turns.map((turn) => (
          <motion.div
            key={`${turn.question}-${turn.answer.answer}`}
            className="chat-response"
            initial={false}
            animate={{ opacity: 1 }}
          >
            <p className="chat-question [margin:0_0_18px_auto] w-[fit-content] max-w-[90%] bg-accent-soft text-ink text-[13px] leading-[1.6] [padding:12px_15px] rounded-[12px_12px_3px_12px]">
              {turn.question}
            </p>
            <div className="chat-answer bg-transparent p-0 text-sm leading-[1.8] [overflow-wrap:anywhere] [&_button]:max-w-full [&_button]:text-left [&_button]:leading-[1.5] [&_button]:[padding:8px_10px] [&_button]:bg-surface [&_button]:text-accent [&_button]:text-[11px]">
              <p>{turn.answer.answer}</p>
              <div>
                {turn.answer.citations.map((item) => (
                  <button
                    type="button"
                    key={`${item.sourceId}-${item.locator}-${item.excerpt}`}
                    onClick={() => onCitation(item)}
                  >
                    {item.sourceName}, {item.locator}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
        {loading ? (
          <div
            className="chat-loading [margin:24px_0] text-muted text-xs [&_.document-skeleton]:mt-4 [&_.document-skeleton]:gap-[9px] [&_.document-skeleton_i]:h-[10px] [&_.document-skeleton_i:first-child]:h-[10px] [&_.document-skeleton_i:first-child]:w-[92%]"
            role="status"
          >
            <p className="chat-question [margin:0_0_18px_auto] w-[fit-content] max-w-[90%] bg-accent-soft text-ink text-[13px] leading-[1.6] [padding:12px_15px] rounded-[12px_12px_3px_12px]">
              {pendingQuestion}
            </p>
            <span>Finding the answer in your sources</span>
            <div className="document-skeleton">
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div ref={transcriptEndRef} aria-hidden="true" />
      </div>
      <form
        className="chat-form bg-surface [padding:20px_24px_24px] gap-2.5 [&_label]:text-xs [&_label]:font-[550] [&_textarea]:min-h-[100px] [&_textarea]:max-h-[180px] [&_textarea]:resize-y [&_textarea]:bg-canvas [&_textarea]:text-sm max-[761px]:[padding:18px_22px]"
        onSubmit={submit}
      >
        <label htmlFor="chat-question">Question about {pill.title}</label>
        <textarea
          ref={inputRef}
          id="chat-question"
          aria-describedby="chat-keyboard-hint"
          rows={3}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="What would you like to understand?"
        />
        <p id="chat-keyboard-hint" className="m-0 text-xs text-muted">
          Enter to send · Shift + Enter for a new line
        </p>
        <button
          type="submit"
          className="primary-button min-h-[42px] rounded-[10px] whitespace-nowrap font-semibold shadow-none"
          disabled={loading || !question.trim()}
        >
          {loading ? 'Checking sources...' : 'Ask'}
        </button>
      </form>
    </motion.aside>
  );
}

function useDialog(
  ref: React.RefObject<HTMLDialogElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open, ref]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose, ref]);
}

function demoMarkdown(pill: StudyPill) {
  const lines = [`# ${pill.title}`, '', `> Demo lesson generated from fixture sources.`, ''];
  for (const section of pill.artifact?.sections ?? []) {
    lines.push(`## ${section.title}`, '', section.markdown, '');
  }
  lines.push('## Sources', '');
  pill.sources.forEach((source, index) =>
    lines.push(`${index + 1}. ${source.name}, ${source.detail}`),
  );
  return new Blob([lines.join('\n')], { type: 'text/markdown' });
}

function subscribeToChat(key: string, onChange: () => void) {
  const eventName = `noteesta-chat-change:${key}`;
  window.addEventListener('storage', onChange);
  window.addEventListener(eventName, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(eventName, onChange);
  };
}

function readChatSnapshot(key: string) {
  try {
    return localStorage.getItem(key) ?? '[]';
  } catch {
    return '[]';
  }
}

function parseChatTurns(serialized: string): Array<{ question: string; answer: ChatAnswer }> {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (turn): turn is { question: string; answer: ChatAnswer } =>
        typeof turn?.question === 'string' &&
        typeof turn?.answer?.answer === 'string' &&
        Array.isArray(turn?.answer?.citations),
    );
  } catch {
    return [];
  }
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
