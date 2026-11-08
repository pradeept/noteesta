'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/app-providers';
import { announceSessionChange, refreshSession, safeReturnPath } from '@/lib/session';

export function AuthCallback({ returnTo }: { returnTo?: string }) {
  const { status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === 'authenticated') {
      announceSessionChange();
      router.replace(safeReturnPath(returnTo ?? null));
    }
  }, [status, router, returnTo]);
  return (
    <main className="auth-page">
      <section className="auth-content" aria-busy={status === 'loading'}>
        <h1>
          {status === 'anonymous'
            ? 'Sign-in could not be completed.'
            : status === 'unavailable'
              ? 'We couldn’t connect.'
              : 'Opening your study space…'}
        </h1>
        {status === 'anonymous' && <Link href="/login">Back to sign in</Link>}
        {status === 'unavailable' && (
          <button
            type="button"
            className="primary-button"
            onClick={() => void refreshSession().catch(() => {})}
          >
            Try again
          </button>
        )}
      </section>
    </main>
  );
}
