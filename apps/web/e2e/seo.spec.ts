import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false, userAgent: 'facebookexternalhit/1.1' });

for (const route of ['/', '/app']) {
  test(`${route} serves complete search and social metadata without JavaScript`, async ({
    page,
    request,
  }, testInfo) => {
    await page.goto(`${route}?utm_source=share`);
    const canonical = route === '/' ? 'https://noteesta.com' : `https://noteesta.com${route}`;
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', canonical);
    await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute(
      'content',
      canonical,
    );
    await expect(page.locator('head meta[property="og:site_name"]')).toHaveAttribute(
      'content',
      'Noteesta',
    );
    const title = await page.title();
    const description = await page.locator('head meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
    for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
      await expect(page.locator(`head ${selector}`)).toHaveAttribute('content', title);
    }
    for (const selector of [
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) {
      await expect(page.locator(`head ${selector}`)).toHaveAttribute('content', description!);
    }
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'index, follow',
    );
    await expect(page.locator('head meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );

    for (const [attribute, name] of [
      ['property', 'og:image'],
      ['name', 'twitter:image'],
    ]) {
      const tag = page.locator(`head meta[${attribute}="${name}"]`);
      await expect(tag).toHaveCount(1);
      const imageUrl = new URL((await tag.getAttribute('content'))!);
      expect(imageUrl.origin).toBe('https://noteesta.com');
      expect(imageUrl.pathname).toBe('/share/study-workspace-v1.png');
      await expect(page.locator(`head meta[${attribute}="${name}:alt"]`)).toHaveAttribute(
        'content',
        /open-source alternative to Turbo AI and Google NotebookLM/,
      );
      const response = await request.get(`${imageUrl.pathname}${imageUrl.search}`);
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('image/png');
      const image = await response.body();
      expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(image.readUInt32BE(16)).toBe(1200);
      expect(image.readUInt32BE(20)).toBe(630);
      expect(image.length).toBeLessThan(5_000_000);
      await testInfo.attach(`${name}.png`, { body: image, contentType: 'image/png' });
    }
    expect(await page.locator('head').innerHTML()).not.toContain('noteesta-og.jpg');
    expect(await page.locator('head').innerHTML()).not.toContain('sisters');
  });
}

test('the homepage explains the current positioning and exposes valid structured data', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.marketing-lead')).toContainText(
    'An open-source alternative to Turbo AI and Google NotebookLM.',
  );
  const json = await page.locator('script[type="application/ld+json"]').textContent();
  const data = JSON.parse(json!);
  expect(data['@context']).toBe('https://schema.org');
  expect(data['@graph']).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ '@type': 'WebSite', url: 'https://noteesta.com' }),
      expect.objectContaining({
        '@type': ['SoftwareApplication', 'SoftwareSourceCode'],
        applicationCategory: 'EducationalApplication',
        codeRepository: 'https://github.com/pradeept/noteesta',
      }),
    ]),
  );
});

test('crawler files list public pages and authentication stays out of search', async ({
  page,
  request,
}) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  expect(xml).toContain('<loc>https://noteesta.com</loc>');
  expect(xml).toContain('<loc>https://noteesta.com/app</loc>');
  expect(xml.match(/<loc>/g)).toHaveLength(2);
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain('Sitemap: https://noteesta.com/sitemap.xml');
  expect(await robots.text()).toContain('Disallow: /pills/');
  await page.goto('/login');
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0);
});
