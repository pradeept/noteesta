'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  CaretDownIcon,
  FilesIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { Brand } from '@/components/brand';
import { CreatePillDialog } from '@/components/create-pill-dialog';
import { FileLibraryDialog } from '@/components/file-library-dialog';
import { ThemePicker } from '@/components/appearance-controls';
import { SourceIcon } from '@/components/source-icon';
import { createPill, listCollections, listLibrary, listPills } from '@/lib/api';
import { demoPill } from '@/lib/fixtures';
import type { Collection, CreatePillInput, LibraryEntry, StudyPill } from '@/lib/types';

const enableDemo = process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA !== 'false';

export function HomeDashboard() {
  const router = useRouter();
  const [pills, setPills] = useState<StudyPill[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sources, setSources] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [expandedCollection, setExpandedCollection] = useState<string | null>(null);
  const [palette, setPalette] = useState(() =>
    typeof document !== 'undefined'
      ? (document.documentElement.dataset.palette ?? 'grove')
      : 'grove',
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([listPills(), listCollections(), listLibrary()]).then(
      ([pillResult, collectionResult, sourceResult]) => {
        if (cancelled) return;
        if (pillResult.status === 'fulfilled') setPills(pillResult.value);
        else
          setError('Your Study Pills could not be loaded. Check the API connection and refresh.');
        if (collectionResult.status === 'fulfilled') setCollections(collectionResult.value);
        else
          setError('Your collections could not be loaded. Check the API connection and refresh.');
        if (sourceResult.status === 'fulfilled') setSources(sourceResult.value);
        else setSourceError('Source preview is unavailable right now.');
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(input: CreatePillInput) {
    const pill = await createPill(input);
    setPills((current) => [pill, ...current]);
    setCreateOpen(false);
    router.push(`/pills/${pill.id}`);
  }

  function choosePalette(value: string) {
    setPalette(value);
    document.documentElement.dataset.palette = value;
    localStorage.setItem('noteesta-palette', value);
  }

  const displayPills = pills.length ? pills : !loading && enableDemo ? [demoPill] : [];
  const processingCount = pills.filter((pill) =>
    ['queued', 'processing'].includes(pill.status),
  ).length;

  return (
    <div className="home-dashboard">
      <a className="skip-link" href="#dashboard-content">
        Skip to your library
      </a>
      <header className="home-header">
        <Brand href="/workspace" />
        <div className="home-header-actions">
          <ThemePicker value={palette} onChange={choosePalette} />
          <button
            type="button"
            className="quiet-button"
            aria-label="Open source library"
            onClick={() => setLibraryOpen(true)}
          >
            <FolderOpenIcon size={18} /> <span>Source library</span>
          </button>
          <button
            type="button"
            className="primary-button"
            aria-label="New Study Pill"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon size={17} weight="bold" /> <span>New Study Pill</span>
          </button>
        </div>
      </header>

      <main id="dashboard-content" className="home-content">
        <section className="home-welcome">
          <div>
            <p className="home-eyebrow">
              <SparkleIcon size={16} weight="duotone" /> Your study space
            </p>
            <h1>Welcome back.</h1>
            <p>Pick up a lesson, organize your Study Pills, or bring in something new.</p>
          </div>
        </section>

        {error ? (
          <p className="connection-note" role="alert">
            {error}
          </p>
        ) : null}

        <div className="home-stats" aria-label="Your library at a glance">
          <div>
            <BookOpenTextIcon size={22} weight="duotone" />
            <strong>{pills.length}</strong>
            <span>Study Pills</span>
          </div>
          <div>
            <FolderIcon size={22} weight="duotone" />
            <strong>{collections.length}</strong>
            <span>Collections</span>
          </div>
          <div>
            <FilesIcon size={22} weight="duotone" />
            <strong>{sources.length}</strong>
            <span>Sources</span>
          </div>
          {processingCount ? (
            <p>
              {processingCount} {processingCount === 1 ? 'Pill is' : 'Pills are'} being prepared.
            </p>
          ) : null}
        </div>

        <div className="home-grid">
          <section className="home-pills" aria-labelledby="home-pills-title">
            <div className="home-section-heading">
              <div>
                <p className="home-eyebrow">Your learning</p>
                <h2 id="home-pills-title">All Study Pills</h2>
              </div>
              <span>{displayPills.length} total</span>
            </div>
            {loading ? <p className="home-placeholder">Opening your library…</p> : null}
            {!loading && !displayPills.length ? (
              <div className="home-placeholder">
                <p>
                  No Study Pills yet. Use New Study Pill in the navbar to add your first source.
                </p>
              </div>
            ) : null}
            <div className="home-pill-list">
              {displayPills.map((pill) => (
                <PillCard key={pill.id} pill={pill} />
              ))}
            </div>
          </section>

          <div className="home-side">
            <section className="home-panel" aria-labelledby="home-collections-title">
              <div className="home-section-heading">
                <div>
                  <p className="home-eyebrow">Keep things together</p>
                  <h2 id="home-collections-title">Collections</h2>
                </div>
                <FolderIcon size={21} weight="duotone" />
              </div>
              {loading ? <p className="home-panel-empty">Loading collections…</p> : null}
              {!loading && !collections.length ? (
                <p className="home-panel-empty">
                  Collections you create appear here. Open a Study Pill to organize it.
                </p>
              ) : null}
              <div className="home-collection-list">
                {collections.map((collection) => {
                  const contained = pills.filter((pill) => pill.collectionId === collection.id);
                  const open = expandedCollection === collection.id;
                  return (
                    <div key={collection.id} className="home-collection">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setExpandedCollection(open ? null : collection.id)}
                      >
                        <i
                          className={`collection-dot color-${collection.color}`}
                          aria-hidden="true"
                        />
                        <span>{collection.name}</span>
                        <small>{contained.length}</small>
                        <CaretDownIcon size={14} className={open ? 'expanded' : ''} />
                      </button>
                      {open ? (
                        <div className="home-collection-pills">
                          {contained.length ? (
                            contained.map((pill) => (
                              <Link key={pill.id} href={`/pills/${pill.id}`}>
                                {pill.title}
                                <ArrowRightIcon size={14} />
                              </Link>
                            ))
                          ) : (
                            <p>No Study Pills in this collection yet.</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="home-panel" aria-labelledby="home-sources-title">
              <div className="home-section-heading">
                <div>
                  <p className="home-eyebrow">Your references</p>
                  <h2 id="home-sources-title">Source library</h2>
                </div>
                <FilesIcon size={21} weight="duotone" />
              </div>
              {sourceError ? <p className="home-panel-empty">{sourceError}</p> : null}
              {!sourceError && !sources.length ? (
                <p className="home-panel-empty">
                  Files and YouTube links attached to your Study Pills will appear here.
                </p>
              ) : null}
              {sources.slice(0, 4).map((source) => (
                <div className="home-source" key={source.sourceId}>
                  <SourceIcon kind={source.kind} size={19} />
                  <div>
                    <strong>{source.name}</strong>
                    <small>{source.pills.map((pill) => pill.title).join(', ')}</small>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="home-panel-action"
                onClick={() => setLibraryOpen(true)}
              >
                Open source library <ArrowRightIcon size={15} />
              </button>
            </section>
          </div>
        </div>
      </main>
      <CreatePillDialog
        key={`home-create-${createOpen ? 'open' : 'closed'}`}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
      <FileLibraryDialog
        key={`home-library-${libraryOpen ? 'open' : 'closed'}`}
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
      />
    </div>
  );
}

function PillCard({ pill }: { pill: StudyPill }) {
  return (
    <Link href={`/pills/${pill.id}`} className="home-pill-card">
      <span className="home-pill-icon">
        <BookOpenTextIcon size={21} weight="duotone" />
      </span>
      <span className="home-pill-copy">
        <strong>{pill.title}</strong>
        <small>
          {pill.subject} · {pill.sources.length} {pill.sources.length === 1 ? 'source' : 'sources'}
        </small>
        {pill.description ? <span>{pill.description}</span> : null}
      </span>
      <span className={`home-status status-${pill.status}`}>
        {pill.isDemo ? 'Example' : pill.status}
      </span>
      <ArrowRightIcon className="home-pill-arrow" size={18} />
    </Link>
  );
}
