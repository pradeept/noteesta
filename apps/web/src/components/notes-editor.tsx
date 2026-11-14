'use client';

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  EditorContent,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
} from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { Dialog, DropdownMenu, Popover } from 'radix-ui';
import {
  ClockCounterClockwiseIcon,
  DotsThreeIcon,
  HighlighterIcon,
  LinkIcon,
  TextAaIcon,
} from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CitationButton } from '@/components/citation-button';
import { FlowVisual } from '@/components/flow-visual';
import { useSession } from '@/components/app-providers';
import { useNotesGuard } from '@/components/notes-save-guard';
import { NoteHistoryDialog } from '@/components/notes-history';
import { NoteAutosave } from '@/lib/note-autosave';
import type { SaveState } from '@/lib/note-autosave';
import {
  colorNames,
  allowedNoteLink,
  canonicalDocument,
  emptySection,
  highlightNames,
  noteColors,
  noteHighlights,
  noteOutline,
  NoteRoot,
  NoteSection,
  NoteStructure,
  NoteSummary,
  NoteVisual,
  textOf,
  versionDocument,
} from '@/lib/note-document';
import * as api from '@/lib/api';
import type { Citation, NoteDocument, NoteVersion, VisualSpec } from '@/lib/types';
import { ApiError } from '@/lib/session';

type Outline = Array<{ id: string; title: string }>;
interface NoteContextValue {
  version: NoteVersion;
  onCitation: (citation: Citation) => void;
  onVisual: (visual: VisualSpec) => void;
}
const NoteContext = createContext<NoteContextValue | null>(null);

function SectionView({ node }: NodeViewProps) {
  const context = useContext(NoteContext);
  return (
    <NodeViewWrapper as="section" id={node.attrs.id} className="note-section">
      <NodeViewContent />
      <div className="section-citations" contentEditable={false} aria-label="Section sources">
        {(node.attrs.citationIds as string[]).length ? <span>Sources</span> : null}
        {(node.attrs.citationIds as string[]).map((id, index) =>
          context?.version.references[id] ? (
            <CitationButton
              key={id}
              citation={context.version.references[id]}
              index={index + 1}
              onOpen={context.onCitation}
            />
          ) : null,
        )}
      </div>
    </NodeViewWrapper>
  );
}

function VisualView({ node }: NodeViewProps) {
  const context = useContext(NoteContext);
  const visual = context?.version.visuals.find((item) => item.id === node.attrs.id);
  return (
    <NodeViewWrapper contentEditable={false}>
      {visual ? <FlowVisual visual={visual} onExpand={() => context?.onVisual(visual)} /> : null}
    </NodeViewWrapper>
  );
}

function extensions() {
  return [
    StarterKit.configure({
      document: false,
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, defaultProtocol: 'https', isAllowedUri: allowedNoteLink },
    }),
    NoteRoot,
    NoteStructure,
    NoteSummary,
    NoteSection.extend({ addNodeView: () => ReactNodeViewRenderer(SectionView) }),
    NoteVisual.extend({ addNodeView: () => ReactNodeViewRenderer(VisualView) }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    TableKit.configure({ table: { resizable: false } }),
  ];
}

export function NotesEditor({
  pillId,
  onCitation,
  onVisual,
  onOutline,
}: {
  pillId: string;
  onCitation: (citation: Citation) => void;
  onVisual: (visual: VisualSpec) => void;
  onOutline: (outline: Outline, words: number) => void;
}) {
  const { user } = useSession();
  const query = useQuery({
    queryKey: ['user', user?.id, 'notes', pillId],
    queryFn: ({ signal }) => api.getNotes(pillId, signal),
    staleTime: 0,
  });
  const [reset, setReset] = useState(0);
  if (query.isPending)
    return (
      <div className="notes-loading" role="status">
        Loading your notes…
      </div>
    );
  if (query.isError)
    return (
      <div className="notes-save-error" role="alert">
        <p>{query.error.message}</p>
        <button type="button" className="secondary-button" onClick={() => void query.refetch()}>
          Retry loading notes
        </button>
      </div>
    );
  return (
    <EditableNotes
      key={reset}
      initial={query.data}
      pillId={pillId}
      onCitation={onCitation}
      onVisual={onVisual}
      onOutline={onOutline}
      focusOnLoad={reset > 0}
      onReload={async () => {
        const result = await query.refetch();
        if (result.error) throw result.error;
        setReset((value) => value + 1);
      }}
    />
  );
}

