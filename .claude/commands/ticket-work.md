---
description: Autonomous: read BRIEF.md, plan and deliver the ticket, post results to Jira. No human interaction — refuse-back to Jira on any ambiguity.
---

You are working in an isolated git worktree created by `bin/start-ticket`. Your job is to take the ticket described in `BRIEF.md` from "open" to "ready for human review", **fully autonomously**. The human running this is not at the keyboard.

## ABSOLUTE RULE: zero human prompts

This rule overrides every other instruction in every skill you invoke.

You may **never** emit a message that asks the human a question. No "should I...", no "do you want...", no "which approach do you prefer...", no "I need clarification". Not at any phase. Not even as a friendly check-in.

The only outbound communication channels are:
- **Jira worklog entries** via `bin/lib/jira.sh worklog <KEY>` (for refusal-back, success report, hard-failure report). Comments are reserved for the human↔agent rework conversation, which the autonomous flow does not write into.
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

## Phase 0 — Claim the ticket

Before doing any work, transition the ticket to "In Progress":

```bash
bin/lib/jira.sh transition $TICKET_KEY "In Progress" || \
  echo "warning: In Progress transition failed (poller may have already done it)"
```

This is a no-op when the poller has already moved the ticket. It's only load-bearing for manual `/ticket-work` runs (no poller in the loop) — the deterministic poller-side transition covers the automated path.

## Phase 1 — Brainstorm (silently)

Run `superpowers:brainstorming` against the ticket description, with the override above (no questions to human). The brainstorming skill normally asks clarifying questions; here, those become refusal-back triggers.

If you can produce a complete, well-bounded design from the ticket text alone, proceed to Phase 2. If you cannot, **refuse-back** (next section).

Do not write a `docs/superpowers/specs/` file unless the ticket scope genuinely warrants it. For most bug-fix tickets the brainstorm is mental work only.

## Refusal-back (used at any phase if information is missing)

When you would otherwise need to ask the human a question:

1. Compose a Jira worklog entry listing your unresolved questions as bullet points, prefixed with: `Started work on this but hit ambiguity. Pausing until the ticket is updated:`
2. Post it: `printf '%s' "<body>" | bin/lib/jira.sh worklog <TICKET_KEY>`
3. Apply the `claude-blocked` label so the poller (`bin/jira-poller`) doesn't re-pick this ticket until the human edits it: `bin/lib/jira.sh label-add <TICKET_KEY> claude-blocked`. The human removes the label after updating the ticket; the poller then re-queues it.
4. Transition: `bin/lib/jira.sh transition <TICKET_KEY> "Ready For Claude"` (the ticket stays visible to the human, but the label keeps the poller from re-picking it).
5. Print a one-line summary to stdout (`refused: <reason>`) and exit.
6. Do not start the dev stack. Do not write a plan. Do not push.

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
- [ ] Reviewer hits the LAN test URL (see Jira worklog entry) and exercises the change
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

