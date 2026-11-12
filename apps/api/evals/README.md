# Comparing generation presets

The five Promptfoo suites use the application's structured generation adapters and
JSON schemas. They cover section extraction, note coverage, practice materials,
visual structure and grounded chat (including abstention). Promptfoo records
per-case results, latency and schema failures. These small fixtures are regression
checks, not a comprehensive model ranking.

A preset's `flagship`, `balanced` or `fast` tier describes the provider's published
positioning. It is not a claim that Noteesta evaluated it or proved it superior.
The Settings connection test checks access and one tiny JSON response only.

## Live comparison

Provide dedicated `EVAL_*` credentials from `apps/api/.env.example` in your local
backend environment. The harness never reads stored account keys, and never falls
back to Ollama when a hosted credential is missing. It does not expose keys in a
generated config. Running the comparison makes billable calls to selected providers.

From `apps/api`, prepare a matrix (this step does not call a provider):

```bash
uv run python -m evals.compare --job notes \
  --model openai:gpt-6-astra \
  --model anthropic:claude-opus-5-5 \
  --output /private/tmp/noteesta-notes-matrix.json
```

The configured Ollama model is always included as the baseline. Repeat `--model`
for other registered presets; use `--job sections`, `materials`, `visuals` or
`chat` for another suite. All preset IDs live in `src/generation.py`.

Run the matrix from the repository root:

```bash
PROMPTFOO_PYTHON=apps/api/.venv/bin/python \
  pnpm dlx promptfoo@0.123.1 eval \
  -c /private/tmp/noteesta-notes-matrix.json \
  --env-file apps/api/.env --no-cache -j 1 \
  -o /private/tmp/noteesta-notes-results.json
```

For each comparison, record date, provider/model ID, job, fixture count, schema
pass rate, evidence/coverage assertion results and latency from the exported
report. Repeat runs to account for model variance. Describe a model as better on
Noteesta only when it improves evidence/coverage without reducing schema validity;
report the observed tradeoffs and fixture limitations. Do not infer a quality win
from a successful API connection or a newer model name.

No live frontier comparison results are bundled with this change. Automated
transport tests use mocked responses and are listed separately in `tests/`.

Official preset and protocol references, checked November 12, 2026:

- [OpenAI models](https://developers.openai.com/api/docs/models)
- [Anthropic models](https://platform.claude.com/docs/en/models/overview)
- [Gemini models](https://aistudio.google.com/docs/models)
- [Gemini structured output](https://aistudio.google.com/docs/structured-output)
- [Hugging Face model/provider capabilities](https://huggingface.co/inference/models)
- [DeepSeek Responses API](https://api-docs.deepseek.com/api/create-response/)
- [Z.ai GLM-5.3](https://docs.z.ai/guides/llm/glm-5.3)
