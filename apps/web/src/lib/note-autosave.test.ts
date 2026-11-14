import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoteAutosave } from '@/lib/note-autosave';
import { ApiError } from '@/lib/session';
import type { NoteDocument, NoteVersion } from '@/lib/types';

const document = (text: string): NoteDocument => ({
  type: 'doc',
  content: [{ type: 'text', text }],
});
const version = (revisionId: string) => ({ revisionId }) as NoteVersion;

afterEach(() => {
  vi.useRealTimers();
});

describe('note autosave', () => {
  it('lets corrected content replace a definitively rejected validation request', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(422, 'request_failed', 'Invalid formatting'))
      .mockResolvedValue(version('r2'));
    const controller = new NoteAutosave(document('a'), 'r1', save, vi.fn());
    controller.update(document('invalid'));
    await expect(controller.flush()).rejects.toThrow('Invalid formatting');
    controller.update(document('corrected'));
    await controller.flush();
    expect(save.mock.calls[1][0]).toEqual(document('corrected'));
    expect(save.mock.calls[1][2]).not.toEqual(save.mock.calls[0][2]);
    controller.dispose();
  });
  it('adopts external changes only when the local draft is clean', () => {
    const controller = new NoteAutosave(document('a'), 'r1', vi.fn(), vi.fn());
    expect(controller.adopt(document('b'), version('r2'))).toBe(true);
    expect(controller.revision).toBe('r2');
    controller.update(document('local draft'));
    expect(controller.adopt(document('remote draft'), version('r3'))).toBe(false);
    expect(controller.draft).toEqual(document('local draft'));
    expect(controller.revision).toBe('r2');
    controller.dispose();
  });
  it('debounces edits, ignores noops, and saves continuous typing after ten seconds', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(version('r2'));
    const controller = new NoteAutosave(document('a'), 'r1', save, vi.fn());
    controller.update(document('a'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
    controller.update(document('b'));
    await vi.advanceTimersByTimeAsync(1400);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.dirty).toBe(false);
    for (let index = 0; index < 10; index += 1) {
      controller.update(document(`c${index}`));
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(save).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it('queues edits during an in-flight request using the returned revision', async () => {
    let finish!: (value: NoteVersion) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<NoteVersion>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(version('r3'));
    const controller = new NoteAutosave(document('a'), 'r1', save, vi.fn());
    controller.update(document('b'));
    const flush = controller.flush();
    controller.update(document('c'));
    expect(save).toHaveBeenCalledTimes(1);
    finish(version('r2'));
    await flush;
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toEqual(document('c'));
    expect(save.mock.calls[1][1]).toBe('r2');
    expect(controller.dirty).toBe(false);
    controller.dispose();
  });

  it('retains failed operations and retries the same mutation before newer edits', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(version('r2'))
      .mockResolvedValue(version('r3'));
    const controller = new NoteAutosave(document('a'), 'r1', save, vi.fn());
    controller.update(document('b'));
    await expect(controller.flush()).rejects.toThrow('Offline');
    controller.update(document('c'));
    expect(controller.state).toBe('error');
    expect(controller.dirty).toBe(true);
    await controller.flush();
    expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
    expect(save.mock.calls[2][0]).toEqual(document('c'));
    expect(controller.dirty).toBe(false);
    controller.dispose();
  });

  it('waits for composition and cancels timers on disposal', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(version('r2'));
    const controller = new NoteAutosave(document('a'), 'r1', save, vi.fn());
    controller.composition(true);
    controller.update(document('b'));
    await vi.advanceTimersByTimeAsync(10000);
    expect(save).not.toHaveBeenCalled();
    await expect(controller.flush()).rejects.toThrow('Finish typing');
    controller.composition(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(1);
    controller.update(document('c'));
    controller.dispose();
    await vi.advanceTimersByTimeAsync(10000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
