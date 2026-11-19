import re
from urllib.parse import parse_qs, urlsplit

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com"}
SHORTS_ERROR = "YouTube Shorts aren’t supported. Add a regular YouTube video link."
VIDEO_LINK_ERROR = "Enter a YouTube video link from youtube.com/watch or youtu.be."


def youtube_video_url(value: str, *, saved_source: bool = False) -> str:
    """Accept one video and build the exact URL the worker will fetch."""
    try:
        parsed = urlsplit(value.strip())
        host = parsed.hostname
        if (
            parsed.scheme not in {"http", "https"}
            or parsed.username is not None
            or parsed.port is not None
        ):
            raise ValueError
    except ValueError:
        raise ValueError(VIDEO_LINK_ERROR) from None

    path = parsed.path.rstrip("/")
    video_id = ""
    if host in YOUTUBE_HOSTS and path == "/watch":
        ids = parse_qs(parsed.query, keep_blank_values=True).get("v", [])
        if len(ids) == 1:
            video_id = ids[0]
    elif host == "youtu.be":
        video_id = path.removeprefix("/")
    elif host in YOUTUBE_HOSTS:
        route, _, identifier = path.removeprefix("/").partition("/")
        if route.lower() == "shorts" and not saved_source:
            raise ValueError(SHORTS_ERROR)
        # Earlier versions saved some direct links outside the watch/share formats.
        if saved_source and route in {"shorts", "embed", "v", "live"}:
            video_id = identifier

    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError(VIDEO_LINK_ERROR)
    return f"https://www.youtube.com/watch?v={video_id}"
