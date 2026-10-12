import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-url';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: 'monthly', priority: 1 },
    { url: `${siteUrl}/app`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/llm`, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
