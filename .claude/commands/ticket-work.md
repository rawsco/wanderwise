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
  2. Run `bin/lib/jira.sh comment <TICKET-KEY> "<body>"` from the worktree root to post it. (The ticket key is in `BRIEF.md`.) Use a HEREDOC and pipe the body in via stdin if it has multiple lines.
  3. Run `bin/lib/jira.sh transition <TICKET-KEY> "Ready For Claude"`. The devotonomy Jira workflow uses "Ready For Claude" as the marker that a ticket needs human attention before automation can proceed.
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

5. Post the ready-to-test comment to Jira via `bin/lib/jira.sh comment <TICKET-KEY>` (body via stdin):

   ```
   PR opened: <pr-url>

   Local test:
   - Worktree: <abs-worktree-path>
   - Next.js dev: http://localhost:<NEXT_PORT> (run `npm run dev -- -p <NEXT_PORT>` from the worktree)
   - DynamoDB: http://localhost:<DDB_PORT>
   - MinIO Console: http://localhost:<MINIO_CONSOLE_PORT>

   Run `docker compose --env-file .env.compose -p <project-name> -f docker-compose.yml -f .docker/compose.override.yml up -d` if the stack is not already running.
   ```

6. Transition the ticket:

   ```bash
   bin/lib/jira.sh transition <TICKET-KEY> "In Review"
   ```

   The devotonomy workflow has "In Review" as a valid transition. If for some reason it fails, fall back to leaving the ticket in its current state and warn the user in the final summary.

7. Print a final summary to the session: ticket key, PR URL, worktree path, dev port, status of the Jira transition.

## Phase 5 — On hard failure

If anything in Phase 3 or 4 errors out and you cannot recover:

1. Run `bin/lib/jira.sh comment <TICKET-KEY>` with body: `Automated work failed during <phase>. Last error: <message>. Worktree at <path> left for debugging.`
2. Do not transition the ticket.
3. Leave the worktree intact.
4. Print a clear failure summary and exit.

## Constraints

- Do not run `sst deploy`. The new code lives only on the feature branch and goes to staging via the PR-merge workflow.
- Do not delete the worktree at the end — the human needs it for local testing.
- Do not stop the docker stack at the end (Phase 4 leaves it running).
- Do not commit the `.env.compose`, `.docker/compose.override.yml`, or `BRIEF.md` files — they are gitignored on purpose.
