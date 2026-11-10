'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Brand } from '@/components/brand';
import { useSession } from '@/components/app-providers';
import { API_URL, ApiError, authRequest, safeReturnPath, signIn } from '@/lib/session';

export type AuthMode = 'login' | 'register' | 'verify-email' | 'forgot-password' | 'reset-password';
const headings: Record<AuthMode, string> = {
  login: 'Welcome back.',
  register: 'Make room for learning.',
  'verify-email': 'Verify your email.',
  'forgot-password': 'Let’s get you back in.',
  'reset-password': 'Choose a new password.',
};

export function AuthForm({
  mode,
  token,
  returnTo,
  initialError,
}: {
  mode: AuthMode;
  token?: string;
  returnTo?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const { user } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(
    initialError ? 'Google sign-in could not be completed. Please try again.' : '',
  );
  const [needsVerification, setNeedsVerification] = useState(false);
  const destination = safeReturnPath(returnTo ?? null);
  useEffect(() => {
    if (user && (mode === 'login' || mode === 'register')) router.replace(destination);
  }, [user, mode, destination, router]);
  useEffect(() => {
    // Keep single-use email tokens out of history and outbound referrers.
    if (token) window.history.replaceState(null, '', window.location.pathname);
  }, [token]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNeedsVerification(false);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        toast.success('Welcome back.');
        router.replace(destination);
      } else {
        const endpoint = mode === 'verify-email' && !token ? '/resend-verification' : `/${mode}`;
        const body =
          mode === 'register'
            ? { email, password, displayName: name }
            : mode === 'verify-email' && token
              ? { token }
              : mode === 'reset-password'
                ? { token, password }
                : { email };
        await authRequest(endpoint, body);
        setDone(true);
        toast.success(
          mode === 'reset-password'
            ? 'Password updated.'
            : mode === 'verify-email' && token
              ? 'Email verified.'
              : 'Check your email for the next step.',
        );
      }
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';
      setError(message);
      toast.error(message);
      setNeedsVerification(cause instanceof ApiError && cause.code === 'email_not_verified');
    } finally {
      setBusy(false);
    }
  }

  const hasEmail =
    mode === 'login' ||
    mode === 'register' ||
    mode === 'forgot-password' ||
    (mode === 'verify-email' && !token);
  const hasPassword = mode === 'login' || mode === 'register' || mode === 'reset-password';
  const completedAction = mode === 'reset-password' || (mode === 'verify-email' && Boolean(token));
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Brand href="/" />
        <Link href="/app">Explore an example</Link>
      </header>
      <main className="auth-content">
        <h1>
          {done ? (completedAction ? 'You’re all set.' : 'Check your inbox.') : headings[mode]}
        </h1>
        <p>
          {done
            ? completedAction
              ? 'You can now sign in to your study space.'
              : 'If this address is eligible, an email will arrive shortly. Check your spam folder too.'
            : mode === 'register'
              ? 'Bring your sources together in your own study space.'
              : mode === 'login'
                ? 'Your notes and sources are waiting for you.'
                : mode === 'verify-email'
                  ? token
                    ? 'Confirm your email to finish setting up your account.'
                    : 'Enter your email and we’ll send another verification link.'
                  : mode === 'forgot-password'
                    ? 'We’ll email you a link to choose a new password.'
                    : 'Use at least 12 characters. Your other sessions will be signed out.'}
        </p>
        {!done && (
          <form onSubmit={submit} className="auth-form" aria-busy={busy}>
            {mode === 'register' && (
              <label htmlFor="display-name">
                Your name
                <input
                  id="display-name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={100}
                />
              </label>
            )}
            {hasEmail && (
              <label htmlFor="email">
                Email
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={254}
                />
              </label>
            )}
            {hasPassword && (
              <label htmlFor="password">
                Password
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={mode === 'login' ? 1 : 12}
                  maxLength={128}
                  aria-describedby={mode === 'login' ? undefined : 'password-hint'}
                />
              </label>
            )}
            {hasPassword && mode !== 'login' && (
              <p id="password-hint" className="auth-hint">
                12–128 characters. A memorable passphrase works well.
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {needsVerification && <Link href="/verify-email">Send another verification email</Link>}
            {mode === 'reset-password' && !token ? (
              <p role="alert">
                This link is missing its reset token.{' '}
                <Link href="/forgot-password">Request a new link</Link>.
              </p>
            ) : (
              <button type="submit" className="primary-button" disabled={busy}>
                {busy
                  ? 'Please wait…'
                  : mode === 'login'
                    ? 'Sign in'
                    : mode === 'register'
                      ? 'Create account'
                      : mode === 'reset-password'
                        ? 'Update password'
                        : mode === 'verify-email' && token
                          ? 'Verify email'
                          : 'Send email'}
              </button>
            )}
            {mode === 'login' && <Link href="/forgot-password">Forgot your password?</Link>}
          </form>
        )}
        {!done && (mode === 'login' || mode === 'register') && (
          <div className="auth-alternatives">
            <span>or</span>
            <a
              className="secondary-button"
              href={`${API_URL}/auth/google/start?return_to=${encodeURIComponent(destination)}`}
            >
              Continue with Google
            </a>
            <p>
              {mode === 'login' ? 'New to Noteesta?' : 'Already have an account?'}{' '}
              <Link
                href={`/${mode === 'login' ? 'register' : 'login'}?returnTo=${encodeURIComponent(destination)}`}
              >
                {mode === 'login' ? 'Create an account' : 'Sign in'}
              </Link>
            </p>
          </div>
        )}
        {(done || (mode !== 'login' && mode !== 'register')) && (
          <Link href="/login">Back to sign in</Link>
        )}
      </main>
    </div>
  );
}
