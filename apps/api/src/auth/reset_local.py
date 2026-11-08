"""Explicit local development reset. Never called by application startup."""

import argparse
import asyncio
import json
from pathlib import Path
from urllib.parse import urlparse

from redis.asyncio import Redis

from src.config import get_settings
from src.database import close_database, get_database
from src.storage import get_storage
from workers.celery_app import celery_app

TABLES = (
    "pills",
    "collections",
    "chunks",
    "pill_three_d",
    "users",
    "auth_sessions",
    "auth_email_tokens",
    "auth_oauth",
)
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def validate_target(database_name: str) -> None:
    settings = get_settings()
    if settings.app_env != "development" or database_name != settings.mongodb_database:
        raise RuntimeError(
            "Reset requires APP_ENV=development and the exact configured database name."
        )
    for url in (settings.mongodb_uri, settings.s3_endpoint_url, settings.redis_url):
        if urlparse(url).hostname not in LOCAL_HOSTS:
            raise RuntimeError("Reset only supports localhost MongoDB, object storage, and Redis.")


async def reset(database_name: str, execute: bool) -> dict:
    validate_target(database_name)
    database = get_database()
    storage = get_storage()
    counts = {table: await database[table].count_documents({}) for table in TABLES}

    def list_objects():
        paginator = storage.client.get_paginator("list_objects_v2")
        return [
            item["Key"]
            for page in paginator.paginate(Bucket=storage.bucket, Prefix="users/")
            for item in page.get("Contents", [])
        ]

    objects = await asyncio.to_thread(list_objects)
    directory = Path(get_settings().local_email_directory).resolve()
    directory.relative_to(Path.cwd().resolve())
    emails = list(directory.glob("*.json"))
    report = {
        "database": database_name,
        "bucket": storage.bucket,
        "collections": counts,
        "objectsUnderUsersPrefix": len(objects),
        "localEmails": len(emails),
        "execute": execute,
    }
    if execute:
        workers = await asyncio.to_thread(celery_app.control.inspect(timeout=1).ping)
        async with Redis.from_url(get_settings().redis_url) as redis:
            queued = await redis.llen("celery")
            unacknowledged = await redis.hlen("unacked")
        if workers or queued or unacknowledged:
            raise RuntimeError("Stop workers and drain/purge pending jobs before executing reset.")
        for key in objects:
            await storage.delete_object(key)
        for table in TABLES:
            await database[table].delete_many({})
        for file in emails:
            file.unlink()
    return report


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, help="Exact configured local database name")
    parser.add_argument("--execute", action="store_true", help="Delete data; default is dry-run")
    args = parser.parse_args()
    try:
        print(json.dumps(await reset(args.database, args.execute), indent=2))
    finally:
        await close_database()


if __name__ == "__main__":
    asyncio.run(main())
