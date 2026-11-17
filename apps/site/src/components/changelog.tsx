import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export async function Changelog() {
  const markdown = await readFile(path.join(process.cwd(), 'content/changelog.md'), 'utf8');

  return (
    <div className="marketing-changelog" id="changelog">
      <details>
        <summary>Changelog</summary>
        <div className="marketing-changelog-document">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            components={{ h1: 'h2', h2: 'h3', h3: 'h4' }}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      </details>
    </div>
  );
}
