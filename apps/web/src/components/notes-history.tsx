'use client';

import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowLeftIcon, CheckIcon, ClockCounterClockwiseIcon, XIcon } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/components/app-providers';
import { NoteVersionPreview } from '@/components/notes-editor';
import * as api from '@/lib/api';
import type { Citation, VisualSpec } from '@/lib/types';

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function NoteHistoryDialog({
  pillId,
  currentRevisionId,
  onClose,
  onRestored,
  onCitation,
  onVisual,
}: {
  pillId: string;
  currentRevisionId: string;
  onClose: () => void;
  onRestored: () => Promise<void>;
  onCitation: (citation: Citation) => void;
  onVisual: (visual: VisualSpec) => void;
}) {
  const { user } = useSession();
  const client = useQueryClient();
  const [selected, setSelected] = useState(currentRevisionId);
  const [mobilePreview, setMobilePreview] = useState(false);
  const history = useInfiniteQuery({
    staleTime: 0,
    queryKey: ['user', user?.id, 'note-history', pillId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.getNoteVersions(pillId, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const preview = useQuery({
    queryKey: ['user', user?.id, 'note-version', pillId, selected],
    queryFn: () => api.getNoteVersion(pillId, selected),
  });
  const [restoreId, setRestoreId] = useState(() => crypto.randomUUID());
  const restore = useMutation({
    mutationFn: () => api.restoreNotes(pillId, selected, currentRevisionId, restoreId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['user', user?.id, 'note-history', pillId] });
      await onRestored();
    },
  });
  const current = currentRevisionId;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !restore.isPending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={`note-history-dialog${mobilePreview ? ' showing-preview' : ''}`}
          aria-busy={restore.isPending}
        >
          <header className="note-history-header">
            <div>
              <Dialog.Title>
                <ClockCounterClockwiseIcon size={25} /> Version history
              </Dialog.Title>
              <Dialog.Description>
                Preview a version before restoring its notes. Practice materials stay as they are.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="icon-button"
                aria-label="Close version history"
                disabled={restore.isPending}
              >
                <XIcon size={22} />
              </button>
            </Dialog.Close>
          </header>
          <div className="note-history-body">
            <aside className="note-version-list" aria-label="Saved note versions">
              {history.isPending ? <p role="status">Loading versions…</p> : null}
              {history.isError ? (
                <div role="alert">
                  <p>{history.error.message}</p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void history.refetch()}
                  >
                    Retry history
                  </button>
                </div>
              ) : null}
              {history.data?.pages
                .flatMap((page) => page.items)
                .map((item) => (
                  <button
                    type="button"
                    key={item.revisionId}
                    className={`note-version-item${current === item.revisionId ? ' current' : ''}`}
                    aria-pressed={selected === item.revisionId}
                    onClick={() => {
                      setSelected(item.revisionId);
                      setMobilePreview(true);
                      setRestoreId(crypto.randomUUID());
                      restore.reset();
                    }}
                  >
                    <span className="note-version-miniature" aria-hidden="true">
                      <b>Notes</b>
                      {item.excerpt}
                    </span>
                    <span>
                      <strong>{relativeTime(item.createdAt)}</strong>
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString()}
                      </time>
                      <span className="note-version-kind">
                        {item.kind === 'generated'
                          ? 'Generated'
                          : item.kind === 'restored'
                            ? 'Restored'
                            : 'Edited'}
                        {current === item.revisionId ? (
                          <span className="note-current-badge">
                            <CheckIcon size={13} /> Current
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                ))}
              {history.data && !history.data.pages[0].items.length ? (
                <p>No saved versions yet. Your generated notes will appear here.</p>
              ) : null}
              {history.hasNextPage ? (
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => void history.fetchNextPage()}
                  disabled={history.isFetchingNextPage}
                >
                  {history.isFetchingNextPage ? 'Loading…' : 'Load older versions'}
                </button>
              ) : null}
            </aside>
            <div className="note-history-preview">
              <div className="note-preview-actions">
                <button
                  type="button"
                  className="quiet-button note-history-back"
                  onClick={() => setMobilePreview(false)}
                >
                  <ArrowLeftIcon size={16} /> Versions
                </button>
                <span>{selected === current ? 'Current version' : 'Read-only preview'}</span>
                <button
                  type="button"
                  className="primary-button"
                  disabled={
                    selected === current || !preview.data || preview.isError || restore.isPending
                  }
                  onClick={() => restore.mutate()}
                >
                  {restore.isPending ? 'Restoring…' : 'Restore this version'}
                </button>
              </div>
              {restore.isError ? (
                <p className="notes-save-error" role="alert">
                  {restore.error.message}
                </p>
              ) : null}
              {preview.isPending ? <p role="status">Loading preview…</p> : null}
              {preview.isError ? (
                <div role="alert">
                  <p>{preview.error.message}</p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void preview.refetch()}
                  >
                    Retry preview
                  </button>
                </div>
              ) : null}
              {preview.data ? (
                <NoteVersionPreview
                  version={preview.data}
                  onCitation={onCitation}
                  onVisual={onVisual}
                />
              ) : null}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
