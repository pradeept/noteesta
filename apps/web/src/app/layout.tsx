import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { siteUrl } from '@/lib/site-url';
import { siteDescription, siteTitle, socialImage } from '@/lib/seo';
import { AppProviders } from '@/components/app-providers';
import './globals.css';
import './marketing.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  applicationName: 'Noteesta',
  category: 'education',
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    siteName: 'Noteesta',
    type: 'website',
    locale: 'en_US',
    images: [socialImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [socialImage],
  },
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
      <body className={GeistSans.variable}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
