import json

from pymongo.asynchronous.database import AsyncDatabase

from src.generation import generation_client
from src.llm import CHAT_SCHEMA
from src.prompts import render_prompt
from src.common.schemas.schemas import ChatAnswer, Citation
from src.models.schemas import GenerationSelection
from src.services.rag import StudyPillRetriever


async def answer_question(
    database: AsyncDatabase,
    *,
    pill_id: str,
    user_id: str,
    question: str,
    generation: GenerationSelection,
) -> ChatAnswer:
    """Answer a question only from the nearest chunks in the requested Study Pill."""

    client = generation_client(generation)
    ranked = await StudyPillRetriever(database).retrieve(
        pill_id=pill_id, user_id=user_id, question=question
    )
    context = [
        {
            "sourceId": item.metadata["source_id"],
            "sourceName": item.metadata["source_name"],
            "locator": item.metadata["locator"],
            "text": item.page_content,
        }
        for item in ranked
    ]
    if not context:
        return ChatAnswer(
            answer="This Study Pill does not contain enough processed evidence to answer that yet.",
            citations=[],
            grounded=False,
        )

    result = await client.generate_json(
        render_prompt(
            "grounded-chat",
            question=question,
            retrieved_context=json.dumps(context, ensure_ascii=False),
        ),
        CHAT_SCHEMA,
        num_predict=1600,
    )
    allowed = {(item["sourceId"], item["locator"]): item for item in context}
    citations: list[Citation] = []
    for item in result.get("evidence", []):
        key = (str(item.get("sourceId", "")), str(item.get("locator", "")))
        source = allowed.get(key)
        if source:
            citations.append(
                Citation(
                    source_id=source["sourceId"],
                    source_name=source["sourceName"],
                    locator=source["locator"],
                    excerpt=str(item.get("excerpt") or source["text"][:280]),
                )
            )

    grounded = bool(result.get("grounded") and citations)
    if result.get("grounded") and not citations:
        return ChatAnswer(
            answer="This Study Pill does not contain enough verifiable evidence to answer that.",
            citations=[],
            grounded=False,
        )
    return ChatAnswer(answer=str(result["answer"]), citations=citations, grounded=grounded)