function EditableNotes({
  initial,
  pillId,
  onCitation,
  onVisual,
  onOutline,
  onReload,
  focusOnLoad,
}: {
  initial: NoteVersion;
  pillId: string;
  onOutline: (outline: Outline, words: number) => void;
  onReload: () => Promise<void>;
  focusOnLoad: boolean;
  onCitation: (citation: Citation) => void;
  onVisual: (visual: VisualSpec) => void;
}) {
  const [startingVersion] = useState(initial);
  const [version, setVersion] = useState(initial);
  const [state, setState] = useState<SaveState>('saved');
  const [error, setError] = useState<Error>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const autosave = useRef<NoteAutosave | null>(null);
  const lastOutline = useRef('');
  const onOutlineRef = useRef(onOutline);
  useEffect(() => {
    onOutlineRef.current = onOutline;
  }, [onOutline]);
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { register } = useNotesGuard();
  const initialDocument = useMemo(() => versionDocument(startingVersion), [startingVersion]);
  const editor = useEditor({
    extensions: useMemo(() => extensions(), []),
    content: initialDocument,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'notes-prose',
        'aria-label': 'Editable notes',
        role: 'textbox',
        'aria-multiline': 'true',
      },
      handleDOMEvents: {
        compositionstart: () => {
          autosave.current?.composition(true);
          return false;
        },
        compositionend: () => {
          autosave.current?.composition(false);
          return false;
        },
      },
    },
    onUpdate: ({ editor: current }) => {
      const document = current.getJSON();
      autosave.current?.update(canonicalDocument(document));
      const outline = noteOutline(document);
      const serialized = JSON.stringify(outline);
      if (lastOutline.current !== serialized) {
        lastOutline.current = serialized;
        onOutlineRef.current(outline, textOf(document).split(/\s+/).length);
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    const controller = new NoteAutosave(
      canonicalDocument(editor.getJSON()),
      startingVersion.revisionId,
      async (document, base, mutation) => {
        await queryClient.cancelQueries({ queryKey: ['user', user?.id, 'notes', pillId] });
        return api.saveNotes(pillId, document, base, mutation);
      },
      (nextState, cause, savedVersion) => {
        setState(nextState);
        setError(cause);
        if (savedVersion) {
          setVersion(savedVersion);
          queryClient.setQueryData(['user', user?.id, 'notes', pillId], savedVersion);
          void queryClient.invalidateQueries({
            queryKey: ['user', user?.id, 'note-history', pillId],
          });
          onOutlineRef.current(
            noteOutline(controller.draft),
            textOf(controller.draft).split(/\s+/).length,
          );
        }
      },
    );
    autosave.current = controller;
    register(controller);
    if (focusOnLoad) editor.view.dom.focus({ preventScroll: true });
    onOutlineRef.current(
      noteOutline(editor.getJSON()),
      textOf(editor.getJSON()).split(/\s+/).length,
    );
    return () => {
      controller.dispose();
      register(null);
      autosave.current = null;
    };
  }, [editor, startingVersion.revisionId, pillId, queryClient, register, user?.id, focusOnLoad]);

  useEffect(() => {
    if (!editor || initial.revisionId === version.revisionId) return;
    const document = versionDocument(initial);
    if (autosave.current?.adopt(document, initial))
      editor.commands.setContent(document, { emitUpdate: false });
  }, [editor, initial, version.revisionId]);

  async function openHistory() {
    setHistoryBusy(true);
    try {
      await autosave.current?.flush();
      setHistoryOpen(true);
    } catch {
      /* Save error remains visible. */
    } finally {
      setHistoryBusy(false);
    }
  }

  async function reload() {
    try {
      await onReload();
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Could not reload notes.'));
    }
  }

  const context = useMemo(
    () => ({ version, onCitation, onVisual }),
    [version, onCitation, onVisual],
  );
  return (
    <NoteContext.Provider value={context}>
      <div className="notes-editor">
        <div className="notes-editor-header">
          <span
            role="status"
            aria-live="polite"
            className={state === 'error' ? 'save-status failed' : 'save-status'}
          >
            {state === 'saving'
              ? 'Saving…'
              : state === 'pending'
                ? 'Unsaved changes'
                : state === 'error'
                  ? 'Not saved'
                  : 'All changes saved'}
          </span>
          <button
            type="button"
            className="quiet-button"
            onClick={() => void openHistory()}
            disabled={historyBusy}
          >
            <ClockCounterClockwiseIcon size={18} /> Version history
          </button>
        </div>
        {state === 'error' ? (
          <div className="notes-save-error" role="alert">
            <p>{error?.message ?? 'Your changes could not be saved. Your draft is still here.'}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void autosave.current?.flush().catch(() => {})}
            >
              Retry save
            </button>
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(textOf(autosave.current?.draft ?? initialDocument))
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError(
                      new Error(
                        'Copy is unavailable. Select your notes and copy them before discarding.',
                      ),
                    ),
                  );
              }}
            >
              {copied ? 'Draft copied' : 'Copy draft'}
            </button>
            <button type="button" className="quiet-button" onClick={() => setDiscardOpen(true)}>
              Discard draft and reload
            </button>
            {error instanceof ApiError && error.status === 409 ? (
              <p>
                Another tab or generation changed these notes. Copy your draft before reloading.
              </p>
            ) : null}
          </div>
        ) : null}
        {editor ? (
          <>
            <div className="notes-desktop-toolbar">
              <FormattingToolbar editor={editor} />
            </div>
            <div className="notes-mobile-tools">
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button type="button" className="quiet-button">
                    <TextAaIcon size={20} /> Formatting
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="notes-toolbar-popover"
                    sideOffset={8}
                    collisionPadding={12}
                  >
                    <FormattingToolbar editor={editor} />
                    <Popover.Close className="quiet-button">Close formatting</Popover.Close>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
            <BubbleMenu
              editor={editor}
              className="notes-selection-toolbar"
              options={{
                strategy: 'fixed',
                placement: 'top',
                offset: 10,
                flip: true,
                shift: { padding: 12 },
              }}
              shouldShow={({ state: current }) =>
                !current.selection.empty && editor.view.dom.clientWidth < 600
              }
            >
              <FormattingToolbar editor={editor} compact />
            </BubbleMenu>
          </>
        ) : null}
        <EditorContent editor={editor} />
        <footer className="notes-footer">
          <span>
            {!version.document
              ? 'Generated from this Study Pill’s sources.'
              : 'These notes include your edits.'}
          </span>
          <span>Source links remain available for checking details.</span>
        </footer>
      </div>
      {historyOpen ? (
        <NoteHistoryDialog
          pillId={pillId}
          currentRevisionId={version.revisionId}
          onClose={() => setHistoryOpen(false)}
          onRestored={async () => {
            setHistoryOpen(false);
            await reload();
          }}
          onCitation={onCitation}
          onVisual={onVisual}
        />
      ) : null}
      <Dialog.Root open={discardOpen} onOpenChange={setDiscardOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="radix-dialog-content">
            <Dialog.Title>Discard unsaved changes?</Dialog.Title>
            <Dialog.Description>
              Your server version will replace this draft. Copy anything you want to keep first.
            </Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="secondary-button">
                  Keep editing
                </button>
              </Dialog.Close>
              <button type="button" className="primary-button" onClick={() => void reload()}>
                Discard and reload
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </NoteContext.Provider>
  );
}

