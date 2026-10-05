from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from noteesta_api.database import database_dependency
from noteesta_api.dependencies import current_user_id
from noteesta_api.schemas import Collection, CollectionCreate, CollectionUpdate

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get("", response_model=list[Collection])
async def list_collections(
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> list[Collection]:
    return [
        Collection.model_validate({**document, "id": document["_id"]})
        async for document in database.collections.find({"user_id": user_id}).sort("name", 1)
    ]


@router.post("", response_model=Collection, status_code=201)
async def create_collection(
    body: CollectionCreate,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> Collection:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Collection name cannot be empty.")
    collection = Collection(
        id=str(uuid4()), user_id=user_id, name=name, color=body.color
    )
    document = collection.model_dump(mode="json", by_alias=False)
    document["user_id"] = user_id
    document["_id"] = document.pop("id")
    try:
        await database.collections.insert_one(document)
    except DuplicateKeyError as error:
        raise HTTPException(
            status_code=409, detail="A collection with this name already exists."
        ) from error
    return collection


@router.patch("/{collection_id}", response_model=Collection)
async def update_collection(
    collection_id: str,
    body: CollectionUpdate,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> Collection:
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes:
        name = (changes["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Collection name cannot be empty.")
        changes["name"] = name
    if "color" in changes and changes["color"] is None:
        raise HTTPException(status_code=422, detail="Collection color cannot be empty.")
    if not changes:
        raise HTTPException(status_code=422, detail="Choose a collection name or color to update.")
    changes["updated_at"] = datetime.now(UTC)
    try:
        result = await database.collections.update_one(
            {"_id": collection_id, "user_id": user_id}, {"$set": changes}
        )
    except DuplicateKeyError as error:
        raise HTTPException(
            status_code=409, detail="A collection with this name already exists."
        ) from error
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Collection not found.")
    document = await database.collections.find_one(
        {"_id": collection_id, "user_id": user_id}
    )
    return Collection.model_validate({**document, "id": document["_id"]})


@router.delete("/{collection_id}", status_code=204)
async def delete_collection(
    collection_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> None:
    result = await database.collections.delete_one(
        {"_id": collection_id, "user_id": user_id}
    )
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Collection not found.")
    await database.pills.update_many(
        {"user_id": user_id, "collection_id": collection_id},
        {"$set": {"collection_id": None, "updated_at": datetime.now(UTC)}},
    )
