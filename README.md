<div align="center">
  <img src="apps/web/src/app/icon.svg" alt="Noteesta logo" width="64" height="64" />
  <h1>Noteesta</h1>
  <p><strong>Make sense of what you study.</strong></p>
  <p>An open-source alternative to Turbo AI and Google NotebookLM.<br />Self-host your study workspace with local Ollama or bring your own API keys.</p>
  <p>
    <a href="https://noteesta.com">Website</a> ·
    <a href="#docker">Docker Compose</a> ·
    <a href="#local-setup">Local development</a> ·
    <a href="#documentation">Documentation</a> ·
    <a href="apps/site/content/changelog.md">Changelog</a> ·
    <a href="https://github.com/pradeept/noteesta/issues">Issues</a>
  </p>
</div>

[![Watch the Noteesta intro on YouTube](apps/site/public/media/noteesta-intro-thumbnail.jpg)](https://youtu.be/35rLahgiU4o)

<div align="center">
Click the thumbnail above 👆 to watch the Noteesta intro ✨
</div>

## What is Noteesta?

A lesson can be spread across a recording, slides, handwritten notes, and a YouTube video. Noteesta brings those sources into a **Study Pill**: a structured explanation you can read, check against its sources, edit, and revisit when studying.

You can self-host the workspace for your own use (without auth) or for your study group! The self-hosting setup is simple and straightforward for more information check [self-hosting](docs/self-hosting.md).

## Features

| Feature                   | What you can do                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Source-linked notes**   | Combine documents, images, audio, video files, YouTube videos, and public website pages into notes with references and passages. |
| **Practice**              | Choose flashcards, multiple-choice and true-or-false questions, and a study roadmap.                                             |
| **Visual learning**       | Explore flow visuals and optional interactive 3D concept models.                                                                 |
| **Local models and BYOK** | Generate with Ollama or personal keys for OpenAI, Anthropic, Gemini, Hugging Face, DeepSeek, and Z.ai.                           |
| **Private workspaces**    | Sign in with email/password or Google; keep each account’s Pills, collections, and sources separate.                             |
| **In-place editing**      | Format and highlight notes, save automatically, and preview or restore earlier versions.                                         |
| **Chat and export**       | Ask questions within a Pill’s sources and download Markdown notes with PNG visuals.                                              |

## Getting started

Choose [Docker Compose](#docker) to run the application in containers, or [local development](#local-setup) to work on the frontend and backend or workers.

## Self-hosting prerequisites

- **Docker with Compose** for the full stack or just Redis and object storage. The setup script uses **`sh`**, **curl**, and **OpenSSL**.
- **MongoDB Atlas** with a database user and network access configured for your API and worker. Create the [Atlas Vector Search index](docs/self-hosting.md#atlas-vector-search) on a database `ABC`(replace with your db name) which shall have a collection named `chunks` and wait for it to be ready. Once the creation is successful, make not of 3 things (the URI, DB name and Vector index name)
- **Ollama** for embeddings with every generation provider. Use a [host installation](https://ollama.com/download) or run Ollama with Noteesta in [Docker](#docker).

## Docker

- Create a new directory `mkdir noteesta`
- Change directory to newly created **noteesta** `cd noteesta`
- Execute the following command

```bash
curl -fsSLo setup.sh https://raw.githubusercontent.com/pradeept/noteesta/main/setup.sh && sh setup.sh
```

The script downloads both Compose files and both `.env.example` files, creates the `.env` files, and generates secrets in `apps/api/.env`. It prints the commands for both Ollama setups so you can choose which one to start. Rerunning setup preserves existing files and secrets.

Set `MONGODB_URI` in `apps/api/.env` to your Atlas connection string. URL-encode any special characters in its username or password. Set `OLLAMA_MODEL` to the exact tag you pull for local generation. For hosted generation, add a provider key in Settings and pull only the embedding model. Then follow the instructions for your Ollama setup below.

### Use Ollama running on your host (option 1)

Start Ollama on your host and pull the models there. This setup uses `compose.yaml`.

```bash
ollama pull nomic-embed-text
ollama pull qwen3-vl:8b-instruct # For local generation
```

Then start Noteesta ✅.

```bash
docker compose --env-file apps/web/.env --env-file apps/api/.env -f compose.yaml up -d --pull always
```

### Run Ollama with Noteesta in Docker (Option 2)

Follow the steps below to download the required models and start the full Noteesta stack with Ollama.

#### Step 1: Start the Ollama container

Start the Ollama service first so you can download the required models.

```bash
docker compose --env-file apps/web/.env --env-file apps/api/.env \
  -f compose.ollama.yaml up -d ollama
```

#### Step 2: Download the required embedding model

On your first run, download the `nomic-embed-text` model. The model will be stored in the Docker volume and will persist across container restarts.

```bash
docker compose --env-file apps/web/.env --env-file apps/api/.env \
  -f compose.ollama.yaml exec ollama ollama pull nomic-embed-text
```

#### Step 3: (Optional) Download a local generation model

If you want to use Ollama for local AI generation, download a model of your choice.

For example:

```bash
docker compose --env-file apps/web/.env --env-file apps/api/.env \
  -f compose.ollama.yaml exec ollama ollama pull qwen3-vl:8b-instruct
```

You can explore other supported models in the [Ollama model library](https://ollama.com/search).

**Note:** If you prefer using an external model provider, you can configure your provider API key later in Noteesta Settings.

#### Step 4: Start the full Noteesta stack ✅

Once the required models have been downloaded, start the full Noteesta stack along with the Ollama container.

```bash
docker compose --env-file apps/web/.env --env-file apps/api/.env \
  -f compose.ollama.yaml up -d --pull always
```

**You're all set!** Noteesta is now running with Ollama, and your downloaded models are persisted in the Docker volume for future use.

### Open Noteesta

Open **[localhost:3000](http://localhost:3000)**. Your local workspace opens immediately; account setup is optional.

### Misc (Manage docker compose deployement)

Run these commands from the directory containing your Compose file.

```bash
# Check services and follow application logs
docker compose --env-file apps/web/.env --env-file apps/api/.env ps
docker compose --env-file apps/web/.env --env-file apps/api/.env logs -f api worker

# Validate configuration without starting services
docker compose --env-file apps/web/.env --env-file apps/api/.env config --quiet

# Pull updates and recreate services whose image changed
docker compose --env-file apps/web/.env --env-file apps/api/.env up -d --pull always

# Stop the stack, keeping the object-storage volume
docker compose --env-file apps/web/.env --env-file apps/api/.env down
```

Compose configures container-to-container Redis and storage URLs automatically. **Do not change those to `localhost`. The first image pull and first document/transcription job can take longer while images and model weights download.**

This is a local self-hosting configuration. For a public deployment, follow the [deployment settings](docs/self-hosting.md#public-deployments).


## Models and BYOK

Open **Settings** from your account menu to add a personal API key and select a default generation model. Noteesta supports **OpenAI, Anthropic, Google Gemini, Hugging Face Inference Providers, DeepSeek, and Z.ai**, alongside **Ollama**.

The model menu overrides your default for a new Pill. Each Pill retains its chosen model for retries and chat. Personal keys are encrypted in MongoDB and are never returned in full. Source text goes to the selected generation provider; provider usage is billed to your account.

Missing personal keys fall back to the configured Ollama generation model. Invalid keys, quota errors, provider outages, and unreadable stored credentials return errors instead of silently switching providers. Keep Ollama’s embedding model available with every provider. See [provider configuration](docs/self-hosting.md#provider-keys-and-model-selection) for details.


## Local Development Setup

Check [CONTRIBUTING.MD](CONTRIBUTING.md)

## Troubleshooting

| Symptom                     | What to check                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace is unavailable    | Check API connectivity and `/api/v1/config`; the product workspace is always enabled.                                                                          |
| MongoDB fails in Docker     | Container `localhost` is not your host. Use a reachable Atlas connection string and allow the API/worker’s outbound address in Atlas.                          |
| Models unavailable          | Expand **Unavailable models** below the picker and check the model tags in the Ollama instance used by your [setup](docs/self-hosting.md#ollama-connectivity). |
| Noteesta can’t reach Ollama | [Debug host Ollama on Linux](docs/self-hosting.md#debug-host-ollama-on-linux).                                                                                 |
| Pill stays queued           | Confirm the Celery worker is running and can reach Redis, MongoDB, storage, and Ollama.                                                                        |
| No verification email       | The default `local` adapter writes JSON previews. Check the host folder or API container described [above](#create-an-account).                                |
| Chat cannot find sources    | Check the Atlas vector index name, readiness, 768 dimensions, and both filter fields.                                                                          |
| BYOK is unavailable         | Set the same persistent encryption key for API and worker, restart them, and add your personal key in Settings.                                                |

For project questions, [open an issue](https://github.com/pradeept/noteesta/issues) or email [contact@noteesta.com](mailto:contact@noteesta.com).

## License

[MIT](LICENSE). You can use, modify, publish, distribute, sublicense, and sell copies, including commercially. Keep the copyright and license notice with copies or substantial portions of the software.

See [deployment modes](docs/deployment-modes.md) for local ownership, switching auth on, and deployment configuration.

## Contributors 

<a href="https://github.com/pradeept/noteesta/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=pradeept/noteesta" />
</a>