from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from noteesta_api.schemas import StudyPill
from noteesta_api.storage import ObjectStorage


async def build_export(pill: StudyPill, storage: ObjectStorage) -> bytes:
    """Bundle a Study Pill's Markdown and rendered assets into a portable ZIP file."""
    if not pill.artifact:
        raise ValueError("This Study Pill has no generated artifact")

    markdown = [f"# {pill.title}", ""]
    if pill.description:
        markdown.extend([pill.description, ""])
    markdown.extend([pill.artifact.summary, ""])
    for section in pill.artifact.sections:
        markdown.extend([f"## {section.title}", "", section.markdown, ""])
        for citation in section.citations:
            markdown.append(f"- Source: {citation.source_name}, {citation.locator}")
        markdown.append("")

    if pill.artifact.visuals:
        markdown.extend(["## Visuals", ""])
        for visual in pill.artifact.visuals:
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
        for visual in pill.artifact.visuals:
            if visual.asset_key:
                archive.writestr(
                    f"assets/{visual.id}.png",
                    await storage.get_bytes(visual.asset_key),
                )
    return buffer.getvalue()
