// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CreatePillDialog } from '@/components/create-pill-dialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});

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
