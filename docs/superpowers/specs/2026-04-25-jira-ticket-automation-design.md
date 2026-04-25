# Jira ticket automation

**Status:** Design approved 2026-04-25
**Branch:** `tooling/jira-ticket-automation`

## Goal

Pull a Jira ticket from the terminal, spin up an isolated workspace for it, and have an autonomous Claude Code session plan-and-deliver the ticket — leaving a PR open and a working local test environment, with progress reported back to Jira. Multiple tickets can be in flight at once without colliding.

## Scope

In scope:
- A shell orchestrator (`bin/start-ticket WAN-123`) that creates a per-ticket workspace.
- Per-workspace isolation via git worktrees plus per-worktree Docker Compose project names and dynamic host ports.
- An autonomous Claude session per workspace that reads a brief, runs the existing brainstorm → plan → implement flow, opens a PR, and posts a comment to Jira when done.
- A Jira-comment-back path when the ticket is too ambiguous to plan against.
- A cleanup helper (`bin/finish-ticket WAN-123`).
- Atlassian Jira MCP server wired into `.claude/settings.local.json`.

Out of scope (tracked follow-ups):
- Extracting the orchestrator into a standalone repo.
- A "respond to PR review comments" follow-up automation.
- A TUI / dashboard for tickets in flight.
- Auto-launching a Claude session in a new terminal window (OS-specific).
- Containerising Next.js dev itself (only revisit if port-offset is insufficient).

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  YOUR TERMINAL                                           │
│  $ bin/start-ticket WAN-123                              │
│           │                                              │
│           ▼                                              │
│  ┌─────────────────────────────────────────────┐         │
│  │  bin/start-ticket (bash orchestrator)       │         │
│  │  1. validate env (gh, docker, repo root)    │         │
│  │  2. fetch ticket via Jira MCP one-shot      │         │
│  │  3. git worktree add ../wanderwise-WAN-123  │         │
│  │  4. allocate free ports                     │         │
│  │  5. write .docker/compose.override.yml      │         │
│  │  6. write .env.local + BRIEF.md             │         │
│  │  7. print connection details + claude cmd   │         │
│  └─────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  WORKTREE: ../wanderwise-WAN-123                         │
│                                                          │
│  Claude Code session loads .claude/commands/             │
│  ticket-work.md, reads BRIEF.md, runs the autonomous     │
│  flow:                                                   │
│                                                          │
│    brainstorm → can plan? ──no──► post Jira comment      │
│         │                          + transition Blocked  │
│         │                          + exit                │
│        yes                                               │
│         ▼                                                │
│    write-plan → subagent-driven-development →            │
│    commit → push → gh pr create →                        │
│    post Jira comment with PR link + test URLs →          │
│    transition In Review → exit                           │
│                                                          │
│  Dev stack (started by the session before testing):      │
│    docker compose -p wanderwise-wan-123                  │
│      -f docker-compose.yml                               │
│      -f .docker/compose.override.yml up -d               │
│  → DynamoDB Local + MinIO bound to dynamic host ports    │
│                                                          │
│  Next.js dev (host, not Docker): npm run dev -- -p <P>   │
└──────────────────────────────────────────────────────────┘
```

## Component 1 — `bin/start-ticket` (orchestrator)

A bash script in WanderWise. Single source of truth for "spin up a ticket workspace."

**Inputs:** one positional argument, the ticket key (e.g. `WAN-123`). No flags initially; the autonomous mode is the only mode.

**Pre-flight validation:**
- Must be invoked from the repo root.
- `gh`, `docker`, `jq`, and `claude` must all be on `PATH`.
- `docker info` must succeed (Docker daemon running).
- `~/.config/claude/atlassian.env` must exist and contain `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`.

**Steps:**

1. **Source Atlassian creds** from `~/.config/claude/atlassian.env`.
2. **Fetch the ticket** by spawning a one-shot, headless Claude call (`claude -p`) that uses the Atlassian MCP server to retrieve the issue and emits JSON to stdout: `{summary, description, status, assignee, labels, url}`. The orchestrator parses this with `jq`.
3. **Validate the ticket.** Refuse if status is `Closed` / `Done`, or if description is empty. Print a useful error and exit non-zero.
4. **Allocate free host ports** for DynamoDB Local, MinIO API, MinIO Console, and Next.js dev — four ports total. The port helper in `bin/lib/ports.sh` probes from a base (8100, 9100, 9101, 3100) upward until each is free, ensuring the four allocations don't conflict with each other.
5. **Create the worktree** with `git worktree add ../wanderwise-WAN-123 -b WAN-123`. Branch name is the lowercased ticket key (`wan-123`), worktree directory uses the original-case key for human readability.
6. **Write `<worktree>/.docker/compose.override.yml`** with the per-worktree project name and dynamic ports (see Component 4).
7. **Write `<worktree>/.env.local`** seeded from `.env.local.example` with the dynamic ports substituted into `DYNAMODB_ENDPOINT`, `S3_ENDPOINT`, etc.
8. **Write `<worktree>/BRIEF.md`** containing: ticket key, summary, full description, link, allocated ports, the docker compose project name, and the autonomous-mode instructions header (see Component 3).
9. **Print connection details** in a clear block: worktree path, dev port, DDB port, MinIO ports, the docker compose command, and a `cd <path> && claude` invocation to copy-paste. The user starts that session and types `/ticket-work` as the first message.
10. **Exit 0.**

**On any failure after step 5,** clean up: remove the partially-created worktree (`git worktree remove --force ../wanderwise-WAN-123`) and delete the branch. The user is left exactly where they started.

## Component 2 — `bin/finish-ticket` (cleanup)

A bash script invoked after the PR is merged.

**Inputs:** one positional argument, the ticket key.

**Steps:**

1. Confirm the branch is fully merged into `main` (`git branch --merged main | grep wan-123`). Refuse if not, unless `--force`.
2. `docker compose -p wanderwise-wan-123 down -v` (stops containers, removes volumes — DDB and MinIO data are throwaway per ticket).
3. `git worktree remove ../wanderwise-WAN-123`.
4. `git branch -d wan-123` (locally).
5. Print confirmation.

## Component 3 — `.claude/commands/ticket-work.md` (autonomous skill)

The slash command / prompt-as-skill that the spawned Claude session runs. The orchestrator does not invoke it directly — it instructs the user to start `claude` in the worktree, and the user types `/ticket-work` as the first message. The skill body stays in `.claude/commands/` so it's also discoverable in any future manual session in that worktree (e.g. for debugging an aborted run).

The skill body:

1. Reads `BRIEF.md` and confirms it can see the ticket details.
2. Runs `superpowers:brainstorming` against the ticket body, with one decision criterion modified: if at any point the model would need to ask the human a question that isn't trivially derivable from the ticket, it instead enters **refusal mode**:
   - Composes a Jira comment listing the unresolved questions in plain bullet form.
   - Calls `bin/lib/jira.sh comment <ticket-key> <body>` to post it.
   - Calls `bin/lib/jira.sh transition <ticket-key> <BLOCKED_TRANSITION>`.
   - Stops the docker stack if it was started.
   - Exits the session with a clear printed summary.
3. If brainstorming completes cleanly, runs `superpowers:writing-plans`, then `superpowers:subagent-driven-development` over the resulting plan.
4. After implementation, commits any remaining changes, pushes the branch, and creates a PR with `gh pr create`.
5. Starts the local dev stack (`docker compose -p ... up -d`) so the human can test immediately.
6. Posts the success comment via `bin/lib/jira.sh comment` containing: PR URL, the worktree path, the docker compose command, the local URLs (Next.js dev, MinIO console).
7. Transitions the ticket via `bin/lib/jira.sh transition <ticket-key> <IN_REVIEW_TRANSITION>`.
8. Exits.

The "refusal" gate is the most novel piece. The brainstorming skill normally asks questions of the human; the override flips that to "if you would ask, instead refuse with the questions written into Jira." The skill body explicitly instructs Claude to apply this override only at the brainstorming stage — not during implementation, where blocking on a question is rarer and worth a hard fail rather than a refusal-back.

## Component 4 — Per-worktree dev stack

The current `docker-compose.yml` exposes:

| Service | Port |
|---|---|
| DynamoDB Local | 8000 |
| MinIO API | 9000 |
| MinIO Console | 9001 |

For parallel worktrees we layer a `.docker/compose.override.yml` per worktree:

```yaml
# .docker/compose.override.yml — written by bin/start-ticket
services:
  dynamodb:
    ports:
      - "${DDB_PORT}:8000"
  minio:
    ports:
      - "${MINIO_API_PORT}:9000"
      - "${MINIO_CONSOLE_PORT}:9001"
