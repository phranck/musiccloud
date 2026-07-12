#!/usr/bin/env bash
# Project-local dev server runner.
# Reads ./app.config and manages dev servers per app.
# State (pid files + logs) lives under ./.app/.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$ROOT/app.config"
STATE="$ROOT/.app"
LOG_DIR="$STATE/log"
PID_DIR="$STATE/pid"
DETACHED_LAUNCHER="$ROOT/scripts/start-detached.mjs"

if [ ! -f "$CONFIG" ]; then
  echo "error: missing $CONFIG" >&2
  exit 2
fi

if [ ! -f "$DETACHED_LAUNCHER" ]; then
  echo "error: missing $DETACHED_LAUNCHER" >&2
  exit 2
fi

APP_NAMES=()
APP_PORTS=()
APP_CMDS=()
APP_HOSTS=()
APP_HEALTH_PATHS=()
# shellcheck source=/dev/null
source "$CONFIG"

# Readiness timing can be shortened by isolated tests, while normal local
# starts retain enough time for package startup and backend migrations.
APP_START_TIMEOUT_SECONDS="${APP_START_TIMEOUT_SECONDS:-60}"
APP_PROBE_INTERVAL_SECONDS="${APP_PROBE_INTERVAL_SECONDS:-0.25}"
APP_HEALTH_TIMEOUT_SECONDS="${APP_HEALTH_TIMEOUT_SECONDS:-2}"
APP_LOG_TAIL_LINES="${APP_LOG_TAIL_LINES:-20}"

if [ "${#APP_NAMES[@]}" -eq 0 ]; then
  echo "error: APP_NAMES is empty in $CONFIG" >&2
  exit 2
fi
if [ "${#APP_PORTS[@]}" -ne "${#APP_NAMES[@]}" ] ||
   [ "${#APP_CMDS[@]}" -ne "${#APP_NAMES[@]}" ] ||
   [ "${#APP_HEALTH_PATHS[@]}" -ne "${#APP_NAMES[@]}" ]; then
  echo "error: APP_NAMES, APP_PORTS, APP_CMDS, APP_HEALTH_PATHS must have equal length" >&2
  exit 2
fi

