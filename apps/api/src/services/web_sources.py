"""Public HTML imports. All network access goes through an address-pinning transport."""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
import ssl
import zlib
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urljoin

import httpcore
import httpx
from lxml import etree, html
from trafilatura import extract

from src.config import get_settings


class WebImportError(ValueError):
    """A page-specific import problem, safe to show to the learner."""


def public_address(value: str) -> bool:
    address = ipaddress.ip_address(value)
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    if isinstance(address, ipaddress.IPv6Address) and (
        address.is_site_local
        or address in ipaddress.ip_network("64:ff9b::/96")
        or address in ipaddress.ip_network("64:ff9b:1::/48")
    ):
        return False
    return address.is_global and not address.is_multicast


def website_url(value: str) -> str:
    value = value.strip()
    if not value or len(value) > 4096 or re.search(r"[\x00-\x20\x7f\\]", value):
        raise WebImportError(
            "Enter a complete public website URL beginning with http:// or https://."
        )
    try:
        url = httpx.URL(value)
        if (
            url.scheme not in {"http", "https"}
            or not url.host
            or url.userinfo
            or url.port not in {None, 80 if url.scheme == "http" else 443}
        ):
            raise ValueError
        host = url.host.lower().rstrip(".")
        if host in {"youtu.be", "youtube.com"} or host.endswith(".youtube.com"):
            raise WebImportError("Add YouTube videos using the YouTube link field.")
        if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
            raise WebImportError("Only public website addresses can be imported.")
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            if not public_address(str(address)):
                raise WebImportError("Only public website addresses can be imported.")
        return str(url.copy_with(host=host, raw_path=url.raw_path, fragment=None))
    except WebImportError:
        raise
    except (ValueError, httpx.InvalidURL) as error:
        raise WebImportError("Enter a valid public HTTP or HTTPS website URL.") from error


class PublicNetworkBackend(httpcore.AsyncNetworkBackend):
    """Resolve once at connect time and pass only validated numeric IPs to the dialer.

    HTTPcore retains the original hostname for Host and TLS certificate/SNI checks.
    The numeric address prevents a second DNS lookup from rebinding to a private IP.
    """

    def __init__(self):
        self.backend = httpcore.AnyIOBackend()

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        records = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
        addresses = list(dict.fromkeys(record[4][0] for record in records))
        if not addresses or any(not public_address(address) for address in addresses):
            raise WebImportError("Only public website addresses can be imported.")
        # Try only the already validated numeric addresses; never resolve the hostname again.
        for index, address in enumerate(addresses):
            try:
                return await self.backend.connect_tcp(
                    address, port, min(timeout or 5, 5), local_address, socket_options
                )
            except (httpcore.ConnectError, httpcore.ConnectTimeout, OSError):
                if index == len(addresses) - 1:
                    raise

    async def connect_unix_socket(self, *args, **kwargs):
        raise WebImportError("Only public website addresses can be imported.")


class CoreStream(httpx.AsyncByteStream):
    def __init__(self, stream):
        self.stream = stream

    async def __aiter__(self):
        async for chunk in self.stream:
            yield chunk

    async def aclose(self):
        await self.stream.aclose()


class PublicTransport(httpx.AsyncBaseTransport):
    def __init__(self):
        self.pool = httpcore.AsyncConnectionPool(
            ssl_context=ssl.create_default_context(),
            network_backend=PublicNetworkBackend(),
            max_connections=4,
        )

    async def handle_async_request(self, request):
        response = await self.pool.handle_async_request(
            httpcore.Request(
                method=request.method,
                url=httpcore.URL(
                    scheme=request.url.raw_scheme,
                    host=request.url.raw_host,
                    port=request.url.port,
                    target=request.url.raw_path,
                ),
                headers=request.headers.raw,
                content=request.stream,
                extensions=request.extensions,
            )
        )
        return httpx.Response(
            response.status,
            headers=response.headers,
            stream=CoreStream(response.stream),
            extensions=response.extensions,
        )

    async def aclose(self):
        await self.pool.aclose()


@dataclass(frozen=True)
class WebPage:
    requested_url: str
    url: str
    content: bytes
    fetched_at: str


async def read_html(response: httpx.Response, limit: int) -> bytes:
    """Bound decompression as well as the final HTML size, including zip bombs."""
    encoding = response.headers.get("content-encoding", "identity").lower().strip()
    if encoding not in {"identity", "gzip", "deflate"}:
        raise WebImportError(
            "This page uses an unsupported compression format. Upload its content instead."
        )
    decoder = (
        None if encoding == "identity" else zlib.decompressobj(31 if encoding == "gzip" else 15)
    )
    content = bytearray()
    try:
        async for chunk in response.aiter_raw(chunk_size=64 * 1024):
            content.extend(
                decoder.decompress(chunk, limit - len(content) + 1) if decoder else chunk
            )
            if len(content) > limit:
                raise WebImportError("This page exceeds the HTML size limit.")
        if decoder and (not decoder.eof or decoder.unused_data):
            raise WebImportError("This page returned invalid compressed HTML.")
    except zlib.error as error:
        raise WebImportError("This page returned invalid compressed HTML.") from error
    return bytes(content)


