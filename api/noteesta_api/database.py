from collections.abc import AsyncIterator

from pymongo import ASCENDING, AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from noteesta_api.config import get_settings

_client: AsyncMongoClient | None = None


def get_client() -> AsyncMongoClient:
    global _client
    if _client is None:
        _client = AsyncMongoClient(get_settings().mongodb_uri)
    return _client


def get_database() -> AsyncDatabase:
    settings = get_settings()
    return get_client()[settings.mongodb_database]


async def database_dependency() -> AsyncIterator[AsyncDatabase]:
    yield get_database()


async def ensure_indexes() -> None:
    database = get_database()
    await database.pills.create_index([("user_id", ASCENDING), ("updated_at", ASCENDING)])
    await database.chunks.create_index(
        [("user_id", ASCENDING), ("pill_id", ASCENDING), ("source_id", ASCENDING)]
    )


async def ping_database() -> bool:
    try:
        await get_client().admin.command("ping")
        return True
    except Exception:
        return False


async def close_database() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
