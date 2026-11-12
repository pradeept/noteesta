'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DropdownMenu } from 'radix-ui';
import { toast } from 'sonner';
import { useSession } from '@/components/app-providers';
import { signOut } from '@/lib/session';

export function UserMenu() {
  const { user } = useSession();
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  if (!user) return null;
  async function logout(everywhere: boolean) {
    setBusy(true);
    try {
      await signOut(everywhere);
      toast.success('Signed out.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not sign out. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="quiet-button" disabled={busy} aria-label="Account menu">
          {user.displayName}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="account-menu" sideOffset={8} align="end">
            <DropdownMenu.Label>{user.email}</DropdownMenu.Label>
            <DropdownMenu.Item asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => void logout(false)}>Sign out</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => setConfirmAll(true)}>
              Sign out everywhere…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {confirmAll && (
        <div className="account-confirm" role="region" aria-label="Confirm sign out everywhere">
          <p>Sign out on all your devices?</p>
          <button className="quiet-button" type="button" onClick={() => setConfirmAll(false)}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => void logout(true)}
          >
            Sign out everywhere
          </button>
        </div>
      )}
    </>
  );
}
