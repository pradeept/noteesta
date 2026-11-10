import { StudyShell } from '@/components/study-shell';
import { AuthGuard } from '@/components/auth-guard';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function StudyPillPage({ params }: { params: Promise<{ pillId: string }> }) {
  if (process.env.NOTEESTA_ENABLE_WORKSPACE !== 'true') notFound();
  const { pillId } = await params;
  return (
    <AuthGuard>
      <StudyShell key={pillId} initialPillId={pillId} />
    </AuthGuard>
  );
}
