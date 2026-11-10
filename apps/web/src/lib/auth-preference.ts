'use client';

import { useSyncExternalStore } from 'react';

type AuthMethod = 'password' | 'google';
const STORAGE_KEY = 'noteesta:v1:last-auth-method';
const CHANGE_EVENT = 'noteesta-auth-method-changed';

function readAuthMethod(): AuthMethod | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'password' || value === 'google' ? value : null;
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function rememberAuthMethod(method: AuthMethod) {
  try {
    localStorage.setItem(STORAGE_KEY, method);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // An optional sign-in hint must not interrupt authentication when storage is blocked.
  }
}

const serverSnapshot = () => null;

export function useLastAuthMethod() {
  return useSyncExternalStore(subscribe, readAuthMethod, serverSnapshot);
}
