import { AuthModeGuard } from '@/components/auth-mode-guard';
export const metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthModeGuard>{children}</AuthModeGuard>;
}
