'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/app-providers';
export function AuthModeGuard({ children }: { children: React.ReactNode }) {
  const { authEnabled } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (authEnabled === false) router.replace('/');
  }, [authEnabled, router]);
  return authEnabled === false ? null : children;
}
