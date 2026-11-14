// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import {
  NoteRoot,
  NoteSection,
  NoteStructure,
  NoteSummary,
  NoteVisual,
  noteOutline,
  canonicalDocument,
  textOf,
  versionDocument,
} from '@/lib/note-document';
import type { NoteDocument, NoteVersion } from '@/lib/types';

const baseline: NoteVersion = {
  revisionId: 'r1',
  groupId: 'g1',
  kind: 'generated',
  createdAt: '',
  excerpt: '',
  document: null,
  references: {},
  visuals: [],
  generated: {
    summary: 'Big idea',
    sections: [
      {
        id: 'first',
        title: 'First section',
        citationIds: [],
        markdown:
          '## First section\n\n**Important** content.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nlet cell = 1;\n```',
      },
      {
        id: 'second',
        title: 'Second section',
        citationIds: [],
        markdown: '- One\n- Two\n\n> A quote',
      },
    ],
  },
};

function createEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ document: false, heading: { levels: [2, 3, 4] } }),
      NoteRoot,
      NoteSummary,
      NoteSection,
      NoteStructure,
      NoteVisual,
      TableKit,
    ],
    content: versionDocument(baseline),
  });
}

describe('note document structure', () => {
  it('normalizes pasted RGB colors and link attributes without modifying the original content', () => {
    const document: NoteDocument = {
      type: 'text',
      text: 'Example',
      marks: [
        { type: 'highlight', attrs: { color: 'rgb(254, 240, 138)' } },
        { type: 'textStyle', attrs: { color: 'rgb(22, 101, 52)' } },
        {
          type: 'link',
          attrs: {
            href: 'https://example.com',
            class: 'external-style',
            target: '_self',
            title: 'Example link',
          },
        },
      ],
    };
    const normalized = canonicalDocument(document);
    expect(normalized.marks?.[0].attrs?.color).toBe('#fef08a');
    expect(normalized.marks?.[1].attrs?.color).toBe('#166534');
    expect(normalized.marks?.[2].attrs).toMatchObject({
      class: null,
      target: '_blank',
      title: 'Example link',
    });
    expect(document.marks?.[0].attrs?.color).toBe('rgb(254, 240, 138)');
    expect(
      canonicalDocument({
        type: 'text',
        text: 'Unsafe',
        marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
      }).marks,
    ).toBeUndefined();
  });

  it('keeps words intact when inline formatting splits heading text', () => {
    const heading: NoteDocument = {
      type: 'heading',
      content: [
        { type: 'text', text: 'Cell struc' },
        { type: 'text', text: 'ture', marks: [{ type: 'bold' }] },
      ],
    };
    expect(textOf(heading)).toBe('Cell structure');
  });
  it('imports generated Markdown without losing tables, code, lists, or section anchors', () => {
    const editor = createEditor();
    const document = editor.getJSON();
    expect(noteOutline(document)).toEqual([
      { id: 'first', title: 'First section' },
      { id: 'second', title: 'Second section' },
    ]);
    const first = document.content?.[1];
    expect(first?.content?.filter((node) => node.type === 'heading')).toHaveLength(1);
    expect(first?.content?.some((node) => node.type === 'table')).toBe(true);
    expect(first?.content?.some((node) => node.type === 'codeBlock')).toBe(true);
    expect(editor.getText()).toContain('Important');
    editor.destroy();
  });

  it('gives pasted duplicate sections fresh IDs and keeps section titles at heading level two', () => {
    const editor = createEditor();
    const duplicate = editor.getJSON().content?.[1];
    editor.commands.insertContentAt(editor.state.doc.content.size, duplicate!);
    const outline = noteOutline(editor.getJSON());
    expect(new Set(outline.map((section) => section.id)).size).toBe(3);
    const sectionOffset = editor.state.doc.child(0).nodeSize;
    editor.commands.setTextSelection(sectionOffset + 2);
    editor.commands.setHeading({ level: 3 });
    const current: NoteDocument = editor.getJSON();
    expect(current.content?.[1].content?.[0].attrs?.level).toBe(2);
    editor.destroy();
  });
});
