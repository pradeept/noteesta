'use client';

import { useMemo, useState } from 'react';
import { AlertDialog, Dialog, DropdownMenu, RadioGroup } from 'radix-ui';
import {
  ArrowBendUpRightIcon,
  ArrowClockwiseIcon,
  CheckIcon,
  CaretDownIcon,
  DotsThreeIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilSimpleIcon,
  PillIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { Collection, CollectionColor, StudyPill } from '@/lib/types';
import { createCollection, updateCollection } from '@/lib/api';

const collectionColors: CollectionColor[] = [
  'moss',
  'ocean',
  'terracotta',
  'plum',
  'gold',
  'slate',
];

export function CollectionNavigation({
  pills,
  collections,
  activeId,
  onSelect,
  onCollectionCreated,
  onCollectionUpdated,
  onCollectionDeleted,
  onMove,
}: {
  pills: StudyPill[];
  collections: Collection[];
  activeId: string;
  onSelect: (id: string) => void;
  onCollectionCreated: (collection: Collection) => void;
  onCollectionUpdated: (collection: Collection) => void;
  onCollectionDeleted: (id: string) => Promise<void>;
  onMove: (pillIds: string[], collectionId: string | null) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>('all');
  const [selecting, setSelecting] = useState(false);
  const [editor, setEditor] = useState<{ open: boolean; collection?: Collection }>({ open: false });
  const [deleting, setDeleting] = useState<Collection | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const [moving, setMoving] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const visiblePills = useMemo(
    () =>
      expanded && expanded !== 'all'
        ? pills.filter((pill) => pill.collectionId === expanded)
        : pills,
    [expanded, pills],
  );

  async function moveTo(collectionId: string | null) {
    setMoving(true);
    try {
      await onMove(selectedIds, collectionId);
      setSelectedIds([]);
      setSelecting(false);
      setBulkError('');
    } catch (cause) {
      setBulkError(cause instanceof Error ? cause.message : 'Study Pills could not be moved.');
    } finally {
      setMoving(false);
    }
  }

  const pillList = (
    <div className="pill-nav-list" id="library-pill-list" hidden={!expanded}>
      {visiblePills.map((pill) => {
        const selected = selectedIds.includes(pill.id);
        return (
          <div
            className={`pill-nav-row ${selecting ? 'selecting' : ''} ${pill.id === activeId ? 'active' : ''}`}
            key={pill.id}
          >
            {selecting ? (
              <label className="pill-select-label" htmlFor={`select-pill-${pill.id}`}>
                <input
                  id={`select-pill-${pill.id}`}
                  type="checkbox"
                  checked={selected}
                  disabled={pill.isDemo}
                  onChange={() =>
                    setSelectedIds((current) =>
                      selected ? current.filter((id) => id !== pill.id) : [...current, pill.id],
                    )
                  }
                  aria-label={`Select ${pill.title}`}
                />
              </label>
            ) : null}
            <button type="button" className="library-item" onClick={() => onSelect(pill.id)}>
              <span className="library-item-title">
                <PillIcon size={17} weight="duotone" />
                <span className="pill-title-text">{pill.title}</span>
                {pill.status === 'failed' ? (
                  <WarningCircleIcon
                    className="status-icon failed"
                    size={16}
                    role="img"
                    aria-label="Failed"
                  />
                ) : pill.status === 'queued' ? (
                  <ArrowClockwiseIcon
                    className="status-icon queued"
                    size={16}
                    role="img"
                    aria-label="Queued or retrying"
                  />
                ) : pill.status === 'processing' ? (
                  <span className="status-dot processing" aria-label="Processing" />
                ) : null}
              </span>
              <small>
                {pill.subject} · {pill.sources.length}{' '}
                {pill.sources.length === 1 ? 'source' : 'sources'}
              </small>
              {pill.tags.length ? (
                <small className="pill-tags">{pill.tags.join(' · ')}</small>
              ) : null}
              {pill.status === 'processing' || pill.status === 'queued' ? (
                <span className="mini-progress" aria-label={`${pill.progress}% complete`}>
                  <i style={{ width: `${pill.progress}%` }} />
                </span>
              ) : null}
            </button>
          </div>
        );
      })}
      {!visiblePills.length ? <p className="library-empty">No Study Pills here yet.</p> : null}
    </div>
  );

  return (
    <>
      <div className="library-controls">
        <span>Your library</span>
        <button
          type="button"
          className="quiet-button library-select-toggle"
          aria-pressed={selecting}
          onClick={() => {
            setSelecting((current) => !current);
            setSelectedIds([]);
            setBulkError('');
          }}
        >
          {selecting ? 'Done' : 'Select'}
        </button>
      </div>
      {selecting ? (
        <div className="bulk-toolbar" aria-live="polite">
          <span>
            {selectedIds.length ? `${selectedIds.length} selected` : 'Choose Study Pills'}
          </span>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="secondary-button"
                disabled={moving || !selectedIds.length}
              >
                <ArrowBendUpRightIcon size={16} /> Move to
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="menu-content" sideOffset={5} align="start">
                <DropdownMenu.Item className="menu-item" onSelect={() => void moveTo(null)}>
                  No collection
                </DropdownMenu.Item>
                {collections.map((collection) => (
                  <DropdownMenu.Item
                    className="menu-item"
                    key={collection.id}
                    onSelect={() => void moveTo(collection.id)}
                  >
                    <i className={`collection-dot color-${collection.color}`} aria-hidden="true" />
                    {collection.name}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button
            type="button"
            className="icon-button"
            aria-label="Exit selection"
            onClick={() => {
              setSelectedIds([]);
              setSelecting(false);
            }}
          >
            <XIcon size={16} />
          </button>
        </div>
      ) : null}
      {bulkError ? (
        <p className="form-error" role="alert">
          {bulkError}
        </p>
      ) : null}

      <button
        type="button"
        className={`library-filter ${expanded === 'all' ? 'active' : ''}`}
        aria-expanded={expanded === 'all'}
        aria-controls="library-pill-list"
        onClick={() => setExpanded((current) => (current === 'all' ? null : 'all'))}
      >
        <FolderIcon size={18} weight="duotone" />
        <span>All Study Pills</span>
        <small>{pills.length}</small>
        <CaretDownIcon className="library-caret" size={13} />
      </button>
      {expanded === 'all' ? pillList : null}
      <div className="collection-heading">
        <span>Collections</span>
        <button
          type="button"
          className="icon-button min-w-[32px] min-h-[32px] rounded-[8px]"
          aria-label="Create collection"
          onClick={() => setEditor({ open: true })}
        >
          <FolderPlusIcon size={17} />
        </button>
      </div>
      {collections.map((collection) => (
        <div className="collection-group" key={collection.id}>
          <div className="collection-row">
            <button
              type="button"
              className={`library-filter ${expanded === collection.id ? 'active' : ''}`}
              aria-expanded={expanded === collection.id}
              aria-controls="library-pill-list"
              onClick={() =>
                setExpanded((current) => (current === collection.id ? null : collection.id))
              }
            >
              <i className={`collection-dot color-${collection.color}`} aria-hidden="true" />
              <FolderIcon size={17} weight="duotone" />
              <span>{collection.name}</span>
              <small>{pills.filter((pill) => pill.collectionId === collection.id).length}</small>
              <CaretDownIcon className="library-caret" size={13} />
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="icon-button collection-menu-trigger"
                  aria-label={`Options for ${collection.name}`}
                >
                  <DotsThreeIcon size={18} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="menu-content" sideOffset={5} align="end">
                  <DropdownMenu.Item
                    className="menu-item"
                    onSelect={() => setEditor({ open: true, collection })}
                  >
                    <PencilSimpleIcon size={16} /> Rename or recolor
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="menu-separator" />
                  <DropdownMenu.Item
                    className="menu-item danger-item"
                    onSelect={() => setDeleting(collection)}
                  >
                    <XIcon size={16} /> Delete collection
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
          {expanded === collection.id ? pillList : null}
        </div>
      ))}

      <CollectionEditor
        key={`${editor.open}-${editor.collection?.id ?? 'new'}`}
        open={editor.open}
        collection={editor.collection}
        onClose={() => setEditor({ open: false })}
        onCreated={(collection) => {
          onCollectionCreated(collection);
          setEditor({ open: false });
          setExpanded(collection.id);
        }}
        onUpdated={(collection) => {
          onCollectionUpdated(collection);
          setEditor({ open: false });
        }}
      />
      <AlertDialog.Root
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="radix-dialog-content collection-confirm">
            <AlertDialog.Title className="radix-dialog-title">Delete collection?</AlertDialog.Title>
            <AlertDialog.Description className="radix-dialog-description">
              Study Pills in {deleting?.name} will stay in your library without a collection.
            </AlertDialog.Description>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <button type="button" className="secondary-button">
                  Keep collection
                </button>
              </AlertDialog.Cancel>
              <button
                type="button"
                className="danger-button"
                disabled={deletePending}
                onClick={async () => {
                  if (!deleting) return;
                  setDeletePending(true);
                  setDeleteError('');
                  try {
                    await onCollectionDeleted(deleting.id);
                    setDeleting(null);
                  } catch (cause) {
                    setDeleteError(
                      cause instanceof Error ? cause.message : 'Collection could not be deleted.',
                    );
                  } finally {
                    setDeletePending(false);
                  }
                }}
              >
                {deletePending ? 'Deleting…' : 'Delete collection'}
              </button>
            </div>
            {deleteError ? (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            ) : null}
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

function CollectionEditor({
  open,
  collection,
  onClose,
  onCreated,
  onUpdated,
}: {
  open: boolean;
  collection?: Collection;
  onClose: () => void;
  onCreated: (collection: Collection) => void;
  onUpdated: (collection: Collection) => void;
}) {
  const [name, setName] = useState(collection?.name ?? '');
  const [color, setColor] = useState<CollectionColor>(collection?.color ?? 'moss');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (collection) {
        onUpdated(await updateCollection(collection.id, { name, color }));
      } else {
        onCreated(await createCollection({ name, color }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Collection could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="radix-dialog-content collection-editor">
          <Dialog.Title className="radix-dialog-title">
            {collection ? 'Edit collection' : 'Create a collection'}
          </Dialog.Title>
          <Dialog.Description className="radix-dialog-description">
            Give related Study Pills a shared place in your library.
          </Dialog.Description>
          <form onSubmit={submit}>
            <label className="field" htmlFor="collection-name">
              <span>Collection name</span>
              <input
                id="collection-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                required
              />
            </label>
            <fieldset className="collection-color-picker">
              <legend>Color</legend>
              <RadioGroup.Root
                value={color}
                onValueChange={(value) => setColor(value as CollectionColor)}
              >
                {collectionColors.map((item) => (
                  <RadioGroup.Item
                    key={item}
                    value={item}
                    className={`collection-swatch color-${item}`}
                    aria-label={`${item} color`}
                  >
                    <RadioGroup.Indicator>
                      <CheckIcon size={15} weight="bold" />
                    </RadioGroup.Indicator>
                  </RadioGroup.Item>
                ))}
              </RadioGroup.Root>
            </fieldset>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="secondary-button">
                  Cancel
                </button>
              </Dialog.Close>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? 'Saving…' : collection ? 'Save collection' : 'Create collection'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
