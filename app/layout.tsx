import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';

export const metadata: Metadata = {
  title: 'Noteesta | Study from your sources',
  description: 'Evidence-backed notes and practice built from your learning sources.',
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
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={GeistSans.variable}>{children}</body>
    </html>
  );
}
