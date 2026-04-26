# Jira integration determinism — design

**Status:** Design approved 2026-04-26
**Branch:** `fix/jira-integration-transitions`
**Supersedes/extends:** `docs/superpowers/specs/2026-04-25-jira-ticket-automation-design.md` (Phase 4 of `.claude/commands/ticket-work.md`)

## Goal

Make the existing Jira-ticket automation reliably move a ticket through `Ready For Claude → In Progress → In Review` and post a "ready to test" comment with the PR URL, every time. Today the poller picks tickets up but the LLM-mediated post-back / column transitions are unreliable; on the first real production run (SCRUM-8, "map auto-fit"), zero of the Jira-side actions fired.

## Problem evidence

Concrete failures observed after `bin/jira-poller` picked up SCRUM-8 on 2026-04-26:

1. **`/ticket-work` never ran inside the spawned session.** `~/.cache/wanderwise-poller/SCRUM-8.log` is 20 lines — exactly the output of `bin/start-ticket`. There is no record of brainstorming, planning, code changes, PR creation, or any Jira call by the skill. The PR that landed (`#11 feat(map): auto-fit trip map to all stops`) was a manual re-do.
2. **`bin/lib/jira.sh transition` was never called by the skill.** Phase 4f of `.claude/commands/ticket-work.md` would otherwise log "transitioning to In Review" via the wrapper. Nothing in the log.
3. **Stale in-flight state.** `~/.cache/wanderwise-poller/in-flight.txt` still contains `SCRUM-8` and `SCRUM-9` because the cleanup hook only fires after the spawned `claude` returns from a normal `/ticket-work` run.
4. **Description-less tickets busy-loop.** `SCRUM-9` was picked up, refused by `bin/start-ticket` (no description), then re-picked every 60 s. The log shows four refusal cycles; the JQL has no exit clause for "we already gave up on this".

## Root cause

`bin/jira-poller:89`:

```bash
claude --dangerously-skip-permissions /ticket-work >> "$log_file" 2>&1
```

Per `claude --help`: *"starts an interactive session by default, use -p/--print for non-interactive output"*. With stdin/stdout backgrounded by `disown` and redirected to a file (no TTY), the interactive TUI exits immediately without ever executing the slash command. Because the skill never runs, none of the in-skill Jira calls (Phase 4d–4f) execute either.

A second class of problem: even when `/ticket-work` *does* run (manual invocation in a TTY, as on SCRUM-8 the second time round), Phase 4e (post comment) and 4f (transition) are LLM instructions calling LLM-mediated wrappers. The poller-side `transition $key "In Progress"` (added in `9c37463`) was promoted out of the skill specifically because it needs to be deterministic; the same logic applies to the In Review transition and the ready-to-test comment, but they're still inside the skill.

## Scope

**In scope:**

- Switch the poller's `claude` invocation to non-interactive (`-p`) so the skill actually runs.
- Make the In Review transition + ready-to-test comment deterministic by moving their composition into a single shell helper (`bin/lib/jira.sh ready-for-review <KEY> <PR_URL>`) that the skill calls once per delivery.
- Add a deterministic In Progress transition for manual `/ticket-work` runs (Phase 0), so the column reflects reality whether a human launched the skill or the poller did.
- Stop the no-description busy-loop: `bin/start-ticket` labels the ticket `claude-blocked` before exiting on this refusal.
- One-shot cleanup of the stale `in-flight.txt` so the poller can re-pick anything that's still legitimately open.

**Out of scope (explicit follow-ups):**

- Replacing the MCP-via-`claude -p` pattern with a direct Atlassian REST client.
- Building a real headless agent SDK for the autonomous run.
- TUI / dashboard for in-flight tickets.
- A "respond to PR review comments" automation.
- Changes to the actual brainstorm / plan / execute LLM phases — only the deterministic Jira-side wrapper changes.

## Architecture changes

```
Before:
  poller ──spawns──► claude (interactive, no TTY) ──► dies silently
                                                       │
                                                  /ticket-work never runs
                                                       │
                                                  no Jira updates

After:
  poller ──spawns──► claude -p "/ticket-work"          ──► skill runs end-to-end
        │                          │                            │
        │                          │                  Phase 0:  jira.sh transition "In Progress"
        │                          │                  Phase 4:  jira.sh ready-for-review <KEY> <PR_URL>
        │                          │                            │ (single deterministic call)
        │                          │                            ├─► post templated comment
        │                          ▼                            └─► transition "In Review"
        │                  --internal-cleanup
        │                  removes in-flight entry
        │
        ├─► transition "In Progress" on pickup (already in 9c37463 — kept; idempotent w/ Phase 0)
        └─► If start-ticket exits "no description" → label claude-blocked → JQL excludes next cycle
```

## Component changes

### `bin/jira-poller`

