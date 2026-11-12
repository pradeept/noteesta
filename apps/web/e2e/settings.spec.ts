import { expect, test } from '@playwright/test';

const labels = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  huggingface: 'Hugging Face',
  deepseek: 'DeepSeek',
  zai: 'Z.ai / GLM',
};

test('personal-key settings work across reloads and mobile layouts', async ({ page }) => {
  const providers = Object.entries(labels).map(([provider, label]) => ({
    provider,
    label,
    configured: false,
    suffix: null as string | null,
    updatedAt: null,
    testedModels: [] as string[],
  }));
  let defaultGeneration = { provider: 'ollama', model: 'qwen3-vl:8b-instruct' };
  const presets = {
    openai: 'gpt-6-astra',
    anthropic: 'claude-opus-5-5',
    gemini: 'gemini-4-carbon',
    huggingface: 'Qwen/Qwen3.8-27B:novita',
    deepseek: 'deepseek-v4-pro',
    zai: 'glm-5.3',
  };
  const models = () => [
    {
      ...{ provider: 'ollama', model: 'qwen3-vl:8b-instruct' },
      label: 'Ollama · Qwen',
      available: true,
      reason: null,
      tier: 'local',
    },
    ...providers.map((provider) => ({
      provider: provider.provider,
      model: presets[provider.provider as keyof typeof presets],
      label: `${provider.label} · ${presets[provider.provider as keyof typeof presets]}`,
      available: provider.configured,
      reason: provider.configured ? null : 'Add a personal key in Settings.',
      tier: 'flagship',
    })),
  ];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Noteesta-Client',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    };
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status, headers });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/auth/refresh')
      return json({
        accessToken: 'settings-token',
        expiresIn: 900,
        user: {
          id: 'alice',
          email: 'alice@example.com',
          displayName: 'Alice',
          emailVerified: true,
          loginMethods: ['password'],
        },
      });
    if (path === '/settings/ai' && request.method() === 'GET')
      return json({ defaultGeneration, keysEnabled: true, providers, models: models() });
    if (path === '/settings/ai' && request.method() === 'PATCH') {
      defaultGeneration = request.postDataJSON().defaultGeneration;
      return json(defaultGeneration);
    }
    const provider = providers.find((entry) =>
      path.startsWith(`/settings/ai/providers/${entry.provider}`),
    );
    if (provider) {
      if (request.method() === 'PATCH') {
        provider.configured = true;
        provider.suffix = request.postDataJSON().apiKey.slice(-4);
        provider.testedModels = [];
        return route.fulfill({ status: 204, headers });
      }
      if (request.method() === 'DELETE') {
        provider.configured = false;
        provider.suffix = null;
        provider.testedModels = [];
        return route.fulfill({ status: 204, headers });
      }
      if (path.endsWith('/test')) {
        provider.testedModels = [request.postDataJSON().model];
        return json({ connected: true });
      }
    }
    if (path === '/models') return json(models());
    return json([]);
  });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const openai = page
    .locator('.settings-provider')
    .filter({ has: page.getByRole('heading', { name: 'OpenAI', exact: true }) });
  await openai.getByRole('button', { name: 'Add key' }).click();
  const keyInput = page.getByLabel('OpenAI API key');
  await keyInput.fill('e2e-personal-secret-1234');
  await expect(keyInput).toHaveAttribute('type', 'password');
  await keyInput.press('Tab');
  await expect(page.getByRole('button', { name: 'Show API key' })).toBeFocused();
  await page.getByRole('button', { name: 'Show API key' }).click();
  await expect(keyInput).toHaveAttribute('type', 'text');
  await openai.getByRole('button', { name: 'Save key' }).click();
  await expect(openai.getByText('Key saved · ••••1234')).toBeVisible();
  await expect(keyInput).toHaveCount(0);
  await openai.getByRole('button', { name: 'Test connection' }).click();
  await expect(openai.getByText('Connection tested')).toBeVisible();
  await page.getByLabel('Generation model', { exact: true }).selectOption('openai:gpt-6-astra');
  await expect(page.getByText('Default model saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Generation model', { exact: true })).toHaveValue(
    'openai:gpt-6-astra',
  );
  await page.screenshot({ path: '/private/tmp/noteesta-settings-desktop.png', fullPage: true });
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toContain('e2e-personal-secret');
  await page.setViewportSize({ width: 390, height: 844 });
  await openai.getByRole('button', { name: 'Replace key' }).click();
  await expect(keyInput).toBeVisible();
  await page.screenshot({ path: '/private/tmp/noteesta-settings-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await openai.getByRole('button', { name: 'Cancel', exact: true }).click();
  await openai.getByRole('button', { name: 'Remove', exact: true }).click();
  await openai.getByRole('button', { name: 'Confirm removal' }).click();
  await expect(openai.getByText('No personal key')).toBeVisible();
});

test('settings requires a signed-in session', async ({ page }) => {
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 401,
      json: { detail: 'Please sign in.' },
      headers: {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
        'Access-Control-Allow-Credentials': 'true',
      },
    }),
  );
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fsettings$/u);
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
});
