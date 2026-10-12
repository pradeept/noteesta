from datetime import UTC, datetime
from typing import Any

from pymongo import DESCENDING
from pymongo.asynchronous.database import AsyncDatabase

from noteesta_api.schemas import Source, StudyArtifact, StudyPill


def _serialize(pill: StudyPill) -> dict[str, Any]:
    payload = pill.model_dump(mode="json", by_alias=False)
    payload["user_id"] = pill.user_id
    payload["settings"] = pill.settings
    payload["sources"] = sources_for_storage(pill.sources)
    if pill.artifact:
        payload["artifact"] = artifact_for_storage(pill.artifact)
    payload["_id"] = payload.pop("id")
    return payload


def _deserialize(document: dict[str, Any]) -> StudyPill:
    payload = dict(document)
    payload["id"] = payload.pop("_id")
    return StudyPill.model_validate(payload)


def sources_for_storage(sources: list[Source]) -> list[dict[str, Any]]:
    payloads = []
    for source in sources:
        payload = source.model_dump(mode="json", by_alias=False)
        payload["object_key"] = source.object_key
        payload["url"] = source.url
        payloads.append(payload)
    return payloads


def artifact_for_storage(artifact: StudyArtifact) -> dict[str, Any]:
    payload = artifact.model_dump(mode="json", by_alias=False)
    for visual_payload, visual in zip(payload["visuals"], artifact.visuals, strict=True):
        visual_payload["asset_key"] = visual.asset_key
    return payload


class PillRepository:
    def __init__(self, database: AsyncDatabase):
        self.database = database

    async def create(self, pill: StudyPill) -> StudyPill:
        await self.database.pills.insert_one(_serialize(pill))
        return pill

    async def list_for_user(self, user_id: str) -> list[StudyPill]:
        cursor = self.database.pills.find({"user_id": user_id}).sort("updated_at", DESCENDING)
        return [_deserialize(document) async for document in cursor]

    async def get(self, pill_id: str, user_id: str | None = None) -> StudyPill | None:
        query: dict[str, Any] = {"_id": pill_id}
        if user_id is not None:
            query["user_id"] = user_id
        document = await self.database.pills.find_one(query)
        return _deserialize(document) if document else None

    async def update(self, pill_id: str, **changes: Any) -> StudyPill | None:
        changes["updated_at"] = datetime.now(UTC)
        await self.database.pills.update_one({"_id": pill_id}, {"$set": changes})
        return await self.get(pill_id)

    async def replace(self, pill: StudyPill) -> StudyPill:
        await self.database.pills.replace_one({"_id": pill.id}, _serialize(pill), upsert=True)
        return pill