```

The orchestrator also writes `.env.compose` in the worktree with the resolved port values. Compose picks both up automatically when invoked with `-f docker-compose.yml -f .docker/compose.override.yml`. The project name comes from the `-p wanderwise-wan-123` flag — Compose isolates containers, networks, and volumes per project, so two stacks coexist without conflict.

The Next.js dev server runs on the host (not in Docker) — port-offset via `npm run dev -- -p <PORT>` is sufficient and keeps fast HMR. Containerising Next.js is a tracked follow-up only if port-offset proves insufficient.

`.env.local` per worktree is seeded from `.env.local.example` with the per-worktree port values inserted into `DYNAMODB_ENDPOINT`, `S3_ENDPOINT`, etc., so the Next.js dev server in worktree A talks to its own DynamoDB/MinIO and not worktree B's.

## Component 5 — `bin/lib/jira.sh` (Jira wrappers)

Three subcommands, all spawning headless `claude -p` calls with the Atlassian MCP server enabled. Used by both the orchestrator (`bin/start-ticket` calls `fetch`) and the autonomous session (calls `comment` and `transition` from inside its run via `Bash`).

```bash
bin/lib/jira.sh fetch <ticket-key>      # → JSON on stdout
bin/lib/jira.sh comment <ticket-key> <body-from-stdin-or-arg>
bin/lib/jira.sh transition <ticket-key> <transition-name>
```

These exist so the orchestrator script and the autonomous session use the *same* code path for Jira interaction. Direct REST calls would also work but would bypass the MCP server config and require a second auth pathway.

## Jira lifecycle states

The autonomous session ends in exactly one of three states. Each posts a comment back to Jira:

| End state | Jira comment | Ticket transition | Worktree state |
|---|---|---|---|
| **Ready to test** | "PR opened: `<url>`. Local test: `http://localhost:<dev-port>` (worktree at `<path>`, branch `wan-123`). Run `docker compose -p wanderwise-wan-123 up -d` to start the local stack." | → **In Review** | Left intact, dev stack running |
| **Needs clarification** | "Started work on this but hit ambiguity: `<bulleted questions>`. Pausing until the ticket is updated." | → **Blocked** / **Needs Info** | Left intact, dev stack stopped |
| **Hard failure** | "Automated work failed during `<step>`. Last error: `<msg>`. Worktree at `<path>` left for debugging." | No transition | Left intact for human triage |

