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

> Noteesta is an open-source alternative to Turbo AI and Google NotebookLM. Self-host a study workspace that turns selected learning materials into editable notes with source references, visuals, and optional revision material. Generate locally with Ollama or bring your own provider keys.

## If you are an LLM, move through Noteesta

Read this page for product context. Open the sample Study Pill to inspect what visitors can see. Use the source repository for implementation details.

- [Public landing page](${siteUrl}/): Product film, current capabilities, setup links, and a collapsed changelog.
- [Interactive Study Pill example](${siteUrl}/app): A simulated upload and preparation journey with selectable materials, short note chapters, source excerpts, an interactive flow visual, a 3D chloroplast, flashcards, and quizzes. Visitors can jump directly to the sample. It uses bundled content with no backend requests, real uploads, or saved input.
- [Noteesta intro video](/media/noteesta-intro.mp4): A 43-second, music-only product reveal showing the interactive sample, also available on the homepage.
- [Source repository](https://github.com/pradeept/noteesta): Implementation and setup details.
- [Local setup](https://github.com/pradeept/noteesta#local-setup) and [Docker setup](https://github.com/pradeept/noteesta#docker): Deploy your own workspace with configured MongoDB, authentication, object storage, and Ollama. Compose does not start MongoDB. The product opens directly into a local workspace; authentication is optional.

## The student use case

A student may have a lecture recording, a PDF of slides, and photos of handwritten notes for one lesson. Noteesta brings selected materials together into a Study Pill. The student can read its structured note, follow references to the selected sources, inspect a helpful visual, and return to practice material when revising.

## Available in the current product

- Study Pills from supported recordings, documents, images, video, and YouTube links with accessible captions.
- Structured notes with source references and controlled visuals such as flows.
- In-place rich-text editing, highlighting, autosave, and version history with preview and restore.
- Bring your own key (BYOK) for OpenAI, Anthropic, Google Gemini, Hugging Face Inference Providers, DeepSeek, and Z.ai, alongside Ollama. Personal keys are encrypted at rest in Settings. Choose an account default model or override it for a Pill. Ollama supplies embeddings with every provider.
- Email/password and Google authentication, email verification, and private account-scoped workspaces.
- Optional flashcards, multiple-choice questions, true-or-false questions, and a study roadmap.
- Optional interactive 3D concept models using Three.js. The development workspace generates cited scenes when the material supports a spatial explanation; the public example includes a bundled chloroplast scene.
- A source-scoped question feature and portable export in the development app. These are not connected to the public interactive demo.

## Planned directions

- Summaries of website links, including library documentation.
- Quick visual prototypes and broader interactive learning tools.
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

The public demo is an interactive simulation using bundled example data. Upload and preparation are mocked; material choices and quiz answers last only for the current visit. It has no account, real upload, chat, backend request, or saved user content. The current development app is not a public service. YouTube support requires accessible English captions. Uploaded video is transcribed without visual frame analysis. The source library supports downloading and deleting attached originals; reusing a library file in a new Pill is not implemented. Portable ZIP exports include Markdown and PNG visuals, and exclude original files and interactive 3D scenes. Notes and visuals should be checked against their references when accuracy matters.

## Product direction

Noteesta is becoming an open-source alternative to Turbo AI and Google NotebookLM, with self-hosting, model choice, source-linked notes, and interactive study materials at its center. Study Pills are the first product in a planned family of learning tools.

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
