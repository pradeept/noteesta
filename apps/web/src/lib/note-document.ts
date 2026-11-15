import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { MarkdownManager } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import type { NoteDocument, NoteVersion } from '@/lib/types';

export const noteColors = ['#1f2937', '#166534', '#1d4ed8', '#7e22ce', '#b91c1c'];
export const noteHighlights = ['#fef08a', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fed7aa'];
export const colorNames = ['Slate', 'Green', 'Blue', 'Purple', 'Red'];
export const highlightNames = ['Yellow', 'Green', 'Blue', 'Purple', 'Orange'];

export const NoteRoot = Node.create({
  name: 'doc',
  topNode: true,
  content: 'noteSummary? noteSection+',
});
export const NoteSummary = Node.create({
  name: 'noteSummary',
  content: 'block+',
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-note-summary]' }],
  renderHTML: () => ['div', { 'data-note-summary': '', class: 'note-summary' }, 0],
});
export const NoteSection = Node.create({
  name: 'noteSection',
  content: 'heading block+',
  defining: true,
  isolating: true,
  addAttributes: () => ({ id: { default: null }, citationIds: { default: [], rendered: false } }),
  parseHTML: () => [{ tag: 'section[data-note-section]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'section',
    mergeAttributes(HTMLAttributes, { 'data-note-section': '' }),
    0,
  ],
});
export const NoteVisual = Node.create({
  name: 'noteVisual',
  group: 'block',
  atom: true,
  addAttributes: () => ({ id: { default: null } }),
  parseHTML: () => [{ tag: 'div[data-note-visual]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-note-visual': '' }),
  ],
});

export const NoteStructure = Extension.create({
  name: 'noteStructure',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _previous, state) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const transaction = state.tr;
          const ids = new Set<string>();
          state.doc.forEach((node, offset) => {
            if (node.type.name !== 'noteSection') return;
            let id = node.attrs.id as string | null;
            if (
              !id ||
              !id.trim() ||
              id.length > 1000 ||
              /[\u0000-\u001f]/.test(id) ||
              ids.has(id)
            ) {
              id = `section-${crypto.randomUUID()}`;
              transaction.setNodeMarkup(offset, undefined, { ...node.attrs, id, citationIds: [] });
            }
            ids.add(id);
            if (node.firstChild?.type.name === 'heading' && node.firstChild.attrs.level !== 2)
              transaction.setNodeMarkup(offset + 1, undefined, { level: 2 });
          });
          return transaction.docChanged ? transaction : null;
        },
      }),
    ];
  },
});

export function textOf(node: NoteDocument): string {
  if (node.type === 'hardBreak') return '\n';
  return (
    node.text ??
    (node.content ?? [])
      .map(textOf)
      .join(['paragraph', 'heading', 'codeBlock'].includes(node.type) ? '' : '\n')
  );
}

export function noteOutline(document: NoteDocument) {
  return (document.content ?? [])
    .filter((node) => node.type === 'noteSection')
    .map((node) => ({
      id: String(node.attrs?.id),
      title: textOf(node.content?.[0] ?? { type: 'heading' }) || 'Untitled section',
    }));
}

export function emptySection(): NoteDocument {
  return {
    type: 'noteSection',
    attrs: { id: `section-${crypto.randomUUID()}`, citationIds: [] },
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'New section' }] },
      { type: 'paragraph' },
    ],
  };
}

const markdown = new MarkdownManager({
  extensions: [StarterKit, TableKit, Highlight, TextStyle, Color],
});

export function allowedNoteLink(value: string): boolean {
  return /^(https?:\/\/|mailto:)\S+$/i.test(value);
}

function paletteColor(value: unknown): string {
  const color = String(value ?? '').toLowerCase();
  const rgb = color.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
  return rgb
    ? `#${rgb
        .slice(1)
        .map((channel) => Number(channel).toString(16).padStart(2, '0'))
        .join('')}`
    : color;
}

/** Normalize pasted HTML attributes to the same schema as toolbar-created formatting. */
export function canonicalDocument(node: NoteDocument): NoteDocument {
  const marks = node.marks?.flatMap((mark) => {
    if (mark.type === 'link') {
      const href = String(mark.attrs?.href ?? '');
      return allowedNoteLink(href)
        ? [
            {
              type: 'link',
              attrs: {
                href,
                target: '_blank',
                rel: 'noopener noreferrer nofollow',
                class: null,
                title:
                  typeof mark.attrs?.title === 'string' ? mark.attrs.title.slice(0, 500) : null,
              },
            },
          ]
        : [];
    }
    if (mark.type === 'highlight') {
      const color = paletteColor(mark.attrs?.color);
      return [
        {
          type: 'highlight',
          attrs: { color: noteHighlights.includes(color) ? color : noteHighlights[0] },
        },
      ];
    }
    if (mark.type === 'textStyle') {
      const color = paletteColor(mark.attrs?.color);
      return noteColors.includes(color) ? [{ type: 'textStyle', attrs: { color } }] : [];
    }
    return [mark];
  });
  const result: NoteDocument = {
    ...node,
    ...(node.type === 'heading'
      ? {
          attrs: { ...node.attrs, level: Math.max(2, Math.min(4, Number(node.attrs?.level) || 2)) },
        }
      : {}),
    ...(node.type === 'codeBlock'
      ? {
          attrs: {
            language: /^[\w#+.-]{0,50}$/.test(String(node.attrs?.language ?? ''))
              ? (node.attrs?.language ?? null)
              : null,
          },
        }
      : {}),
    ...(marks ? { marks } : {}),
    ...(node.content ? { content: node.content.map(canonicalDocument) } : {}),
  };
  if (result.marks?.length === 0) delete result.marks;
  return result;
}

export function versionDocument(version: NoteVersion): NoteDocument {
  if (version.document) return version.document;
  const generated = version.generated;
  if (!generated) return { type: 'doc', content: [emptySection()] };
  return {
    type: 'doc',
    content: [
      {
        type: 'noteSummary',
        content: [
          {
            type: 'paragraph',
            content: generated.summary ? [{ type: 'text', text: generated.summary }] : [],
          },
        ],
      },
      ...generated.sections.map((section, index): NoteDocument => {
        const source = section.markdown.replace(
          /^\s{0,3}#{1,3}\s+([^\n]+)\n*/,
          (heading, title: string) =>
            title
              .replace(/\s+#+\s*$/, '')
              .trim()
              .toLocaleLowerCase() === section.title.trim().toLocaleLowerCase()
              ? ''
              : heading,
        );
        const content = (
          (markdown.parse(source).content ?? [{ type: 'paragraph' }]) as NoteDocument[]
        ).map(canonicalDocument);
        if (index === Math.min(1, generated.sections.length - 1)) {
          version.visuals.forEach((visual) =>
            content.push({ type: 'noteVisual', attrs: { id: visual.id } }),
          );
        }
        return {
          type: 'noteSection',
          attrs: { id: section.id, citationIds: section.citationIds },
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: section.title }],
            },
            ...content,
          ],
        };
      }),
    ],
  };
}
