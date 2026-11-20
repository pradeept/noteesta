import asyncio
import gzip
import json
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from zipfile import ZipFile

import httpcore
import httpx
import pytest
from botocore.exceptions import ClientError
from fakes import FakeTable
from test_routes import api as api

from src.common.schemas.schemas import Source
from src.config import Settings
from src.models.schemas import GenerationSelection
from src.pills.schemas import StudyPill
from src.repository import _deserialize, _serialize
from src.services import extraction, pipeline
from src.services import web_sources as web
from src.services.exporting import build_export
from src.sources import router as web_routes

HTML = (Path(__file__).parent / "fixtures/website.html").read_bytes()
URL = "https://example.com/python/loops"


def page(content=HTML, url=URL):
    return web.WebPage(URL, url, content, "2026-11-20T00:00:00+00:00")


@pytest.mark.parametrize(
    "value",
    [
        "file:///etc/passwd",
        "ftp://example.com",
        "https://user:secret@example.com/",
        "http://127.0.0.1/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.1/",
        "http://224.0.0.1/",
        "http://localhost/",
        "http://service.local/",
        "https://example.com:8443/",
        "https://example.com/\nheader",
        "https://example.com\\@127.0.0.1/",
        "https://youtube.com/watch?v=83iyz_5rN8c",
        "https://youtu.be/83iyz_5rN8c",
    ],
)
def test_rejects_unsupported_or_nonpublic_urls(value):
    with pytest.raises(web.WebImportError):
        web.website_url(value)


def test_normalizes_urls_without_removing_meaningful_query_values():
    assert (
        web.website_url(" HTTPS://EXAMPLE.COM:443/lesson?v=2#part ")
        == "https://example.com/lesson?v=2"
    )
    assert (
        web.website_url("https://example.com.evil.test/path")
        == "https://example.com.evil.test/path"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "addresses",
    [
        ["127.0.0.1"],
        ["::1"],
        ["169.254.169.254"],
        ["10.1.2.3"],
        ["93.184.216.34", "192.168.1.1"],
        ["::ffff:127.0.0.1"],
        ["ff02::1"],
        ["fec0::1"],
        ["64:ff9b::7f00:1"],
    ],
)
async def test_connection_rejects_private_and_mixed_dns_answers(monkeypatch, addresses):
    backend = web.PublicNetworkBackend()
    dial = AsyncMock()
    backend.backend = SimpleNamespace(connect_tcp=dial)
    resolver = AsyncMock(return_value=[(None, None, None, None, (ip, 443)) for ip in addresses])
    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolver)
    with pytest.raises(web.WebImportError, match="public"):
        await backend.connect_tcp("example.com", 443)
    dial.assert_not_awaited()


@pytest.mark.asyncio
async def test_connection_pins_ipv6_address_and_never_redials_hostname(monkeypatch):
    backend = web.PublicNetworkBackend()
    backend.backend = SimpleNamespace(connect_tcp=AsyncMock(return_value="stream"))
    resolver = AsyncMock(return_value=[(None, None, None, None, ("2606:4700:4700::1111", 443))])
    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolver)
    assert await backend.connect_tcp("example.com", 443, timeout=5) == "stream"
    backend.backend.connect_tcp.assert_awaited_once_with("2606:4700:4700::1111", 443, 5, None, None)
    resolver.assert_awaited_once()


