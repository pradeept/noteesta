"""Assertions for citation-bearing note synthesis."""

import json
from typing import Any


def get_assert(output: str, context: dict[str, Any]) -> dict[str, Any]:
    """Confirm synthesized notes cover both supplied analyses with evidence."""

    del context
    try:
        value = json.loads(output)
        sections = value.get("sections", [])
        allowed = {"lecture", "slides"}
        seen: set[str] = set()
        valid_sections = bool(sections) and len(sections) >= 2
        for section in sections:
            evidence = section.get("evidence", [])
            valid_sections = valid_sections and (
                isinstance(section.get("id"), str)
                and isinstance(section.get("markdown"), str)
                and len(section["markdown"]) > 20
                and bool(evidence)
            )
            for item in evidence:
                source_id = item.get("sourceId")
                seen.add(source_id)
                valid_sections = valid_sections and (
                    source_id in allowed
                    and isinstance(item.get("locator"), str)
                    and bool(item["locator"])
                )
        passed = (
            isinstance(value.get("summary"), str)
            and len(value["summary"]) > 20
            and valid_sections
            and seen == allowed
        )
        return _result(passed, "Notes cover both source analyses and attach valid evidence.")
    except (json.JSONDecodeError, TypeError, KeyError) as error:
        return _result(False, f"Invalid JSON: {error}")


def _result(passed: bool, success_reason: str) -> dict[str, Any]:
    return {
        "pass": passed,
        "score": 1 if passed else 0,
        "reason": success_reason if passed else "Coverage or evidence validation failed.",
    }
