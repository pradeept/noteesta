'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import type { NoteAutosave } from '@/lib/note-autosave';

const NotesGuard = createContext<{
  register: (controller: NoteAutosave | null) => void;
  flushNotes: () => Promise<void>;
} | null>(null);

export function NotesSaveGuard({ children }: { children: ReactNode }) {
  const current = useRef<NoteAutosave | null>(null);
  const replaying = useRef(false);
  const register = useCallback((controller: NoteAutosave | null) => {
    current.current = controller;
  }, []);
  const flushNotes = useCallback(async () => {
    await current.current?.flush();
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (current.current?.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const navigate = (event: MouseEvent) => {
      if (
        replaying.current ||
        !current.current?.dirty ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (
        !link ||
        link.target === '_blank' ||
        link.download ||
        link.href.split('#')[0] === window.location.href.split('#')[0]
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void flushNotes()
        .then(() => {
          replaying.current = true;
          link.click();
          replaying.current = false;
        })
        .catch(() => {
          toast.error('Save your notes before leaving. Retry or copy and discard your draft.');
        });
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', navigate, true);
    };
  }, [flushNotes]);
  const context = useMemo(() => ({ register, flushNotes }), [register, flushNotes]);
  return <NotesGuard.Provider value={context}>{children}</NotesGuard.Provider>;
}

export function useNotesGuard() {
  const value = useContext(NotesGuard);
  if (!value) throw new Error('Notes editor requires NotesSaveGuard.');
  return value;
}

export function useOptionalNotesGuard() {
  return useContext(NotesGuard);
}
