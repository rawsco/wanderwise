# Jira integration determinism — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Ready For Claude → In Progress → In Review` transitions and the "ready to test" Jira comment happen reliably, every time the poller picks a ticket up. Today, on the first real run (SCRUM-8), zero of those Jira side effects fired.

**Spec:** `docs/superpowers/specs/2026-04-26-jira-integration-determinism-design.md`
**Branch:** `fix/jira-integration-transitions` (already created and on HEAD).

---

## Project context for the implementer

**No test suite.** Validation is by direct invocation against a real Jira ticket. See spec section "Validation strategy".

**Bash safety.** Every shell script keeps `#!/usr/bin/env bash` + `set -euo pipefail`.

**Real Jira interaction during validation.** Tasks 4 and 6 require credentials at `~/.config/claude/atlassian.env` and a throwaway test ticket. If unavailable, report BLOCKED rather than skipping.

**Commit-trailer convention** (from CLAUDE.md): `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. Use HEREDOC for multi-line commit messages.

**Don't reformat unrelated code.** This branch should touch only the lines named in each task.

---

## File structure

| Path | New / Modify | Responsibility |
|---|---|---|
| `bin/jira-poller` | Modify | Switch `claude` invocation to `-p`. Safety-net `claude-blocked` label on start-ticket failure. |
| `bin/start-ticket` | Modify | Label tickets `claude-blocked` before exiting on no-description / Done refusals. |
| `bin/lib/jira.sh` | Modify | Add `ready-for-review <KEY> <PR_URL>` subcommand (deterministic comment + In Review transition). |
| `.claude/commands/ticket-work.md` | Modify | Add Phase 0 (In Progress transition). Replace Phase 4e+4f with `ready-for-review` call. |
| `docs/superpowers/specs/2026-04-26-jira-integration-determinism-design.md` | Already created | Design doc. |
| `docs/superpowers/plans/2026-04-26-jira-integration-determinism.md` | This file | Plan. |

---

## Task 1 — Add `ready-for-review` to `bin/lib/jira.sh`

**Files:** Modify `bin/lib/jira.sh`.

**Why first:** The skill change in Task 4 depends on this subcommand existing. Build + smoke-test the helper in isolation first.

- [ ] **Step 1: Add the subcommand to the case statement and the usage block.**

In the `usage()` heredoc, add:

```
  jira.sh ready-for-review <KEY> <PR_URL>
