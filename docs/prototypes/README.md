# Noteesta design prototypes

Open [index.html](index.html) directly in a current browser. No build, backend, external scripts, or network connection is needed. Keep the shared CSS and JS beside the HTML files.

| Direction | Layout and visual character | Entry |
| --- | --- | --- |
| Geist Study | Compact left library, monochrome controls, right document outline, sans-serif notes | [geist.html](geist.html) |
| Folio | Horizontal library, spacious reading desk, serif document, blue accents | [folio.html](folio.html) |
| Grove | Green library, soft segmented navigation, inline section trail, friendly spacing | [grove.html](grove.html) |

## Shared working interactions

- Source-selection dialog with multiple files, an optional YouTube URL, and independently selectable study extras.
- Simulated generation with progress, input validation, and cancellation when the dialog closes.
- Notes, flashcards, an MCQ, a true-or-false question, and a roadmap.
- Keyboard-accessible image preview, zoom, Escape dismissal, and return focus.
- Source excerpt dialogs, section navigation, focus mode, text size, dark appearance, and mobile library toggle.
- Downloadable ZIP containing actual Markdown and a rendered PNG visual with a relative image link.
- Native modal focus containment, skip link, reduced-motion support, chart text description, and semantic table headings.

## Prototype boundaries

The photosynthesis content and source excerpts are fixtures. The generation flow demonstrates controls and selected extras, but always loads the same sample lesson and labels its fixture sources. Uploaded files are not read, uploaded, transcribed, or used to generate content. User-selected source subsets are not applied to the fixture lesson. There is no authentication, persistence, live AI, source playback, or chat implementation in these prototypes.

The Markdown download is a representative export of the fixture, not a general Markdown serializer. ZIP generation is an uncompressed prototype implementation. Production export should use a maintained archive library.

## Design rationale

The frontend-design and Impeccable product guidance informed readable line lengths, restrained chrome, native controls, consistent interaction states, and accessible preview behavior. These are deliberately different layout explorations, not just color themes. No final brand direction has been selected.

Geist Study draws on the [official Geist reference](https://vercel.com/geist/introduction) and [Geist typeface](https://vercel.com/font). It is an independent interpretation, not an official component implementation. To remain offline and dependency-free, it uses a locally installed Geist font when present, then Arial. Folio uses the system Georgia serif; Grove uses the shared sans-serif stack.

The marketing-focused design-taste skill was inspected but not applied: its own scope excludes this kind of multi-step product UI.