@pytest.mark.asyncio
async def test_pinned_connection_keeps_original_host_and_tls_name(monkeypatch):
    class Stream(httpcore.AsyncNetworkStream):
        def __init__(self):
            self.written = b""
            self.tls_name = None

        async def read(self, max_bytes, timeout=None):
            return b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK"

        async def write(self, buffer, timeout=None):
            self.written += buffer

        async def start_tls(self, ssl_context, server_hostname=None, timeout=None):
            self.tls_name = server_hostname
            return self

        async def aclose(self):
            pass

        def get_extra_info(self, info):
            return None

    stream = Stream()
    transport = web.PublicTransport()
    backend = transport.pool._network_backend
    backend.backend = SimpleNamespace(connect_tcp=AsyncMock(return_value=stream))
    monkeypatch.setattr(
        asyncio.get_running_loop(),
        "getaddrinfo",
        AsyncMock(return_value=[(None, None, None, None, ("93.184.216.34", 443))]),
    )
    async with httpx.AsyncClient(transport=transport) as client:
        response = await client.get("https://example.com/lesson")
    assert response.text == "OK"
    assert stream.tls_name == "example.com"
    assert b"Host: example.com\r\n" in stream.written
    assert backend.backend.connect_tcp.call_args.args[0] == "93.184.216.34"


@pytest.mark.asyncio
async def test_fetch_validates_redirects_before_requesting_them(monkeypatch):
    requests = []

    def handle(request):
        requests.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://169.254.169.254/secrets"})

    monkeypatch.setattr(web, "PublicTransport", lambda: httpx.MockTransport(handle))
    with pytest.raises(web.WebImportError, match="public"):
        await web.fetch_page(URL)
    assert requests == [URL]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case, message",
    [
        ("status", "HTTP 403"),
        ("pdf", "not an HTML"),
        ("size", "size limit"),
        ("redirect", "redirects"),
        ("timeout", "could not be reached"),
        ("compressed", "unsupported compression"),
    ],
)
async def test_fetch_limits_and_access_failures(monkeypatch, case, message):
    monkeypatch.setattr(
        web,
        "get_settings",
        lambda: Settings(
            _env_file=None,
            web_max_html_bytes=1024,
            web_max_redirects=1,
            web_fetch_timeout_seconds=0.01,
        ),
    )

    async def handle(request):
        if case == "timeout":
            await asyncio.sleep(0.05)
        if case == "status":
            return httpx.Response(403)
        if case == "pdf":
            return httpx.Response(200, headers={"content-type": "application/pdf"})
        if case == "redirect":
            return httpx.Response(302, headers={"location": "/loop"})
        headers = {"content-type": "text/html"}
        if case == "compressed":
            headers["content-encoding"] = "br"
        return httpx.Response(200, headers=headers, stream=httpx.ByteStream(b"x" * 1025))

    monkeypatch.setattr(web, "PublicTransport", lambda: httpx.MockTransport(handle))
    with pytest.raises(web.WebImportError, match=message):
        await web.fetch_page(URL)