if ! [[ "$APP_START_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] ||
   ! [[ "$APP_LOG_TAIL_LINES" =~ ^[1-9][0-9]*$ ]] ||
   ! [[ "$APP_PROBE_INTERVAL_SECONDS" =~ ^[0-9]+([.][0-9]+)?$ ]] ||
   ! [[ "$APP_PROBE_INTERVAL_SECONDS" =~ [1-9] ]] ||
   ! [[ "$APP_HEALTH_TIMEOUT_SECONDS" =~ ^[0-9]+([.][0-9]+)?$ ]] ||
   ! [[ "$APP_HEALTH_TIMEOUT_SECONDS" =~ [1-9] ]]; then
  echo "error: invalid APP_* readiness timing configuration" >&2
  exit 2
fi

for i in "${!APP_NAMES[@]}"; do
  if [ "${APP_PORTS[$i]}" = "-" ] || [ -z "${APP_PORTS[$i]}" ]; then
    if [ "${APP_HEALTH_PATHS[$i]}" != "-" ]; then
      echo "error: ${APP_NAMES[$i]} has no port, so APP_HEALTH_PATHS[$i] must be '-'" >&2
      exit 2
    fi
  elif [[ "${APP_HEALTH_PATHS[$i]}" != /* ]]; then
    echo "error: ${APP_NAMES[$i]} requires an absolute APP_HEALTH_PATHS[$i]" >&2
    exit 2
  fi
done

has_port_app=false
for port in "${APP_PORTS[@]}"; do
  if [ -n "$port" ] && [ "$port" != "-" ]; then
    has_port_app=true
    break
  fi
done

if [ "$has_port_app" = true ]; then
  for tool in curl lsof ps node; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "error: required readiness tool '$tool' is unavailable" >&2
      exit 2
    fi
  done
fi

mkdir -p "$LOG_DIR" "$PID_DIR"
if [ ! -f "$STATE/.gitignore" ]; then
  printf '*\n!.gitignore\n' > "$STATE/.gitignore"
fi

idx_of() {
  local name="$1" i
  for i in "${!APP_NAMES[@]}"; do
    [ "${APP_NAMES[$i]}" = "$name" ] && { echo "$i"; return 0; }
  done
  return 1
}

is_alive() { kill -0 "$1" 2>/dev/null; }

# Returns success when candidate is the managed root PID or one of its
# descendants. This prevents an unrelated process on the expected port from
# making a dead dev server appear healthy.
is_in_process_tree() {
  local root_pid="$1" current_pid="$2" parent_pid depth=0

  while [[ "$current_pid" =~ ^[0-9]+$ ]] && [ "$current_pid" -gt 1 ] && [ "$depth" -lt 128 ]; do
    [ "$current_pid" = "$root_pid" ] && return 0
    parent_pid="$(ps -o ppid= -p "$current_pid" 2>/dev/null | tr -d '[:space:]')"
    [ -n "$parent_pid" ] || break
    current_pid="$parent_pid"
    depth=$((depth + 1))
  done

  return 1
}

# Requires at least one listener on the configured port to belong to the
# process tree recorded in the app's PID file.
has_owned_listener() {
  local root_pid="$1" port="$2" listener_pid

  while IFS= read -r listener_pid; do
    [ -n "$listener_pid" ] || continue
    is_in_process_tree "$root_pid" "$listener_pid" && return 0
  done < <(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)

  return 1
}

host_of() {
  local i="$1"
  if [ "${#APP_HOSTS[@]}" -gt "$i" ] && [ -n "${APP_HOSTS[$i]:-}" ]; then
    echo "${APP_HOSTS[$i]}"
  else
    echo "localhost"
  fi
}

url_of() {
  local i="$1"
  local port="${APP_PORTS[$i]}"
  if [ -z "$port" ] || [ "$port" = "-" ]; then
    echo "—"
  else
    echo "http://$(host_of "$i"):${port}/"
  fi
}

health_url_of() {
  local i="$1"
  echo "http://$(host_of "$i"):${APP_PORTS[$i]}${APP_HEALTH_PATHS[$i]}"
}

# Sets READINESS_REASON and succeeds only at the runtime boundary users depend
# on: live managed root, owned listener, and successful HTTP response.
check_readiness() {
  local i="$1" pid="$2"
  local port="${APP_PORTS[$i]}"

  if ! is_alive "$pid"; then
    READINESS_REASON="managed process exited"
    return 1
  fi
  if [ -z "$port" ] || [ "$port" = "-" ]; then
    READINESS_REASON="process is alive"
    return 0
  fi
  if ! has_owned_listener "$pid" "$port"; then
    READINESS_REASON="no managed listener on port $port"
    return 1
  fi
  if ! curl --fail --silent --show-error --max-time "$APP_HEALTH_TIMEOUT_SECONDS" "$(health_url_of "$i")" >/dev/null 2>&1; then
    READINESS_REASON="health probe failed: $(health_url_of "$i")"
    return 1
  fi

  READINESS_REASON="ready"
  return 0
}

wait_for_readiness() {
  local i="$1" pid="$2" deadline=$((SECONDS + APP_START_TIMEOUT_SECONDS))

  while [ "$SECONDS" -lt "$deadline" ]; do
    check_readiness "$i" "$pid" && return 0
    is_alive "$pid" || return 1
    sleep "$APP_PROBE_INTERVAL_SECONDS"
  done

  check_readiness "$i" "$pid"
}

kill_tree() {
  local pid="$1" sig="${2:-TERM}" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child" "$sig"
  done
  if is_alive "$pid"; then
    kill "-$sig" "$pid" 2>/dev/null || true
  fi
}

start_one() {
  local i="$1"
  local name="${APP_NAMES[$i]}" port="${APP_PORTS[$i]}" cmd="${APP_CMDS[$i]}"
  local pidfile="$PID_DIR/$name.pid"
  local logfile="$LOG_DIR/$name.log"

  if [ -f "$pidfile" ]; then
    local oldpid
    oldpid="$(cat "$pidfile" 2>/dev/null || true)"
    if [ -n "$oldpid" ] && is_alive "$oldpid"; then
      if check_readiness "$i" "$oldpid"; then
        printf "  %-12s already running (pid %s) -> %s\n" "$name" "$oldpid" "$(url_of "$i")"
        return 0
      fi
      printf "  %-12s UNHEALTHY (pid %s): %s\n" "$name" "$oldpid" "$READINESS_REASON" >&2
      return 1
    fi
    rm -f "$pidfile"
  fi

  : > "$logfile"

  # Record an independent command-root PID. Package managers and file watchers
  # may outlive their HTTP child, so PID liveness alone is never treated as
  # application readiness for port-bearing processes; wait_for_readiness
  # verifies the full process/listener/HTTP boundary below. The detached
  # launcher also prevents the caller's terminal or automation process from
  # terminating the managed tree when it exits.
  cd "$ROOT"
  local pid
  if ! pid="$(node "$DETACHED_LAUNCHER" "$ROOT" "$logfile" "${port:--}" "$cmd")"; then
    printf "  %-12s FAILED to launch detached process\n" "$name" >&2
    return 1
  fi
  if ! [[ "$pid" =~ ^[1-9][0-9]*$ ]] || ! is_alive "$pid"; then
    printf "  %-12s FAILED to return a live detached PID\n" "$name" >&2
    return 1
  fi
  echo "$pid" > "$pidfile"

  if ! wait_for_readiness "$i" "$pid"; then
    printf "  %-12s FAILED to become ready: %s\n" "$name" "$READINESS_REASON" >&2
    kill_tree "$pid" TERM
    rm -f "$pidfile"
    if [ -s "$logfile" ]; then
      echo "  recent log output:" >&2
      tail -n "$APP_LOG_TAIL_LINES" "$logfile" | sed 's/^/    /' >&2
    fi
    return 1
  fi
  printf "  %-12s ready (pid %s) -> %s\n" "$name" "$pid" "$(url_of "$i")"
}

stop_one() {
  local i="$1"
  local name="${APP_NAMES[$i]}"
  local pidfile="$PID_DIR/$name.pid"
  if [ ! -f "$pidfile" ]; then
    printf "  %-12s not running\n" "$name"
    return 0
  fi
  local pid
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  if [ -z "$pid" ] || ! is_alive "$pid"; then
    rm -f "$pidfile"
    printf "  %-12s not running (cleared stale pidfile)\n" "$name"
    return 0
  fi
  kill_tree "$pid" TERM
  local n=0
  while is_alive "$pid" && [ "$n" -lt 20 ]; do
    sleep 0.25
    n=$((n + 1))
  done
  if is_alive "$pid"; then
    kill_tree "$pid" KILL
    sleep 0.2
  fi
  rm -f "$pidfile"
  printf "  %-12s stopped\n" "$name"
}

resolve_targets() {
  if [ "$#" -eq 0 ]; then
    local i
    for i in "${!APP_NAMES[@]}"; do echo "$i"; done
    return
  fi
  local arg i
  for arg in "$@"; do
    if i="$(idx_of "$arg")"; then
      echo "$i"
    else
      echo "error: unknown app '$arg'" >&2
      exit 2
    fi
  done
}

cmd_start() {
  local i failed=0
  while IFS= read -r i; do
    start_one "$i" || failed=1
  done < <(resolve_targets "$@")
  return "$failed"
}

cmd_stop() {
  local i
  for i in $(resolve_targets "$@"); do stop_one "$i" || true; done
}

cmd_restart() {
  cmd_stop "$@"
  sleep 0.3
  cmd_start "$@"
}

cmd_status() {
  printf "  %-12s %-6s %-7s %-8s %s\n" "APP" "PORT" "PID" "STATE" "URL"
  printf "  %-12s %-6s %-7s %-8s %s\n" "---" "----" "---" "-----" "---"
  local i unhealthy=0
  for i in "${!APP_NAMES[@]}"; do
    local name="${APP_NAMES[$i]}" port="${APP_PORTS[$i]}"
    local pidfile="$PID_DIR/$name.pid" pid="-" state="stopped"
    if [ -f "$pidfile" ]; then
      pid="$(cat "$pidfile" 2>/dev/null || true)"
      if [ -n "$pid" ] && is_alive "$pid"; then
        if check_readiness "$i" "$pid"; then
          state="running"
        else
          state="unhealthy"
          unhealthy=1
        fi
      else
        pid="-"
        state="stopped"
      fi
    fi
    if [ -z "$port" ] || [ "$port" = "-" ]; then port="-"; fi
    printf "  %-12s %-6s %-7s %-8s %s\n" "$name" "$port" "$pid" "$state" "$(url_of "$i")"
  done
  return "$unhealthy"
}

cmd_logs() {
  local target="${1:-}"
  if [ -z "$target" ]; then
    ls -1 "$LOG_DIR" 2>/dev/null
    return
  fi
  local i
  if ! i="$(idx_of "$target")"; then
    echo "error: unknown app '$target'" >&2
    exit 2
  fi
  local logfile="$LOG_DIR/${APP_NAMES[$i]}.log"
  if [ ! -f "$logfile" ]; then
    echo "no log yet for ${APP_NAMES[$i]}" >&2
    exit 1
  fi
  exec tail -f "$logfile"
}

usage() {
  cat <<'EOF'
usage: ./app <command> [name...]

  start   [name...]   start all apps (or selected ones)
  stop    [name...]   stop all apps (or selected ones)
  restart [name...]   stop then start
  status              list apps; exits 1 when any live app is unhealthy
  logs    <name>      tail the log of a specific app
  help                show this help

Apps are defined in ./app.config (APP_NAMES, APP_PORTS, APP_CMDS).
EOF
}

cmd="${1:-}"
case "$cmd" in
  start)             shift; cmd_start "$@" ;;
  stop)              shift; cmd_stop "$@" ;;
  restart)           shift; cmd_restart "$@" ;;
  status)            cmd_status ;;
  logs)              shift; cmd_logs "$@" ;;
  ""|-h|--help|help) usage ;;
  *) echo "error: unknown command '$cmd'" >&2; usage; exit 2 ;;
esac
