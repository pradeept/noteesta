"""Assertions for grounded Study Pill chat."""

import json
import re
from typing import Any


def get_assert(output: str, context: dict[str, Any]) -> dict[str, Any]:
    """Confirm chat uses retrieved evidence or clearly abstains."""

    try:
        value = json.loads(output)
        expected = str(context["vars"]["expect_grounded"]).lower() == "true"
        evidence = value.get("evidence", [])
        passed = (
            value.get("grounded") is True
            and bool(evidence)
            and all(
                item.get("sourceId") == "lecture" and item.get("locator") == "08:42"
                for item in evidence
            )
            if expected
            else value.get("grounded") is False
            and not evidence
            and bool(
                re.search(
                    r"not contain|not enough|insufficient",
                    value.get("answer", ""),
                    re.I,
                )
            )
        )
        return _result(passed, "Grounding behavior matches available evidence.")
    except (json.JSONDecodeError, TypeError, KeyError) as error:
        return _result(False, f"Invalid JSON: {error}")


def _result(passed: bool, success_reason: str) -> dict[str, Any]:
    return {
        "pass": passed,
        "score": 1 if passed else 0,
        "reason": success_reason if passed else "The answer did not ground or abstain correctly.",
    }
