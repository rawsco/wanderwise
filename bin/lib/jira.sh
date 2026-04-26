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
  jira.sh worklog <KEY> [<body>]
  jira.sh transition <KEY> <STATUS>
  jira.sh search <JQL>
  jira.sh label-add <KEY> <LABEL>
  jira.sh label-remove <KEY> <LABEL>
  jira.sh ready-for-review <KEY> <PR_URL>
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
  worklog)
    [ $# -ge 1 ] || usage
    key="$1"
    if [ $# -ge 2 ]; then
      body="$2"
    else
      body=$(cat)
    fi

    # Convert the plain-text body into Atlassian Document Format. The
    # worklog endpoint requires `comment` to be ADF JSON, not plain text
    # like the comment endpoint accepts. Each line becomes a paragraph;
    # blank lines become empty paragraphs.
    adf_doc=$(printf '%s' "$body" | jq -Rs '
      split("\n")
      | (if .[-1] == "" then .[:-1] else . end)
      | map(
          if . == "" then {type:"paragraph"}
          else {type:"paragraph", content:[{type:"text", text:.}]}
          end
        )
      | {type:"doc", version:1, content:.}
    ')

    # Worklog API requires `started` (ISO 8601 with timezone) and
    # `timeSpentSeconds`. We log a nominal 60s — these entries are
    # status notes from automation, not real time tracking.
    started=$(date -u +"%Y-%m-%dT%H:%M:%S.000+0000")

    request_body=$(jq -n --arg started "$started" --argjson comment "$adf_doc" \
      '{started:$started, timeSpentSeconds:60, comment:$comment}')

    claude -p --allowed-tools "$ALLOWED_TOOLS" <<EOF
Use the atlassian-jira MCP server to add a worklog entry to issue $key.

Call jira_post with path "/rest/api/3/issue/$key/worklog" and this exact JSON body:
---BODY---
$request_body
---/BODY---

After posting successfully, reply with the single word "OK".
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
  ready-for-review)
    [ $# -eq 2 ] || usage
    key="$1"
    pr_url="$2"

    if [ ! -f .env.compose ]; then
      echo "ready-for-review: .env.compose not found in $(pwd)" >&2
      exit 1
    fi
    # shellcheck disable=SC1091
    set -a; . ./.env.compose; set +a

    worktree_path=$(pwd)
    branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

    # Compose body with printf rather than $(cat <<EOF) — avoids bash's
    # quirk where apostrophes inside a heredoc nested in $(...) confuse
    # the parser into hunting for an unmatched single quote.
    body=$(printf '%s\n' \
      "PR opened: $pr_url" \
      "" \
      "Local test (LAN-accessible from any machine on this network):" \
      "- Site: https://$LAN_HOST:$NEXT_PORT  (self-signed cert: first hit on each device shows a browser warning, click Advanced -> Proceed)" \
      "- MinIO console: http://$LAN_HOST:$MINIO_CONSOLE_PORT (minioadmin / minioadmin)" \
      "- Dev server log: $worktree_path/.nextdev.log" \
      "" \
      "Worktree on the dev host: $worktree_path" \
      "Branch: $branch_name" \
      "" \
      "When you are done testing, merge the PR — staging auto-deploys via the existing GitHub Actions workflow. Then run bin/finish-ticket $key on the dev host to clean up.")

    worklog_rc=0
    transition_rc=0
    printf '%s' "$body" | "$0" worklog "$key" || worklog_rc=$?
    "$0" transition "$key" "In Review" || transition_rc=$?

    if [ "$worklog_rc" -eq 0 ] && [ "$transition_rc" -eq 0 ]; then
      echo "OK"
    else
      echo "PARTIAL: worklog=$worklog_rc transition=$transition_rc" >&2
      exit 1
    fi
    ;;
  *)
    usage
    ;;
esac
