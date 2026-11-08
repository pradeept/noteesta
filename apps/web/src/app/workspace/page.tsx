import { notFound } from 'next/navigation';
import { HomeDashboard } from '@/components/home-dashboard';
import { AuthGuard } from '@/components/auth-guard';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default function Workspace() {
  if (process.env.NOTEESTA_ENABLE_WORKSPACE !== 'true') notFound();
  return (
    <AuthGuard>
      <HomeDashboard />
    </AuthGuard>
  );
}
