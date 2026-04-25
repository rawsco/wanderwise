# jira-poller — runtime setup

`bin/jira-poller` is a long-running bash daemon that watches Jira for tickets in **Ready For Claude** without the `claude-blocked` label and runs the autonomous `/ticket-work` flow on each new one.

This directory contains the launchd user-agent plist for installing it as a per-user service on macOS, plus this README.

## Pre-requisites

The dev host running the poller needs everything `bin/start-ticket` requires:

- `claude` CLI on PATH (latest)
- `gh`, `git`, `docker` (with the daemon running), `jq`, `nc`
- `~/.config/claude/atlassian.env` with `ATLASSIAN_SITE_NAME`, `ATLASSIAN_USER_EMAIL`, `ATLASSIAN_API_TOKEN`
- The repo cloned at `~/ClaudeProjects/wanderwise` (or pass `WANDERWISE_DIR` env var to override)

## Install (macOS launchd)

```bash
# 1. Copy the plist into the user LaunchAgents directory.
cp infra/jira-poller/com.wanderwise.jira-poller.plist ~/Library/LaunchAgents/

# 2. Replace REPLACE_HOME with the actual home path. launchd does not expand
#    $HOME inside plist values, so the substitution must be literal.
sed -i '' "s|REPLACE_HOME|$HOME|g" ~/Library/LaunchAgents/com.wanderwise.jira-poller.plist

# 3. Load the agent. -w persists it across reboots.
launchctl load -w ~/Library/LaunchAgents/com.wanderwise.jira-poller.plist
```

Verify it's running:

```bash
launchctl list | grep wanderwise.jira-poller
tail -f ~/Library/Logs/wanderwise-poller.log
```

You should see something like:

```
2026-04-26T12:34:56Z [poller] poller starting (interval 60s, repo /Users/...)
```

## Stop / disable

```bash
launchctl unload -w ~/Library/LaunchAgents/com.wanderwise.jira-poller.plist
```

`-w` here disables the agent so it stays off across reboots.

## Re-enable

```bash
launchctl load -w ~/Library/LaunchAgents/com.wanderwise.jira-poller.plist
```

## Uninstall

```bash
launchctl unload -w ~/Library/LaunchAgents/com.wanderwise.jira-poller.plist
rm ~/Library/LaunchAgents/com.wanderwise.jira-poller.plist
```

## Configuration

All knobs are environment variables on the agent (set in the plist's `EnvironmentVariables` block):

| Variable | Default | Purpose |
|---|---|---|
| `POLL_INTERVAL_SECONDS` | `60` | How often to query Jira. |
| `WANDERWISE_DIR` | `$HOME/ClaudeProjects/wanderwise` | Repo root used to resolve `bin/start-ticket` and worktree siblings. |
| `POLLER_STATE_DIR` | `$HOME/.cache/wanderwise-poller` | Where in-flight tracking and per-ticket logs live. |

Edit the plist, then `launchctl unload && launchctl load`.

## Troubleshooting

**Poller is loaded but nothing happens:**

- Check that the JQL query returns tickets when run by hand:
  ```bash
  bin/lib/jira.sh search 'status = "Ready For Claude" AND (labels is EMPTY OR labels not in (claude-blocked))'
  ```
  If empty, no tickets match — that's fine. The poller is idle.
- Check `~/Library/Logs/wanderwise-poller.log` for errors.

**A ticket got picked but the autonomous session failed:**

- Per-ticket log: `~/.cache/wanderwise-poller/<TICKET>.log`
- The worktree at `../wanderwise-<TICKET>` is left intact for debugging.
- The Jira ticket should have a comment from Claude describing the failure.

**Refused-back ticket keeps getting re-picked:**

- Confirm the `claude-blocked` label is on the ticket: `bin/lib/jira.sh fetch <TICKET> | jq .labels`.
- The autonomous skill applies it as part of refusal-back. If it's missing, the label-add step failed — check the per-ticket log.

**Need to manually requeue a refused ticket:**

- Edit the Jira ticket so the human's input has been added.
- Remove the `claude-blocked` label in the Jira UI (or via `bin/lib/jira.sh label-remove <TICKET> claude-blocked`).
- The poller will re-pick it on the next cycle.

## Why launchd and not systemd / cron?

Target host is macOS. launchd is the native scheduler. Auto-restarts on crash (with throttling), starts at user login, has clean log redirection — equivalent of what you'd want from a systemd service file. If we ever run this on Linux a sibling `infra/jira-poller/jira-poller.service` is straightforward; not built today (YAGNI).
