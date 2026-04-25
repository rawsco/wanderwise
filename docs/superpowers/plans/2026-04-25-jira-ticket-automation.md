# Jira Ticket Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shell-driven workflow that fetches a Jira ticket, creates an isolated git-worktree workspace with its own Docker Compose dev stack, and an autonomous Claude Code session that plans and delivers the ticket — with refusal-back-to-Jira on ambiguity.

**Architecture:** A `bin/start-ticket` bash orchestrator wires together a Jira MCP one-shot fetch, a git worktree, dynamic-port allocation, a per-worktree compose override, and a brief file. Inside the worktree, the user starts Claude and types `/ticket-work` — the autonomous skill in `.claude/commands/ticket-work.md` runs brainstorming → planning → subagent-driven-development → PR. Three small bash libraries (`jira.sh`, `ports.sh`) keep the orchestrator tight.

**Tech Stack:** Bash, git worktrees, Docker Compose, GitHub CLI (`gh`), `jq`, the Atlassian Jira MCP server, the existing superpowers skills (brainstorming, writing-plans, subagent-driven-development).

**Spec:** `docs/superpowers/specs/2026-04-25-jira-ticket-automation-design.md`
**Branch:** `tooling/jira-ticket-automation` (already created and on HEAD).

---

## Project context for the implementer

**No test suite.** WanderWise has no `npm test` and no shell test framework installed. Validation for shell scripts is done by direct invocation against fixtures and asserting the visible side effects (file contents, exit codes, ports, git state). Where the plan calls for a "test", that means a shell smoke test you run by hand — not `bats`, not `pytest`.

**Bash safety.** Every shell script in this plan starts with:

```bash
#!/usr/bin/env bash
set -euo pipefail
```

This is non-negotiable: `set -e` exits on any failed command, `-u` errors on unset variables, `-o pipefail` makes piped failures propagate. Skipping these in a script that creates worktrees + Docker stacks risks orphan state.

**Portable ports check.** Use `nc -z localhost <port>` to test if a port is free — works on macOS and Linux without sudo. Avoid `lsof` (slow) and `ss` (Linux-only).

**Real Jira interaction during validation.** Tasks 3 and 4 require a real Atlassian credential and a real (or sandbox) ticket to validate against. The implementer will need access to:
- A Jira project with at least one open ticket they can read.
- An API token with read+write scopes on that project, created at https://id.atlassian.com/manage-profile/security/api-tokens **while logged in as the workspace user** (the token is bound to the account that creates it; using it with a different email will 401).
- A throwaway "test" ticket they can post comments to without disrupting work.

The env file at `~/.config/claude/atlassian.env` must contain:

```
ATLASSIAN_SITE_NAME=<workspace-subdomain>
ATLASSIAN_USER_EMAIL=<email>
ATLASSIAN_API_TOKEN=<token>
```

These are the names the MCP server expects. `ATLASSIAN_SITE_NAME` is the subdomain (e.g. `devotonomy`), not the full URL.

If the implementer doesn't have these, do not skip validation — report BLOCKED and let the controller provide credentials.

**Do not commit secrets.** `~/.config/claude/atlassian.env` lives in the user's home directory by design; never write credentials into the repo.

**Commit-trailer convention** (from CLAUDE.md): `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. Use HEREDOC for multi-line commit messages.

---

## File structure

| Path | New / Modify | Responsibility |
|---|---|---|
| `bin/lib/ports.sh` | New | Free-port allocator (`find_free_port`, `allocate_workspace_ports`). |
| `bin/lib/jira.sh` | New | Three Jira MCP wrappers: `fetch`, `comment`, `transition`. |
| `bin/start-ticket` | New | Main orchestrator. Validate env → fetch → worktree → ports → override → brief → print. |
| `bin/finish-ticket` | New | Cleanup: stop docker, remove worktree, delete branch. |
| `.claude/commands/ticket-work.md` | New | Autonomous skill: reads BRIEF.md, runs brainstorm → plan → execute → PR → Jira comment. |
| `.claude/settings.local.json` | New / Modify | Atlassian MCP server config + permissions allowlist. |
| `.gitignore` | Modify | Add `.env.compose` and `.docker/compose.override.yml`. |
| `docs/superpowers/specs/...` | Already committed | The design spec. |

**Note on `.gitignore`:** worktrees share the same `.gitignore` as the main repo (it lives in `.git/info/exclude` for repo-level state, but the file `.gitignore` is tracked and inherited). Adding the compose override + `.env.compose` to `.gitignore` once protects against accidental commits in any worktree.

---

## Task 1: Set up the Atlassian Jira MCP server

**Files:**
- Modify: `.claude/settings.local.json`

**Why first:** Every other piece of code depends on being able to talk to Jira. Get the MCP server working and end-to-end-tested before writing any wrapper scripts that depend on it.

This task is part code, part operator setup. The implementer needs to coordinate with the user for the credentials.

- [ ] **Step 1: Confirm or install the Atlassian MCP server.**

The recommended server is `@aashari/mcp-server-atlassian-jira` (npm-based, supports read + comment + transition).

Check whether it's already installed and discoverable:

```bash
npx -y @aashari/mcp-server-atlassian-jira --help
```

Expected: a help message printed to stdout (npx will install on first run if needed). If the package is unmaintained or unavailable at implementation time, fall back to `mcp-atlassian` (Python-based; install via `uvx mcp-atlassian --help`). Do not pick a different server without consulting the controller.

- [ ] **Step 2: Confirm the user has created an Atlassian API token.**

The user creates this at https://id.atlassian.com/manage-profile/security/api-tokens. Ask the user to confirm they have one before continuing. If they don't, report `NEEDS_CONTEXT` and pause.

- [ ] **Step 3: Confirm `~/.config/claude/atlassian.env` exists with the right contents.**

```bash
test -f ~/.config/claude/atlassian.env && \
  grep -q '^JIRA_URL=' ~/.config/claude/atlassian.env && \
  grep -q '^JIRA_EMAIL=' ~/.config/claude/atlassian.env && \
  grep -q '^JIRA_API_TOKEN=' ~/.config/claude/atlassian.env && \
  echo "ok"
