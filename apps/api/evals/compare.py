"""Generate a Promptfoo matrix comparing selected presets with the local baseline.

Does not invoke a model. Run Promptfoo explicitly against the generated config.
"""

import argparse
import json
from pathlib import Path

import yaml

from src.config import get_settings
from src.generation import valid_selection
from src.models.schemas import GenerationSelection

JOBS = ("sections", "notes", "materials", "visuals", "chat")


def build_matrix(job: str, choices: list[str]) -> dict:
    root = Path(__file__).resolve().parent
    config = yaml.safe_load((root / f"{job}.yaml").read_text())
    baseline = GenerationSelection(provider="ollama", model=get_settings().ollama_model)
    selections = [baseline]
    for choice in choices:
        provider, separator, model = choice.partition(":")
        if not separator:
            raise ValueError("Models must use provider:model syntax.")
        selected = GenerationSelection(provider=provider, model=model)
        if not valid_selection(selected):
            raise ValueError("Choose a registered model preset.")
        if selected not in selections:
            selections.append(selected)
    prototype = config["providers"][0]["config"]
    config["providers"] = [
        {
            "id": "file://" + str(root / "provider.py"),
            "label": f"{selected.provider}:{selected.model}",
            "config": {**prototype, **selected.model_dump(by_alias=False)},
        }
        for selected in selections
    ]
    config["prompts"] = [
        "file://" + str(root / "prompts" / Path(config["prompts"][0].removeprefix("file://")).name)
    ]
    for test in config["tests"]:
        for assertion in test.get("assert", []):
            if assertion.get("type") == "python" and assertion.get("value", "").startswith(
                "file://"
            ):
                assertion["value"] = "file://" + str(
                    root / assertion["value"].removeprefix("file://")
                )
    return config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job", choices=JOBS, required=True)
    parser.add_argument(
        "--model", action="append", required=True, help="provider:model (repeatable)"
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(build_matrix(args.job, args.model), indent=2) + "\n")


if __name__ == "__main__":
    main()
