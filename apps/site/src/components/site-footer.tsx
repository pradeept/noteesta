import Link from 'next/link';
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowUpRight';
import { GithubMark } from '@/components/icons/github-mark';
import { XLogoIcon } from '@phosphor-icons/react/dist/ssr/XLogo';
import { ChangelogLink } from '@/components/changelog-link';

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
        <p>A self-hosted workspace for making sense of what you study.</p>
      </div>

      <div className="marketing-footer-column">
        <span className="marketing-footer-label">Contact us</span>
        <a href="mailto:contact@noteesta.com">contact@noteesta.com</a>
      </div>

      <nav className="marketing-footer-column" aria-label="Footer links">
        <span className="marketing-footer-label">Follow & explore</span>
        <div className="marketing-footer-socials">
          <a href="https://x.com/0x0btoo" target="_blank" rel="noopener noreferrer">
            <XLogoIcon size={17} aria-hidden="true" />
            <span className="sr-only">X · </span>@0x0btoo
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <a
            className="marketing-icon-link"
            href="https://github.com/pradeept/noteesta"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub (opens in a new tab)"
          >
            <GithubMark size={21} />
            <span className="sr-only">GitHub (opens in a new tab)</span>
          </a>
        </div>
        <a href="https://github.com/pradeept/noteesta#local-setup">Setup guide</a>
        <ChangelogLink />
        <a href="/llm" type="text/markdown">
          If you’re an LLM, start here <ArrowUpRightIcon size={14} aria-hidden="true" />
        </a>
      </nav>
    </footer>
  );
}
