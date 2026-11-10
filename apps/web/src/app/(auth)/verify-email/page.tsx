import { AuthForm } from '@/components/auth-form';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; returnTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      mode="verify-email"
      token={params.token}
      returnTo={params.returnTo}
      initialError={params.error}
    />
  );
}
