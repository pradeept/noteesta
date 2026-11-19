// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CreatePillDialog } from '@/components/create-pill-dialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});

afterEach(cleanup);

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open new pill
      </button>
      <CreatePillDialog
        key={open ? 'open' : 'closed'}
        open={open}
        onClose={() => setOpen(false)}
        onCreate={vi.fn().mockResolvedValue(undefined)}
      />
    </>
  );
}

describe('new Study Pill defaults', () => {
  it('shows the Shorts warning as soon as the link is entered and blocks submission', () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreatePillDialog open onClose={vi.fn()} onCreate={onCreate} />);
    const input = screen.getByLabelText('YouTube link');
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Create Study Pill' });
    fireEvent.change(input, { target: { value: 'https://youtube.com/shorts/83iyz_5rN8c' } });

    expect(screen.getByRole('alert').textContent).toContain('YouTube Shorts aren’t supported');
    expect(submit.disabled).toBe(true);
    fireEvent.submit(submit.form!);
    expect(onCreate).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'https://youtu.be/83iyz_5rN8c' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(submit.disabled).toBe(false);
  });

  it('resets the form and learning preferences every time it opens', () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open new pill' }));

    const detailLevel = document.querySelector<HTMLSelectElement>('#detail-level');
    const learnerLevel = document.querySelector<HTMLSelectElement>('#learner-level');
    const flashcards = document.querySelector<HTMLInputElement>('#material-flashcards');
    const multipleChoice = document.querySelector<HTMLInputElement>('#material-mcqs');
    expect(detailLevel?.value).toBe('balanced');
    expect(learnerLevel?.value).toBe('intermediate');
    expect(flashcards?.checked).toBe(true);
    expect(multipleChoice?.checked).toBe(false);

    fireEvent.change(detailLevel!, { target: { value: 'concise' } });
    fireEvent.change(learnerLevel!, { target: { value: 'advanced' } });
    fireEvent.click(flashcards!);
    fireEvent.click(multipleChoice!);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open new pill' }));

    expect(document.querySelector<HTMLSelectElement>('#detail-level')?.value).toBe('balanced');
    expect(document.querySelector<HTMLSelectElement>('#learner-level')?.value).toBe('intermediate');
    expect(document.querySelector<HTMLInputElement>('#material-flashcards')?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#material-mcqs')?.checked).toBe(false);
  });
});