```

In the `case "$cmd" in` block, add (before `*)`):

```bash
  ready-for-review)
    [ $# -eq 2 ] || usage
    key="$1"
    pr_url="$2"

    # Read worktree-local .env.compose for ports + LAN host. The skill calls
    # this from the worktree root after start-ticket has written the file.
    if [ ! -f .env.compose ]; then
      echo "ready-for-review: .env.compose not found in $(pwd)" >&2
      exit 1
    fi
    # shellcheck disable=SC1091
    set -a; . ./.env.compose; set +a

    worktree_path=$(pwd)
    branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    project_name="wanderwise-$(echo "$key" | tr '[:upper:]' '[:lower:]')"

    body=$(cat <<BODY
PR opened: $pr_url

Local test (LAN-accessible from any machine on this network):
- Site: http://$LAN_HOST:$NEXT_PORT
- MinIO console: http://$LAN_HOST:$MINIO_CONSOLE_PORT (minioadmin / minioadmin)
- Dev server log: $worktree_path/.nextdev.log

Worktree on the dev host: $worktree_path
Branch: $branch_name

When you're done testing, merge the PR — staging auto-deploys via the existing GitHub Actions workflow. Then run \`bin/finish-ticket $key\` on the dev host to clean up.
BODY
)

    # Post comment, then transition. Both are best-effort in the sense that
    # we always attempt the transition even if the comment failed — better
    # to land partial state than nothing — but we exit non-zero if either
    # step fails so the caller can refuse-back.
    comment_rc=0
    transition_rc=0
    printf '%s' "$body" | "$0" comment "$key" || comment_rc=$?
    "$0" transition "$key" "In Review" || transition_rc=$?

    if [ "$comment_rc" -eq 0 ] && [ "$transition_rc" -eq 0 ]; then
      echo "OK"
    else
      echo "PARTIAL: comment=$comment_rc transition=$transition_rc" >&2
      exit 1
    fi
    ;;
```

The `"$0" comment` / `"$0" transition` calls re-invoke this same script with the existing wrappers — keeps the prompt-templating in one place and inherits any future improvements automatically.

- [ ] **Step 2: Smoke-test against a throwaway ticket.**

You need a worktree with a populated `.env.compose` (any worktree that `bin/start-ticket` has touched will do). From inside one:

```bash
bin/lib/jira.sh ready-for-review <THROWAWAY-KEY> "https://example.test/pr/999"
```

Expected: stdout prints `OK`, exit 0. In the Jira UI: a new comment with the templated body appears, and the ticket is now in "In Review" (or whatever close-match the wrapper picked — see step 3).

- [ ] **Step 3: Verify failure mode.**

Pass a ticket key that doesn't exist:

```bash
bin/lib/jira.sh ready-for-review NOPE-9999 "https://example.test/pr/0"
```

Expected: prints `PARTIAL: comment=<rc> transition=<rc>` to stderr, exits non-zero. The skill relies on this exit status to decide whether to refuse-back.

- [ ] **Step 4: Commit.**

```bash
git add bin/lib/jira.sh
git commit -m "$(cat <<'EOF'
feat(jira): add ready-for-review subcommand

Compose the "PR opened, here is the test URL" Jira comment in shell from
the worktree's .env.compose values, post it, and transition the ticket
to "In Review" — in one deterministic helper call instead of two
LLM-mediated steps inside the autonomous skill. Caller (the skill) just
checks exit status.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — `bin/start-ticket`: label `claude-blocked` on refusal

**Files:** Modify `bin/start-ticket`.

**Why second:** Stops the SCRUM-9-style busy-loop independently of the poller change in Task 3.

- [ ] **Step 1: Locate the two refusal exits** (around lines 57 and 61 — "Done/Closed" and "no description"). Replace each `exit 1` with a label-then-exit block.

For the "Done/Closed" branch:

```bash
if [ "$STATUS" = "Done" ] || [ "$STATUS" = "Closed" ]; then
  echo "Ticket $TICKET is $STATUS — refusing to start work." >&2
  "$BIN_DIR/lib/jira.sh" label-add "$TICKET" claude-blocked >/dev/null 2>&1 || \
    echo "warning: failed to label $TICKET claude-blocked" >&2
  exit 1
fi
```

For the "no description" branch:

```bash
if [ -z "$DESCRIPTION" ] || [ "$DESCRIPTION" = "null" ]; then
  echo "Ticket $TICKET has no description — refusing." >&2
  "$BIN_DIR/lib/jira.sh" label-add "$TICKET" claude-blocked >/dev/null 2>&1 || \
    echo "warning: failed to label $TICKET claude-blocked" >&2
  exit 1
fi
```

The label call is best-effort: a failure to label still results in `exit 1`, which means the poller's safety-net (Task 3, Step 2) will retry the labelling.

- [ ] **Step 2: Smoke-test.**

```bash
bin/start-ticket <TICKET-WITH-NO-DESCRIPTION>
```

Expected: stderr says "no description", `claude-blocked` label appears in the Jira UI, exit code 1.

If you don't have a description-less ticket handy, temporarily strip the description from a throwaway ticket (and restore after).

- [ ] **Step 3: Commit.**

```bash
git add bin/start-ticket
git commit -m "$(cat <<'EOF'
fix(start-ticket): label claude-blocked on refusal

When start-ticket refuses a ticket (Done/Closed status, or empty
description), apply the claude-blocked label so the poller's JQL
excludes it on the next cycle. Without this, a description-less ticket
busy-loops every POLL_INTERVAL_SECONDS forever.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — `bin/jira-poller`: switch to `claude -p` and add safety-net label

**Files:** Modify `bin/jira-poller`.

**Why third:** The single biggest fix — without `-p`, the autonomous skill never runs. Comes after Task 2 so the safety-net label below has somewhere to defer to.

- [ ] **Step 1: Switch the spawn invocation.**

Locate `spawn_ticket_work` (around line 72). The current line is:

```bash
claude --dangerously-skip-permissions /ticket-work >> "$log_file" 2>&1
```

Replace with:

```bash
claude -p "/ticket-work" --dangerously-skip-permissions >> "$log_file" 2>&1
```

`-p` puts the CLI in non-interactive print mode; the positional `"/ticket-work"` is parsed as a slash-command prompt. This is the same pattern `bin/lib/jira.sh` already uses for every Jira call.

- [ ] **Step 2: Add a safety-net label on `start-ticket` failure.**

Locate the `if ! "$WANDERWISE_DIR/bin/start-ticket" "$key"` block. Today it logs and returns. Extend it to also try the label (in case start-ticket itself failed before labelling, e.g. crashed early):

```bash
if ! "$WANDERWISE_DIR/bin/start-ticket" "$key" >> "$log_file" 2>&1; then
  log "start-ticket failed for $key — labelling claude-blocked and giving up"
  "$WANDERWISE_DIR/bin/lib/jira.sh" label-add "$key" claude-blocked \
    >> "$log_file" 2>&1 || log "warning: also failed to label $key"
  remove_inflight "$key"
  return 1
fi
```

This is a belt-and-braces pairing with Task 2 — `start-ticket` does the labelling on its own refusal exits, but if it died for some other reason (Docker not running, jira.sh fetch failed) the poller still labels so we don't busy-loop on a permanently broken ticket.

- [ ] **Step 3: Smoke-test the spawn change.**

Pick a small throwaway ticket with a real description (anything well-defined enough that `/ticket-work` can run). Move it to `Ready For Claude` and remove any `claude-blocked` label.

Restart the poller:

```bash
launchctl unload -w ~/Library/LaunchAgents/com.wanderwise.jira-poller.plist
launchctl load -w ~/Library/LaunchAgents/com.wanderwise.jira-poller.plist
```

Tail the per-ticket log:

```bash
tail -f ~/.cache/wanderwise-poller/<KEY>.log
```

Expected within a few minutes: log shows the start-ticket output, then output from `claude -p` (the skill's stdout — brainstorming, planning, etc.), then a final `DONE: <KEY>` summary. The Jira ticket moves to In Progress, then to In Review, with a comment.

If `claude -p "/ticket-work"` exits immediately complaining about the slash command, that's a hard blocker — fall back to passing the skill body inline (read `.claude/commands/ticket-work.md` and pipe it as the prompt). Don't proceed with the rest of the plan until this loop is closed.

- [ ] **Step 4: Commit.**

```bash
git add bin/jira-poller
git commit -m "$(cat <<'EOF'
fix(poller): run /ticket-work via claude -p

The previous invocation `claude --dangerously-skip-permissions
/ticket-work` started the interactive TUI; without a TTY (the poller
disowns the spawned subshell and redirects output to a log file), it
exited immediately without ever executing the slash command. Net
effect: the autonomous skill never ran, so no Jira transitions or
post-back comments fired. SCRUM-8 was the first observed instance.

Switch to `claude -p "/ticket-work"` so the CLI runs the skill in
non-interactive print mode — the same pattern bin/lib/jira.sh already
uses for every Jira call.

Also: when start-ticket itself fails (not just the description-refusal
case it labels on its own), label the ticket claude-blocked from the
poller as a safety net so we don't busy-loop on a permanently broken
ticket.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `.claude/commands/ticket-work.md`: Phase 0 + collapsed Phase 4

**Files:** Modify `.claude/commands/ticket-work.md`.

**Why fourth:** Depends on Task 1 (`ready-for-review` exists) and Task 3 (the skill actually gets a chance to run).

- [ ] **Step 1: Insert Phase 0 — In Progress transition.**

After the "Read the brief" section and before "Phase 1 — Brainstorm", insert:

```markdown
## Phase 0 — Claim the ticket

Before doing any work, transition the ticket to "In Progress":

\`\`\`bash
bin/lib/jira.sh transition $TICKET_KEY "In Progress" || \
  echo "warning: In Progress transition failed (poller may have already done it)"
\`\`\`

This is a no-op when the poller has already moved the ticket. It's only
load-bearing for manual `/ticket-work` runs (no poller in the loop) — the
deterministic poller-side transition added in commit 9c37463 covers the
automated path.
```

- [ ] **Step 2: Replace Phase 4e + 4f with the helper call.**

Find "Phase 4e. Post the ready-to-test Jira comment" through the end of "Phase 4f. Transition" (sections that walk through composing the comment body and calling `transition` separately). Replace the entire block with:

```markdown
### 4e. Hand off to Jira (comment + transition, in one call)

The body and the transition are composed deterministically by the helper
from the worktree's `.env.compose` and current git branch. Just run:

\`\`\`bash
bin/lib/jira.sh ready-for-review $TICKET_KEY $PR_URL
\`\`\`

Exit status:
- `0` (`OK` to stdout): comment posted and ticket transitioned to "In Review".
- non-zero (`PARTIAL: comment=<rc> transition=<rc>` to stderr): one or both
  steps failed. **Refuse-back** with the helper's stderr as the reason — the
  PR is open and the dev stack is up, but Jira didn't get the update, so the
  human won't know to look. The refusal-back comment in `bin/lib/jira.sh
  comment` is itself a Jira call, so if Jira is hard-down both will fail; in
  that case still print `FAILED: <KEY> jira unreachable` to stdout so the
  poller's log shows the right reason.
```

- [ ] **Step 3: Update Phase 4g (final summary) reference.**

Phase 4g already prints a summary. Confirm it now reads sensibly given Phases 4e+4f collapsed into 4e — adjust the "Jira transition: <state>" line to "Jira: <OK | PARTIAL>" reflecting the helper's exit status.

- [ ] **Step 4: Re-read the whole file end to end.** Make sure no stale references to "Phase 4f" or to manually composing the comment body remain. Section anchors don't matter (this is plain markdown read by the LLM, not navigation), but stale instructions confuse the agent.

- [ ] **Step 5: Commit.**

```bash
git add .claude/commands/ticket-work.md
git commit -m "$(cat <<'EOF'
fix(ticket-work): make Jira transitions deterministic

Two changes to the autonomous skill:

1. New Phase 0 transitions the ticket to "In Progress" so manual
   `/ticket-work` invocations also move the column. The poller-side
   transition added in 9c37463 already covers the automated path; this
   is a belt-and-braces no-op there.

2. Phase 4e (post comment) and Phase 4f (transition to In Review)
   collapse into a single `bin/lib/jira.sh ready-for-review` helper
   call. The body and transition are composed by shell, not by the LLM
   running the skill, removing a source of drift on every delivery.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Operator cleanup of stale poller state

**Files:** None (operational only).

**Why now:** With the spawn-and-cleanup chain fixed (Tasks 1–4), the stale `in-flight.txt` entries from the failed SCRUM-8 / SCRUM-9 runs would otherwise still block re-pickup. This is a one-off cleanup, not a code change.

- [ ] **Step 1: Snapshot the file** for the audit trail, then clear it.

```bash
cp ~/.cache/wanderwise-poller/in-flight.txt ~/.cache/wanderwise-poller/in-flight.txt.bak.$(date +%Y%m%d)
: > ~/.cache/wanderwise-poller/in-flight.txt
```

The poller picks up the cleared file on the next cycle without restart (it `grep`s the file each iteration).

- [ ] **Step 2: Confirm SCRUM-8 / SCRUM-9 either are no longer in the JQL set or are intentionally re-queued.** SCRUM-8 is already merged so should not match `Ready For Claude`. SCRUM-9 — if it's still description-less, the next cycle will refuse it, label `claude-blocked`, and never re-pick. Watch one cycle of the poller log to confirm:

```bash
tail -f ~/Library/Logs/wanderwise-poller.log
```

Expected: no spawn for SCRUM-8. Either no spawn for SCRUM-9 (already labelled) or one final spawn that refuses and labels it.

---

## Task 6 — End-to-end validation

**Files:** None (validation only).

- [ ] **Step 1: Pick a real, well-described throwaway ticket** in the test project. Move it to `Ready For Claude`. Remove any `claude-blocked` label.

- [ ] **Step 2: Watch the poller pick it up.**

```bash
tail -f ~/Library/Logs/wanderwise-poller.log
```

Within `POLL_INTERVAL_SECONDS` you should see:
1. `[poller] starting workspace for <KEY>`
2. `[poller] spawned ticket-work for <KEY>`

Then in `~/.cache/wanderwise-poller/<KEY>.log`:
1. `start-ticket` output
2. `claude -p` output (the skill running)
3. Final `DONE: <KEY>` summary

- [ ] **Step 3: Verify Jira state.**

Open the ticket in the Jira UI. Confirm:
- Status went from `Ready For Claude` → `In Progress` → `In Review`.
- A comment containing the PR URL and the LAN test URL exists, posted by the bot account.

- [ ] **Step 4: Verify GitHub state.**

```bash
gh pr list --state open --search "<KEY>"
```

A PR should be open against `main`, branch named after the lowercased ticket key.

- [ ] **Step 5: Run the project gauntlet.**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

All three must pass. None of the changes touch app code, but verify.

- [ ] **Step 6: Push the branch and open the PR for this work.**

```bash
git push -u origin fix/jira-integration-transitions
gh pr create --title "fix(jira): make ticket transitions and post-back deterministic" --body "$(cat <<'EOF'
## Summary
- Switch poller to `claude -p` so the autonomous skill actually runs (root cause of zero Jira updates on SCRUM-8).
- Add `bin/lib/jira.sh ready-for-review` — composes the ready-to-test comment in shell and transitions to In Review in one deterministic call.
- Skill: new Phase 0 (In Progress for manual runs), collapsed Phase 4e/4f into the helper call.
- `start-ticket` + poller now label refused tickets `claude-blocked` so description-less tickets don't busy-loop.

Spec: `docs/superpowers/specs/2026-04-26-jira-integration-determinism-design.md`
Plan: `docs/superpowers/plans/2026-04-26-jira-integration-determinism.md`

## Test plan
- [x] `ready-for-review` against a throwaway ticket — comment + transition land.
- [x] `start-ticket` against a description-less ticket — `claude-blocked` label applied.
- [x] Full poller-driven run on a real ticket — `Ready For Claude → In Progress → In Review`, PR opened, comment posted with test URL.
- [x] `npx tsc --noEmit && npm run lint && npm run build`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Spec self-review (notes from plan author)

Coverage check against the spec sections:

- **Root cause: poller invokes `claude` interactively** → Task 3.
- **LLM-mediated Phase 4e/4f** → Tasks 1 (helper) + 4 (skill collapse).
- **Manual `/ticket-work` doesn't move column** → Task 4 Step 1 (Phase 0).
- **No-description busy-loop** → Task 2 (`start-ticket`) + Task 3 Step 2 (poller safety-net).
- **Stale in-flight state** → Task 5 (operator cleanup).
- **Validation strategy** → Task 6 covers all four named tests.

Out-of-scope items called out in the spec are not covered here, by design.

No placeholders. Function/file names match across tasks (`ready-for-review`, `claude-blocked`, `bin/lib/jira.sh`, `bin/start-ticket`, `bin/jira-poller`, `.claude/commands/ticket-work.md`).
