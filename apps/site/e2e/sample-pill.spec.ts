import { expect, test, type Page } from '@playwright/test';

function activity(page: Page, name: string) {
  return page
    .getByRole('navigation', { name: 'Study activities' })
    .getByRole('button', { name, exact: true });
}

async function openSample(page: Page) {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Jump to the sample' }).click();
  await expect(page.getByRole('heading', { name: 'Photosynthesis, made clear' })).toBeVisible();
}

test('mock upload, material selection, preparation, and restart never call the backend', async ({
  page,
}, testInfo) => {
  const apiCalls: string[] = [];
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url());
  });
  await page.goto('/app');
  await expect(page.locator('h1')).not.toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('sample-upload-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Upload sample sources' }).click();
  await expect(page.getByRole('button', { name: 'Uploading samples…' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'How do you like to learn?' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Interactive 3D/ }).uncheck();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('sample-materials-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Prepare my Study Pill' }).click();
  await expect(page.getByRole('heading', { name: 'Connecting the dots for you.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Photosynthesis, made clear' })).toBeVisible();
  await expect(activity(page, 'Interactive 3D')).toHaveCount(0);
  await expect(activity(page, 'Flashcards')).toBeVisible();
  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(page.getByRole('button', { name: 'Upload sample sources' })).toBeVisible();
  expect(apiCalls).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test('notes-only choice still includes visual exploration and preparation can be skipped', async ({
  page,
}) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Upload sample sources' }).click();
  const checkboxes = page.getByRole('checkbox');
  await expect(checkboxes).toHaveCount(5);
  for (const checkbox of await checkboxes.all()) await checkbox.uncheck();
  await page.getByRole('button', { name: 'Prepare my Study Pill' }).click();
  await page.getByRole('button', { name: 'Skip animation' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Study activities' }).getByRole('button'),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('heading', { name: 'How the two stages connect' })).toBeVisible();
  await activity(page, 'Energy flow').click();
  await page.getByRole('button', { name: 'Calvin cycle Build something useful' }).click();
  await expect(
    page.getByRole('definition').filter({ hasText: 'Carbon dioxide + ATP + NADPH' }),
  ).toBeVisible();
  await activity(page, 'Notes').click();
  await expect(page.getByRole('heading', { name: 'How the two stages connect' })).toBeVisible();
});

test('flashcards and quizzes respond and retain answers between activities', async ({
  page,
}, testInfo) => {
  await openSample(page);
  await activity(page, 'Flashcards').click();
  await page.getByRole('button', { name: /Reveal answer/ }).click();
  await expect(
    page.getByText('In the thylakoid membrane of the chloroplast.', {
      exact: true,
    }),
  ).toBeVisible();
  await activity(page, 'Multiple choice').click();
  await page.getByRole('button', { name: 'A Oxygen and carbon dioxide' }).click();
  await expect(page.getByRole('status')).toContainText('Not quite');
  await page.getByRole('button', { name: 'Try another answer' }).click();
  await page.getByRole('button', { name: 'B ATP and NADPH' }).click();
  await expect(page.getByRole('status')).toContainText('Correct.');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('sample-quiz-feedback.png'),
    fullPage: true,
  });
  await activity(page, 'True or false').click();
  await page.getByRole('button', { name: 'B False' }).click();
  await expect(page.getByRole('status')).toContainText('Correct.');
  await activity(page, 'Multiple choice').click();
  await expect(page.getByRole('button', { name: 'B ATP and NADPH' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await activity(page, 'Flashcards').click();
  await expect(page.getByRole('button', { name: /Show question/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.getByRole('button', { name: 'Next card' }).click();
  await expect(page.getByText('Card 2 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Start again' }).click();
  await page.getByRole('button', { name: 'Jump to the sample' }).click();
  await activity(page, 'Multiple choice').click();
  await expect(page.getByText('Pick an answer to see how you did.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Upload sample sources' })).toBeVisible();
});

test('source dialog supports keyboard dismissal and restores focus; roadmap opens a chapter', async ({
  page,
}) => {
  await openSample(page);
  const reference = page.getByRole('button', {
    name: /Lecture 04: Photosynthesis · 08:42/,
  });
  await reference.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('thylakoid membrane');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(reference).toBeFocused();
  await page.getByRole('button', { name: 'View 3 sources' }).click();
  await page.getByRole('button', { name: 'View excerpt' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close source' }).click();
  await activity(page, 'Roadmap').click();
  await page.getByRole('button', { name: 'Open this chapter' }).nth(2).click();
  await expect(page.getByRole('heading', { name: 'What to remember' })).toBeVisible();
});

test('existing deep links bypass setup and 3D loads only when opened', async ({ page }) => {
  const runtimeRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('three-artifact-runtime.js')) runtimeRequests.push(request.url());
  });
  await page.goto('/app#demo-visual');
  await expect(activity(page, 'Energy flow')).toHaveAttribute('aria-pressed', 'true');
  expect(runtimeRequests).toHaveLength(0);
  await page.goto('/app#section-remember');
  await expect(page.getByRole('heading', { name: 'What to remember' })).toBeVisible();
  await activity(page, 'Interactive 3D').click();
  await expect(page.getByTitle('Chloroplast model')).toBeVisible();
  await expect.poll(() => runtimeRequests.length).toBeGreaterThan(0);
  await expect(
    page.frameLocator('iframe[title="Chloroplast model"]').locator('canvas'),
  ).toBeVisible();
});

test('3D failure retains the model description and source references', async ({ page }) => {
  await page.route('**/three-artifact-runtime.js', (route) => route.abort());
  await page.goto('/app#demo-3d');
  await expect(page.getByText(/This 3D model could not render/)).toBeVisible();
  await expect(page.getByText(/A schematic chloroplast showing/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Lecture 04: Photosynthesis · 08:42/ }),
  ).toBeVisible();
});

for (const width of [375, 768, 1440]) {
  test(`responsive journey and exploration at ${width}px with reduced motion`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`sample-start-${width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Upload sample sources' }).click();
    await page.getByRole('button', { name: 'Prepare my Study Pill' }).click();
    await expect(activity(page, 'Notes')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`sample-notes-${width}.png`),
      fullPage: true,
    });
    await activity(page, 'Energy flow').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`sample-visual-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await activity(page, 'Flashcards').focus();
    await page.keyboard.press('Enter');
    await expect(activity(page, 'Flashcards')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Flashcards', exact: true })).toBeFocused();
    expect(
      await page
        .getByRole('button', { name: /Reveal answer/ })
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    ).toBe('1e-05s');
  });
}

test('skipping an upload cancels its timer and repeated clicks cannot restart it', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/app');
  await page.getByRole('button', { name: 'Upload sample sources' }).click();
  await expect(page.getByRole('button', { name: 'Uploading samples…' })).toBeDisabled();
  await page.getByRole('button', { name: 'Jump to the sample' }).click();
  await page.getByRole('button', { name: 'Start again' }).click();
  await page.clock.fastForward(5000);
  await expect(page.getByRole('button', { name: 'Upload sample sources' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});