async def fetch_page(value: str) -> WebPage:
    settings = get_settings()
    requested = current = website_url(value)
    try:
        async with asyncio.timeout(settings.web_fetch_timeout_seconds):
            async with httpx.AsyncClient(
                transport=PublicTransport(),
                trust_env=False,
                follow_redirects=False,
                timeout=settings.web_fetch_timeout_seconds,
                headers={
                    "User-Agent": "Noteesta/1.0 (public page import)",
                    "Accept": "text/html",
                    "Accept-Encoding": "gzip, deflate",
                },
            ) as client:
                for hop in range(settings.web_max_redirects + 1):
                    async with client.stream("GET", current) as response:
                        if response.status_code in {301, 302, 303, 307, 308}:
                            if hop == settings.web_max_redirects or not response.headers.get(
                                "location"
                            ):
                                raise WebImportError("This page has too many or invalid redirects.")
                            current = website_url(urljoin(current, response.headers["location"]))
                            continue
                        if response.status_code != 200:
                            raise WebImportError(
                                f"This page could not be read (HTTP {response.status_code}). "
                                "Try another public page or upload its content."
                            )
                        content_type = response.headers.get("content-type", "").split(";")[0]
                        if content_type.lower().strip() not in {
                            "text/html",
                            "application/xhtml+xml",
                        }:
                            raise WebImportError(
                                "This link is not an HTML page. Upload documents or media as files."
                            )
                        content = await read_html(response, settings.web_max_html_bytes)
                        return WebPage(requested, current, content, datetime.now(UTC).isoformat())
    except WebImportError:
        raise
    except (
        TimeoutError,
        OSError,
        httpx.TransportError,
        httpcore.NetworkError,
        httpcore.TimeoutException,
        httpcore.ProtocolError,
    ) as error:
        raise WebImportError(
            "This page could not be reached. Try again or upload its content as a file."
        ) from error
    raise WebImportError("This page could not be read.")


def page_tree(content: bytes):
    try:
        return html.fromstring(content, parser=html.HTMLParser(no_network=True))
    except (etree.ParserError, ValueError) as error:
        raise WebImportError("No readable HTML was found on this page.") from error


def page_title(tree, fallback: str) -> str:
    titles = tree.xpath("//title//text()") or tree.xpath("//h1//text()")
    return " ".join(" ".join(titles).split())[:300] or fallback


def discover_page(page: WebPage) -> dict:
    tree = page_tree(page.content)
    limit = get_settings().web_max_discovered_links
    links = []
    seen = {page.url}
    hostname = httpx.URL(page.url).host
    capped = False
    bases = tree.xpath("//base[@href]/@href")
    base = urljoin(page.url, bases[0]) if bases else page.url
    for element in tree.xpath("//a[@href]"):
        href = element.get("href", "").strip()
        if not href or href.startswith("#") or "download" in element.attrib:
            continue
        try:
            url = website_url(urljoin(base, href))
        except WebImportError:
            continue
        parsed = httpx.URL(url)
        if (
            parsed.host != hostname
            or url in seen
            or re.search(
                r"\.(?:pdf|zip|gz|png|jpe?g|gif|svg|webp|mp[34]|wav|docx?|pptx?|xlsx?)(?:$)",
                parsed.path,
                re.I,
            )
        ):
            continue
        seen.add(url)
        if len(links) == limit:
            capped = True
            break
        links.append({"url": url, "title": " ".join(element.text_content().split())[:300] or url})
    return {
        "url": page.url,
        "title": page_title(tree, page.url),
        "links": links,
        "capped": capped,
    }


def extract_page(page: WebPage) -> dict:
    tree = page_tree(page.content)
    title = page_title(tree, page.url)
    if not tree.xpath("//article") and re.match(
        r"^(?:just a moment[.!…]*|access denied|403 forbidden|log[ -]?in|sign[ -]?in)"
        r"(?:\s*[-|–—].*)?$",
        title,
        re.I,
    ):
        raise WebImportError(
            "This page requires sign-in or blocks automated access. Upload its content instead."
        )
    for element in tree.xpath("//script|//style|//noscript|//svg|//iframe|//form"):
        element.drop_tree()
    xml = extract(
        tree,
        url=page.url,
        output_format="xml",
        include_formatting=True,
        include_comments=False,
        include_tables=True,
        include_images=False,
    )
    if not xml:
        raise WebImportError(
            "No readable content was found. This page may require JavaScript or sign-in. "
            "Upload its content as a file instead."
        )
    body = etree.fromstring(xml.encode(), parser=etree.XMLParser(no_network=True)).find("main")
    if body is None:
        raise WebImportError("No readable content was found on this page.")
    segments = []
    heading = "Introduction"
    blocks = []

    def finish():
        if blocks:
            segments.append(
                {"locator": f"Section {len(segments) + 1}: {heading}", "text": "\n\n".join(blocks)}
            )
            blocks.clear()

    def render(element):
        text = "".join(element.itertext()).strip()
        if element.tag in {"code", "pre"}:
            return f"```\n{text}\n```"
        if element.tag == "table":
            rows = []
            for row in element.iter("row"):
                cells = [
                    " ".join("".join(cell.itertext()).split()).replace("|", "\\|") for cell in row
                ]
                rows.append("| " + " | ".join(cells) + " |")
                if len(rows) == 1:
                    rows.append("| " + " | ".join("---" for _ in cells) + " |")
            return "\n".join(rows)
        if element.tag == "list":
            return "\n".join(f"- {''.join(item.itertext()).strip()}" for item in element)
        return text

    for element in body:
        if element.tag == "head":
            finish()
            heading = " ".join("".join(element.itertext()).split()) or "Untitled section"
            blocks.append(f"## {heading}")
        else:
            text = render(element)
            if text:
                blocks.append(text)
    finish()
    count = sum(len(segment["text"]) for segment in segments)
    if not count:
        raise WebImportError("No readable content was found on this page.")
    if count > get_settings().web_max_text_characters:
        raise WebImportError("This page exceeds the readable text limit. Choose a shorter page.")
    return {
        "type": "website",
        "version": 1,
        "title": title,
        "requested_url": page.requested_url,
        "url": page.url,
        "fetched_at": page.fetched_at,
        "segments": segments,
    }
