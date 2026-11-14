# Note editing and history

Authenticated workspace notes are always editable. The public example stays read-only. Existing generated Markdown is converted into a structured document in the browser, retaining section IDs, citations, tables, code, and visuals.

## Saving and history

- Autosave runs after a 1.5-second typing pause, or after 10 seconds of continuous editing. Input composition finishes before saving.
- The original generated version is preserved. Changed saves are grouped into five-minute history entries, starting at the first edit. Unchanged saves create no revision. Restore and generation create separate entries.
- Version history previews notes without changing the current document. The current version has a distinct badge and background; the selected preview has a border. Restoring creates a new version and preserves history.
- Save failures retain the in-memory draft and show Retry, Copy draft, and Discard and reload. Workspace links, Pill switching, export, regeneration, and sign-out flush pending edits first. Browser exit warns while changes remain unsaved. This is not an offline editing mode: discarding a draft or closing the browser after accepting its warning loses unsaved edits.
- Concurrent edits use an expected revision. A stale request returns `409 notes_conflict`, without overwriting the server document. Copy the local draft before reloading; there is no automatic merge.

New sections begin without citations. Existing references move with their sections. Removing a section disables its roadmap link; restoring it re-enables the link. Sources remain in the source library. Notes can contain personal edits, so the footer no longer claims that every edited statement is source-grounded.

Regeneration adds a new notes version and keeps historical visuals at unique storage paths. Failed regeneration leaves the previous notes available. Restoring notes restores their text, references, and visuals; it does not regenerate practice materials or change the source evidence used by chat.

## Storage and API

The Pill's `notes_revision_id` points to an immutable snapshot in `pill_note_revisions`. Each snapshot links to the preceding save and the preceding five-minute history group. History follows only the committed group chain. Every save inserts its snapshot before conditionally advancing the Pill pointer; a stale save cannot replace a newer revision. A retry uses the same mutation UUID, including when an interrupted request left a prepared snapshot. No MongoDB replica-set transaction is required.

Existing Pills acquire their original snapshot lazily. Startup creates the collection index; no bulk migration is required. History has no automatic expiry. Snapshot responses never expose storage keys and refresh visual download URLs when read.

All routes require ownership of the Pill and use the `/api/v1/pills/{pillId}/notes` prefix:

| Method | Suffix | Behavior |
| --- | --- | --- |
| GET | — | Current snapshot |
| PUT | — | Save `{document, baseRevisionId, mutationId}` |
| GET | `/versions` | History summaries; optional `cursor` and `limit` (1–50) |
| GET | `/versions/{revisionId}` | Read-only version snapshot |
| POST | `/versions/{revisionId}/restore` | Restore with `{baseRevisionId, mutationId}` |

Saved JSON is validated against the supported editor nodes, formatting marks, reference IDs, link schemes, and named color palettes. Documents are limited to 1 MB. The editor JSON retains formatting; Markdown export uses escaped inline HTML for underline, text color, and highlights, alongside standard Markdown for other blocks.

## Checks

Backend coverage is in `apps/api/tests/test_notes.py`. Frontend autosave and document tests cover request serialization, retries, composition, Markdown conversion, and section IDs. `apps/web/e2e/notes.spec.ts` exercises the actual editor and modal using mocked authenticated API responses, including mobile selection and failed-save navigation.
