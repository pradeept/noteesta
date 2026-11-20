# Website sources

In **New Study Pill**, paste one public website URL per line under **Website links**, then choose **Review website pages**. Each URL shows an inline list with the pasted page checked and direct links on the same hostname unchecked. Search the list, select the pages you need, and choose **Add selected pages**. Multiple pasted links are reviewed in order. You can skip a link or cancel the review without removing pages already added.

Choose up to 20 website pages per Pill. Files and a YouTube video can be combined with website pages, or you can create a Pill from website pages alone. The public sample remains a fixture-based demo.

## What is imported

The worker reads public HTML and extracts its main text, retaining headings, lists, code blocks, and tables as text. Each selected page is a separate source. Discovery reads only the pasted page and suggests up to 100 directly linked pages; it does not fetch the suggested pages or recursively crawl a website. Candidate names come from link labels and may differ from the title read during import.

Website imports do not execute JavaScript, sign in, bypass access restrictions, interpret images, or download embedded resources. For pages that cannot be read, upload the content as a supported file instead. Direct PDF and media URLs use the existing file-upload flow. YouTube videos use the separate YouTube field.

## Saved text and citations

Successful imports save extracted sections, page title, requested/resolved URLs, and the import timestamp in object storage under the Pill's existing parsed-source path. Source details and citation dialogs can open the website. Markdown exports link to website references. Opening a live website may show newer content; citation excerpts use the saved text.

Retry and regeneration reuse successful saved imports, even if the live page changes or disappears. Previously unsuccessful pages are fetched again. Missing or invalid saved text produces an explicit error instead of silently replacing evidence. To import an updated page, add its URL to a new Pill.

## Failed imports

If a website cannot be read, its source is marked failed with a visible reason. Generation continues using readable sources; skipped pages contribute no indexed text or citations. If every selected source is unreadable, generation fails. A ready Pill can therefore contain skipped website pages; regenerating retries those pages. File, YouTube, model, indexing, and storage failures retain their existing job-level handling.

Website library entries are links. They have no original-file download or deletion action; generated notes and saved extracted text remain part of the Pill.

## Configuration

The backend accepts these environment settings in `apps/api/.env`. Restart the API and worker after changes.

| Setting | Default | Purpose |
| --- | --- | --- |
| `WEB_MAX_PAGES` | `20` | Maximum website URLs accepted per Pill |
| `WEB_MAX_DISCOVERED_LINKS` | `100` | Candidate links returned per lookup |
| `WEB_MAX_HTML_BYTES` | `5242880` | Maximum decoded HTML bytes per page |
| `WEB_MAX_TEXT_CHARACTERS` | `200000` | Maximum extracted characters per page |
| `WEB_MAX_REDIRECTS` | `5` | Maximum HTTP redirects per fetch |
| `WEB_FETCH_TIMEOUT_SECONDS` | `20` | Deadline for DNS, connection, redirects, and reading a page |
| `WEB_DISCOVERY_RATE_PER_MINUTE` | `10` | Discovery lookups per workspace user per minute |

The frontend picker allows up to 20 pages. Lower backend limits are enforced by the API. Oversized pages fail explicitly rather than being silently truncated. Discovery uses Redis for rate limiting and reports unavailability if Redis cannot be reached.

Only public HTTP/HTTPS addresses on their standard ports are allowed. Every connection resolves and validates all returned addresses, then connects to a validated numeric address while retaining the original hostname for TLS verification. Redirects pass through the same checks. Proxy environment variables are not used. HTML is parsed locally without fetching embedded resources. Gzip and deflate responses are decompressed with a bounded output size.
