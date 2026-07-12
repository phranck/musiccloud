#!/usr/bin/env bash

# Retries only the known transient Zerops CLI websocket-close failure. Build,
# packaging, and application failures remain terminal so CI still reports the
# real deploy error without hiding it behind repeated deploy attempts.
set -euo pipefail

service_id="${1:?Usage: zerops-deploy.sh <service-id>}"
max_attempts="${ZEROPS_DEPLOY_MAX_ATTEMPTS:-3}"
retry_delay_seconds="${ZEROPS_DEPLOY_RETRY_DELAY_SECONDS:-10}"

if ! [[ "$max_attempts" =~ ^[1-9][0-9]*$ ]]; then
  printf '%s\n' "ZEROPS_DEPLOY_MAX_ATTEMPTS must be a positive integer" >&2
  exit 2
fi

for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
  deploy_log=$(mktemp)

  if zcli push --serviceId "$service_id" 2>&1 | tee "$deploy_log"; then
    rm -f "$deploy_log"
    exit 0
  fi

  if ! grep -Fq "websocket: close sent" "$deploy_log"; then
    rm -f "$deploy_log"
    exit 1
  fi

  rm -f "$deploy_log"

  if ((attempt == max_attempts)); then
    printf '%s\n' "Zerops websocket transport failed after $max_attempts attempts" >&2
    exit 1
  fi

  printf '%s\n' "Zerops websocket transport closed; retrying deploy ($attempt/$max_attempts)" >&2
  sleep "$retry_delay_seconds"
done
