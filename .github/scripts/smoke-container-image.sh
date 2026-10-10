#!/usr/bin/env bash
set -euo pipefail

architecture="${1:?Usage: smoke-container-image.sh <amd64|arm64> <image-ref>}"
image_ref="${2:?Usage: smoke-container-image.sh <amd64|arm64> <image-ref>}"

case "$architecture" in
  amd64|arm64) platform="linux/$architecture" ;;
  *) echo "Unsupported architecture: $architecture" >&2; exit 2 ;;
esac

run_suffix="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-${architecture}"
container_name="topic-kanban-smoke-${run_suffix}"
volume_name="topic-kanban-smoke-data-${run_suffix}"
app_password='ci-smoke-password'
topic_title="CI container smoke ${run_suffix}"
wait_attempts=30
if [[ "$architecture" == 'arm64' ]]; then wait_attempts=60; fi

cleanup() {
  local exit_code=$?
  trap - EXIT
  if [[ "$exit_code" -ne 0 ]]; then docker logs "$container_name" || true; fi
  docker rm --force "$container_name" >/dev/null 2>&1 || true
  docker volume rm "$volume_name" >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap cleanup EXIT

docker volume create "$volume_name" >/dev/null
docker run --detach \
  --name "$container_name" \
  --platform "$platform" \
  --publish 127.0.0.1::3030 \
  --mount "type=volume,src=${volume_name},dst=/app/data" \
  --env "APP_PASSWORD=${app_password}" \
  --env DATA_DIR=/app/data \
  "$image_ref" >/dev/null

base_url=''

resolve_base_url() {
  local host_port
  host_port="$(docker port "$container_name" 3030/tcp | awk -F: 'NR == 1 { print $NF }')"
  if [[ -z "$host_port" ]]; then
    echo 'Docker did not publish the application port.' >&2
    return 1
  fi
  base_url="http://127.0.0.1:${host_port}"
  echo "Checking the container through published endpoint ${base_url}."
}

wait_for_health() {
  local attempt last_probe
  last_probe='no health response received'
  for ((attempt = 1; attempt <= wait_attempts; attempt += 1)); do
    if last_probe="$(curl --connect-timeout 2 --max-time 5 --fail --silent --show-error \
      --output /dev/null --write-out 'HTTP %{http_code}' "$base_url/api/health" 2>&1)"; then
      return 0
    fi
    sleep 2
  done
  echo "Container did not become healthy at $base_url. Last probe: $last_probe" >&2
  return 1
}

login() {
  local response payload
  payload="$(jq -cn --arg password "$app_password" '{password: $password}')"
  response="$(curl --connect-timeout 3 --max-time 15 --fail --silent --show-error \
    --header 'Content-Type: application/json' \
    --data "$payload" \
    "$base_url/api/auth/login")"
  jq -er '.token | strings | select(length > 0)' <<<"$response"
}

read_topic() {
  local token="$1"
  local response
  response="$(curl --connect-timeout 3 --max-time 15 --fail --silent --show-error \
    --header "Authorization: Bearer ${token}" \
    --get \
    --data-urlencode 'scope=all' \
    --data-urlencode 'page=1' \
    --data-urlencode 'page_size=20' \
    --data-urlencode "q=${topic_title}" \
    "$base_url/api/topics")"
  jq -e --arg title "$topic_title" \
    'any(.items[]?; .title == $title)' <<<"$response" >/dev/null
}

resolve_base_url
wait_for_health
token="$(login)"
topic_payload="$(jq -cn --arg title "$topic_title" '{title: $title}')"
created_topic="$(curl --connect-timeout 3 --max-time 15 --fail --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${token}" \
  --header 'Content-Type: application/json' \
  --data "$topic_payload" \
  "$base_url/api/topics")"
jq -e --arg title "$topic_title" '.title == $title and (.id | strings | length > 0)' \
  <<<"$created_topic" >/dev/null
read_topic "$token"

docker restart --time 10 "$container_name" >/dev/null
resolve_base_url
wait_for_health
token="$(login)"
read_topic "$token"
echo "Container smoke passed for $platform, including authenticated write/read and volume persistence after restart."
