import type { Metadata } from 'next';

export const siteTitle = 'Noteesta — Open-source alternative to NotebookLM & Turbo AI';
export const siteDescription =
  'An open-source alternative to Google NotebookLM and Turbo AI. Turn PDFs, recordings, and notes into cited study materials. Self-host with Ollama or your API keys.';

// A new URL also lets sharing services fetch this card independently of the old poster.
export const socialImage = {
  url: '/share/study-workspace-v1.png',
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: 'Noteesta — Make sense of what you study. An open-source alternative to Turbo AI and Google NotebookLM. Source-linked notes, visuals, and practice.',
};

export function publicPageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path, types: { 'text/markdown': '/llm' } },
    openGraph: {
      title,
      description,
      siteName: 'Noteesta',
      locale: 'en_US',
      type: 'website',
      url: path,
      images: [socialImage],
    },
    // Next.js replaces nested metadata; include the shared image on every public page.
    twitter: { card: 'summary_large_image', title, description, images: [socialImage] },
    robots: {
      index: true,
      follow: true,
      googleBot: { 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
    },
  };
}
