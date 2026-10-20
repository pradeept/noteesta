import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-brand">
        <Link className="marketing-wordmark" href="/" aria-label="Noteesta home">
          <span className="marketing-mark" aria-hidden="true">
            n
          </span>
          <span>noteesta</span>
        </Link>
        <p>Thoughtful tools for learning, starting with Study Pills.</p>
      </div>

      <div className="marketing-footer-column">
        <span className="marketing-footer-label">Contact us</span>
        <a href="mailto:contact@noteesta.com">contact@noteesta.com</a>
      </div>

      <nav className="marketing-footer-column" aria-label="Footer links">
        <span className="marketing-footer-label">Follow & explore</span>
        <a href="https://x.com/0x0btoo" target="_blank" rel="noopener noreferrer">
          X · @0x0btoo <span aria-hidden="true">↗</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <a href="https://github.com/pradeept/noteesta" target="_blank" rel="noopener noreferrer">
          GitHub <span aria-hidden="true">↗</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <a href="/llm" type="text/markdown">
          If you’re an LLM, start here <span aria-hidden="true">↗</span>
        </a>
      </nav>
    </footer>
  );
}
