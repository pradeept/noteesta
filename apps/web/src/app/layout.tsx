import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { siteUrl } from '@/lib/site-url';
import './globals.css';
import './marketing.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Noteesta | Study from your sources',
  description: 'Evidence-backed notes and practice built from your learning sources.',
  openGraph: {
    siteName: 'Noteesta',
    images: [
      {
        url: '/noteesta-og.jpg',
        width: 1200,
        height: 630,
        alt: 'Noteesta, a study pal for learning from your sources',
      },
    ],
  },
  twitter: { card: 'summary_large_image', images: ['/noteesta-og.jpg'] },
};

const themeScript = `
try {
  const saved = localStorage.getItem('noteesta-theme');
  const dark = saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.palette = localStorage.getItem('noteesta-palette') || 'grove';
  document.documentElement.dataset.readerBackground = localStorage.getItem('noteesta-reader-background') || 'canvas';
} catch (_) {}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="alternate" href="/llms.txt" type="text/markdown" title="Noteesta for LLMs" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={GeistSans.variable}>{children}</body>
    </html>
  );
}
