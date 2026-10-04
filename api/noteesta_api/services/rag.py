"""LangChain-backed indexing and retrieval for Study Pill content."""

import asyncio
import logging
from functools import lru_cache

from langchain_core.documents import Document
from langchain_mongodb import MongoDBAtlasVectorSearch
from langchain_ollama import OllamaEmbeddings
from pymongo.asynchronous.database import AsyncDatabase

from noteesta_api.config import get_settings
from noteesta_api.llm import OllamaClient

logger = logging.getLogger(__name__)


@lru_cache
def _vector_store() -> MongoDBAtlasVectorSearch:
    """Create the LangChain Atlas store using the API's configured Mongo URI."""

    settings = get_settings()
    return MongoDBAtlasVectorSearch.from_connection_string(
        connection_string=settings.mongodb_uri,
        namespace=f"{settings.mongodb_database}.chunks",
        embedding=OllamaEmbeddings(
            model=settings.ollama_embedding_model,
            base_url=settings.ollama_base_url,
        ),
        index_name=settings.mongodb_vector_index,
    )


class StudyPillRetriever:
    """Index documents and retrieve only within a user's requested Study Pill."""

    def __init__(
        self, database: AsyncDatabase | None = None, client: OllamaClient | None = None
    ) -> None:
        # Kept as an optional constructor argument for the existing pipeline boundary.
        self.database = database
        self.client = client or OllamaClient()
        self.vector_store = _vector_store()

    async def index(
        self,
        *,
        pill_id: str,
        user_id: str,
        documents: list[Document],
    ) -> None:
        """Replace the searchable documents for one Study Pill."""

        collection = self.vector_store.collection
        await asyncio.to_thread(
            collection.delete_many,
            {"pill_id": pill_id, "user_id": user_id},
        )
        if not documents:
            return

        indexed_documents = [
            Document(
                page_content=document.page_content,
                metadata={
                    **document.metadata,
                    "pill_id": pill_id,
                    "user_id": user_id,
                },
            )
            for document in documents
        ]
        await self.vector_store.aadd_documents(indexed_documents)

    async def retrieve(
        self,
        *,
        pill_id: str,
        user_id: str,
        question: str,
        limit: int = 6,
    ) -> list[Document]:
        """Run Atlas Vector Search with user and Study Pill prefilters."""

        filters = {"pill_id": {"$eq": pill_id}, "user_id": {"$eq": user_id}}
        documents = await self.vector_store.asimilarity_search(
            question,
            k=limit,
            pre_filter=filters,
        )
        if documents:
            logger.info(
                "Atlas retrieval returned %d chunk(s) for pill %s using index %s",
                len(documents),
                pill_id,
                get_settings().mongodb_vector_index,
            )
        else:
            scoped_count = await asyncio.to_thread(
                self.vector_store.collection.count_documents,
                {"pill_id": pill_id, "user_id": user_id},
            )
            logger.warning(
                "Atlas retrieval returned no chunks for pill %s using index %s; "
                "%d matching chunk document(s) exist. Check the Atlas index name, "
                "readiness, and indexed filter fields.",
                pill_id,
                get_settings().mongodb_vector_index,
                scoped_count,
            )
        return documents
