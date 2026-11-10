import { expect, test, type Page } from '@playwright/test';

async function mockApi(page: Page) {
  let userId = 'student-1';
  let tokenNumber = 0;
  let rejectNextPills = false;
  const calls: string[] = [];
  const user = () => ({
    id: userId,
    email: `${userId}@example.com`,
    displayName: userId,
    emailVerified: true,
    loginMethods: ['password', 'google'],
  });
  await page.context().route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Noteesta-Client',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    calls.push(path);
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body, headers });
    const issue = () => {
      tokenNumber += 1;
      headers['Set-Cookie'] =
        'noteesta_refresh=mock-refresh; HttpOnly; Path=/api/v1/auth; SameSite=Lax';
      return json({ accessToken: `${userId}:${tokenNumber}`, expiresIn: 900, user: user() });
    };
    if (path === '/auth/login') {
      const body = request.postDataJSON();
      userId = body.email.split('@')[0];
      if (body.password === 'incorrect-password')
        return json(
          {
            detail: { code: 'invalid_credentials', message: 'The email or password is incorrect.' },
          },
          401,
        );
      return issue();
    }
    if (path === '/auth/refresh') {
      if (!(request.headers().cookie ?? '').includes('noteesta_refresh='))
        return json(
          { detail: { code: 'authentication_required', message: 'Please sign in.' } },
          401,
        );
      return issue();
    }
    if (path === '/auth/logout' || path === '/auth/logout-all') {
      headers['Set-Cookie'] = 'noteesta_refresh=; Max-Age=0; Path=/api/v1/auth';
      return route.fulfill({ status: 204, headers });
    }
    if (path === '/auth/google/start') {
      headers['Set-Cookie'] =
        'noteesta_refresh=mock-google; HttpOnly; Path=/api/v1/auth; SameSite=Lax';
      return route.fulfill({
        status: 302,
        headers: {
          ...headers,
          Location: 'http://127.0.0.1:3100/auth/callback?returnTo=%2Fworkspace',
        },
      });
    }
    if (path.startsWith('/auth/')) return json({ message: 'Done' });
    if (!request.headers().authorization?.startsWith(`Bearer ${userId}:`))
      return json({ detail: { code: 'invalid_token', message: 'Please sign in.' } }, 401);
    if (path === '/pills' && rejectNextPills) {
      rejectNextPills = false;
      return json({ detail: 'Expired' }, 401);
    }
    if (path === '/models')
      return json([
        {
          provider: 'ollama',
          model: 'qwen3-vl:8b-instruct',
          label: 'Ollama',
          available: true,
          reason: null,
        },
      ]);
    if (path === '/pills')
      return json(
        userId === 'student-1'
          ? [
              {
                id: 'pill-1',
                title: 'Private first-account note',
                subject: 'Biology',
                description: '',
                tags: [],
                sources: [],
                status: 'ready',
                progress: 100,
                selectedMaterials: ['notes'],
                generation: { provider: 'ollama', model: 'qwen3-vl:8b-instruct' },
                updatedAt: new Date().toISOString(),
              },
            ]
          : [],
      );
    return json([]);
  });
  return {
    calls,
    expireNextPills: () => {
      rejectNextPills = true;
    },
  };
}

async function login(page: Page, email = 'student-1@example.com') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('a long study passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/u);
}

test('email signup, verification, login, reload, recovery, and logout', async ({ page }) => {
  const api = await mockApi(page);
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Student');
  await page.getByLabel('Email', { exact: true }).fill('student-1@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a long study passphrase');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  await page.goto('/verify-email?token=a-single-use-verification-token');
  await page.getByRole('button', { name: 'Verify email' }).click();
  await expect(page.getByRole('heading', { name: 'You’re all set.' })).toBeVisible();
  api.expireNextPills();
  await login(page);
  await expect(page.getByText('Private first-account note')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Private first-account note')).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?/u);
  await page.goto('/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill('student-1@example.com');
  await page.getByRole('button', { name: 'Send email' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  await page.goto('/reset-password?token=a-single-use-password-reset-token');
  await page.getByLabel('Password', { exact: true }).fill('another long study passphrase');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('heading', { name: 'You’re all set.' })).toBeVisible();
  expect(api.calls).toContain('/auth/reset-password');
});

test('clears account data when signing in as another user', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await expect(page.getByText('Private first-account note')).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?/u);
  await page.getByLabel('Email', { exact: true }).fill('student-2@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a long study passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/u);
  await expect(page.getByText('Private first-account note')).toHaveCount(0);
});

test('Google sign-in returns through the application callback without URL tokens', async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Continue with Google' }).click();
  await expect(page).toHaveURL(/\/workspace$/u);
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  expect(page.url()).not.toContain('accessToken');
  expect(api.calls.filter((path) => path === '/auth/refresh').length).toBeLessThanOrEqual(3);
});

test('public demo makes no API requests; private workspace redirects anonymous visitors', async ({
  page,
}, testInfo) => {
  const api = await mockApi(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Photosynthesis, made clear' })).toBeVisible();
  expect(api.calls).toHaveLength(0);
  await page.goto('/workspace');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fworkspace$/u);
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('login-desktop.png') });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('login-mobile.png') });
});

test('coordinates refresh across tabs and broadcasts logout everywhere', async ({
  page,
  context,
}) => {
  await mockApi(page);
  await login(page);
  const other = await context.newPage();
  await other.goto('/workspace');
  await expect(other.getByText('Private first-account note')).toBeVisible();
  await Promise.all([page.reload(), other.reload()]);
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  await expect(other.getByRole('button', { name: 'Account menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out everywhere…' }).click();
  await page.getByRole('button', { name: 'Sign out everywhere', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?/u);
  await expect(other).toHaveURL(/\/login\?/u);
  await expect(other.getByText('Private first-account note')).toHaveCount(0);
});