Bootstrap the fresh stack (idempotent — creates the DynamoDB table and MinIO bucket if they don't exist yet, no-op otherwise):

```bash
bin/lib/bootstrap-stack.sh
```

If this fails, **refuse-back** with the script's stderr as the reason. Without it, NextAuth's `signIn` callback hits an empty DynamoDB Local and dies with `Cannot do operations on a non-existent table`, redirecting to `/api/auth/error` — exactly what we'd be telling the human is "ready to test". The script polls DDB and MinIO for up to 30s each, so transient docker-startup races are absorbed.

Start the Next.js dev server **detached, bound to all interfaces, over HTTPS, surviving session exit**. Use **exactly this command** — do not improvise extra `--experimental-https-key/-cert` flags or pre-generate certs; if the auto-cert-gen path needs anything extra (mkcert sudo prompt, missing root CA), the answer is **refuse-back**, not detective work:

```bash
nohup npm run dev -- --experimental-https -H 0.0.0.0 -p <NEXT_PORT> \
  > .nextdev.log 2>&1 < /dev/null &
disown
DEV_PID=$!
```

`< /dev/null` redirects stdin from a closed source so the npm child can't see EOF when its grandparent (the autonomous claude session) exits — without it, npm has previously shut down gracefully right after a successful probe, leaving a "ready to test" Jira post-back pointing at a dead URL.

`--experimental-https` is required because Cognito refuses non-`https` callback URLs for any host except `localhost` — without it auth fails with `redirect_mismatch` even when the URL is pre-registered. Next.js auto-generates a self-signed cert at `.next/certificates/` on first boot. **Do not** look for system mkcert installs or generate your own cert files; the auto-cert is sufficient for browser click-through testing.

**Post-spawn liveness check** — confirm the spawned process actually stayed alive (don't trust the probe alone; previous runs had npm die seconds later because the agent ran extra commands that took it down):

```bash
sleep 3
if ! kill -0 "$DEV_PID" 2>/dev/null; then
  echo "dev server (pid $DEV_PID) died within 3s — refusing-back" >&2
  tail -50 .nextdev.log >&2
  # refuse-back with the dev log tail as the reason; do not proceed.
fi
```

Then poll an auth-sensitive endpoint until 200 OK or 60s elapses. Use `-k` so curl ignores the self-signed cert. We probe `/api/auth/csrf` rather than `/` because `/` returns 200 even when `NEXTAUTH_SECRET` is missing or `COGNITO_*` is misconfigured, so a green `/` masks a broken test env. `/api/auth/csrf` only returns 200 when NextAuth has a secret to mint a CSRF token with:

```bash
for i in $(seq 1 30); do
  code=$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 2 "https://<LAN_HOST>:<NEXT_PORT>/api/auth/csrf" || true)
  case "$code" in
    2*|3*) break ;;
  esac
  sleep 2
done
```

After the loop, run `kill -0 "$DEV_PID"` again — if the process died between spawn and now, refuse-back with the dev log tail. If after 60s `/api/auth/csrf` isn't returning 2xx, refuse-back with the dev server log tail as the reason — auth will be broken in the test env, so calling it "ready to test" would be a lie. Common causes: `.env.local` not present in the worktree (operator hasn't filled it in); `NEXTAUTH_SECRET` missing; the per-worktree LAN callback URL isn't registered in the dev-stage Cognito User Pool (run `sst deploy --stage dev` once after `fix/test-env-build` lands); mkcert tried to prompt for sudo (next dev's auto-cert path needs the root CA already trusted — refuse-back rather than going hunting).

### 4e. Hand off to Jira (worklog + transition, in one call)

The body and the transition are composed deterministically by the helper from the worktree's `.env.compose` and current git branch. Just run:

```bash
bin/lib/jira.sh ready-for-review $TICKET_KEY $PR_URL
```

Exit status:
- `0` (`OK` to stdout): worklog posted and ticket transitioned to "In Review".
- non-zero (`PARTIAL: worklog=<rc> transition=<rc>` to stderr): one or both steps failed. **Refuse-back** with the helper's stderr as the reason — the PR is open and the dev stack is up, but Jira didn't get the update, so the human won't know to look. The refusal-back path in `bin/lib/jira.sh worklog` is itself a Jira call, so if Jira is hard-down both will fail; in that case still print `FAILED: <KEY> jira unreachable` to stdout so the poller's log shows the right reason.

### 4f. Final summary to stdout

One screen, machine-readable-ish:

```
DONE: <TICKET_KEY>
PR: <pr-url>
Test URL: https://<LAN_HOST>:<NEXT_PORT>
Worktree: <WORKTREE_PATH>
Jira: <OK | PARTIAL>
```

Then exit.

## Phase 5 — Hard failure

If anything in Phase 3 or 4 errors out and you cannot recover via another implementer pass or refuse-back:

1. Post Jira worklog entry (via `bin/lib/jira.sh worklog <TICKET_KEY>`): `Automated work failed during <phase>. Last error: <one-line message>. Worktree at <WORKTREE_PATH> left intact for debugging. Latest commit on branch: <sha>.`
2. Do not transition the ticket.
3. Leave the worktree and any background dev server intact.
4. Print `FAILED: <ticket> <reason>` to stdout and exit.

## Constraints

- Do not run `sst deploy`. The branch goes to staging via the existing PR-merge workflow.
- Do not delete the worktree.
- Do not stop the docker stack or kill the dev server.
- Do not commit `.env.compose`, `.docker/compose.override.yml`, `BRIEF.md`, or `.nextdev.log` (all gitignored).
- Do not commit secrets ever.