def test_discovery_resolves_links_and_preserves_same_host_boundary():
    result = web.discover_page(page())
    urls = [link["url"] for link in result["links"]]
    assert result["title"] == "Learning Python loops"
    assert urls == [
        "https://example.com/",
        "https://example.com/account",
        "https://example.com/python/lists",
        "https://example.com/tuples?version=2",
    ]
    assert result["capped"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("oversized", [False, True])
async def test_compressed_html_is_decoded_with_a_bounded_output(monkeypatch, oversized):
    content = b"x" * 1_000_000 if oversized else HTML

    def handle(request):
        return httpx.Response(
            200,
            headers={
                "content-type": "text/html",
                "content-encoding": "gzip",
            },
            stream=httpx.ByteStream(gzip.compress(content)),
        )

    monkeypatch.setattr(web, "PublicTransport", lambda: httpx.MockTransport(handle))
    monkeypatch.setattr(
        web, "get_settings", lambda: Settings(_env_file=None, web_max_html_bytes=4096)
    )
    if oversized:
        with pytest.raises(web.WebImportError, match="size limit"):
            await web.fetch_page(URL)
    else:
        assert (await web.fetch_page(URL)).content == HTML


def test_discovery_honors_cap_and_html_base_url(monkeypatch):
    monkeypatch.setattr(
        web, "get_settings", lambda: Settings(_env_file=None, web_max_discovered_links=1)
    )
    result = web.discover_page(
        page(b'<base href="/chapter/"><a href="one">One</a><a href="two">Two</a>')
    )
    assert result["links"] == [{"url": "https://example.com/chapter/one", "title": "One"}]
    assert result["capped"] is True
    assert (
        web.discover_page(page(b'<base href="https://outside.example/"><a href="one">One</a>'))[
            "links"
        ]
        == []
    )


def test_extraction_keeps_structured_evidence_and_removes_boilerplate():
    result = web.extract_page(page())
    text = "\n".join(segment["text"] for segment in result["segments"])
    assert "Section 2: Loop example" == result["segments"][1]["locator"]
    assert "```\nfor value in values:\n    print(value)" in text
    assert "| for | Iterate over values |" in text
    assert "- Choose the collection." in text
    assert "Home navigation" not in text
    assert "unrelated banner" not in text
    assert "ignore_all_previous" not in text
    assert result["requested_url"] == result["url"] == URL
    chunks = extraction.chunk_segments(
        [
            extraction.ExtractedSegment(**segment, preserve_formatting=True)
            for segment in result["segments"]
        ]
    )
    assert any("\n    print(value)" in chunk.text for chunk in chunks)


@pytest.mark.parametrize("html", [b"", b"<html><body><script>loadApp()</script></body></html>"])
def test_unreadable_pages_fail_clearly(html):
    with pytest.raises(web.WebImportError, match="readable"):
        web.extract_page(page(html))


def test_extracted_text_cap_is_explicit(monkeypatch):
    monkeypatch.setattr(
        web, "get_settings", lambda: Settings(_env_file=None, web_max_text_characters=1000)
    )
    with pytest.raises(web.WebImportError, match="text limit"):
        web.extract_page(
            page(b"<article><p>" + b"Long educational content. " * 100 + b"</p></article>")
        )


@pytest.mark.asyncio
async def test_snapshot_regeneration_never_fetches_live_page(monkeypatch):
    canonical = web.extract_page(page())
    source = Source(
        id="web", name="Loops", kind="website", detail="saved", url=URL, snapshot_key="saved.json"
    )
    storage = SimpleNamespace(get_bytes=AsyncMock(return_value=json.dumps(canonical).encode()))
    fetch = AsyncMock(side_effect=AssertionError("live fetch forbidden"))
    monkeypatch.setattr(extraction, "fetch_page", fetch)
    result = await extraction.extract_source(source, storage)
    assert result.canonical == canonical
    assert result.segments[1].preserve_formatting
    fetch.assert_not_awaited()
    storage.get_bytes.side_effect = ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
    with pytest.raises(web.WebImportError, match="saved page text is missing"):
        await extraction.extract_source(source, storage)
    fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_storage_outage_is_not_a_skippable_page_error():
    source = Source(
        id="web", name="Loops", kind="website", detail="saved", snapshot_key="saved.json"
    )
    storage = SimpleNamespace(
        get_bytes=AsyncMock(
            side_effect=ClientError({"Error": {"Code": "ServiceUnavailable"}}, "GetObject")
        )
    )
    with pytest.raises(ClientError):
        await extraction.extract_source(source, storage)


def test_website_only_creation_and_library_link_metadata(api):
    client, database, storage, queue = api
    response = client.post(
        "/api/v1/pills",
        data={
            "title": "Loops",
            "subject": "Python",
            "website_urls": json.dumps([URL + "#one", URL + "#two"]),
        },
    )
    assert response.status_code == 202
    body = response.json()
    assert len(body["sources"]) == 1
    source = body["sources"][0]
    assert source["websiteUrl"] == URL
    assert source["originalAvailable"] is False
    assert "snapshotKey" not in source and "url" not in source
    stored = database.pills.documents[body["id"]]
    assert _deserialize(stored).sources[0].url == URL
    entry = next(
        entry for entry in client.get("/api/v1/library").json() if entry["sourceId"] == source["id"]
    )
    assert entry["websiteUrl"] == URL and entry["youtubeUrl"] is None
    for suffix in ["download", "download-url"]:
        assert client.get(f'/api/v1/library/{source["id"]}/{suffix}').status_code == 409
    assert client.delete(f'/api/v1/library/{source["id"]}').status_code == 409
    storage.put_bytes.assert_not_awaited()
    queue.assert_called_once_with(body["id"])


@pytest.mark.parametrize(
    "value", ["invalid-json", "{}", "[null]", '["http://127.0.0.1"]', json.dumps([URL] * 21)]
)
def test_bad_web_input_rejected_before_any_upload(api, value):
    client, _, storage, queue = api
    response = client.post(
        "/api/v1/pills",
        data={
            "title": "Loops",
            "subject": "Python",
            "website_urls": value,
        },
        files={"files": ("notes.txt", b"Notes", "text/plain")},
    )
    assert response.status_code == 422
    storage.put_bytes.assert_not_awaited()
    queue.assert_not_called()


def test_all_source_types_can_be_combined(api):
    client, database, storage, queue = api
    response = client.post(
        "/api/v1/pills",
        data={
            "title": "Loops",
            "subject": "Python",
            "website_urls": json.dumps([URL]),
            "youtube_url": "https://youtu.be/83iyz_5rN8c",
        },
        files={"files": ("notes.txt", b"Notes", "text/plain")},
    )
    assert response.status_code == 202
    assert [source["kind"] for source in response.json()["sources"]] == [
        "document",
        "youtube",
        "website",
    ]


def test_discovery_route_uses_workspace_user_and_returns_candidates(api, monkeypatch):
    client, *_ = api
    rate = AsyncMock()
    monkeypatch.setattr(web_routes, "discovery_rate_limit", rate)
    monkeypatch.setattr(web_routes, "fetch_page", AsyncMock(return_value=page()))
    response = client.post("/api/v1/sources/web/discover", json={"url": URL})
    assert response.status_code == 200
    assert response.json()["url"] == URL
    assert response.json()["links"][2]["title"] == "Lists"
    rate.assert_awaited_once_with("student-1")


@pytest.mark.asyncio
async def test_discovery_rate_limit_is_per_workspace_user(monkeypatch):
    store = SimpleNamespace(eval=AsyncMock(return_value=11))
    monkeypatch.setattr(web_routes, "rate_store", lambda: store)
    with pytest.raises(Exception) as raised:
        await web_routes.discovery_rate_limit("student-1")
    assert raised.value.status_code == 429
    assert raised.value.headers["Retry-After"] == "60"
    assert store.eval.call_args.args[2] == f'web:discovery:{web_routes.digest("student-1")}'


@pytest.fixture
def web_pipeline(monkeypatch):
    good = Source(id="good", name="Loops", kind="website", url=URL, detail="Website")
    bad = Source(
        id="bad",
        name="Blocked",
        kind="website",
        url="https://example.com/blocked",
        detail="Website",
    )
    pill = StudyPill(
        id="web-pill", user_id="student-1", title="Loops", subject="Python", sources=[bad, good]
    )
    database = SimpleNamespace(
        pills=FakeTable([_serialize(pill)]),
        pill_note_revisions=FakeTable(),
        pill_three_d=FakeTable(),
    )
    objects = {}

    async def put(key, data, _type):
        objects[key] = data

    storage = SimpleNamespace(
        put_bytes=AsyncMock(side_effect=put),
        get_bytes=AsyncMock(side_effect=lambda key: objects[key]),
    )
    retriever = SimpleNamespace(index=AsyncMock())
    orchestrator = SimpleNamespace(
        analyze_section=AsyncMock(
            return_value={
                "claims": [
                    {"text": "Loops repeat.", "locator": "wrong", "excerpt": "Loops repeat."}
                ]
            }
        ),
        synthesize_notes=AsyncMock(
            return_value={
                "summary": "Loops repeat.",
                "sections": [
                    {
                        "id": "loops",
                        "title": "Loops",
                        "markdown": "Loops repeat.",
                        "evidence": [
                            {
                                "sourceId": "good",
                                "locator": "Section 1: Python loops",
                                "excerpt": "Loops repeat.",
                            },
                            {"sourceId": "bad", "locator": "invented", "excerpt": "Never use"},
                        ],
                    }
                ],
            }
        ),
        generate_visual=AsyncMock(side_effect=RuntimeError("No visual for fixture")),
    )
    monkeypatch.setattr(pipeline, "get_database", lambda: database)
    monkeypatch.setattr(pipeline, "get_storage", lambda: storage)
    monkeypatch.setattr(
        pipeline,
        "resolve_generation",
        AsyncMock(return_value=(GenerationSelection(provider="ollama", model="local"), Mock())),
    )
    monkeypatch.setattr(pipeline, "StudyPillOrchestrator", lambda _: orchestrator)
    monkeypatch.setattr(pipeline, "StudyPillRetriever", lambda _: retriever)

    async def fetch(url):
        if url.endswith("blocked"):
            raise web.WebImportError("This page could not be read (HTTP 403).")
        return page()

    fetcher = AsyncMock(side_effect=fetch)
    monkeypatch.setattr(extraction, "fetch_page", fetcher)
    return SimpleNamespace(
        pill=pill,
        db=database,
        storage=storage,
        objects=objects,
        retriever=retriever,
        orchestrator=orchestrator,
        fetch=fetcher,
    )


@pytest.mark.asyncio
async def test_partial_failure_generates_only_from_readable_pages_and_keeps_snapshot(web_pipeline):
    state = web_pipeline
    await pipeline.process_pill(state.pill.id)
    result = _deserialize(state.db.pills.documents[state.pill.id])
    assert result.status == "ready"
    assert result.sources[0].status == "failed"
    assert "HTTP 403" in result.sources[0].error
    assert result.sources[1].snapshot_key in state.objects
    assert result.sources[1].fetched_at == datetime(2026, 11, 20, tzinfo=UTC)
    assert [c.source_id for c in result.artifact.sections[0].citations] == ["good"]
    documents = state.retriever.index.call_args.kwargs["documents"]
    assert {document.metadata["source_id"] for document in documents} == {"good"}
    state.fetch.reset_mock()
    await pipeline.process_pill(state.pill.id)
    state.fetch.assert_awaited_once_with("https://example.com/blocked")


@pytest.mark.asyncio
async def test_all_failed_pages_fail_without_indexing_or_generating(web_pipeline):
    state = web_pipeline
    state.fetch.side_effect = web.WebImportError("Page unavailable")
    with pytest.raises(RuntimeError, match="None of the selected"):
        await pipeline.process_pill(state.pill.id)
    assert state.db.pills.documents[state.pill.id]["status"] == "failed"
    assert all(
        source["status"] == "failed"
        for source in state.db.pills.documents[state.pill.id]["sources"]
    )
    state.retriever.index.assert_not_awaited()
    state.orchestrator.synthesize_notes.assert_not_awaited()


@pytest.mark.asyncio
async def test_model_failure_preserves_snapshot_and_keeps_existing_failure_handling(web_pipeline):
    state = web_pipeline
    state.orchestrator.analyze_section.side_effect = RuntimeError("Model unavailable")
    with pytest.raises(RuntimeError, match="Model unavailable"):
        await pipeline.process_pill(state.pill.id)
    saved = _deserialize(state.db.pills.documents[state.pill.id])
    assert saved.status == "failed"
    assert saved.sources[1].snapshot_key in state.objects
    assert saved.sources[1].error is None


@pytest.mark.asyncio
async def test_export_includes_web_links_and_skipped_page_reasons(web_pipeline):
    state = web_pipeline
    await pipeline.process_pill(state.pill.id)
    pill = _deserialize(state.db.pills.documents[state.pill.id])
    archive = await build_export(pill, state.storage)
    markdown = ZipFile(BytesIO(archive)).read("notes.md").decode()
    assert f"[Learning Python loops](<{URL}>)" in markdown
    assert "skipped: This page could not be read (HTTP 403)" in markdown


def test_root_urls_deduplicate_and_escaped_paths_are_preserved():
    assert web.website_url("https://example.com") == web.website_url("https://example.com/")
    assert web.website_url("https://example.com/a%2Fb?q=%2f") == "https://example.com/a%2Fb?q=%2f"


@pytest.mark.parametrize("title", ["Just a moment...", "Sign in"])
def test_access_challenges_are_not_imported_as_study_material(title):
    markup = f"<html><title>{title}</title><body>"
    content = (markup + "<p>Please sign in to continue.</p></body></html>").encode()
    with pytest.raises(web.WebImportError, match="blocks automated access"):
        web.extract_page(page(content))


def test_article_about_signing_in_is_still_readable():
    result = web.extract_page(page(HTML.replace(b"Learning Python loops", b"Sign in")))
    assert result["title"] == "Sign in"
    assert result["segments"]


@pytest.mark.asyncio
async def test_connection_falls_back_only_to_prevalidated_addresses(monkeypatch):
    backend = web.PublicNetworkBackend()
    dial = AsyncMock(side_effect=[httpcore.ConnectError("IPv6 unavailable"), "stream"])
    backend.backend = SimpleNamespace(connect_tcp=dial)
    resolver = AsyncMock(
        return_value=[
            (None, None, None, None, ("2606:4700:4700::1111", 443)),
            (None, None, None, None, ("93.184.216.34", 443)),
        ]
    )
    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolver)
    assert await backend.connect_tcp("example.com", 443) == "stream"
    assert [call.args[0] for call in dial.call_args_list] == [
        "2606:4700:4700::1111",
        "93.184.216.34",
    ]
    resolver.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad_snapshot",
    [
        {"type": "website", "version": 99},
        {"type": "website", "version": 1, "segments": [None]},
    ],
)
async def test_invalid_saved_pages_produce_explicit_import_errors(bad_snapshot):
    source = Source(
        id="web", name="Loops", kind="website", detail="saved", snapshot_key="saved.json"
    )
    storage = SimpleNamespace(get_bytes=AsyncMock(return_value=json.dumps(bad_snapshot).encode()))
    with pytest.raises(web.WebImportError, match="saved page text"):
        await extraction.extract_source(source, storage)


