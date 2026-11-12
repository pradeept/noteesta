from evals.compare import build_matrix
from evals.provider import call_api


def test_comparison_matrix_preserves_assertions_and_includes_local_baseline():
    for job in ("sections", "notes", "materials", "visuals", "chat"):
        matrix = build_matrix(job, ["openai:gpt-6-astra", "anthropic:claude-opus-5-5"])
        assert matrix["providers"][0]["config"]["provider"] == "ollama"
        assert len(matrix["providers"]) == 3
        assert all(provider["config"]["job"] == job for provider in matrix["providers"])
        assert all(prompt.startswith("file:///") for prompt in matrix["prompts"])
        assert all(test.get("assert") for test in matrix["tests"])
        assert "api_key" not in str(matrix).lower()


def test_missing_evaluation_key_returns_error_instead_of_fallback(monkeypatch):
    monkeypatch.delenv("EVAL_OPENAI_API_KEY", raising=False)
    result = call_api(
        "synthetic fixture",
        {"config": {"provider": "openai", "model": "gpt-6-astra", "job": "notes"}},
        {},
    )
    assert "error" in result and "EVAL_OPENAI_API_KEY" in result["error"]
    assert "output" not in result
