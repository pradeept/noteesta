import { AuthCallback } from '@/components/auth-callback';

export default async function Callback({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  return <AuthCallback returnTo={(await searchParams).returnTo} />;
}
