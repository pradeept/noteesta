'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { GlobeIcon, XIcon } from '@phosphor-icons/react';
import { discoverWebsite } from '@/lib/api';
import type { WebsiteDiscovery, WebsitePage } from '@/lib/types';

const maxPages = 20;

export function WebsiteSourcePicker({
  pages,
  onChange,
  onPendingChange,
}: {
  pages: WebsitePage[];
  onChange: (pages: WebsitePage[]) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [input, setInput] = useState('');
  const [seeds, setSeeds] = useState<string[]>([]);
  const [review, setReview] = useState<WebsiteDiscovery | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const pickerId = useId();

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    onPendingChange(Boolean(input.trim() || seeds.length || loading || review));
  }, [input, seeds.length, loading, review, onPendingChange]);

  async function load(url: string) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setReview(null);
    setError('');
    setSearch('');
    try {
      const result = await discoverWebsite(url, controller.signal);
      if (controller.signal.aborted) return;
      setReview(result);
      setSelected(new Set([result.url]));
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'This page could not be opened.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function startReview() {
    try {
      const urls = [
        ...new Set(
          input
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const url = new URL(line);
              if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
                throw new Error();
              url.hash = '';
              return url.href;
            }),
        ),
      ];
      if (!urls.length) return;
      if (urls.length > maxPages) {
        setError(`Review up to ${maxPages} website links at a time.`);
        return;
      }
      setSeeds(urls);
      setInput('');
      void load(urls[0]);
    } catch {
      setError('Enter one complete HTTP or HTTPS website URL per line.');
    }
  }

  function advance() {
    const remaining = seeds.slice(1);
    setSeeds(remaining);
    setReview(null);
    setError('');
    if (remaining.length) void load(remaining[0]);
  }

  function confirm() {
    if (!review) return;
    const merged = new Map(pages.map((page) => [page.url, page]));
    for (const page of [review, ...review.links]) {
      if (selected.has(page.url)) merged.set(page.url, { url: page.url, title: page.title });
    }
    if (merged.size > maxPages) {
      setError(`Choose at most ${maxPages} website pages per Pill.`);
      return;
    }
    onChange([...merged.values()]);
    advance();
  }

  function cancel() {
    requestRef.current?.abort();
    setSeeds([]);
    setReview(null);
    setInput('');
    setLoading(false);
    setError('');
  }

  const candidates = review ? [review, ...review.links] : [];
  const visible = candidates.filter((page) =>
    `${page.title} ${page.url}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section className="mt-6 min-w-0" aria-label="Website sources">
      <label className="field gap-2 text-[13px] font-[550]" htmlFor="website-links">
        <span className="flex items-center gap-2">
          <GlobeIcon size={17} aria-hidden="true" /> Website links
        </span>
        <textarea
          id="website-links"
          rows={2}
          value={input}
          disabled={Boolean(seeds.length)}
          onChange={(event) => {
            setInput(event.target.value);
            setError('');
          }}
          aria-describedby="website-links-help"
          placeholder={'https://example.com/lesson\nOne URL per line'}
        />
      </label>
      <p id="website-links-help" className="mt-2 text-xs text-muted leading-relaxed">
        Public articles and documentation. Review each link to choose pages from the same website.
        Up to {maxPages} pages per Pill.
      </p>
      {!seeds.length ? (
        <button
          type="button"
          className="secondary-button mt-3"
          disabled={!input.trim()}
          onClick={startReview}
        >
          Review website pages
        </button>
      ) : null}
      {seeds.length ? (
        <div className="mt-4 border border-(--line) rounded-xl p-4 min-w-0" aria-busy={loading}>
          <p className="text-sm font-semibold">Choose pages to include</p>
          <p className="mt-1 text-xs text-muted break-all">{seeds[0]}</p>
          {loading ? (
            <p className="mt-3 text-sm" role="status">
              Finding linked pages…
            </p>
          ) : null}
          {review ? (
            <>
              <label className="field mt-3 gap-1 text-xs" htmlFor="website-page-search">
                Search pages
                <input
                  id="website-page-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <ul className="mt-3 max-h-60 overflow-y-auto" aria-label="Pages available to import">
                {visible.map((page, index) => (
                  <li key={page.url} className="border-b border-(--line) py-2.5">
                    <label
                      className="flex items-start gap-3 text-sm cursor-pointer"
                      htmlFor={`${pickerId}-page-${index}`}
                    >
                      <input
                        id={`${pickerId}-page-${index}`}
                        type="checkbox"
                        checked={selected.has(page.url)}
                        className="mt-1 size-4 min-h-4 shrink-0 p-0 [accent-color:var(--accent)]"
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(page.url)) next.delete(page.url);
                            else next.add(page.url);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words">{page.title}</span>
                        <span className="block text-xs text-muted break-all mt-1">{page.url}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {!visible.length ? (
                <p className="mt-2 text-xs text-muted">No pages match your search.</p>
              ) : null}
              {!review.links.length ? (
                <p className="mt-2 text-xs text-muted">
                  No other pages were linked on this website. You can include the pasted page.
                </p>
              ) : null}
              {review.capped ? (
                <p className="mt-2 text-xs text-muted">
                  Showing the first {review.links.length} linked pages. Paste another URL to explore
                  more.
                </p>
              ) : null}
              <p className="mt-3 text-xs" role="status">
                {selected.size} {selected.size === 1 ? 'page' : 'pages'} selected
                {seeds.length > 1 ? ` · ${seeds.length - 1} links left to review` : ''}
              </p>
            </>
          ) : null}
          <div className="flex flex-wrap gap-2 mt-3">
            {review ? (
              <button
                type="button"
                className="secondary-button"
                onClick={confirm}
                disabled={!selected.size}
              >
                Add selected pages
              </button>
            ) : null}
            {!loading && !review ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void load(seeds[0])}
              >
                Try again
              </button>
            ) : null}
            {!loading ? (
              <button type="button" className="quiet-button" onClick={advance}>
                Skip this link
              </button>
            ) : null}
            <button type="button" className="quiet-button" onClick={cancel}>
              Cancel review
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="form-error mt-2" role="alert">
          {error}
        </p>
      ) : null}
      {pages.length ? (
        <>
          <p className="mt-4 text-xs font-semibold">
            {pages.length} / {maxPages} website pages added
          </p>
          <ul className="mt-1" aria-label="Selected website pages">
            {pages.map((page) => (
              <li
                key={page.url}
                className="flex gap-2 items-center border-b border-(--line) py-2 text-xs"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium">{page.title}</span>
                  <span className="block break-all text-muted mt-1">{page.url}</span>
                </span>
                <button
                  type="button"
                  className="icon-button shrink-0"
                  aria-label={`Remove ${page.title}`}
                  onClick={() => onChange(pages.filter((item) => item.url !== page.url))}
                >
                  <XIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