- Line ~89: replace `claude --dangerously-skip-permissions /ticket-work` with `claude -p "/ticket-work" --dangerously-skip-permissions`. Same redirection, same `disown`. The `-p` flag puts the CLI in non-interactive mode and makes the positional `/ticket-work` invoke the skill as a slash command. (Anything that breaks in `-p` mode would already be broken for `bin/lib/jira.sh fetch`, which uses the same flag.)
- Detect "start-ticket refused: no description" and call `bin/lib/jira.sh label-add <KEY> claude-blocked` so the next JQL cycle skips it. (Belt-and-braces: `bin/start-ticket` does the labelling itself, but the poller can't always tell which refusal it hit, so this is a safety net for any other `start-ticket` exit > 0 — log "labelling claude-blocked due to start-ticket failure".)

### `bin/start-ticket`

- The "no description" refusal at line ~61 currently exits non-zero with no Jira side effect. Add a `bin/lib/jira.sh label-add "$TICKET" claude-blocked` call before exiting. Best-effort: if the label add itself fails (e.g. transient Jira error), log it and still exit non-zero — the poller's safety-net catches it.
- Same treatment for the "Done / Closed" refusal (defensive: the JQL shouldn't surface those, but if it does we don't want to busy-loop).

### `bin/lib/jira.sh`

Add one new subcommand:

```
ready-for-review <KEY> <PR_URL>
```

Behavior:

1. Read worktree-local `.env.compose` (caller's CWD) to get `LAN_HOST`, `NEXT_PORT`, `MINIO_CONSOLE_PORT`, `DDB_PORT`. Resolve `WORKTREE_PATH=$(pwd)` and `BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)`.
2. Compose the comment body in **shell** (not LLM) using a heredoc template — same wording as today's Phase 4e instructions in `.claude/commands/ticket-work.md`.
3. Pipe the body to the existing `jira.sh comment <KEY>` subcommand. Capture exit status.
4. Call `jira.sh transition <KEY> "In Review"`. Capture exit status.
5. Print `OK` to stdout if both succeeded; `PARTIAL: comment=<rc> transition=<rc>` if either failed (non-zero exit, but only after attempting both).

This subcommand is what guarantees the Jira-visible state changes — even if the LLM driving the skill drifts after step 4d, the single helper call either succeeds or fails loudly with a non-zero exit the skill must handle.

### `.claude/commands/ticket-work.md`

- Insert **Phase 0**: `bin/lib/jira.sh transition $TICKET_KEY "In Progress"` (best-effort; warn-and-continue if it fails — the poller may have already done it). Idempotent.
- Replace **Phase 4e + 4f** with one line: `bin/lib/jira.sh ready-for-review $TICKET_KEY <PR_URL>`. The skill text shifts from "compose this comment, post it, then transition" to "run this helper; if it exits non-zero, refuse-back with the helper's stderr as the reason".
- Phase 4g (final summary) reads the helper's exit status to decide what to print.

### One-shot cleanup

- Manually remove `~/.cache/wanderwise-poller/in-flight.txt` entries for `SCRUM-8` and `SCRUM-9` so the poller can re-evaluate them. Not committed code — operator note in the plan.

## Validation strategy

No automated test suite. Validate by direct invocation against a real Jira ticket.

1. **Headless skill smoke test** — manually run `claude -p "/ticket-work" --dangerously-skip-permissions` from a worktree set up by `bin/start-ticket` against a throwaway Jira ticket; verify the PR opens and Jira shows In Progress → In Review with the comment posted. This is the primary integration test; it exercises every changed surface.
2. **`ready-for-review` helper unit smoke** — call `bin/lib/jira.sh ready-for-review <THROWAWAY-KEY> https://example.test/pr/1` from a fixture worktree; verify the comment lands and the transition happens.
3. **No-description refusal labels** — feed `bin/start-ticket` a ticket with empty description; verify `claude-blocked` is added and the next poller cycle skips it.
4. **Project gauntlet** — `npx tsc --noEmit && npm run lint && npm run build` to confirm no incidental damage to the app build (none expected — these are shell + markdown changes).

## Risk and rollback

Low blast radius — all changes are in `bin/` shell scripts and the autonomous skill markdown. Rollback is `git revert` of this branch's PR. No data migrations, no app-code changes, no schema changes.

The one user-visible behavior change is "no-description tickets get a `claude-blocked` label automatically". A human can remove the label after fleshing out the description; the poller will then re-pick. This matches the existing refusal-back semantics from Phase 1 of the skill, just applied at the orchestrator layer.

## Spec self-review

- Every observed failure (SCRUM-8 silent, SCRUM-9 busy loop, in-flight not cleared) is mapped to at least one component change.
- Determinism boundary made explicit: the LLM may drift, the shell wrapper may not — so the wrapper owns the Jira-visible state changes.
- No new dependencies. Reuses existing `jira.sh` subcommands.
- Naming is consistent with existing conventions (`ready-for-review` mirrors `label-add` / `label-remove` style).
