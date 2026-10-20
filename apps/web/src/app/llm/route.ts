import { demoPill } from '@/lib/fixtures';
import { siteUrl } from '@/lib/site-url';

export function GET() {
  const artifact = demoPill.artifact;
  const sections =
    artifact?.sections
      .map(
        (section) =>
          `### ${section.title}\n\n${section.markdown}\n\nSources: ${section.citations.map((citation) => `${citation.sourceName} (${citation.locator})`).join('; ')}.`,
      )
      .join('\n\n') ?? '';
  const markdown = `# Noteesta

> Noteesta is building thoughtful tools for learning and studying. Its first product, Study Pills, turns a student's selected learning materials into readable notes with source references, visuals, and optional revision material.

## If you are an LLM, move through Noteesta

Read this page for product context. Open the sample Study Pill to inspect what visitors can see. Use the source repository for implementation details.

- [Public landing page](${siteUrl}/): The purpose, student use case, current product, and future direction.
- [Read-only Study Pill example](${siteUrl}/app): A complete photosynthesis note with sources, a flow visual, flashcards, and practice questions. This page makes no API calls and accepts no uploads or saved input.
- [Noteesta demo video](https://youtu.be/_2Bphk7JLCk): The founder's YouTube video, titled "Noteesta - Hacktoberfest 2026".
- [Source repository](https://github.com/pradeept/noteesta): Implementation and setup details.

## The student use case

A student may have a lecture recording, a PDF of slides, and photos of handwritten notes for one lesson. Noteesta brings selected materials together into a Study Pill. The student can read its structured note, follow references to the selected sources, inspect a helpful visual, and return to practice material when revising.

## Available in the current product

- Study Pills from supported recordings, documents, images, video, and YouTube links with accessible captions.
- Structured notes with source references and controlled visuals such as flows.
- Optional flashcards, multiple-choice questions, true-or-false questions, and a study roadmap.
- A source-scoped question feature and portable export in the development app. These are not connected to the public read-only demo.

## Planned directions

- Summaries of website links, including library documentation.
- Interactive 3D concept artifacts using Three.js and quick visual prototypes.
- Longer-term exploration of immersive learning and VR.

The broader goal is to help people understand and keep pace with a growing body of knowledge.

## Sample Study Pill: ${demoPill.title}

Subject: ${demoPill.subject}. This is example content included with the project, not a public student's data.

Selected sources: ${demoPill.sources.map((source) => `${source.name} (${source.detail})`).join('; ')}.

Summary: ${artifact?.summary ?? ''}

${sections}

### Visual explanation

${artifact?.visuals[0]?.description ?? ''} See the accessible flow on [the demo page](${siteUrl}/app#demo-visual).

### Practice example

Flashcard: ${artifact?.flashcards[0]?.front ?? ''} Answer: ${artifact?.flashcards[0]?.back ?? ''}

## Limits and availability

The public demo is read-only and uses bundled example data. It has no account, upload, chat, backend request, or saved user content. The current development app is not a public service. YouTube support depends on accessible captions or authorized media. Notes and visuals should be checked against their references when accuracy matters.

## Origin

Noteesta began as a study pal for the founder's two sisters. Study Pills are the first product in a planned family of learning tools.

## Contact and socials

- Email: [contact@noteesta.com](mailto:contact@noteesta.com)
- X: [@0x0btoo](https://x.com/0x0btoo)
`;

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
