from copy import deepcopy
from types import SimpleNamespace

from pymongo.errors import DuplicateKeyError


class FakeTable:
    def __init__(self, documents=(), *, unique_fields=("email", "google_sub")):
        self.documents = {document["_id"]: deepcopy(document) for document in documents}
        self.unique_fields = unique_fields

    @staticmethod
    def matches(document, query):
        for key, value in query.items():
            actual = document.get(key)
            if isinstance(value, dict):
                if "$in" in value and actual not in value["$in"]:
                    return False
                if "$gt" in value and (actual is None or actual <= value["$gt"]):
                    return False
            elif actual != value:
                return False
        return True

    def find(self, query):
        documents = [doc for doc in self.documents.values() if self.matches(doc, query)]

        class Cursor:
            def sort(self, *_args):
                return self

            async def __aiter__(self):
                for document in documents:
                    yield deepcopy(document)

        return Cursor()

    async def find_one(self, query):
        async for document in self.find(query):
            return document
        return None

    async def insert_one(self, document):
        if document["_id"] in self.documents or any(
            document.get(key) is not None and existing.get(key) == document[key]
            for existing in self.documents.values()
            for key in self.unique_fields
        ):
            raise DuplicateKeyError("Duplicate key")
        self.documents[document["_id"]] = deepcopy(document)

    @staticmethod
    def apply(document, update):
        document.update(update.get("$set", {}))
        for key, value in update.get("$inc", {}).items():
            document[key] = document.get(key, 0) + value

    async def update_one(self, query, update):
        for document in self.documents.values():
            if self.matches(document, query):
                self.apply(document, update)
                return SimpleNamespace(matched_count=1)
        return SimpleNamespace(matched_count=0)

    async def update_many(self, query, update):
        for document in self.documents.values():
            if self.matches(document, query):
                self.apply(document, update)

    async def find_one_and_update(self, query, update):
        document = await self.find_one(query)
        if document is not None:
            await self.update_one(query, update)
        return document

    async def find_one_and_delete(self, query):
        document = await self.find_one(query)
        if document is not None:
            await self.delete_one(query)
        return document

    async def delete_one(self, query):
        document = await self.find_one(query)
        if document is None:
            return SimpleNamespace(deleted_count=0)
        del self.documents[document["_id"]]
        return SimpleNamespace(deleted_count=1)
