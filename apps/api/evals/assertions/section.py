"""Assertions for source-section extraction."""

import json
from typing import Any


def get_assert(output: str, context: dict[str, Any]) -> dict[str, Any]:
    """Confirm claims preserve the supplied locator and omit invented facts."""

    del context
    try:
        value = json.loads(output)
        claims = value.get("claims", [])
        valid = (
            isinstance(value.get("title"), str)
            and isinstance(value.get("summary"), str)
            and isinstance(value.get("uncertainties"), list)
            and bool(claims)
            and all(
                claim.get("locator") == "08:42"
                and isinstance(claim.get("text"), str)
                and isinstance(claim.get("excerpt"), str)
                and bool(claim["excerpt"])
                for claim in claims
            )
            and "mitochond" not in output.lower()
        )
        return _result(valid, "Claims preserve the supplied locator and stay inside the source.")
    except (json.JSONDecodeError, TypeError, KeyError) as error:
        return _result(False, f"Invalid JSON: {error}")


def _result(passed: bool, success_reason: str) -> dict[str, Any]:
    return {
        "pass": passed,
        "score": 1 if passed else 0,
        "reason": success_reason if passed else "A claim is ungrounded or has an invalid locator.",
    }
