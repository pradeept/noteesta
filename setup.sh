#!/bin/sh
set -eu
set +x

usage() {
  printf '%s\n' 'Usage: sh setup.sh' \
    'Prepare Noteesta in the current directory for either Docker Compose setup.'
}

download_file() {
  if [ -f "$1" ]; then
    return
  fi

  printf 'Downloading %s\n' "$1"
  curl --fail --silent --show-error --location --retry 2 \
    --connect-timeout 10 --max-time 60 --output "$staging/$1" "$source_url/$1"
  if [ ! -s "$staging/$1" ]; then
    printf 'Download is empty: %s\n' "$1" >&2
    return 1
  fi
}

write_api_env() {
  jwt_secret=$(openssl rand -hex 32)
  s3_secret=$(openssl rand -hex 20)
  provider_key=$(openssl rand -base64 32)
  provider_key=$(printf '%s' "$provider_key" | tr '/+' '_-')

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      JWT_SECRET=*) line="JWT_SECRET=$jwt_secret" ;;
      S3_SECRET_ACCESS_KEY=*) line="S3_SECRET_ACCESS_KEY=$s3_secret" ;;
      PROVIDER_KEYS_ENCRYPTION_KEY=*) line="PROVIDER_KEYS_ENCRYPTION_KEY=$provider_key" ;;
    esac
    printf '%s\n' "$line"
  done < "$1"
}

prepare_env() (
  if [ -f "$1" ]; then
    return
  fi
  template="$1.example"
  if [ -f "$staging/$template" ]; then
    template="$staging/$template"
  fi

  umask 077
  if [ "$1" = apps/api/.env ]; then
    write_api_env "$template" > "$staging/$1"
  else
    cat "$template" > "$staging/$1"
  fi
)

install_file() {
  if [ -f "$1" ]; then
    printf 'Keeping %s\n' "$1"
  elif ln -n "$staging/$1" "$1" 2>/dev/null; then
    printf 'Created %s\n' "$1"
  elif [ -f "$1" ]; then
    printf 'Keeping %s\n' "$1"
  else
    printf 'Could not create %s\n' "$1" >&2
    return 1
  fi
}

main() {
  case "$#:${1:-}" in
    0:) ;;
    1:-h|1:--help) usage; return ;;
    *) usage >&2; return 2 ;;
  esac

  for dependency in curl openssl; do
    if ! command -v "$dependency" >/dev/null; then
      printf 'Install %s and rerun setup.\n' "$dependency" >&2
      return 1
    fi
  done

  source_url="https://raw.githubusercontent.com/pradeept/noteesta/${NOTEESTA_REF:-main}"
  set -- compose.yaml compose.ollama.yaml apps/web/.env.example apps/api/.env.example
  for file in "$@" apps/web/.env apps/api/.env; do
    if { [ -e "$file" ] || [ -L "$file" ]; } && [ ! -f "$file" ]; then
      printf 'Expected a regular file at %s\n' "$file" >&2
      return 1
    fi
  done

  staging=$(mktemp -d .noteesta-setup.XXXXXXXX)
  trap 'rm -rf "$staging"' 0
  trap 'exit 130' INT
  trap 'exit 143' TERM
  mkdir -p "$staging/apps/web" "$staging/apps/api"

  for file in "$@"; do
    download_file "$file"
  done
  prepare_env apps/web/.env
  prepare_env apps/api/.env

  mkdir -p apps/web apps/api
  for file in "$@" apps/web/.env apps/api/.env; do
    install_file "$file"
  done

  cat <<'EOF'

Set MONGODB_URI in apps/api/.env, then choose one of these setups.

With Ollama running on your host
  docker compose --env-file apps/web/.env --env-file apps/api/.env -f compose.yaml up -d --pull always

With Ollama running in Docker
  docker compose --env-file apps/web/.env --env-file apps/api/.env -f compose.ollama.yaml up -d --pull always

Ollama setup and model downloads are documented at https://github.com/pradeept/noteesta#docker
EOF
}

main "$@"
