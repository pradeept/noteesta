import { notFound } from 'next/navigation';
import { AuthGuard } from '@/components/auth-guard';
import { AISettingsPage } from '@/components/ai-settings';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Settings | Noteesta',
  robots: { index: false, follow: false },
};

export default function Settings() {
  if (process.env.NOTEESTA_ENABLE_WORKSPACE !== 'true') notFound();
  return (
    <AuthGuard>
      <AISettingsPage />
    </AuthGuard>
  );
}
