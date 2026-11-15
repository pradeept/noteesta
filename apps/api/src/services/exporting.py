from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from src.common.schemas.schemas import VisualSpec
from src.pills.notes import document_markdown
from src.pills.schemas import StudyPill
from src.storage import ObjectStorage


async def build_export(pill: StudyPill, storage: ObjectStorage, notes: dict | None = None) -> bytes:
    """Bundle a Study Pill's Markdown and rendered assets into a portable ZIP file."""
    if not pill.artifact:
        raise ValueError("This Study Pill has no generated artifact")

    markdown = [f"# {pill.title}", ""]
    if pill.description:
        markdown.extend([pill.description, ""])
    if notes and notes["document"]:
        for block in notes["document"].get("content", []):
            markdown.extend([document_markdown(block), ""])
            for reference in block.get("attrs", {}).get("citationIds", []):
                citation = notes["references"][reference]
                markdown.append(f"- Source: {citation['sourceName']}, {citation['locator']}")
            markdown.append("")
    else:
        generated = (
            notes["generated"]
            if notes
            else {
                "summary": pill.artifact.summary,
                "sections": [
                    section.model_dump(by_alias=True) for section in pill.artifact.sections
                ],
            }
        )
        markdown.extend([generated["summary"], ""])
        for section in generated["sections"]:
            markdown.extend([f"## {section['title']}", "", section["markdown"], ""])
            citations = (
                [notes["references"][ref] for ref in section.get("citationIds", [])]
                if notes
                else section["citations"]
            )
            for citation in citations:
                markdown.append(f"- Source: {citation['sourceName']}, {citation['locator']}")
            markdown.append("")

    visuals = (
        [VisualSpec.model_validate(value) for value in notes["visuals"]]
        if notes
        else pill.artifact.visuals
    )
    if notes and notes["document"]:

        def visual_ids(node):
            result = {node["attrs"]["id"]} if node["type"] == "noteVisual" else set()
            for child in node.get("content", []):
                result.update(visual_ids(child))
            return result

        included = visual_ids(notes["document"])
        visuals = [visual for visual in visuals if visual.id in included]
    elif visuals:
        markdown.extend(["## Visuals", ""])
        for visual in visuals:
            markdown.extend(
                [
                    f"![{visual.description}](assets/{visual.id}.png)",
                    "",
                    visual.description,
                    "",
                ]
            )

    if pill.artifact.flashcards:
        markdown.extend(["## Flashcards", ""])
        for card in pill.artifact.flashcards:
            markdown.extend([f"**{card.front}**", "", card.back, ""])

    if pill.artifact.mcqs:
        markdown.extend(["## Multiple-choice questions", ""])
        for question in pill.artifact.mcqs:
            markdown.append(question.question)
            for index, choice in enumerate(question.choices):
                markdown.append(f"{chr(65 + index)}. {choice}")
            markdown.extend(
                [
                    "",
                    f"Answer: {chr(65 + question.correct_index)}. {question.explanation}",
                    "",
                ]
            )

    if pill.artifact.true_false:
        markdown.extend(["## True or false", ""])
        for question in pill.artifact.true_false:
            markdown.extend(
                [
                    question.statement,
                    "",
                    f"Answer: {'True' if question.answer else 'False'}. {question.explanation}",
                    "",
                ]
            )

    if pill.artifact.roadmap:
        markdown.extend(["## Study roadmap", ""])
        for index, item in enumerate(pill.artifact.roadmap):
            markdown.append(f"{index + 1}. **{item.title}**: {item.description}")
        markdown.append("")

    markdown.extend(["## Source references", ""])
    for index, source in enumerate(pill.sources):
        markdown.append(f"{index + 1}. {source.name} ({source.detail})")

    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr("notes.md", "\n".join(markdown).encode("utf-8"))
        for visual in visuals:
            if visual.asset_key:
                archive.writestr(
                    f"assets/{visual.id}.png",
                    await storage.get_bytes(visual.asset_key),
                )
    return buffer.getvalue()
