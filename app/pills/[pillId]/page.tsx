import { StudyShell } from '@/components/study-shell';

export default async function StudyPillPage({ params }: { params: Promise<{ pillId: string }> }) {
  const { pillId } = await params;
  return <StudyShell key={pillId} initialPillId={pillId} />;
}