@pytest.mark.asyncio
async def test_failed_website_can_be_combined_with_a_readable_uploaded_file(web_pipeline):
    state = web_pipeline
    stored = state.db.pills.documents[state.pill.id]
    stored["sources"][1].update(
        kind="document", name="notes.txt", object_key="original.txt", url=None
    )
    state.objects["original.txt"] = b"Loops repeat instructions from the uploaded lesson."
    await pipeline.process_pill(state.pill.id)
    result = _deserialize(state.db.pills.documents[state.pill.id])
    assert result.status == "ready"
    assert result.sources[0].status == "failed"
    assert result.sources[1].kind == "document"
    assert result.sources[1].status == "ready"
    assert {
        doc.metadata["source_id"] for doc in state.retriever.index.call_args.kwargs["documents"]
    } == {"good"}


@pytest.mark.asyncio
async def test_snapshot_storage_failure_stops_the_job(web_pipeline):
    state = web_pipeline
    state.storage.put_bytes.side_effect = ConnectionError("Storage unavailable")
    with pytest.raises(ConnectionError, match="Storage unavailable"):
        await pipeline.process_pill(state.pill.id)
    assert state.db.pills.documents[state.pill.id]["status"] == "failed"
    state.orchestrator.synthesize_notes.assert_not_awaited()
