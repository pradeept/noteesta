import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { NoteDocument, NoteVersion, Source } from '../src/lib/types';

test('website citations show saved dates and skipped pages do not disable regeneration', async ({
  page,
}) => {
  await noteWorkspace(page, [
    {
      id: 'web-1',
      name: 'Learning Python loops',
      kind: 'website',
      detail: 'example.com · saved page',
      status: 'ready',
      originalAvailable: false,
      websiteUrl: 'https://example.com/loops',
      fetchedAt: '2026-11-20T00:00:00Z',
      excerpt: 'A loop repeats instructions.',
    },
    {
      id: 'web-2',
      name: 'Restricted page',
      kind: 'website',
      detail: 'Website page',
      status: 'failed',
      originalAvailable: false,
      websiteUrl: 'https://example.com/blocked',
      error: 'This page could not be read (HTTP 403).',
    },
  ]);
  await expect(
    page.getByText('Skipped page: This page could not be read (HTTP 403).'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Regenerate Pill' })).toBeEnabled();
  await page.getByRole('button', { name: 'Learning Python loops', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Learning Python loops' });
  await expect(dialog.getByRole('link', { name: 'Open website page' })).toHaveAttribute(
    'href',
    'https://example.com/loops',
  );
  await expect(dialog.getByText('A loop repeats instructions.')).toBeVisible();
  await expect(dialog.getByText(/This excerpt uses the saved page text/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
});

for (const mixed of [false, true]) {
  test(`reviews and creates a ${mixed ? 'mixed-source Pill on mobile' : 'website-only Pill'}`, async ({
    page,
  }) => {
    if (mixed) await page.setViewportSize({ width: 390, height: 844 });
    await noteWorkspace(page);
    const website = { url: 'https://example.com/loops', title: 'Learning Python loops' };
    const linked = { url: 'https://example.com/lists', title: 'Python lists' };
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Noteesta-Client',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    let submitted = '';
    const created = {
      id: 'website-pill',
      title: 'Python sources',
      subject: 'Programming',
      status: 'queued',
      progress: 2,
      stage: 'Waiting for a worker',
      selectedMaterials: ['notes'],
      sources: [],
      generation: { provider: 'ollama', model: 'local' },
      updatedAt: new Date().toISOString(),
    };
    await page.route('**/api/v1/sources/web/discover', (route) =>
      route.fulfill({
        json: { ...website, links: [linked], capped: false },
        headers,
      }),
    );
    await page.route(/\/api\/v1\/pills(?:\/website-pill)?$/, async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (request.method() === 'POST') {
        submitted = request.postData() ?? '';
        return route.fulfill({ json: created, status: 202, headers });
      }
      if (request.url().endsWith('/website-pill')) return route.fulfill({ json: created, headers });
      return route.fallback();
    });
    if (mixed) await page.getByRole('button', { name: 'Open library', exact: true }).click();
    await page.getByRole('button', { name: 'New Study Pill', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'What are you learning?' });
    await dialog.getByLabel('Title', { exact: true }).fill('Python sources');
    await dialog.getByLabel('Subject', { exact: true }).fill('Programming');
    if (mixed) {
      await dialog.locator('#source-files').setInputFiles({
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Practice Python loops.'),
      });
      await dialog.getByLabel('YouTube link', { exact: true }).fill('https://youtu.be/83iyz_5rN8c');
    }
    await dialog.getByLabel('Website links', { exact: true }).fill(website.url);
    await expect(dialog.getByRole('button', { name: 'Create Study Pill' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Review website pages' }).click();
    await expect(dialog.getByRole('checkbox', { name: /Learning Python loops/ })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: /Python lists/ })).not.toBeChecked();
    await dialog.getByRole('checkbox', { name: /Python lists/ }).check();
    const checkboxSize = await dialog.getByRole('checkbox', { name: /Python lists/ }).boundingBox();
    expect(checkboxSize!.width).toBeLessThanOrEqual(20);
    expect(checkboxSize!.height).toBeLessThanOrEqual(20);
    await expect(dialog.getByText('Python lists', { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('website-page-picker.png') });
    await dialog.getByLabel('Search pages', { exact: true }).fill('lists');
    await expect(dialog.getByText('2 pages selected', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Add selected pages' }).click();
    await expect(
      dialog.getByRole('list', { name: 'Selected website pages' }).getByRole('listitem'),
    ).toHaveCount(2);
    const overflow = await dialog.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(overflow).toBe(false);
    await dialog.getByRole('button', { name: 'Create Study Pill' }).click();
    await expect.poll(() => submitted).toContain('name="website_urls"');
    expect(submitted).toContain(JSON.stringify([website.url, linked.url]));
    if (mixed) {
      expect(submitted).toContain('filename="notes.txt"');
      expect(submitted).toContain('https://youtu.be/83iyz_5rN8c');
    }
    await expect(dialog).not.toBeVisible();
  });
}

async function noteWorkspace(page: Page, extraSources: Source[] = []) {
  const citation = {
    sourceId: 'source-1',
    sourceName: 'Lecture.pdf',
    locator: 'page 1',
    excerpt: 'Cell biology',
  };
  const sections = [
    {
      id: 'cells',
      title: 'Cell structure',
      markdown: 'Cells contain a nucleus.\n\n**Organelles** have different roles.',
      citations: [citation],
    },
    {
      id: 'division',
      title: 'Cell division',
      markdown: 'Cells divide through mitosis.',
      citations: [citation],
    },
  ];
  const pill = {
    id: 'pill-1',
    title: 'Understanding cells',
    subject: 'Biology',
    tags: [],
    status: 'ready',
    progress: 100,
    selectedMaterials: ['notes', 'roadmap'],
    generation: { provider: 'ollama', model: 'local' },
    sources: [
      { id: 'source-1', name: 'Lecture.pdf', kind: 'pdf', detail: '2 pages', status: 'ready' },
      ...extraSources,
    ],
    artifact: {
      summary: 'Cells are the building blocks of life.',
      sections,
      visuals: [],
      flashcards: [],
      mcqs: [],
      trueFalse: [],
      roadmap: [
        {
          id: 'roadmap-1',
          title: 'Explore cell structure',
          description: 'Start with the cell.',
          sectionId: 'cells',
        },
      ],
    },
    updatedAt: new Date().toISOString(),
  };
  let current: NoteVersion = {
    revisionId: 'generated-1',
    groupId: 'generated-group',
    kind: 'generated',
    createdAt: new Date().toISOString(),
    excerpt: pill.artifact.summary,
    document: null,
    generated: {
      summary: pill.artifact.summary,
      sections: sections.map((section) => ({ ...section, citationIds: ['ref-1'] })),
    },
    references: { 'ref-1': citation },
    visuals: [],
  };
  const versions = [current];
  let sequence = 0;
  let failSave = false;
  const saves: NoteDocument[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Noteesta-Client',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    };
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status, headers });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/config') return json({ authEnabled: true, localUser: null });
    if (path === '/auth/refresh')
      return json({
        accessToken: 'notes-token',
        expiresIn: 900,
        user: {
          id: 'alice',
          email: 'alice@example.com',
          displayName: 'Alice',
          emailVerified: true,
          loginMethods: ['password'],
        },
      });
    if (path === '/pills') return json([pill]);
    if (path === '/pills/pill-1') return json(pill);
    if (path === '/collections' || path === '/library') return json([]);
    if (path === '/pills/pill-1/notes') {
      if (request.method() === 'GET') return json(current);
      if (failSave)
        return json({ detail: 'Connection interrupted. Your draft is still here.' }, 503);
      const body = request.postDataJSON();
      if (body.baseRevisionId !== current.revisionId)
        return json(
          { detail: { code: 'notes_conflict', message: 'Notes changed elsewhere.' } },
          409,
        );
      saves.push(body.document);
      sequence += 1;
      current = {
        ...current,
        document: body.document,
        generated: null,
        revisionId: `edited-${sequence}`,
        groupId: 'editing-group',
        kind: 'edited',
        createdAt: new Date().toISOString(),
      };
      if (versions[0].kind === 'edited') versions[0] = current;
      else versions.unshift(current);
      return json(current);
    }
    if (path === '/pills/pill-1/notes/versions')
      return json({ items: versions, nextCursor: null, currentRevisionId: current.revisionId });
    const match = path.match(/^\/pills\/pill-1\/notes\/versions\/([^/]+)(\/restore)?$/);
    if (match) {
      const target = versions.find((version) => version.revisionId === match[1]);
      if (!target) return json({ detail: 'Not found' }, 404);
      if (match[2]) {
        sequence += 1;
        current = {
          ...target,
          revisionId: `restored-${sequence}`,
          groupId: `restore-${sequence}`,
          kind: 'restored',
        };
        versions.unshift(current);
      }
      return json(match[2] ? current : target);
    }
    return json({ detail: `Unexpected endpoint: ${path}` }, 404);
  });
  await page.goto('/pills/pill-1');
  await expect(page.getByRole('textbox', { name: 'Editable notes' })).toBeVisible();
  return {
    saves,
    fail: (value: boolean) => {
      failSave = value;
    },
  };
}

test('warns once for the automatic caption source in a ready Study Pill', async ({ page }) => {
  const youtube = { kind: 'youtube', detail: 'YouTube captions', status: 'ready' } as const;
  await noteWorkspace(page, [
    { ...youtube, id: 'automatic', name: 'Automatic lecture', captionTrackKind: 'ASR' },
    { ...youtube, id: 'standard', name: 'Standard lecture', captionTrackKind: 'standard' },
    { ...youtube, id: 'legacy', name: 'Legacy lecture' },
  ]);

  const warning = page.getByText(
    'YouTube generated these captions automatically. Some words or details may be inaccurate.',
  );
  await expect(warning).toHaveCount(1);
  await expect(warning).toBeVisible();
  await expect(
    warning.locator('..').getByRole('button', { name: 'Automatic lecture' }),
  ).toBeVisible();
});

async function selectText(page: Page, selector: string) {
  await page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.closest<HTMLElement>('[contenteditable="true"]')?.focus();
      document.dispatchEvent(new Event('selectionchange'));
    });
}

test('notes autosave, preserve formatting, and restore through version history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const state = await noteWorkspace(page);
  const paragraph = page.locator('.note-section p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Added detail.');
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(state.saves.length).toBeGreaterThan(0);
  await selectText(page, '.note-section p');
  const highlight = page
    .getByRole('button', { name: 'Highlight color', exact: true })
    .filter({ visible: true })
    .first();
  await highlight.click();
  await page.getByRole('menuitem', { name: 'Green highlight', exact: true }).click();
  await expect(paragraph.locator('mark')).toBeVisible();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Version history', exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.locator('.note-current-badge')).toHaveCount(1);
  await modal.locator('.note-version-item').filter({ hasText: 'Generated' }).click();
  await expect(modal.locator('.notes-preview')).not.toContainText('Added detail.');
  await modal.getByRole('button', { name: 'Restore this version', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Editable notes' })).not.toContainText(
    'Added detail.',
  );
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await expect(page.locator('.note-version-item.current')).toContainText('Restored');
  await page.screenshot({ path: '/private/tmp/noteesta-notes-desktop-history.png' });
  await page.getByRole('button', { name: 'Close version history', exact: true }).click();
  await page.screenshot({ path: '/private/tmp/noteesta-notes-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('mobile selection formatting, new sections, and history preview fit the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await noteWorkspace(page);
  await expect(page.locator('.notes-desktop-toolbar')).not.toBeVisible();
  await selectText(page, '.note-section p');
  await expect(page.locator('.notes-selection-toolbar')).toBeVisible();
  await page
    .locator('.notes-selection-toolbar')
    .getByRole('button', { name: 'Bold', exact: true })
    .click();
  await expect(page.locator('.note-section p').first().locator('strong')).toBeVisible();
  await page.getByRole('button', { name: 'Formatting', exact: true }).click();
  const panel = page.locator('.notes-toolbar-popover');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'More formatting', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add section', exact: true }).click();
  await page.getByRole('button', { name: 'Close formatting', exact: true }).click();
  await expect(page.locator('.note-section')).toHaveCount(3);
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await page.locator('.note-version-item').filter({ hasText: 'Generated' }).click();
  await expect(page.locator('.note-history-preview')).toBeVisible();
  await expect(page.locator('.notes-preview')).toContainText('Cells contain a nucleus.');
  await expect(page.locator('.note-version-list')).not.toBeVisible();
  await page.screenshot({ path: '/private/tmp/noteesta-notes-mobile-history.png' });
  await page.getByRole('button', { name: 'Versions', exact: true }).click();
  await expect(page.locator('.note-version-list')).toBeVisible();
  await page.screenshot({ path: '/private/tmp/noteesta-notes-mobile-list.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('section moves and deletion update the outline and roadmap without losing undo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await noteWorkspace(page);
  await page.locator('.note-section p').first().click();
  await page
    .getByRole('button', { name: 'More formatting', exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole('menuitem', { name: 'Move section down', exact: true }).click();
  await expect(page.locator('.note-section h2')).toHaveText(['Cell division', 'Cell structure']);
  await expect(
    page.getByRole('navigation', { name: 'On this page', exact: true }).getByRole('link'),
  ).toHaveText(['Cell division', 'Cell structure']);
  await page.locator('#cells p').first().click();
  await page
    .getByRole('button', { name: 'More formatting', exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole('menuitem', { name: 'Delete section', exact: true }).click();
  await expect(page.locator('.note-section h2')).toHaveText(['Cell division']);
  await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Section removed from notes', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).filter({ visible: true }).click();
  await expect(page.locator('.note-section h2')).toHaveText(['Cell division', 'Cell structure']);
  await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open notes', exact: true })).toBeEnabled();
});

test('failed saves retain drafts and prevent navigation until retry', async ({ page }) => {
  const state = await noteWorkspace(page);
  state.fail(true);
  await page.locator('.note-section p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Unsaved detail.');
  await expect(page.getByText('Not saved', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'My Study Pills', exact: true }).click();
  await expect(page).toHaveURL(/\/pills\/pill-1$/);
  await expect(page.getByRole('textbox', { name: 'Editable notes' })).toContainText(
    'Unsaved detail.',
  );
  state.fail(false);
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(state.saves.length).toBeGreaterThan(0);
});