export function NoteVersionPreview({ version, onCitation, onVisual }: NoteContextValue) {
  const document = useMemo(() => versionDocument(version), [version]);
  const editor = useEditor(
    {
      extensions: useMemo(() => extensions(), []),
      content: document,
      editable: false,
      immediatelyRender: false,
      editorProps: { attributes: { class: 'notes-prose notes-preview' } },
    },
    [version.revisionId],
  );
  const context = useMemo(
    () => ({ version, onCitation, onVisual }),
    [version, onCitation, onVisual],
  );
  return (
    <NoteContext.Provider value={context}>
      <EditorContent editor={editor} />
    </NoteContext.Provider>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function sectionAction(editor: Editor, action: 'add' | 'up' | 'down' | 'delete') {
  editor.view.dispatch(closeHistory(editor.state.tr));
  try {
    const { $from } = editor.state.selection;
    let depth = $from.depth;
    while (depth > 0 && $from.node(depth).type.name !== 'noteSection') depth -= 1;
    const sections: Array<{ offset: number; size: number; json: NoteDocument }> = [];
    editor.state.doc.forEach((node, offset) => {
      if (node.type.name === 'noteSection')
        sections.push({ offset, size: node.nodeSize, json: node.toJSON() });
    });
    const position = depth ? $from.before(depth) : -1;
    const index = sections.findIndex((section) => section.offset === position);
    if (action === 'add') {
      const at =
        index < 0 ? editor.state.doc.content.size : sections[index].offset + sections[index].size;
      editor
        .chain()
        .focus()
        .insertContentAt(at, emptySection())
        .setTextSelection(at + 2)
        .run();
      return;
    }
    if (index < 0) return;
    const section = sections[index];
    if (action === 'delete') {
      if (sections.length === 1)
        editor
          .chain()
          .focus()
          .insertContentAt(
            { from: section.offset, to: section.offset + section.size },
            emptySection(),
          )
          .run();
      else
        editor
          .chain()
          .focus()
          .deleteRange({ from: section.offset, to: section.offset + section.size })
          .run();
      return;
    }
    const neighbor = sections[index + (action === 'up' ? -1 : 1)];
    if (!neighbor) return;
    const start = Math.min(neighbor.offset, section.offset);
    editor
      .chain()
      .focus()
      .insertContentAt(
        {
          from: start,
          to: Math.max(neighbor.offset + neighbor.size, section.offset + section.size),
        },
        action === 'up' ? [section.json, neighbor.json] : [neighbor.json, section.json],
      )
      .setTextSelection(start + 2)
      .run();
  } finally {
    editor.view.dispatch(closeHistory(editor.state.tr));
  }
}

function FormattingToolbar({ editor, compact = false }: { editor: Editor; compact?: boolean }) {
  const linkId = useId();
  const selection = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      highlight: current.isActive('highlight'),
      heading: current.isActive('heading', { level: 3 })
        ? '3'
        : current.isActive('heading', { level: 4 })
          ? '4'
          : current.isActive('heading', { level: 2 })
            ? '2'
            : 'paragraph',
      undo: current.can().undo(),
      redo: current.can().redo(),
      table: current.isActive('table'),
    }),
  });
  const [link, setLink] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkError, setLinkError] = useState('');
  return (
    <div
      className={`note-formatting-toolbar${compact ? ' compact' : ''}`}
      role="toolbar"
      aria-label="Note formatting"
    >
      {!compact ? (
        <select
          aria-label="Text style"
          value={selection.heading}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'paragraph') editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .setHeading({ level: Number(value) as 3 | 4 })
                .run();
          }}
        >
          <option value="paragraph">Paragraph</option>
          <option value="2" disabled>
            Section title
          </option>
          <option value="3">Heading</option>
          <option value="4">Subheading</option>
        </select>
      ) : null}
      <ToolButton
        label="Bold"
        active={selection.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolButton>
      <ToolButton
        label="Italic"
        active={selection.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolButton>
      <ToolButton
        label="Underline"
        active={selection.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </ToolButton>
      {!compact ? (
        <ToolButton
          label="Strikethrough"
          active={selection.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </ToolButton>
      ) : null}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="Highlight color"
            title="Highlight color"
            aria-pressed={selection.highlight}
            onMouseDown={(event) => event.preventDefault()}
          >
            <HighlighterIcon size={19} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="notes-menu" sideOffset={6} collisionPadding={12}>
            {noteHighlights.map((color, index) => (
              <DropdownMenu.Item
                key={color}
                onSelect={() => editor.chain().focus().setHighlight({ color }).run()}
              >
                <span className="note-swatch" style={{ background: color }} />
                {highlightNames[index]} highlight
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item onSelect={() => editor.chain().focus().unsetHighlight().run()}>
              Remove highlight
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {!compact ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Text color"
              title="Text color"
              onMouseDown={(event) => event.preventDefault()}
            >
              <TextAaIcon size={19} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="notes-menu" sideOffset={6} collisionPadding={12}>
              {noteColors.map((color, index) => (
                <DropdownMenu.Item
                  key={color}
                  onSelect={() => editor.chain().focus().setColor(color).run()}
                >
                  <span className="note-swatch" style={{ background: color }} />
                  {colorNames[index]}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Item onSelect={() => editor.chain().focus().unsetColor().run()}>
                Default text color
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : null}
      <Popover.Root
        open={linkOpen}
        onOpenChange={(open) => {
          setLinkOpen(open);
          setLinkError('');
          if (open) setLink(String(editor.getAttributes('link').href ?? ''));
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Edit link"
            title="Edit link"
            onMouseDown={(event) => event.preventDefault()}
          >
            <LinkIcon size={18} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="notes-link-popover" sideOffset={8} collisionPadding={12}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!/^https?:\/\/\S+$|^mailto:\S+$/i.test(link)) {
                  setLinkError('Use an http, https, or mailto link.');
                  return;
                }
                editor.chain().focus().extendMarkRange('link').setLink({ href: link }).run();
                setLinkOpen(false);
              }}
            >
              <label htmlFor={linkId}>
                Link address
                <input
                  id={linkId}
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                  placeholder="https://example.com"
                />
              </label>
              {linkError ? <p role="alert">{linkError}</p> : null}
              <button type="submit" className="primary-button">
                Apply link
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => {
                  editor.chain().focus().unsetLink().run();
                  setLinkOpen(false);
                }}
              >
                Remove link
              </button>
            </form>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {!compact ? (
        <>
          <ToolButton
            label="Undo"
            disabled={!selection.undo}
            onClick={() => editor.chain().focus().undo().run()}
          >
            ↶
          </ToolButton>
          <ToolButton
            label="Redo"
            disabled={!selection.redo}
            onClick={() => editor.chain().focus().redo().run()}
          >
            ↷
          </ToolButton>
        </>
      ) : null}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="More formatting"
            title="More formatting"
            onMouseDown={(event) => event.preventDefault()}
          >
            <DotsThreeIcon size={22} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="notes-menu" sideOffset={6} collisionPadding={12}>
            {compact ? (
              <>
                <DropdownMenu.Item onSelect={() => editor.chain().focus().toggleStrike().run()}>
                  Strikethrough
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                >
                  Heading
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => editor.chain().focus().setParagraph().run()}>
                  Paragraph
                </DropdownMenu.Item>
                {noteColors.map((color, index) => (
                  <DropdownMenu.Item
                    key={color}
                    onSelect={() => editor.chain().focus().setColor(color).run()}
                  >
                    Text: {colorNames[index]}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Item onSelect={() => editor.chain().focus().unsetColor().run()}>
                  Default text color
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  disabled={!selection.undo}
                  onSelect={() => editor.chain().focus().undo().run()}
                >
                  Undo
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  disabled={!selection.redo}
                  onSelect={() => editor.chain().focus().redo().run()}
                >
                  Redo
                </DropdownMenu.Item>
              </>
            ) : null}
            <DropdownMenu.Item onSelect={() => editor.chain().focus().toggleBulletList().run()}>
              Bullet list
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().toggleOrderedList().run()}>
              Numbered list
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().toggleBlockquote().run()}>
              Quote
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().toggleCode().run()}>
              Inline code
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().toggleCodeBlock().run()}>
              Code block
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() =>
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
              }
            >
              Insert table
            </DropdownMenu.Item>
            {selection.table ? (
              <>
                <DropdownMenu.Item onSelect={() => editor.chain().focus().addRowAfter().run()}>
                  Add table row
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => editor.chain().focus().addColumnAfter().run()}>
                  Add table column
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => editor.chain().focus().deleteRow().run()}>
                  Delete table row
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => editor.chain().focus().deleteColumn().run()}>
                  Delete table column
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => editor.chain().focus().deleteTable().run()}>
                  Delete table
                </DropdownMenu.Item>
              </>
            ) : null}
            <DropdownMenu.Item onSelect={() => editor.chain().focus().unsetAllMarks().run()}>
              Clear formatting
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={() => sectionAction(editor, 'add')}>
              Add section
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => sectionAction(editor, 'up')}>
              Move section up
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => sectionAction(editor, 'down')}>
              Move section down
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => sectionAction(editor, 'delete')}>
              Delete section
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
