'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

export interface User {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  loginMethods: string[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Tokens {
  accessToken: string;
  expiresIn: number;
  user: User;
}
interface Session {
  status: 'loading' | 'authenticated' | 'anonymous' | 'unavailable';
  user: User | null;
}
const initial: Session = { status: 'loading', user: null };
let session = initial;
let accessToken: string | null = null;
let expiresAt = 0;
let epoch = 0;
let controller = new AbortController();
let refreshFlight: Promise<void> | null = null;
let refreshEpoch = -1;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

export const getSession = () => session;
export const getServerSession = () => initial;
export const sessionEpoch = () => epoch;
export function announceSessionChange() {
  channel?.postMessage('changed');
}
export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(value: Session) {
  session = value;
  listeners.forEach((listener) => listener());
}

export function clearSession(status: Session['status'] = 'anonymous') {
  epoch += 1;
  controller.abort();
  controller = new AbortController();
  accessToken = null;
  expiresAt = 0;
  publish({ status, user: null });
}

function install(tokens: Tokens) {
  if (tokens.user.id !== session.user?.id) {
    epoch += 1;
    controller.abort();
    controller = new AbortController();
  }
  accessToken = tokens.accessToken;
  expiresAt = Date.now() + tokens.expiresIn * 1000;
  publish({ status: 'authenticated', user: tokens.user });
}

export async function responseError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;
  return new ApiError(
    response.status,
    detail?.code ?? 'request_failed',
    (typeof detail === 'string' ? detail : detail?.message) ??
      (Array.isArray(detail) ? detail.map((item: { msg: string }) => item.msg).join('. ') : null) ??
      `Request failed (${response.status}). Please try again.`,
  );
}

export async function authRequest<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}/auth${path}`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-Noteesta-Client': 'web',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response);
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

async function sessionLock<T>(callback: () => Promise<T>): Promise<T> {
  // Web Locks coordinate the shared refresh cookie across tabs on secure origins.
  if (!navigator.locks)
    throw new Error('Sign-in requires a browser with Web Locks on HTTPS or localhost.');
  return navigator.locks.request('noteesta-session', callback);
}

export function refreshSession(): Promise<void> {
  if (!refreshFlight || refreshEpoch !== epoch) {
    const started = epoch;
    refreshEpoch = started;
    refreshFlight = sessionLock(async () => {
      if (started !== epoch) return;
      const tokens = await authRequest<Tokens>('/refresh');
      if (started === epoch) install(tokens);
    })
      .catch((error: unknown) => {
        if (started === epoch) {
          if (error instanceof ApiError && error.status === 401) clearSession();
          else if (!session.user) publish({ status: 'unavailable', user: null });
        }
        throw error;
      })
      .finally(() => {
        if (refreshEpoch === started) refreshFlight = null;
      });
  }
  return refreshFlight;
}

export async function signIn(email: string, password: string) {
  await sessionLock(async () => {
    const tokens = await authRequest<Tokens>('/login', { email, password });
    install(tokens);
    channel?.postMessage('changed');
  });
}

export async function signOut(everywhere = false) {
  await sessionLock(async () => {
    if (everywhere && (!accessToken || expiresAt <= Date.now())) {
      install(await authRequest<Tokens>('/refresh'));
    }
    await authRequest(everywhere ? '/logout-all' : '/logout', undefined, accessToken ?? undefined);
    clearSession();
    channel?.postMessage('logout');
  });
}

export function connectSession() {
  channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('noteesta-session') : null;
  if (channel)
    channel.onmessage = (event: MessageEvent) => {
      clearSession(event.data === 'logout' ? 'anonymous' : 'loading');
      if (event.data === 'changed') void refreshSession().catch(() => {});
    };
  const resume = () => {
    if (document.visibilityState === 'visible' && session.status !== 'anonymous') {
      void refreshSession().catch(() => {});
    }
  };
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
  void refreshSession().catch(() => {});
  return () => {
    channel?.close();
    channel = null;
    window.removeEventListener('online', resume);
    document.removeEventListener('visibilitychange', resume);
  };
}

export async function authenticatedFetch(path: string, init?: RequestInit) {
  if (!accessToken || expiresAt <= Date.now() + 10_000) await refreshSession();
  if (!accessToken)
    throw new ApiError(401, 'authentication_required', 'Please sign in to continue.');
  const started = epoch;
  const send = () => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal,
    });
  };
  let response = await send();
  if (response.status === 401) {
    await refreshSession();
    if (started !== epoch || !accessToken) throw new DOMException('Session changed', 'AbortError');
    response = await send();
  }
  if (started !== epoch) throw new DOMException('Session changed', 'AbortError');
  if (response.status === 401) clearSession();
  if (!response.ok) throw await responseError(response);
  return response;
}

export function safeReturnPath(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') && !/[\\\u0000-\u0020]/u.test(value)
    ? value
    : '/workspace';
}
