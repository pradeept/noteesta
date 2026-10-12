"""Assertions for optional learning-material generation."""

import json
from typing import Any


def get_assert(output: str, context: dict[str, Any]) -> dict[str, Any]:
    """Confirm requested materials are answerable and supported by evidence."""

    try:
        value = json.loads(output)
        variables = context.get("vars", {})
        target = int(variables.get("mcq_target", 2))
        notes = json.loads(variables.get("grounded_notes", "{}"))
        section_ids = {section["id"] for section in notes.get("sections", [])}
        flashcards = value.get("flashcards", [])
        mcqs = value.get("mcqs", [])
        true_false = value.get("trueFalse", [])
        roadmap = value.get("roadmap", [])

        def has_evidence(item: dict[str, Any]) -> bool:
            evidence = item.get("evidence", [])
            return bool(evidence) and all(entry.get("sourceId") == "lecture" for entry in evidence)

        valid_mcqs = all(
            isinstance(item.get("choices"), list)
            and 3 <= len(item["choices"]) <= 4
            and len(set(item["choices"])) == len(item["choices"])
            and isinstance(item.get("correctIndex"), int)
            and 0 <= item["correctIndex"] < len(item["choices"])
            and isinstance(item.get("explanation"), str)
            and has_evidence(item)
            for item in mcqs
        )
        passed = (
            bool(flashcards)
            and len(mcqs) >= target
            and len({item.get("question", "").strip().casefold() for item in mcqs}) == len(mcqs)
            and bool(true_false)
            and bool(roadmap)
            and all(has_evidence(item) for item in flashcards)
            and all(has_evidence(item) for item in true_false)
            and valid_mcqs
            and all(item.get("sectionId") in section_ids for item in roadmap)
        )
        return _result(passed, "Every requested material is valid and grounded.")
    except (json.JSONDecodeError, TypeError, KeyError) as error:
        return _result(False, f"Invalid JSON: {error}")


def _result(passed: bool, success_reason: str) -> dict[str, Any]:
    return {
        "pass": passed,
        "score": 1 if passed else 0,
        "reason": (
            success_reason
            if passed
            else "A requested material is missing, ambiguous, or ungrounded."
        ),
    }
