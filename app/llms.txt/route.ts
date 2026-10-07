import { siteUrl } from '@/lib/site-url';

export function GET() {
  const markdown = `# Noteesta

> A family of thoughtful learning tools, beginning with source-linked Study Pills.

## Start here

- [Noteesta product and direction](${siteUrl}/llm): Full Markdown overview, current capabilities, plans, and limits.
- [Public website](${siteUrl}/): Student use case and product story.
- [Read-only Study Pill example](${siteUrl}/app): Photosynthesis note, visual, references, and practice.
`;
  return new Response(markdown, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
