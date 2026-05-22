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

if [ ! -f "$CONFIG" ]; then
  echo "error: missing $CONFIG" >&2
  exit 2
fi

APP_NAMES=()
APP_PORTS=()
APP_CMDS=()
APP_HOSTS=()
# shellcheck source=/dev/null
source "$CONFIG"

if [ "${#APP_NAMES[@]}" -eq 0 ]; then
  echo "error: APP_NAMES is empty in $CONFIG" >&2
  exit 2
fi
if [ "${#APP_PORTS[@]}" -ne "${#APP_NAMES[@]}" ] || [ "${#APP_CMDS[@]}" -ne "${#APP_NAMES[@]}" ]; then
  echo "error: APP_NAMES, APP_PORTS, APP_CMDS must have equal length" >&2
  exit 2
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

host_of() {
  local i="$1"
  if [ "${#APP_HOSTS[@]}" -gt "$i" ] && [ -n "${APP_HOSTS[$i]:-}" ]; then
    echo "${APP_HOSTS[$i]}"
  else
    echo "localhost"
  fi
}

url_of() {
  local i="$1" port="${APP_PORTS[$i]}"
  if [ -z "$port" ] || [ "$port" = "-" ]; then
    echo "—"
  else
    echo "http://$(host_of "$i"):${port}/"
  fi
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
  local runfile="$STATE/$name.run.sh"

  if [ -f "$pidfile" ]; then
    local oldpid
    oldpid="$(cat "$pidfile" 2>/dev/null || true)"
    if [ -n "$oldpid" ] && is_alive "$oldpid"; then
      printf "  %-12s already running (pid %s) -> %s\n" "$name" "$oldpid" "$(url_of "$i")"
      return 0
    fi
    rm -f "$pidfile"
  fi

  : > "$logfile"

  {
    printf '#!/usr/bin/env bash\n'
    printf 'set -euo pipefail\n'
    printf 'cd %q\n' "$ROOT"
    printf 'echo "$$" > %q\n' "$pidfile"
    printf 'exec > %q 2>&1\n' "$logfile"
    if [ -n "$port" ] && [ "$port" != "-" ]; then
      printf 'export PORT=%q\n' "$port"
    fi
    # Keep stdin open for dev servers such as Vite, which stop on stdin EOF.
    printf 'tail -f /dev/null | %s\n' "$cmd"
  } > "$runfile"
  chmod +x "$runfile"

  rm -f "$pidfile"
  if command -v screen >/dev/null 2>&1; then
    screen -dmS "musiccloud-$name" "$runfile"
  else
    nohup "$runfile" >/dev/null 2>&1 &
  fi

  local pid="" n=0
  while [ ! -s "$pidfile" ] && [ "$n" -lt 20 ]; do
    sleep 0.1
    n=$((n + 1))
  done
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  sleep 0.4
  if [ -z "$pid" ] || ! is_alive "$pid"; then
    printf "  %-12s FAILED to start - see %s\n" "$name" "$logfile"
    rm -f "$pidfile"
    return 1
  fi
  printf "  %-12s started (pid %s) -> %s\n" "$name" "$pid" "$(url_of "$i")"
}

stop_one() {
  local i="$1" name="${APP_NAMES[$i]}"
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
  local i
  for i in $(resolve_targets "$@"); do start_one "$i" || true; done
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
  local i
  for i in "${!APP_NAMES[@]}"; do
    local name="${APP_NAMES[$i]}" port="${APP_PORTS[$i]}"
    local pidfile="$PID_DIR/$name.pid" pid="-" state="stopped"
    if [ -f "$pidfile" ]; then
      pid="$(cat "$pidfile" 2>/dev/null || true)"
      if [ -n "$pid" ] && is_alive "$pid"; then
        state="running"
      else
        pid="-"
        state="stopped"
      fi
    fi
    if [ -z "$port" ] || [ "$port" = "-" ]; then port="-"; fi
    printf "  %-12s %-6s %-7s %-8s %s\n" "$name" "$port" "$pid" "$state" "$(url_of "$i")"
  done
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
  status              list apps with PID, state, and URLs
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
