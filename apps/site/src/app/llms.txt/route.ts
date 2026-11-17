import { siteUrl } from '@/lib/site-url';

export function GET() {
  const markdown = `# Noteesta

> An open-source alternative to Turbo AI and Google NotebookLM. Self-host your study workspace and turn your materials into source-linked Study Pills with local Ollama or your own provider keys.

## Start here

- [Noteesta product and direction](${siteUrl}/llm): Full Markdown overview, current capabilities, plans, and limits.
- [Public website](${siteUrl}/): Product film, current capabilities, and a collapsed changelog.
- [Interactive Study Pill example](${siteUrl}/app): Simulated uploads, photosynthesis notes, visuals, source references, 3D, and practice. No account required.
- [Source repository](https://github.com/pradeept/noteesta): Implementation and contribution history.
- [Local setup](https://github.com/pradeept/noteesta#local-setup) and [Docker setup](https://github.com/pradeept/noteesta#docker): Run your own workspace. Ollama embeddings are required with every generation provider.
`;
  return new Response(markdown, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