```

Expected: `ok`. If any check fails, ask the user to create the file with these three lines:

```
JIRA_URL=https://<workspace>.atlassian.net
JIRA_EMAIL=<email>
JIRA_API_TOKEN=<token>
```

`chmod 600 ~/.config/claude/atlassian.env` to lock it down. Do NOT print the token contents.

- [ ] **Step 4: Add the MCP server to `.claude/settings.local.json`.**

Read the file first (it may not exist yet, or may have other content). Merge in:

```json
{
  "mcpServers": {
    "atlassian-jira": {
      "command": "npx",
      "args": ["-y", "@aashari/mcp-server-atlassian-jira"],
      "env": {
        "ATLASSIAN_SITE_NAME": "${JIRA_URL}",
        "ATLASSIAN_USER_EMAIL": "${JIRA_EMAIL}",
        "ATLASSIAN_API_TOKEN": "${JIRA_API_TOKEN}"
      }
    }
  }
}
```

The exact env variable names depend on the chosen MCP server — read its README and use what it expects. The values reference the env-file the user maintains. If the chosen MCP server doesn't read env-vars but takes config flags, adapt the `args` accordingly.

If `.claude/settings.local.json` doesn't exist:

```bash
mkdir -p .claude && cat > .claude/settings.local.json <<'EOF'
{
  "mcpServers": {
    "atlassian-jira": {
      "command": "npx",
      "args": ["-y", "@aashari/mcp-server-atlassian-jira"],
      "env": {
        "ATLASSIAN_SITE_NAME": "${JIRA_URL}",
        "ATLASSIAN_USER_EMAIL": "${JIRA_EMAIL}",
        "ATLASSIAN_API_TOKEN": "${JIRA_API_TOKEN}"
      }
    }
  }
}
EOF
```

If it does exist, use a Read + Edit pair, not a clobbering Write.

- [ ] **Step 5: Smoke-test the MCP server end-to-end.**

```bash
set -a; source ~/.config/claude/atlassian.env; set +a
claude -p "List the last three Jira issues you can see using the atlassian-jira MCP server. Output one per line: <KEY> — <SUMMARY>."
```

Expected: three lines, each `KEY — SUMMARY`. If the call hangs or errors with "no MCP server named atlassian-jira", check that the server name in `.claude/settings.local.json` matches what `claude` looks for (`atlassian-jira` is the local key in `mcpServers`).

- [ ] **Step 6: Commit.**

```bash
git add .claude/settings.local.json
git commit -m "$(cat <<'EOF'
chore(claude): wire Atlassian Jira MCP server

Add the atlassian-jira MCP server config so headless `claude -p` calls
can fetch tickets, post comments, and transition issues. Credentials
sourced from ~/.config/claude/atlassian.env at runtime.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `bin/lib/ports.sh` — free-port allocator

**Files:**
- Create: `bin/lib/ports.sh`

**Why this size:** Tiny, isolated, and easy to test. Doing it before the orchestrator means we can debug the port logic in isolation.

- [ ] **Step 1: Create the file.**

Path: `bin/lib/ports.sh`

```bash
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
```

- [ ] **Step 2: Make it executable** (sourced files don't need it, but doing it now means we don't forget for sibling scripts).

```bash
chmod +x bin/lib/ports.sh
```

- [ ] **Step 3: Smoke-test in isolation.**

```bash
bash -c 'set -e; . bin/lib/ports.sh; allocate_workspace_ports'
```

Expected: four lines like

