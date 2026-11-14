import type { NoteDocument, NoteVersion } from '@/lib/types';
import { ApiError } from '@/lib/session';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

/** One request at a time; edits arriving in flight become the next save. */
export class NoteAutosave {
  private document: NoteDocument;
  private saved: string;
  private timer?: ReturnType<typeof setTimeout>;
  private maximum?: ReturnType<typeof setTimeout>;
  private flight?: Promise<void>;
  private operation?: { document: NoteDocument; base: string; id: string };
  private disposed = false;
  private composing = false;
  revision: string;
  state: SaveState = 'saved';

  constructor(
    initial: NoteDocument,
    revision: string,
    private save: (document: NoteDocument, base: string, mutation: string) => Promise<NoteVersion>,
    private changed: (state: SaveState, error?: Error, version?: NoteVersion) => void,
  ) {
    this.document = initial;
    this.saved = JSON.stringify(initial);
    this.revision = revision;
  }

  get dirty() {
    return Boolean(this.operation) || JSON.stringify(this.document) !== this.saved;
  }
  get draft() {
    return this.document;
  }

  adopt(document: NoteDocument, version: NoteVersion): boolean {
    if (this.dirty || this.disposed || this.flight) return false;
    this.clearTimers();
    this.document = document;
    this.saved = JSON.stringify(document);
    this.revision = version.revisionId;
    this.status('saved', undefined, version);
    return true;
  }

  composition(active: boolean) {
    this.composing = active;
    if (!active && this.dirty) this.update(this.document);
  }

  update(document: NoteDocument) {
    this.document = document;
    if (this.disposed || this.state === 'error') return;
    this.status(this.dirty ? 'pending' : 'saved');
    clearTimeout(this.timer);
    if (!this.dirty) {
      this.clearTimers();
      return;
    }
    this.timer = setTimeout(() => {
      if (!this.composing) void this.flush().catch(() => {});
    }, 1500);
    this.maximum ??= setTimeout(() => {
      if (!this.composing) void this.flush().catch(() => {});
    }, 10000);
  }

  private status(state: SaveState, error?: Error, version?: NoteVersion) {
    this.state = state;
    if (!this.disposed) this.changed(state, error, version);
  }

  private clearTimers() {
    clearTimeout(this.timer);
    clearTimeout(this.maximum);
    this.timer = undefined;
    this.maximum = undefined;
  }

  async flush(): Promise<void> {
    if (this.flight) {
      await this.flight;
      if (this.dirty) await this.flush();
      return;
    }
    this.clearTimers();
    if (!this.dirty || this.disposed) return;
    if (this.composing) throw new Error('Finish typing before leaving the notes.');
    this.operation ??= { document: this.document, base: this.revision, id: crypto.randomUUID() };
    const operation = this.operation;
    this.status('saving');
    this.flight = this.save(operation.document, operation.base, operation.id)
      .then((version) => {
        this.saved = JSON.stringify(operation.document);
        this.revision = version.revisionId;
        this.operation = undefined;
        this.status(this.dirty ? 'pending' : 'saved', undefined, version);
      })
      .catch((cause: unknown) => {
        const error = cause instanceof Error ? cause : new Error('Your notes could not be saved.');
        if (
          cause instanceof ApiError &&
          cause.status >= 400 &&
          cause.status < 500 &&
          ![408, 429].includes(cause.status)
        )
          this.operation = undefined;
        this.status('error', error);
        throw error;
      })
      .finally(() => {
        this.flight = undefined;
      });
    await this.flight;
    if (this.dirty && !this.disposed) await this.flush();
  }

  dispose() {
    this.disposed = true;
    this.clearTimers();
  }
}
