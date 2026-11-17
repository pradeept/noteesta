import { expect, test } from '@playwright/test';

test('local workspace opens without login, retains Settings, and redirects account screens', async ({
  page,
}) => {
  const calls: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    calls.push(path);
    expect(route.request().headers().authorization).toBeUndefined();
    const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:3100' };
    const body =
      path === '/config'
        ? {
            authEnabled: false,
            localUser: {
              id: 'local-workspace',
              displayName: 'Local workspace',
              email: '',
              emailVerified: true,
              loginMethods: [],
            },
          }
        : path === '/settings/ai'
          ? {
              defaultGeneration: { provider: 'ollama', model: 'qwen3-vl:8b-instruct' },
              keysEnabled: false,
              providers: [],
              models: [],
            }
          : [];
    await route.fulfill({ json: body, headers });
  });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.goto('/reset-password');
  await expect(page).toHaveURL(/\/$/u);
  expect(calls.some((path) => path.startsWith('/auth/'))).toBe(false);
});
