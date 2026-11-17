import { StudyShell } from '@/components/study-shell';
import { AuthGuard } from '@/components/auth-guard';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function StudyPillPage({ params }: { params: Promise<{ pillId: string }> }) {
  const { pillId } = await params;
  return (
    <AuthGuard>
      <StudyShell key={pillId} initialPillId={pillId} />
    </AuthGuard>
  );
}
