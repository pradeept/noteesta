import { expect, test } from '@playwright/test';

const repository = 'https://github.com/pradeept/noteesta';

test('GitHub and setup lead to the repository while the sample remains reachable', async ({
  page,
}) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.getByRole('link', { name: 'View on GitHub' })).toHaveAttribute(
    'href',
    repository,
  );
  await expect(navigation.getByRole('link', { name: 'Set up locally' })).toHaveAttribute(
    'href',
    `${repository}#local-setup`,
  );
  await expect(page.getByRole('link', { name: 'Docker setup', exact: true })).toHaveAttribute(
    'href',
    `${repository}#docker`,
  );
  await page
    .getByRole('navigation', { name: 'Footer links' })
    .getByRole('link', { name: 'Changelog', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#changelog details')).toHaveAttribute('open', '');
  await expect(
    page.locator('#changelog').getByRole('heading', { name: 'Unreleased' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Explore the sample', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Jump to the sample' })).toBeVisible();
});

test('Markdown release notes render on the server and open with a keyboard without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  const changelog = page.locator('#changelog details');
  const summary = changelog.locator('summary');
  await expect(changelog).not.toHaveAttribute('open', '');
  await expect(changelog.getByRole('heading', { name: 'Unreleased' })).not.toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(changelog).toHaveAttribute('open', '');
  await expect(changelog.getByRole('heading', { name: 'Unreleased' })).toBeVisible();
  await expect(changelog.getByRole('heading', { name: '2026-11-12' })).toBeVisible();
  await expect(changelog.getByRole('list').first()).toHaveCSS('list-style-type', 'disc');
  await expect(changelog.getByRole('listitem').filter({ hasText: 'BYOK' })).toBeVisible();
  await expect(
    changelog.getByRole('listitem').filter({ hasText: 'In-place rich-text' }),
  ).toBeVisible();
  await expect(
    changelog.getByRole('listitem').filter({ hasText: 'Email and password authentication' }),
  ).toBeVisible();
  await expect(changelog.getByRole('link', { name: 'setup guide', exact: true })).toHaveAttribute(
    'href',
    `${repository}#local-setup`,
  );
  await page.keyboard.press('Space');
  await expect(changelog).not.toHaveAttribute('open', '');
  await context.close();
});

test('the approved film loads on demand and plays with native controls', async ({ page }) => {
  const mediaRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('noteesta-intro.mp4')) mediaRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const video = page.locator('video');
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video).toHaveAttribute('controls', '');
  await page.locator('#changelog summary').click();
  expect(mediaRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Play the 43-second Noteesta film' }).click();
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(0);
  await expect(video).toBeFocused();
  await expect(page.getByRole('button', { name: 'Play the 43-second Noteesta film' })).toHaveCount(
    0,
  );
  expect(mediaRequests.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

for (const width of [320, 375, 768, 1440]) {
  test(`landing navigation and expanded changelog fit at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const navigation = page.getByRole('navigation', {
      name: 'Main navigation',
    });
    for (const link of await navigation.getByRole('link').all()) await expect(link).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`landing-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole('contentinfo')
      .screenshot({ path: testInfo.outputPath(`footer-${width}.png`) });
    await page.locator('#changelog summary').click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page
      .locator('#changelog')
      .screenshot({ path: testInfo.outputPath(`changelog-${width}.png`) });
  });
}

test('the page reflows at 200% zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { zoom: 2; }' });
  await page.locator('#changelog summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
