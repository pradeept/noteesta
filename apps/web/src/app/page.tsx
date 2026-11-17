import { HomeDashboard } from '@/components/home-dashboard';
import { AuthGuard } from '@/components/auth-guard';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default function Workspace() {
  return (
    <AuthGuard>
      <HomeDashboard />
    </AuthGuard>
  );
}
