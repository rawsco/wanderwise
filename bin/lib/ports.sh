#!/usr/bin/env bash
# bin/lib/ports.sh — free-port allocation helpers for per-worktree dev stacks.
#
# Sourced by bin/start-ticket and bin/finish-ticket. Not intended to be run
# directly.
#
# Reservations are persisted to $POLLER_STATE_DIR/port-reservations.txt so
# concurrent worktrees don't race for the same ports between start-ticket
# allocating and the worktree's docker stack actually binding them. Without
# the reservation, two start-tickets fired close together both saw the
# bases (3100/8100/9100) as free (nc -z = nothing bound) and handed out
# identical numbers — the second worktree's docker compose then failed to
# bind because the first had since claimed them.

set -euo pipefail

POLLER_STATE_DIR="${POLLER_STATE_DIR:-$HOME/.cache/wanderwise-poller}"
RESERVATION_FILE="$POLLER_STATE_DIR/port-reservations.txt"
RESERVATION_LOCK="$POLLER_STATE_DIR/port-reservations.lock"

mkdir -p "$POLLER_STATE_DIR"
touch "$RESERVATION_FILE"

# Print every port currently reserved by any worktree (one per line).
# Format of each line in the reservation file: KEY=p1,p2,p3,p4
_reserved_ports() {
  awk -F= 'NF==2 { gsub(",", "\n", $2); print $2 }' "$RESERVATION_FILE" 2>/dev/null
}

_is_reserved() {
  local port="$1"
  _reserved_ports | grep -qx "$port"
}

# find_free_port <base>
# Echoes the lowest port at or above <base> that is neither bound on the
# host nor reserved by another worktree in the reservation file.
find_free_port() {
  local port=$1
  while nc -z localhost "$port" 2>/dev/null || _is_reserved "$port"; do
    port=$((port + 1))
  done
  echo "$port"
}

# Atomic lock via mkdir — works on macOS + Linux without flock(1).
_acquire_reservation_lock() {
  local tries=50
  while ! mkdir "$RESERVATION_LOCK" 2>/dev/null; do
    tries=$((tries - 1))
    if [ "$tries" -le 0 ]; then
      echo "ports.sh: could not acquire $RESERVATION_LOCK after 5s" >&2
      return 1
    fi
    sleep 0.1
  done
}

_release_reservation_lock() {
  rmdir "$RESERVATION_LOCK" 2>/dev/null || true
}

# allocate_workspace_ports <TICKET-KEY>
# Atomically allocates four free ports (DDB, MinIO API, MinIO Console,
# Next.js) and records them under <TICKET-KEY> in the reservation file.
# Echoes four KEY=VALUE lines.
allocate_workspace_ports() {
  local key="${1:?allocate_workspace_ports: ticket key required}"
  _acquire_reservation_lock

  local ddb minio_api minio_console next
  ddb=$(find_free_port 8100)
  minio_api=$(find_free_port 9100)
  # Console must not collide with the API port we just picked.
  minio_console=$(find_free_port "$((minio_api + 1))")
  next=$(find_free_port 3100)

  # Replace any existing reservation for this key, then append fresh.
  local tmp
  tmp=$(mktemp "$POLLER_STATE_DIR/reservations.XXXXXX")
  grep -v "^$key=" "$RESERVATION_FILE" > "$tmp" 2>/dev/null || true
  printf '%s=%s,%s,%s,%s\n' "$key" "$ddb" "$minio_api" "$minio_console" "$next" >> "$tmp"
  mv "$tmp" "$RESERVATION_FILE"

  _release_reservation_lock

  cat <<EOF
DDB_PORT=$ddb
MINIO_API_PORT=$minio_api
MINIO_CONSOLE_PORT=$minio_console
NEXT_PORT=$next
EOF
}

# release_workspace_ports <TICKET-KEY>
# Removes the ports reservation for the given ticket. Idempotent — no error
# if the ticket has no reservation.
release_workspace_ports() {
  local key="${1:?release_workspace_ports: ticket key required}"
  _acquire_reservation_lock
  local tmp
  tmp=$(mktemp "$POLLER_STATE_DIR/reservations.XXXXXX")
  grep -v "^$key=" "$RESERVATION_FILE" > "$tmp" 2>/dev/null || true
  mv "$tmp" "$RESERVATION_FILE"
  _release_reservation_lock
}
