"""Assertions for controlled visual specifications."""

import json
from typing import Any


def get_assert(output: str, context: dict[str, Any]) -> dict[str, Any]:
    """Confirm visual data and evidence are supported by the supplied notes."""

    del context
    try:
        value = json.loads(output)
        evidence = value.get("evidence", [])
        evidence_valid = bool(evidence) and all(
            item.get("sourceId") == "survey" for item in evidence
        )
        data = value.get("data", [])
        quantities_valid = value.get("kind") != "bar" or (
            bool(data) and all(item.get("value") in {2, 4} for item in data)
        )
        structure_valid = (
            value.get("kind") in {"flow", "bar", "timeline"}
            and isinstance(value.get("description"), str)
            and len(value["description"]) > 10
        )
        return _result(
            evidence_valid and quantities_valid and structure_valid,
            "Visual is grounded and uses only supplied quantities.",
        )
    except (json.JSONDecodeError, TypeError, KeyError) as error:
        return _result(False, f"Invalid JSON: {error}")


def _result(passed: bool, success_reason: str) -> dict[str, Any]:
    return {
        "pass": passed,
        "score": 1 if passed else 0,
        "reason": success_reason if passed else "Visual structure or source fidelity failed.",
    }
