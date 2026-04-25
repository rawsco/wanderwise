#!/usr/bin/env bash
# bin/lib/ports.sh — free-port allocation helpers for per-worktree dev stacks.
#
# Sourced by bin/start-ticket. Not intended to be run directly.
set -euo pipefail

# find_free_port <base>
# Echoes the lowest free TCP port on localhost at or above <base>.
# Uses `nc -z` for portable detection across macOS and Linux.
find_free_port() {
  local port=$1
  while nc -z localhost "$port" 2>/dev/null; do
    port=$((port + 1))
  done
  echo "$port"
}

# allocate_workspace_ports
# Echoes four KEY=VALUE lines for the workspace's dynamic ports:
#   DDB_PORT, MINIO_API_PORT, MINIO_CONSOLE_PORT, NEXT_PORT
# Bases chosen well above the project's defaults (8000, 9002, 9003, 3000).
allocate_workspace_ports() {
  local ddb minio_api minio_console next
  ddb=$(find_free_port 8100)
  minio_api=$(find_free_port 9100)
  # Console must not collide with the API port we just chose.
  minio_console=$(find_free_port "$((minio_api + 1))")
  next=$(find_free_port 3100)
  cat <<EOF
DDB_PORT=$ddb
MINIO_API_PORT=$minio_api
MINIO_CONSOLE_PORT=$minio_console
NEXT_PORT=$next
EOF
}
