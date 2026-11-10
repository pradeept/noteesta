'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/components/app-providers';
import { refreshSession } from '@/lib/session';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status, user } = useSession();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?returnTo=${encodeURIComponent(path)}`);
  }, [status, path, router]);
  if (user) return children;
  return (
    <main className="auth-page">
      <section className="auth-content" aria-busy={status === 'loading'}>
        <h1>{status === 'unavailable' ? 'We couldn’t connect.' : 'Opening your study space…'}</h1>
        {status === 'unavailable' && (
          <>
            <p>Your session could not be checked. Please try again.</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => void refreshSession().catch(() => {})}
            >
              Try again
            </button>
          </>
        )}
      </section>
    </main>
  );
}
