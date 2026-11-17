import { AuthGuard } from '@/components/auth-guard';
import { AISettingsPage } from '@/components/ai-settings';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Settings | Noteesta',
  robots: { index: false, follow: false },
};

export default function Settings() {
  return (
    <AuthGuard>
      <AISettingsPage />
    </AuthGuard>
  );
}
