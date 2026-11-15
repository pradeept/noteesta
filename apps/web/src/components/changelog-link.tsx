'use client';

import Link from 'next/link';

export function ChangelogLink() {
  return (
    <Link
      href="/#changelog"
      onClick={() => {
        const details = document.querySelector<HTMLDetailsElement>('#changelog details');
        if (details) details.open = true;
      }}
    >
      Changelog
    </Link>
  );
}