## Configuration the user provides during implementation

Before this is functional, the user must:

1. Choose a Jira MCP server (recommended: `@aashari/mcp-server-atlassian-jira` if maintained at implementation time; otherwise `mcp-atlassian`).
2. Create an Atlassian API token at https://id.atlassian.com/manage-profile/security/api-tokens.
3. Create `~/.config/claude/atlassian.env` containing:
   ```
   JIRA_URL=https://<workspace>.atlassian.net
   JIRA_EMAIL=<email>
   JIRA_API_TOKEN=<token>
   ```
4. Tell us the project key prefix (e.g. `WAN`) and the exact Jira workflow transition names to use for "in review" and "blocked / needs info." If unset, the orchestrator falls back to posting comments only (no transitions).

These four items are gathered during the implementation phase, not the design phase.

## Files this branch creates

| Path | Purpose |
|---|---|
| `bin/start-ticket` | Orchestrator (bash) |
| `bin/finish-ticket` | Cleanup helper (bash) |
| `bin/lib/jira.sh` | Jira MCP wrappers |
| `bin/lib/ports.sh` | Free-port allocator |
| `.claude/commands/ticket-work.md` | Autonomous skill the spawned session loads |
| `.claude/settings.local.json` | MCP server config (Atlassian) — local, gitignored values |
| `.gitignore` (modified) | Add `.env.compose`, `.docker/compose.override.yml` if not already covered |
| `docs/superpowers/specs/2026-04-25-jira-ticket-automation-design.md` | This spec |
| `docs/superpowers/plans/2026-04-25-jira-ticket-automation.md` | Implementation plan (next step) |

## Validation

Three smoke tests during implementation:

1. **Single ticket happy path.** Pick a real (or test) Jira ticket with a clear description. `bin/start-ticket WAN-N`. Confirm: worktree exists, override file is correct, `BRIEF.md` is correct, `.env.local` has dynamic ports. Start a Claude session in the worktree, run `/ticket-work`, confirm it produces a plan and at least begins implementation.
2. **Two-worktree parallel.** Run `bin/start-ticket` for two different tickets back-to-back. Confirm: each gets its own port allocations, both Docker stacks can be started simultaneously, no port conflicts.
3. **Ambiguity refusal.** Create a Jira ticket with a deliberately vague description. `bin/start-ticket WAN-VAGUE`. Run the session. Confirm: it posts a Jira comment with questions, transitions the ticket, exits cleanly.

## Open questions

None — all design choices made during brainstorming on 2026-04-25.
