import { notFound } from 'next/navigation';
import { HomeDashboard } from '@/components/home-dashboard';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default function Workspace() {
  if (process.env.NOTEESTA_ENABLE_WORKSPACE !== 'true') notFound();
  return <HomeDashboard />;
}
