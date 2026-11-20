// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebsiteSourcePicker } from '@/components/website-source-picker';
import { CreatePillDialog } from '@/components/create-pill-dialog';
import { discoverWebsite } from '@/lib/api';
import type { WebsitePage, WebsiteDiscovery } from '@/lib/types';

vi.mock('@/lib/api', () => ({ discoverWebsite: vi.fn() }));

const seed = { url: 'https://example.com/chapter', title: 'Chapter introduction' };
const linked = { url: 'https://example.com/chapter/loops', title: 'Python loops' };
const result: WebsiteDiscovery = { ...seed, links: [linked], capped: false };

beforeEach(() => {
  vi.mocked(discoverWebsite).mockReset();
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});
afterEach(cleanup);

function Harness({ initial = [] }: { initial?: WebsitePage[] }) {
  const [pages, setPages] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <>
      <WebsiteSourcePicker pages={pages} onChange={setPages} onPendingChange={setPending} />
      <output aria-label="Review pending">{String(pending)}</output>
    </>
  );
}

async function review(input = seed.url) {
  fireEvent.change(screen.getByLabelText('Website links'), { target: { value: input } });
  fireEvent.click(screen.getByRole('button', { name: 'Review website pages' }));
  await screen.findByRole('checkbox', { name: /Chapter introduction/ });
}

describe('website source review', () => {
  it('starts with only the pasted page checked and retains selections while searching', async () => {
    vi.mocked(discoverWebsite).mockResolvedValue(result);
    render(<Harness />);
    await review();
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: /Chapter introduction/ }).checked,
    ).toBe(true);
    const checkbox = screen.getByRole<HTMLInputElement>('checkbox', { name: /Python loops/ });
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'no match' } });
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText('2 pages selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add selected pages' }));
    const added = screen.getByRole('list', { name: 'Selected website pages' });
    expect(within(added).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByLabelText('Review pending').textContent).toBe('false');
  });

  it('reviews multiple seeds in order and deduplicates confirmed pages', async () => {
    vi.mocked(discoverWebsite).mockResolvedValue(result);
    render(<Harness initial={[seed]} />);
    await review(`${seed.url}#one\n${seed.url}#two\nhttps://example.com/other`);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected pages' }));
    await waitFor(() => expect(discoverWebsite).toHaveBeenCalledTimes(2));
    await screen.findByRole('checkbox', { name: /Chapter introduction/ });
    fireEvent.click(screen.getByRole('button', { name: 'Add selected pages' }));
    expect(
      within(screen.getByRole('list', { name: 'Selected website pages' })).getAllByRole('listitem'),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Chapter introduction' }));
    expect(screen.queryByRole('list', { name: 'Selected website pages' })).toBeNull();
  });

  it('cancels loading and ignores a late discovery response', async () => {
    let complete!: (value: WebsiteDiscovery) => void;
    vi.mocked(discoverWebsite).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Website links'), { target: { value: seed.url } });
    fireEvent.click(screen.getByRole('button', { name: 'Review website pages' }));
    expect(screen.getByText('Finding linked pages…')).toBeTruthy();
    const signal = vi.mocked(discoverWebsite).mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', { name: 'Cancel review' }));
    expect(signal?.aborted).toBe(true);
    complete(result);
    await waitFor(() => expect(screen.queryByRole('checkbox')).toBeNull());
    expect(screen.getByLabelText('Review pending').textContent).toBe('false');
  });

  it('allows retry or skip after a discovery error', async () => {
    vi.mocked(discoverWebsite)
      .mockRejectedValueOnce(new Error('Page blocked'))
      .mockResolvedValueOnce(result);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Website links'), { target: { value: seed.url } });
    fireEvent.click(screen.getByRole('button', { name: 'Review website pages' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Page blocked');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('checkbox', { name: /Chapter introduction/ });
    fireEvent.click(screen.getByRole('button', { name: 'Skip this link' }));
    expect(screen.queryByRole('list', { name: 'Selected website pages' })).toBeNull();
    expect(screen.getByLabelText('Review pending').textContent).toBe('false');
  });

  it('shows the no-linked-pages state and enforces the total page limit', async () => {
    vi.mocked(discoverWebsite).mockResolvedValue({ ...result, links: [] });
    render(
      <Harness
        initial={Array.from({ length: 20 }, (_, i) => ({
          url: `https://example.com/${i}`,
          title: `Page ${i}`,
        }))}
      />,
    );
    await review();
    expect(screen.getByText(/No other pages were linked/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add selected pages' }));
    expect(screen.getByRole('alert').textContent).toContain('at most 20');
    expect(screen.getByRole('button', { name: 'Cancel review' })).toBeTruthy();
  });

  it('blocks Pill creation until links are reviewed and submits website-only sources', async () => {
    vi.mocked(discoverWebsite).mockResolvedValue(result);
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreatePillDialog open onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Python' } });
    fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: 'Programming' } });
    fireEvent.change(screen.getByLabelText('Website links'), { target: { value: seed.url } });
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Create Study Pill' }).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Review website pages' }));
    await screen.findByRole('checkbox', { name: /Chapter introduction/ });
    fireEvent.click(screen.getByRole('button', { name: 'Add selected pages' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Study Pill' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(onCreate.mock.calls[0][0]).toMatchObject({ websiteUrls: [seed.url], files: [] });
  });
});