```
DDB_PORT=8100
MINIO_API_PORT=9100
MINIO_CONSOLE_PORT=9101
NEXT_PORT=3100
```

(exact numbers depend on what's currently in use on the machine — what matters is four distinct integer values).

- [ ] **Step 4: Confirm port collision avoidance.**

Open a listener on 8100 in another shell to force the allocator to skip it:

```bash
# Terminal A
nc -l 8100
# Terminal B
bash -c '. bin/lib/ports.sh; find_free_port 8100'
```

Expected: terminal B prints a port `> 8100` (e.g. 8101). Kill the listener afterwards.

- [ ] **Step 5: Commit.**

```bash
git add bin/lib/ports.sh
git commit -m "$(cat <<'EOF'
feat(bin): add ports.sh free-port allocator

Used by bin/start-ticket to assign non-colliding host ports for the
per-worktree DynamoDB, MinIO API, MinIO Console, and Next.js dev
listeners. Pure bash + nc; portable across macOS and Linux.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `bin/lib/jira.sh` — Jira MCP wrappers

**Files:**
- Create: `bin/lib/jira.sh`

**Why third:** The orchestrator and the autonomous skill both call into this. Get the wrappers tested against a real Jira before they get wired into anything bigger.

- [ ] **Step 1: Create the file.**

Path: `bin/lib/jira.sh`

```bash
#!/usr/bin/env bash
# bin/lib/jira.sh — thin wrappers around the atlassian-jira MCP server.
#
# Subcommands:
#   fetch <KEY>                   → JSON to stdout: {summary, description,
#                                                    status, assignee, labels, url}
#   comment <KEY> [<body>]        Post a comment. Body from $2 or stdin.
#   transition <KEY> <STATUS>     Transition the issue to a status by name.
#
# Requires `claude` on PATH and the atlassian-jira MCP server configured
# in .claude/settings.local.json. Atlassian creds sourced from
# ~/.config/claude/atlassian.env if present (caller may have already
# sourced them).
set -euo pipefail

ATLASSIAN_ENV="$HOME/.config/claude/atlassian.env"
if [ -f "$ATLASSIAN_ENV" ] && [ -z "${JIRA_URL:-}" ]; then
  set -a; . "$ATLASSIAN_ENV"; set +a
fi

usage() {
  cat >&2 <<EOF
Usage:
  jira.sh fetch <KEY>
  jira.sh comment <KEY> [<body>]
  jira.sh transition <KEY> <STATUS>
EOF
  exit 2
}

cmd=${1:-}
shift || usage

case "$cmd" in
  fetch)
    [ $# -eq 1 ] || usage
    key="$1"
    claude -p --output-format text <<EOF
Use the atlassian-jira MCP server to fetch Jira issue $key.

Output ONLY a single line of compact JSON with these exact keys:
{"summary":"...","description":"...","status":"...","assignee":"...","labels":[],"url":"..."}

Do not wrap in code fences. Do not add commentary. If a field is empty,
use an empty string (or empty array for labels). Use the full URL of the
ticket including the workspace, like https://x.atlassian.net/browse/$key.
EOF
    ;;
  comment)
    [ $# -ge 1 ] || usage
    key="$1"
    if [ $# -ge 2 ]; then
      body="$2"
    else
      body=$(cat)
    fi
    # Pass the body as a here-doc inside the prompt so newlines survive.
    claude -p <<EOF
Use the atlassian-jira MCP server to add the following comment to issue $key.
Comment body (between the markers):
---BODY---
$body
---/BODY---
After posting, reply with the single word "OK".
EOF
    ;;
  transition)
    [ $# -eq 2 ] || usage
    key="$1"
    status="$2"
    claude -p <<EOF
Use the atlassian-jira MCP server to transition issue $key to the status named "$status".
After transitioning, reply with the single word "OK". If the named status is
not a valid transition for this issue, list the valid transition names instead.
EOF
    ;;
  *)
    usage
    ;;
esac
```

- [ ] **Step 2: Make it executable.**

```bash
chmod +x bin/lib/jira.sh
```

- [ ] **Step 3: Smoke-test `fetch`.**

You'll need the key of any open ticket you can read — call it `<KEY>` below.

```bash
bin/lib/jira.sh fetch <KEY> | jq .
```

Expected: a JSON object with `summary`, `description`, `status`, `assignee`, `labels`, `url` keys. If `jq` errors with "parse error", the model didn't emit pure JSON — adjust the prompt in `fetch` to be stricter.

- [ ] **Step 4: Smoke-test `comment`.**

Pick a throwaway ticket (or create one). Run:

```bash
echo "Test comment from bin/lib/jira.sh — please ignore." | bin/lib/jira.sh comment <THROWAWAY-KEY>
```

Verify in the Jira UI that the comment appeared.

- [ ] **Step 5: Smoke-test `transition`.**

Find a transition that's safe to apply and revert (e.g. moving "To Do" → "In Progress").

```bash
bin/lib/jira.sh transition <THROWAWAY-KEY> "In Progress"
```

Verify in the Jira UI that the status changed. Manually revert if needed.

- [ ] **Step 6: Commit.**

```bash
git add bin/lib/jira.sh
git commit -m "$(cat <<'EOF'
feat(bin): add jira.sh Jira MCP wrappers

Three subcommands — fetch, comment, transition — that wrap the
atlassian-jira MCP server via headless claude -p calls. Used by both
bin/start-ticket and the .claude/commands/ticket-work.md autonomous skill.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `bin/start-ticket` — the orchestrator

**Files:**
- Create: `bin/start-ticket`
- Modify: `.gitignore` (add the new untracked artefacts)

**Why now:** All dependencies are in place — ports, jira, MCP. This is the workhorse.

- [ ] **Step 1: Update `.gitignore`.**

Read the current `.gitignore` first, then append this block at the bottom (Edit, not Write):

```
# Per-worktree dev-stack overrides created by bin/start-ticket.
# Each worktree carries its own values; they are intentionally local-only.
.docker/
.env.compose
BRIEF.md
```

`BRIEF.md` is also added because it's regenerated per-worktree and has no value in `main`'s history.

- [ ] **Step 2: Create `bin/start-ticket`.**

Path: `bin/start-ticket`

```bash
#!/usr/bin/env bash
# bin/start-ticket — spin up an isolated workspace for a Jira ticket.
#
# Usage: bin/start-ticket <TICKET-KEY>
#
# Creates a git worktree in ../wanderwise-<TICKET>, allocates dynamic host
# ports, writes a per-worktree compose override and .env.local, and prints
# instructions for starting the autonomous Claude session.
set -euo pipefail

# --- Args ---
[ $# -eq 1 ] || { echo "Usage: $0 <TICKET-KEY>" >&2; exit 2; }
TICKET="$1"

# --- Paths ---
BIN_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$BIN_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- Pre-flight ---
for cmd in gh docker jq claude git nc; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "missing required command: $cmd" >&2; exit 1; }
done
docker info >/dev/null 2>&1 || {
  echo "Docker daemon is not running" >&2; exit 1; }

ATLASSIAN_ENV="$HOME/.config/claude/atlassian.env"
[ -f "$ATLASSIAN_ENV" ] || {
  echo "missing $ATLASSIAN_ENV — see plan task 1" >&2; exit 1; }
set -a; . "$ATLASSIAN_ENV"; set +a

# --- Source libs ---
. "$BIN_DIR/lib/ports.sh"

# --- Fetch ticket ---
echo "Fetching $TICKET from Jira..."
TICKET_JSON=$("$BIN_DIR/lib/jira.sh" fetch "$TICKET")

SUMMARY=$(echo "$TICKET_JSON" | jq -r .summary)
DESCRIPTION=$(echo "$TICKET_JSON" | jq -r .description)
STATUS=$(echo "$TICKET_JSON" | jq -r .status)
URL=$(echo "$TICKET_JSON" | jq -r .url)

if [ "$STATUS" = "Done" ] || [ "$STATUS" = "Closed" ]; then
  echo "Ticket $TICKET is $STATUS — refusing to start work." >&2
  exit 1
fi
if [ -z "$DESCRIPTION" ] || [ "$DESCRIPTION" = "null" ]; then
  echo "Ticket $TICKET has no description — refusing." >&2
  exit 1
fi

# --- Allocate ports ---
PORTS_OUTPUT=$(allocate_workspace_ports)
DDB_PORT=$(echo "$PORTS_OUTPUT" | grep ^DDB_PORT= | cut -d= -f2)
MINIO_API_PORT=$(echo "$PORTS_OUTPUT" | grep ^MINIO_API_PORT= | cut -d= -f2)
MINIO_CONSOLE_PORT=$(echo "$PORTS_OUTPUT" | grep ^MINIO_CONSOLE_PORT= | cut -d= -f2)
NEXT_PORT=$(echo "$PORTS_OUTPUT" | grep ^NEXT_PORT= | cut -d= -f2)

# --- Worktree ---
TICKET_LOWER=$(echo "$TICKET" | tr '[:upper:]' '[:lower:]')
WORKTREE_DIR="../wanderwise-$TICKET"
PROJECT_NAME="wanderwise-$TICKET_LOWER"

cleanup_partial() {
  if [ -d "$WORKTREE_DIR" ]; then
    git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
  fi
  git branch -D "$TICKET_LOWER" 2>/dev/null || true
}
trap cleanup_partial ERR

git worktree add "$WORKTREE_DIR" -b "$TICKET_LOWER"

# --- Compose override ---
mkdir -p "$WORKTREE_DIR/.docker"
cat > "$WORKTREE_DIR/.docker/compose.override.yml" <<YAML
services:
  dynamodb-local:
    ports:
      - "${DDB_PORT}:8000"
  minio:
    ports:
      - "${MINIO_API_PORT}:9000"
      - "${MINIO_CONSOLE_PORT}:9001"
YAML

cat > "$WORKTREE_DIR/.env.compose" <<ENV
DDB_PORT=$DDB_PORT
MINIO_API_PORT=$MINIO_API_PORT
MINIO_CONSOLE_PORT=$MINIO_CONSOLE_PORT
ENV

# --- .env.local seeded with per-worktree ports ---
if [ -f .env.local.example ]; then
  cp .env.local.example "$WORKTREE_DIR/.env.local"
  # Substitute defaults to dynamic ports.
  sed -i.bak \
    -e "s|http://localhost:8000|http://localhost:$DDB_PORT|g" \
    -e "s|http://localhost:9002|http://localhost:$MINIO_API_PORT|g" \
    -e "s|http://localhost:3000|http://localhost:$NEXT_PORT|g" \
    "$WORKTREE_DIR/.env.local"
  rm -f "$WORKTREE_DIR/.env.local.bak"
fi

# --- BRIEF.md ---
ABS_WORKTREE=$(cd "$WORKTREE_DIR" && pwd)
cat > "$WORKTREE_DIR/BRIEF.md" <<BRIEF
# $TICKET — $SUMMARY

**Mode:** autonomous; refuse-back to Jira if ambiguous.

**URL:** $URL

**Worktree:** $ABS_WORKTREE
**Branch:** $TICKET_LOWER
**Compose project:** $PROJECT_NAME

**Ports allocated:**
- Next.js dev: $NEXT_PORT
- DynamoDB: $DDB_PORT
- MinIO API: $MINIO_API_PORT
- MinIO Console: $MINIO_CONSOLE_PORT

## Ticket description

$DESCRIPTION

## To run the local stack

\`\`\`bash
docker compose --env-file .env.compose -p $PROJECT_NAME \\
  -f docker-compose.yml -f .docker/compose.override.yml up -d
npm run dev -- -p $NEXT_PORT
\`\`\`
BRIEF

# --- Print summary ---
trap - ERR
cat <<SUMMARY

Workspace ready for $TICKET ($SUMMARY)

  Worktree:        $ABS_WORKTREE
  Branch:          $TICKET_LOWER
  Compose project: $PROJECT_NAME

  Next.js dev:     http://localhost:$NEXT_PORT
  DynamoDB:        http://localhost:$DDB_PORT
  MinIO API:       http://localhost:$MINIO_API_PORT
  MinIO Console:   http://localhost:$MINIO_CONSOLE_PORT

Next:
  cd $WORKTREE_DIR
  claude
  /ticket-work

SUMMARY
```

- [ ] **Step 3: Make it executable.**

```bash
chmod +x bin/start-ticket
```

- [ ] **Step 4: Smoke-test against a real ticket.**

Pick a small open ticket — call it `<TEST-KEY>` — that you don't mind a worktree being created for.

```bash
bin/start-ticket <TEST-KEY>
```

Expected:
- A new directory `../wanderwise-<TEST-KEY>` exists.
- It contains `BRIEF.md`, `.env.local`, `.env.compose`, and `.docker/compose.override.yml`.
- `git worktree list` shows the new worktree.
- The summary at the end prints sensible URLs.
- The script exits 0.

Verify the contents of `.docker/compose.override.yml` and `.env.local` look correct (port numbers substituted in).

- [ ] **Step 5: Smoke-test parallel allocation.**

While the first worktree exists, spin up a second one for a different ticket:

```bash
bin/start-ticket <OTHER-TEST-KEY>
```

Expected: ports allocated for the second workspace are *different* from the first. Both `.docker/compose.override.yml` files reference the right ports.

Bring both stacks up to confirm they coexist:

```bash
( cd ../wanderwise-<TEST-KEY> && \
    docker compose --env-file .env.compose -p wanderwise-<test-key-lower> \
      -f docker-compose.yml -f .docker/compose.override.yml up -d )
( cd ../wanderwise-<OTHER-TEST-KEY> && \
    docker compose --env-file .env.compose -p wanderwise-<other-test-key-lower> \
      -f docker-compose.yml -f .docker/compose.override.yml up -d )
```

Expected: both succeed, no port-bind errors. Tear them down with `down -v` for each project.

Then remove the test worktrees:

```bash
git worktree remove ../wanderwise-<TEST-KEY>
git worktree remove ../wanderwise-<OTHER-TEST-KEY>
git branch -D <test-key-lower> <other-test-key-lower>
```

- [ ] **Step 6: Smoke-test the failure path.**

Pass a non-existent key:

```bash
bin/start-ticket NONEXISTENT-9999
```

Expected: the script exits non-zero with a clear error, and *no* worktree is left behind. Verify with `git worktree list` and `ls ..`.

- [ ] **Step 7: Commit.**

```bash
git add bin/start-ticket .gitignore
git commit -m "$(cat <<'EOF'
feat(bin): add start-ticket orchestrator

Spin up an isolated git-worktree workspace for a Jira ticket: fetch the
ticket, allocate dynamic host ports, write a per-worktree Docker Compose
override and .env.local, generate a BRIEF.md, and print the next step
for the user.

Adds .docker/, .env.compose, and BRIEF.md to .gitignore — these are
per-worktree throwaways.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `.claude/commands/ticket-work.md` — autonomous skill

**Files:**
- Create: `.claude/commands/ticket-work.md`

**Why fifth:** The orchestrator works without this — it just sets up the workspace. The autonomous skill is what runs *inside* the spawned session. Build and validate it after the orchestrator is solid.

- [ ] **Step 1: Create the skill file.**

Path: `.claude/commands/ticket-work.md`

```markdown
---
description: Autonomous: read BRIEF.md, plan and deliver the ticket, post results to Jira.
---

You are working in an isolated git worktree created by `bin/start-ticket`. Your job is to take the ticket described in `BRIEF.md` from "open" to "ready for human review", autonomously.

## Read the brief

First, read `BRIEF.md` at the worktree root. Confirm out loud which ticket key, branch, and compose project name you're working with.

## Phase 1 — Brainstorming with refusal-back

Run the `superpowers:brainstorming` skill against the ticket description in `BRIEF.md`, with this critical override:

**You may not ask the human any clarifying questions.** Instead:

- If the ticket is unambiguous enough that you can produce a complete, well-bounded design without questions, proceed to Phase 2.
- If you would normally need to ask the human a question to remove ambiguity, **stop**, collect your unresolved questions as bullet points, and enter "refusal-back mode":
  1. Compose a Jira comment listing your questions in plain bullet form, prefixed with: "Started work on this but hit ambiguity. Pausing until the ticket is updated:"
  2. Run `bin/lib/jira.sh comment <TICKET-KEY> "<body>"` from the worktree root to post it. (The ticket key is in `BRIEF.md`.)
  3. Run `bin/lib/jira.sh transition <TICKET-KEY> "Blocked"` (or whatever your Jira workflow uses for "needs info" — try "Blocked" first; if `jira.sh` reports invalid transition, list the valid options and pick the closest match, then re-run).
  4. Print a summary of what you posted and exit. Do not run brainstorming further. Do not write a plan. Do not start the dev stack.

This refusal gate exists because automated work on under-specified tickets produces wrong code. Posting the questions back to Jira keeps the human in the loop only when their input is genuinely needed.

## Phase 2 — Planning

Run the `superpowers:writing-plans` skill against the validated brainstorming output. The plan goes in `docs/superpowers/plans/<DATE>-<ticket-key>.md`. Do **not** ask the human to approve the plan — proceed directly to execution. The plan is a working document; the human reviews the resulting PR, not the plan itself.

## Phase 3 — Execution

Run the `superpowers:subagent-driven-development` skill over the plan. Standard two-stage review per task (spec compliance → code quality).

## Phase 4 — Deliver

After all tasks pass review:

1. Run the project's validation gauntlet from the worktree root:
   ```bash
   npx tsc --noEmit && npm run lint && npm run build
   ```
   All three must pass. If any fail, fix them — this is execution, not refusal-back territory.

2. Push the branch:
   ```bash
   git push -u origin <branch-name>
   ```

3. Create the PR:
   ```bash
   gh pr create --title "<TICKET-KEY>: <short summary>" --body "$(cat <<'EOF'
   ## Summary
   <2-3 bullet points describing the change>

   ## Linked ticket
   <ticket URL from BRIEF.md>

   ## Test plan
   - [ ] Reviewer pulls the branch and runs the local stack (see comment on Jira)
   - [ ] Reviewer exercises the changed flow

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```
   Capture the PR URL from `gh`'s output.

4. Start the local dev stack (so the human can test immediately):
   ```bash
   docker compose --env-file .env.compose -p <project-name> \
     -f docker-compose.yml -f .docker/compose.override.yml up -d
   ```

5. Post the ready-to-test comment to Jira:
   ```
   PR opened: <pr-url>

   Local test:
   - Worktree: <abs-worktree-path>
   - Next.js dev: http://localhost:<NEXT_PORT> (run `npm run dev -- -p <NEXT_PORT>` from the worktree)
   - DynamoDB: http://localhost:<DDB_PORT>
   - MinIO Console: http://localhost:<MINIO_CONSOLE_PORT>

   Run `docker compose --env-file .env.compose -p <project-name> -f docker-compose.yml -f .docker/compose.override.yml up -d` if the stack is not already running.
   ```
   Use `bin/lib/jira.sh comment <TICKET-KEY>` (body via stdin).

6. Transition the ticket:
   ```bash
   bin/lib/jira.sh transition <TICKET-KEY> "In Review"
   ```
   If "In Review" is not a valid transition, fall back to "Code Review" or whatever the Jira workflow names the equivalent state. If neither works, just post the comment without transitioning and warn the user in your final printed summary.

7. Print a final summary to the session: ticket key, PR URL, worktree path, dev port, status of the Jira transition.

## Phase 5 — On hard failure

If anything in Phase 3 or 4 errors out and you cannot recover:

1. Run `bin/lib/jira.sh comment <TICKET-KEY> "Automated work failed during <phase>. Last error: <message>. Worktree at <path> left for debugging."`.
2. Do not transition the ticket.
3. Leave the worktree intact.
4. Print a clear failure summary and exit.

## Constraints

- Do not run `sst deploy`. The new code lives only on the feature branch and goes to staging via the PR-merge workflow.
- Do not delete the worktree at the end — the human needs it for local testing.
- Do not stop the docker stack at the end (Phase 4 leaves it running).
- Do not commit the `.env.compose`, `.docker/compose.override.yml`, or `BRIEF.md` files — they are gitignored on purpose.
```

- [ ] **Step 2: Confirm Claude Code recognises the skill.**

Open a Claude Code session in this worktree (`claude` from the repo root). Type `/`, then look for `ticket-work` in the autocomplete list.

If it doesn't appear, check that the file path is exactly `.claude/commands/ticket-work.md` and that the frontmatter `description:` is non-empty.

- [ ] **Step 3: Commit.**

```bash
git add .claude/commands/ticket-work.md
git commit -m "$(cat <<'EOF'
feat(claude): add /ticket-work autonomous skill

Drives the spawned Claude session in a per-ticket worktree: read BRIEF.md,
brainstorm with refusal-back-to-Jira on ambiguity, plan, execute via
subagent-driven-development, push, open PR, post results to Jira, leave
the dev stack running for human testing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `bin/finish-ticket` — cleanup

**Files:**
- Create: `bin/finish-ticket`

- [ ] **Step 1: Create the file.**

Path: `bin/finish-ticket`

```bash
#!/usr/bin/env bash
# bin/finish-ticket — tear down a ticket workspace after its PR has been merged.
#
# Usage: bin/finish-ticket <TICKET-KEY> [--force]
set -euo pipefail

[ $# -ge 1 ] || { echo "Usage: $0 <TICKET-KEY> [--force]" >&2; exit 2; }
TICKET="$1"
FORCE="${2:-}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

TICKET_LOWER=$(echo "$TICKET" | tr '[:upper:]' '[:lower:]')
WORKTREE_DIR="../wanderwise-$TICKET"
PROJECT_NAME="wanderwise-$TICKET_LOWER"

# --- Refuse if branch is not merged into main, unless --force ---
if [ "$FORCE" != "--force" ]; then
  git fetch origin main >/dev/null 2>&1 || true
  if ! git branch --merged origin/main 2>/dev/null | grep -q "^[ *]*$TICKET_LOWER\$"; then
    echo "Branch $TICKET_LOWER is not merged into origin/main." >&2
    echo "Re-run with --force to clean up anyway." >&2
    exit 1
  fi
fi

# --- Stop the docker stack ---
if [ -f "$WORKTREE_DIR/.env.compose" ] && [ -f "$WORKTREE_DIR/.docker/compose.override.yml" ]; then
  ( cd "$WORKTREE_DIR" && \
    docker compose --env-file .env.compose -p "$PROJECT_NAME" \
      -f docker-compose.yml -f .docker/compose.override.yml down -v ) || true
fi

# --- Remove the worktree ---
if [ -d "$WORKTREE_DIR" ]; then
  git worktree remove --force "$WORKTREE_DIR"
fi

# --- Delete the local branch ---
git branch -D "$TICKET_LOWER" 2>/dev/null || true

echo "Cleaned up $TICKET (worktree, docker stack, local branch)."
```

- [ ] **Step 2: Make it executable.**

```bash
chmod +x bin/finish-ticket
```

- [ ] **Step 3: Smoke-test.**

You'll need a worktree for an already-merged branch to test against. Easiest path: temporarily merge a no-op branch.

```bash
# Create a throwaway worktree
bin/start-ticket <THROWAWAY-KEY>
# Pretend it's merged: merge it (or skip the --force check by using --force)
bin/finish-ticket <THROWAWAY-KEY> --force
```

Expected: the worktree is gone, the branch is gone, `git worktree list` no longer shows it, and `docker ps` shows no containers in the `wanderwise-<throwaway>` project.

- [ ] **Step 4: Commit.**

```bash
git add bin/finish-ticket
git commit -m "$(cat <<'EOF'
feat(bin): add finish-ticket cleanup helper

Tear down a ticket workspace after its PR has merged: stop the per-worktree
Docker stack, remove the worktree, delete the local branch. Refuses if
the branch is not merged into origin/main, unless --force.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: End-to-end ambiguity-refusal smoke test

**Files:**
- None (validation only).

**Why last:** This validates the most novel piece — the refusal-back path — end to end.

- [ ] **Step 1: Create a deliberately-ambiguous Jira ticket.**

Go to Jira and create a ticket in your test project. Description: "Make it better." Assignee: yourself. Status: Open.

Note its key — call it `<VAGUE-KEY>` below.

- [ ] **Step 2: Run the orchestrator.**

```bash
bin/start-ticket <VAGUE-KEY>
```

Expected: workspace created normally — the orchestrator does not gate on description quality beyond non-emptiness.

- [ ] **Step 3: Run the autonomous session.**

```bash
cd ../wanderwise-<VAGUE-KEY>
claude
# In the session:
/ticket-work
```

Expected (within a few minutes):
1. The session reads `BRIEF.md`.
2. It enters brainstorming.
3. It detects ambiguity, formulates questions.
4. It calls `bin/lib/jira.sh comment` to post the questions.
5. It transitions the ticket via `bin/lib/jira.sh transition`.
6. It prints a summary and stops.

- [ ] **Step 4: Verify in Jira.**

Open `<VAGUE-KEY>` in the Jira UI:
- A comment listing the questions has been posted.
- The status has changed (to Blocked, Needs Info, or whichever transition the session settled on).

- [ ] **Step 5: Tear down.**

```bash
cd "$ROOT_DIR"
bin/finish-ticket <VAGUE-KEY> --force
```

(`--force` because the branch was never merged.)

- [ ] **Step 6: Run the full validation gauntlet.**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

All three must pass. None of the new files should affect the application build, but verify.

- [ ] **Step 7: Push the branch.**

```bash
git push -u origin tooling/jira-ticket-automation
```

- [ ] **Step 8: Open the PR.**

```bash
gh pr create --title "tooling: Jira ticket automation" --body "$(cat <<'EOF'
## Summary
- `bin/start-ticket <KEY>` spins up an isolated worktree workspace per ticket with dynamic ports.
- `bin/finish-ticket <KEY>` tears it down after the PR merges.
- `.claude/commands/ticket-work.md` runs an autonomous brainstorm → plan → implement → PR flow inside the worktree, with refusal-back to Jira if the ticket is too ambiguous.
- Atlassian Jira MCP server wired into `.claude/settings.local.json`.

Spec: `docs/superpowers/specs/2026-04-25-jira-ticket-automation-design.md`
Plan: `docs/superpowers/plans/2026-04-25-jira-ticket-automation.md`

## Test plan
- [x] Single ticket happy path (Task 4)
- [x] Two-worktree parallel allocation (Task 4)
- [x] Failure path leaves no orphan state (Task 4)
- [x] Cleanup path tears down docker + worktree + branch (Task 6)
- [x] Ambiguity refusal posts comment + transitions ticket (Task 7)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

If `gh` isn't installed, push prints a PR URL — open it manually with the same content.

---

## Spec self-review (notes from plan author)

Coverage check against the spec sections:

- **Architecture diagram** — covered by Tasks 1 (MCP), 2 (ports), 3 (jira), 4 (orchestrator), 5 (skill), 6 (cleanup).
- **Component 1: bin/start-ticket** — Task 4.
- **Component 2: bin/finish-ticket** — Task 6.
- **Component 3: .claude/commands/ticket-work.md** — Task 5.
- **Component 4: per-worktree dev stack** — covered inside Task 4 (compose override + .env.local seeding).
- **Component 5: bin/lib/jira.sh** — Task 3.
- **Per-worktree dev stack details** — Task 4 Step 2 writes the override; Task 4 Step 5 validates parallel allocation.
- **Jira lifecycle states (3)** — Phases 4 and 5 of the autonomous skill (Task 5) cover all three.
- **Configuration the user provides** — Task 1 Steps 2–3 walk through it.
- **Validation (3 smoke tests)** — Tasks 4, 4, and 7 each cover one of the three named tests in the spec.

No spec section is left without a task. No placeholders found on the second pass. Function/script names are consistent across tasks (`bin/lib/jira.sh fetch|comment|transition`, `allocate_workspace_ports`, `find_free_port`, `bin/start-ticket`, `bin/finish-ticket`, `/ticket-work`).

One small consistency call-out: the spec referred to `dynamodb` as the Compose service name, but the actual `docker-compose.yml` uses `dynamodb-local`. The plan uses the real name (`dynamodb-local`) to avoid breaking the override.
