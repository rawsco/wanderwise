---
description: Autonomous: read BRIEF.md, plan and deliver the ticket, post results to Jira. No human interaction — refuse-back to Jira on any ambiguity.
---

You are working in an isolated git worktree created by `bin/start-ticket`. Your job is to take the ticket described in `BRIEF.md` from "open" to "ready for human review", **fully autonomously**. The human running this is not at the keyboard.

## ABSOLUTE RULE: zero human prompts

This rule overrides every other instruction in every skill you invoke.

You may **never** emit a message that asks the human a question. No "should I...", no "do you want...", no "which approach do you prefer...", no "I need clarification". Not at any phase. Not even as a friendly check-in.

The only outbound communication channels are:
- **Jira comments** via `bin/lib/jira.sh comment <KEY>` (for refusal-back, success report, hard-failure report)
- **Stdout** to print a final summary just before exit

If at any point you find yourself wanting to ask, **stop** and **refuse-back** (see "Refusal-back" below). Do not invent answers. Do not pick the more conservative option silently. Refuse explicitly.

When invoking other skills (`superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:subagent-driven-development`):
- Treat any "ask the user / get user approval / present design and wait" step in those skills as **automatic refusal-back** if you genuinely lack the information, or **automatic proceed** if you do not.
- Reviewer subagents don't talk to the human — they produce reports you read. That's fine. Keep them.
- Do not invoke `superpowers:requesting-code-review` or any skill whose entire purpose is human review.

## Read the brief

Read `BRIEF.md` at the worktree root. It contains: ticket key, branch name, compose project name, **LAN host IP**, allocated ports, ticket summary, ticket description.

Bind these to working variables in your head:
- `TICKET_KEY`, `BRANCH_NAME`, `PROJECT_NAME`, `LAN_HOST`
- `NEXT_PORT`, `DDB_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`
- `WORKTREE_PATH` (absolute)

Confirm out loud which ticket key you're working on. Then proceed.

## Phase 1 — Brainstorm (silently)

Run `superpowers:brainstorming` against the ticket description, with the override above (no questions to human). The brainstorming skill normally asks clarifying questions; here, those become refusal-back triggers.

If you can produce a complete, well-bounded design from the ticket text alone, proceed to Phase 2. If you cannot, **refuse-back** (next section).

Do not write a `docs/superpowers/specs/` file unless the ticket scope genuinely warrants it. For most bug-fix tickets the brainstorm is mental work only.

## Refusal-back (used at any phase if information is missing)

When you would otherwise need to ask the human a question:

1. Compose a Jira comment listing your unresolved questions as bullet points, prefixed with: `Started work on this but hit ambiguity. Pausing until the ticket is updated:`
2. Post it: `printf '%s' "<body>" | bin/lib/jira.sh comment <TICKET_KEY>`
3. Transition: `bin/lib/jira.sh transition <TICKET_KEY> "Ready For Claude"`
4. Print a one-line summary to stdout (`refused: <reason>`) and exit.
5. Do not start the dev stack. Do not write a plan. Do not push.

## Phase 2 — Plan

Run `superpowers:writing-plans` against the brainstorm. The plan file goes in `docs/superpowers/plans/<DATE>-<ticket-key-lowercase>.md`. Commit it. Do **not** wait for human plan approval.

## Phase 3 — Execute

Run `superpowers:subagent-driven-development` over the plan. The reviewers are subagents (not humans) — that's fine, run them. If a reviewer finds issues, the implementer subagent fixes and re-reviews. Do not pause for human input between tasks.

If a task hits a problem you genuinely cannot resolve from context (third reviewer iteration with the same blocker, plan is wrong), refuse-back rather than guess.

## Phase 4 — Deliver

After all tasks pass review:

### 4a. Validation gauntlet

```bash
npx tsc --noEmit && npm run lint && npm run build
```

All three must pass. If any fail and you cannot fix them in another implementer pass, refuse-back.

### 4b. Push the branch

```bash
git push -u origin <BRANCH_NAME>
```

### 4c. Create the PR

```bash
gh pr create --title "<TICKET_KEY>: <short summary>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets describing the change>

## Linked ticket
<ticket URL from BRIEF.md>

## Test plan
- [ ] Reviewer hits the LAN test URL (see Jira comment) and exercises the change
- [ ] Reviewer confirms no regressions in the surrounding flow

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL printed by `gh`.

### 4d. Start the local stack

Bring up Docker Compose:

```bash
docker compose --env-file .env.compose -p <PROJECT_NAME> \
  -f docker-compose.yml -f .docker/compose.override.yml up -d
```

Start the Next.js dev server **detached, bound to all interfaces, surviving session exit**:

```bash
nohup npm run dev -- -H 0.0.0.0 -p <NEXT_PORT> > .nextdev.log 2>&1 &
disown
```

Wait for it to come up — poll the LAN URL until 200 OK or 60s elapses:

```bash
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://<LAN_HOST>:<NEXT_PORT>/" || true)
  case "$code" in
    2*|3*) break ;;
  esac
  sleep 2
done
```

If after 60s the dev server isn't responding, refuse-back with the dev server log tail as the reason.

### 4e. Post the ready-to-test Jira comment

Body (substitute the placeholders):

```
PR opened: <pr-url>

Local test (LAN-accessible from any machine on this network):
- Site: http://<LAN_HOST>:<NEXT_PORT>
- MinIO console: http://<LAN_HOST>:<MINIO_CONSOLE_PORT> (minioadmin / minioadmin)
- Dev server log: <WORKTREE_PATH>/.nextdev.log

Worktree on the dev host: <WORKTREE_PATH>
Branch: <BRANCH_NAME>

When you're done testing, merge the PR — staging auto-deploys via the existing GitHub Actions workflow. Then run `bin/finish-ticket <TICKET_KEY>` on the dev host to clean up.
```

Post:

```bash
printf '%s' "<body>" | bin/lib/jira.sh comment <TICKET_KEY>
```

### 4f. Transition

```bash
bin/lib/jira.sh transition <TICKET_KEY> "In Review"
```

If "In Review" isn't valid for this ticket's current status, the wrapper will list valid transitions — pick the closest forward-progress one. If nothing reasonable is available, leave the ticket as-is and note that in the final summary (no refusal-back here — the work is done, only the transition is cosmetic).

### 4g. Final summary to stdout

One screen, machine-readable-ish:

```
DONE: <TICKET_KEY>
PR: <pr-url>
Test URL: http://<LAN_HOST>:<NEXT_PORT>
Worktree: <WORKTREE_PATH>
Jira transition: <state>
```

Then exit.

## Phase 5 — Hard failure

If anything in Phase 3 or 4 errors out and you cannot recover via another implementer pass or refuse-back:

1. Post Jira comment: `Automated work failed during <phase>. Last error: <one-line message>. Worktree at <WORKTREE_PATH> left intact for debugging. Latest commit on branch: <sha>.`
2. Do not transition the ticket.
3. Leave the worktree and any background dev server intact.
4. Print `FAILED: <ticket> <reason>` to stdout and exit.

## Constraints

- Do not run `sst deploy`. The branch goes to staging via the existing PR-merge workflow.
- Do not delete the worktree.
- Do not stop the docker stack or kill the dev server.
- Do not commit `.env.compose`, `.docker/compose.override.yml`, `BRIEF.md`, or `.nextdev.log` (all gitignored).
- Do not commit secrets ever.
