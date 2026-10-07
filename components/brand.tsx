import Link from 'next/link';

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="brand font-[750] tracking-[-0.035em]" aria-label="Noteesta home">
      <span className="brand-mark" aria-hidden="true">
        n
      </span>
      <span>noteesta</span>
    </Link>
  );
}
