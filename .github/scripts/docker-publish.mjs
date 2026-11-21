import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const { MERGE_SHA: revision, RUNNER_TEMP: temporary } = process.env;
if (!/^[a-f0-9]{40}$/.test(revision ?? ""))
  throw new Error("A full merged commit SHA is required.");
if (!temporary) throw new Error("RUNNER_TEMP is required.");

const images = ["web", "api"];
const architectures = ["amd64", "arm64"];
const directory = join(temporary, "docker-digests");
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const imageName = (image) => `docker.io/pradeept17/noteesta-${image}`;
const commitTag = (image) => `${imageName(image)}:sha-${revision}`;

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  return result;
}

function command(commandName, args) {
  const result = run(commandName, args);
  if (result.status !== 0)
    throw new Error(`${commandName} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function inspect(reference, optional = false) {
  const result = run("docker", [
    "buildx",
    "imagetools",
    "inspect",
    reference,
    "--format",
    "{{json .Manifest}}",
  ]);
  if (result.status !== 0) {
    // Authentication, rate limiting, and network failures must fail the job.
    if (
      optional &&
      /manifest unknown|manifest_unknown|not found/i.test(result.stderr)
    )
      return null;
    throw new Error(`Cannot inspect ${reference}: ${result.stderr}`);
  }
  const manifest = JSON.parse(result.stdout);
  if (!digestPattern.test(manifest.digest ?? ""))
    throw new Error(`Invalid digest: ${reference}`);
  return manifest;
}

function requirePlatforms(manifest) {
  for (const architecture of architectures) {
    if (
      !manifest.manifests?.some(
        ({ platform }) =>
          platform?.os === "linux" && platform.architecture === architecture,
      )
    ) {
      throw new Error(`Published manifest is missing linux/${architecture}.`);
    }
  }
}

function matrixEntry() {
  const { IMAGE: image, ARCH: architecture } = process.env;
  if (!images.includes(image) || !architectures.includes(architecture)) {
    throw new Error("Unknown image or architecture.");
  }
  return { image, architecture };
}

function output(name, value) {
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.");
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function publish() {
  // Require every matrix result before creating either public commit tag.
  const records = images.map((image) => ({
    image,
    digests: architectures.map((architecture) => {
      const entry = JSON.parse(
        readFileSync(join(directory, `${image}-${architecture}.json`), "utf8"),
      );
      if (
        entry.image !== image ||
        entry.architecture !== architecture ||
        entry.revision !== revision ||
        entry.repository !== imageName(image) ||
        !digestPattern.test(entry.digest ?? "")
      ) {
        throw new Error(
          `Invalid digest metadata for ${image}/${architecture}.`,
        );
      }
      return entry.digest;
    }),
  }));
  const published = records.map(({ image, digests }) => {
    let manifest = inspect(commitTag(image), true);
    if (!manifest) {
      command("docker", [
        "buildx",
        "imagetools",
        "create",
        "--annotation",
        `index:org.opencontainers.image.revision=${revision}`,
        "--annotation",
        `index:org.opencontainers.image.source=${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`,
        "--tag",
        commitTag(image),
        ...[...new Set(digests)].map(
          (digest) => `${imageName(image)}@${digest}`,
        ),
      ]);
      manifest = inspect(commitTag(image));
    }
    requirePlatforms(manifest);
    return { image, digest: manifest.digest };
  });

  // This job is serialized across merges. Old reruns may publish SHA tags,
  // but may never roll latest back after a newer merge has reached main.
  const currentMain = command("git", [
    "ls-remote",
    "origin",
    "refs/heads/main",
  ]).split(/\s+/)[0];
  if (!/^[a-f0-9]{40}$/.test(currentMain))
    throw new Error("Could not resolve main before promotion.");
  const promote = currentMain === revision;
  const summary = [
    "## Docker images",
    "",
    "| Image | Digest |",
    "| --- | --- |",
  ];
  for (const { image, digest } of published) {
    // Record each SHA reference before attempting the mutable tag update.
    summary.push(`| \`${commitTag(image)}\` | \`${digest}\` |`);
  }
  summary.push(
    "",
    promote
      ? "Promoting both images to `latest`."
      : "`latest` unchanged: main has advanced.",
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join("\n") + "\n");
  if (promote) {
    for (const { image, digest } of published) {
      command("docker", [
        "buildx",
        "imagetools",
        "create",
        "--tag",
        `${imageName(image)}:latest`,
        `${imageName(image)}@${digest}`,
      ]);
      if (inspect(`${imageName(image)}:latest`).digest !== digest) {
        throw new Error(
          `latest does not match the commit manifest for ${image}.`,
        );
      }
    }
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        "\nBoth `latest` tags published successfully.\n",
      );
  }
}

switch (process.argv[2]) {
  case "inspect": {
    const { image } = matrixEntry();
    const manifest = inspect(commitTag(image), true);
    if (manifest) {
      requirePlatforms(manifest);
      output("digest", manifest.digest);
    }
    output("exists", Boolean(manifest));
    break;
  }
  case "record": {
    const { image, architecture } = matrixEntry();
    const digest = process.env.IMAGE_DIGEST;
    if (!digestPattern.test(digest ?? ""))
      throw new Error("The build did not return an image digest.");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, `${image}-${architecture}.json`),
      JSON.stringify({
        image,
        architecture,
        revision,
        repository: imageName(image),
        digest,
      }) + "\n",
    );
    break;
  }
  case "publish":
    publish();
    break;
  default:
    throw new Error("Expected inspect, record, or publish.");
}
