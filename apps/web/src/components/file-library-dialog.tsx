'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useLibrary, useWorkspaceMutations } from '@/lib/queries';
import { AlertDialog, Dialog } from 'radix-ui';
import {
  ArrowSquareOutIcon,
  DownloadSimpleIcon,
  FileIcon,
  LinkIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { LibraryEntry } from '@/lib/types';
import { SourceIcon } from '@/components/source-icon';

export function FileLibraryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const query = useLibrary(open);
  const mutations = useWorkspaceMutations();
  const entries = query.data ?? [];
  const loading = open && query.isPending;
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<LibraryEntry | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      await mutations.removeOriginal.mutateAsync(deleting.sourceId);
      toast.success('Original file deleted.');
      setDeleting(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The file could not be deleted.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(value) => !value && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="radix-dialog-content file-library-dialog">
            <div className="file-library-heading">
              <div>
                <p className="dialog-kicker">
                  <FileIcon size={17} /> Your files
                </p>
                <Dialog.Title className="radix-dialog-title">Source library</Dialog.Title>
                <Dialog.Description className="radix-dialog-description">
                  Find the originals and links attached to your Study Pills.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="icon-button" aria-label="Close source library">
                  <XIcon />
                </button>
              </Dialog.Close>
            </div>
            <div className="file-library-list" aria-busy={loading}>
              {loading ? <p className="library-empty">Loading your sources…</p> : null}
              {!loading && !error && !query.error && entries.length === 0 ? (
                <p className="library-empty">
                  Files and YouTube links will appear here when you add them to a Study Pill.
                </p>
              ) : null}
              {entries.map((entry) => (
                <article className="file-library-entry" key={entry.sourceId}>
                  <span className="file-library-icon">
                    <SourceIcon kind={entry.kind} size={18} />
                  </span>
                  <div className="file-library-details">
                    <strong>{entry.name}</strong>
                    <small>{entry.detail}</small>
                    <div className="file-pill-links">
                      {entry.pills.map((pill) => (
                        <span key={pill.id}>{pill.title}</span>
                      ))}
                    </div>
                  </div>
                  <div className="file-library-actions">
                    {entry.kind === 'youtube' && entry.youtubeUrl ? (
                      <a
                        href={entry.youtubeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="icon-button"
                        aria-label={`Open ${entry.name} on YouTube`}
                      >
                        <LinkIcon size={17} />
                        <ArrowSquareOutIcon size={12} />
                      </a>
                    ) : entry.originalAvailable ? (
                      <button
                        type="button"
                        disabled={mutations.download.isPending}
                        onClick={() => {
                          void mutations.download
                            .mutateAsync(entry.sourceId)
                            .then((url) => {
                              const anchor = document.createElement('a');
                              anchor.href = url;
                              anchor.rel = 'noreferrer';
                              anchor.click();
                            })
                            .catch((cause: unknown) =>
                              toast.error(
                                cause instanceof Error ? cause.message : 'Download unavailable.',
                              ),
                            );
                        }}
                        className="icon-button"
                        aria-label={`Download ${entry.name}`}
                      >
                        <DownloadSimpleIcon size={17} />
                      </button>
                    ) : (
                      <span className="file-unavailable">Original removed</span>
                    )}
                    {entry.kind !== 'youtube' && entry.originalAvailable ? (
                      <button
                        type="button"
                        className="icon-button danger-icon"
                        aria-label={`Delete ${entry.name}`}
                        onClick={() => setDeleting(entry)}
                      >
                        <TrashIcon size={17} />
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            {error || query.error ? (
              <p className="form-error" role="alert">
                {error || query.error?.message}
              </p>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <AlertDialog.Root
        open={Boolean(deleting)}
        onOpenChange={(value) => !value && setDeleting(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="radix-dialog-content file-delete-confirm">
            <AlertDialog.Title className="radix-dialog-title">
              Delete the original file?
            </AlertDialog.Title>
            <AlertDialog.Description className="radix-dialog-description">
              This removes {deleting?.name} from storage. Generated notes and citations will stay,
              but the original will no longer be available.
            </AlertDialog.Description>
            <p className="affected-pills-label">Used by</p>
            <ul className="affected-pills">
              {deleting?.pills.map((pill) => (
                <li key={pill.id}>{pill.title}</li>
              ))}
            </ul>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <button type="button" className="secondary-button" disabled={busy}>
                  Keep file
                </button>
              </AlertDialog.Cancel>
              <button
                type="button"
                className="danger-button"
                onClick={() => void confirmDelete()}
                disabled={busy}
              >
                {busy ? 'Deleting…' : 'Delete original'}
              </button>
            </div>
            {error || query.error ? (
              <p className="form-error" role="alert">
                {error || query.error?.message}
              </p>
            ) : null}
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
