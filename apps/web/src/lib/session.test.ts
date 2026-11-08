// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const user = {
  id: 'student-1',
  email: 'student@example.com',
  displayName: 'Student',
  emailVerified: true,
  loginMethods: ['password'],
};
const tokens = (accessToken = 'access-1') => ({ accessToken, expiresIn: 900, user });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('navigator', {
    locks: { request: (_name: string, callback: () => unknown) => callback() },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('session transport', () => {
  it('keeps tokens in memory and attaches only the access bearer to resource requests', async () => {
    const send = vi.fn().mockResolvedValueOnce(json(tokens())).mockResolvedValueOnce(json([]));
    vi.stubGlobal('fetch', send);
    const { signIn, authenticatedFetch, getSession } = await import('@/lib/session');
    await signIn(user.email, 'a long study passphrase');
    await authenticatedFetch('/pills');
    expect(getSession().user).toEqual(user);
    expect(send.mock.calls[0][1].credentials).toBe('include');
    expect(send.mock.calls[0][1].headers['X-Noteesta-Client']).toBe('web');
    expect(send.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer access-1');
    expect(localStorage.length).toBe(0);
  });

  it('deduplicates concurrent refresh attempts', async () => {
    const send = vi.fn().mockResolvedValue(json(tokens()));
    vi.stubGlobal('fetch', send);
    const { refreshSession } = await import('@/lib/session');
    await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('refreshes and retries a rejected request once', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(json(tokens()))
      .mockResolvedValueOnce(json({ detail: 'expired' }, 401))
      .mockResolvedValueOnce(json(tokens('access-2')))
      .mockResolvedValueOnce(json([]));
    vi.stubGlobal('fetch', send);
    const { signIn, authenticatedFetch } = await import('@/lib/session');
    await signIn(user.email, 'password');
    await authenticatedFetch('/pills');
    expect(send).toHaveBeenCalledTimes(4);
    expect(send.mock.calls[3][1].headers.get('Authorization')).toBe('Bearer access-2');
  });

  it('does not retry permission errors or mutations after a network error', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(json(tokens()))
      .mockResolvedValueOnce(json({ detail: 'Forbidden' }, 403));
    vi.stubGlobal('fetch', send);
    const { signIn, authenticatedFetch } = await import('@/lib/session');
    await signIn(user.email, 'password');
    await expect(authenticatedFetch('/pills', { method: 'POST' })).rejects.toMatchObject({
      status: 403,
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('preserves an established session on temporary refresh failures', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(json(tokens()))
      .mockRejectedValueOnce(new TypeError('offline'));
    vi.stubGlobal('fetch', send);
    const { signIn, refreshSession, getSession } = await import('@/lib/session');
    await signIn(user.email, 'password');
    await expect(refreshSession()).rejects.toThrow('offline');
    expect(getSession().status).toBe('authenticated');
  });

  it('rejects resource responses after logout and invalidates memory', async () => {
    let resolveRequest: (value: Response) => void = () => {};
    const send = vi
      .fn()
      .mockResolvedValueOnce(json(tokens()))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      );
    vi.stubGlobal('fetch', send);
    const { signIn, authenticatedFetch, clearSession, getSession } = await import('@/lib/session');
    await signIn(user.email, 'password');
    const pending = authenticatedFetch('/pills');
    clearSession();
    resolveRequest(json([{ id: 'private' }]));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(getSession().user).toBeNull();
  });

  it('does not restore a session from a refresh response after logout', async () => {
    let resolveRefresh: (value: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          }),
      ),
    );
    const { refreshSession, clearSession, getSession } = await import('@/lib/session');
    const pending = refreshSession();
    clearSession();
    resolveRefresh(json(tokens()));
    await pending;
    expect(getSession().status).toBe('anonymous');
  });

  it('rejects external and malformed return URLs', async () => {
    const { safeReturnPath } = await import('@/lib/session');
    for (const value of ['//evil.example', '/\\evil.example', 'https://evil.example', '/\nevil']) {
      expect(safeReturnPath(value)).toBe('/workspace');
    }
    expect(safeReturnPath('/pills/123')).toBe('/pills/123');
  });
});
