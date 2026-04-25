#!/usr/bin/env bash
# bin/lib/jira.sh — thin wrappers around the atlassian-jira MCP server.
#
# Subcommands:
#   fetch <KEY>                   → JSON to stdout: {summary, description,
#                                                    status, assignee, labels, url}
#   comment <KEY> [<body>]        Post a comment. Body from $2 or stdin.
#   transition <KEY> <STATUS>     Transition the issue to a status by name.
#   search <JQL>                  → newline-delimited list of issue keys.
#   label-add <KEY> <LABEL>       Add a label to an issue.
#   label-remove <KEY> <LABEL>    Remove a label from an issue.
#
# Requires `claude` on PATH and the atlassian-jira MCP server configured
# in .mcp.json. Atlassian creds sourced from ~/.config/claude/atlassian.env
# if present (caller may have already sourced them).
set -euo pipefail

ATLASSIAN_ENV="$HOME/.config/claude/atlassian.env"
if [ -f "$ATLASSIAN_ENV" ] && [ -z "${ATLASSIAN_API_TOKEN:-}" ]; then
  set -a; . "$ATLASSIAN_ENV"; set +a
fi

# Tool allowlist passed to `claude -p` so the headless calls don't trip
# on permission prompts. Matches the tool names in .claude/settings.local.json.
ALLOWED_TOOLS="mcp__atlassian-jira__jira_get,mcp__atlassian-jira__jira_post,mcp__atlassian-jira__jira_put,mcp__atlassian-jira__jira_patch,mcp__atlassian-jira__jira_delete"

usage() {
  cat >&2 <<EOF
Usage:
  jira.sh fetch <KEY>
  jira.sh comment <KEY> [<body>]
  jira.sh transition <KEY> <STATUS>
  jira.sh search <JQL>
  jira.sh label-add <KEY> <LABEL>
  jira.sh label-remove <KEY> <LABEL>
EOF
  exit 2
}

cmd=${1:-}
shift || usage

case "$cmd" in
  fetch)
    [ $# -eq 1 ] || usage
    key="$1"
    claude -p --allowed-tools "$ALLOWED_TOOLS" <<EOF
Use the atlassian-jira MCP server to fetch Jira issue $key.

Output ONLY a single line of compact JSON with these exact keys:
{"summary":"...","description":"...","status":"...","assignee":"...","labels":[],"url":"..."}

Do not wrap in code fences. Do not add commentary. If a field is empty,
use an empty string (or empty array for labels). Use the full URL of the
ticket including the workspace, like https://devotonomy.atlassian.net/browse/$key.
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
    claude -p --allowed-tools "$ALLOWED_TOOLS" <<EOF
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
    claude -p --allowed-tools "$ALLOWED_TOOLS" <<EOF
Use the atlassian-jira MCP server to transition issue $key to the status named "$status".
First call jira_get with path "/rest/api/3/issue/$key/transitions" to list available transitions.
Then call jira_post with path "/rest/api/3/issue/$key/transitions" and body {"transition":{"id":"<id>"}}
using the transition id that matches the status name "$status".
After transitioning successfully, reply with the single word "OK". If the named status is
not a valid transition for this issue, list the valid transition names instead (do not error).
EOF
    ;;
  search)
    [ $# -eq 1 ] || usage
    jql="$1"
    claude -p --allowed-tools "$ALLOWED_TOOLS" <<EOF
Use the atlassian-jira MCP server to search Jira with this JQL: $jql

Call jira_get with path "/rest/api/3/search/jql" and a query string of
\`jql=<url-encoded JQL>&fields=summary&maxResults=50\`. (jira_get accepts
\`queryParams\` as an object — use that.)

Output ONLY the issue keys, one per line, no commentary, no JSON, no
prefixes. If there are no matches, output nothing.
EOF
    ;;
  label-add)
    [ $# -eq 2 ] || usage
    key="$1"
    label="$2"
    claude -p --allowed-tools "$ALLOWED_TOOLS" <<EOF
Use the atlassian-jira MCP server to add the label "$label" to Jira issue $key.

Call jira_put with path "/rest/api/3/issue/$key" and body
{"update":{"labels":[{"add":"$label"}]}}.

After succeeding, reply with the single word "OK".
EOF
    ;;
  label-remove)
    [ $# -eq 2 ] || usage
    key="$1"
    label="$2"
    claude -p --allowed-tools "$ALLOWED_TOOLS" <<EOF
Use the atlassian-jira MCP server to remove the label "$label" from Jira issue $key.

Call jira_put with path "/rest/api/3/issue/$key" and body
{"update":{"labels":[{"remove":"$label"}]}}.

After succeeding, reply with the single word "OK".
EOF
    ;;
  *)
    usage
    ;;
esac
