from functools import lru_cache
from pathlib import Path

PROMPT_ROOT = Path(__file__).resolve().parents[1] / "evals" / "prompts"


@lru_cache
def load_prompt(name: str) -> str:
    path = (PROMPT_ROOT / f"{name}.txt").resolve()
    if path.parent != PROMPT_ROOT.resolve():
        raise ValueError("Invalid prompt name")
    return path.read_text(encoding="utf-8")


def render_prompt(name: str, **variables: str) -> str:
    prompt = load_prompt(name)
    for key, value in variables.items():
        prompt = prompt.replace("{{" + key + "}}", value)
    return prompt
