# Staging auto-deploy via GitHub Actions

**Status:** Design approved 2026-04-25
**Branch:** `ci/staging-auto-deploy`

## Goal

Automate the path from "PR merged" to "staging is up to date" so we stop hand-running `sst deploy --stage staging` after every merge. Add a PR validation gate so a PR can't be merged until typecheck, lint, and build all pass.

Production tag-deploy is **out of scope** — added later as `v*` tags → `sst deploy --stage production`.

## Scope

In scope:
- GitHub Actions workflow that validates every PR (`tsc + lint + build`).
- GitHub Actions workflow that deploys to the `staging` SST stage on every push to `main`.
- AWS-side OIDC trust + IAM role, codified in SST so they're version-controlled.

Out of scope (follow-ups):
- Production tag-deploy workflow.
- Tightening IAM permissions from `PowerUserAccess` to a custom policy.
- Branch protection rules (manual GitHub UI configuration).
- Deploy notifications (Slack/email).

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐
│ PR opened/updated   │ ──► │ .github/workflows/       │
│ (any branch → main) │     │   pr-validate.yml        │
└─────────────────────┘     │                          │
                            │ jobs: typecheck, lint,   │
                            │       build (parallel)   │
                            └──────────────────────────┘
                                   ▲ no AWS auth needed

┌─────────────────────┐     ┌──────────────────────────┐
│ PR merged to main   │ ──► │ .github/workflows/       │
│ (push to main)      │     │   deploy-staging.yml     │
└─────────────────────┘     │                          │
                            │ 1. install               │
                            │ 2. assume role via OIDC  │
                            │ 3. sst deploy            │
                            │    --stage staging       │
                            └──────────────────────────┘
                                   │
                                   ▼ assumes
                            ┌──────────────────────────┐
                            │ IAM role:                │
                            │ GitHubActionsDeploy      │
                            │ (created by SST in       │
                            │  infra/github-oidc.ts)   │
                            └──────────────────────────┘
```

## Component 1 — `.github/workflows/pr-validate.yml`

**Triggers:** `pull_request` → `main` (`opened`, `synchronize`, `reopened`).

**Concurrency:** `group: pr-validate-${{ github.ref }}`, `cancel-in-progress: true`. Pushing to a PR cancels the in-flight validation for that PR. Safe — no AWS side effects.

**Jobs (parallel, all required):**

| Job | Command | Notes |
|---|---|---|
| `typecheck` | `npx tsc --noEmit` | Fast (~20s), fails first |
| `lint` | `npm run lint` | Fast (~10s) |
| `build` | `npm run build` | Slowest (~1–3 min) |

**Shared per-job setup:**
1. `actions/checkout@v4`
2. `actions/setup-node@v4` — Node 20, `cache: npm`
3. `npm ci`

**No secrets, no AWS auth.**

## Component 2 — `.github/workflows/deploy-staging.yml`

**Triggers:**
- `push` → `main`
- `workflow_dispatch` (manual re-run button)

**Permissions (top-level):**
```yaml
permissions:
  id-token: write   # required for OIDC
  contents: read
```

**Concurrency:** `group: deploy-staging`, `cancel-in-progress: false`. Queue deploys; never cancel mid-flight (CloudFormation can get stuck in `UPDATE_IN_PROGRESS`).

**Single job, `ubuntu-latest`, 30 min timeout:**

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 20, cache: npm }
  - run: npm ci
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::646300308181:role/GitHubActionsDeploy
      aws-region: eu-west-2
  - run: npx sst deploy --stage staging
```

The role ARN is read from a GitHub Actions repo variable `AWS_DEPLOY_ROLE_ARN` (`${{ vars.AWS_DEPLOY_ROLE_ARN }}`), not hardcoded in the workflow. Keeps the YAML environment-agnostic and avoids an extra commit if the ARN ever changes.

`sst deploy` invokes OpenNext which runs `next build` itself — no separate build step needed.

## Component 3 — `infra/github-oidc.ts`

A new SST module imported from `sst.config.ts`, deployed only when `stage === "staging"`.

### Resources created

**1. IAM OIDC identity provider** (one per AWS account, idempotent)
- URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`
- Thumbprint list: AWS now validates the OIDC token signature itself, so the thumbprint is largely cosmetic, but the Pulumi AWS provider still accepts it. Include the well-known GitHub thumbprint (`6938fd4d98bab03faadb97b34396831e3780aea1`) for compatibility; Pulumi will accept an empty list too if the provider version is recent enough — pick whichever the current SST/Pulumi versions accept without warning.
- Idempotency: an OIDC provider for `token.actions.githubusercontent.com` may already exist in account `646300308181` from another project. Implementation pattern: call `aws.iam.getOpenIdConnectProvider({ url: "..." })` first; if it resolves, reference its ARN; if it throws "not found", create one. Document the lookup-vs-create branch in the module.

**2. IAM role `GitHubActionsDeploy`**

Trust policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "<oidc-provider-arn>" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": [
          "repo:rawsco/wanderwise:ref:refs/heads/main",
          "repo:rawsco/wanderwise:environment:staging"
        ]
      }
    }
  }]
}
```

The two `sub` patterns cover (a) pushes to `main` and (b) `workflow_dispatch` runs that target a `staging` GitHub environment. (We'll create the `staging` GitHub environment as part of implementation; this also gives us a place to add manual approval later if we want one.)

Permissions: `PowerUserAccess` (AWS-managed) + a small inline policy granting `iam:CreateRole`, `iam:AttachRolePolicy`, `iam:DetachRolePolicy`, `iam:DeleteRole`, `iam:PassRole`, `iam:GetRole`, `iam:PutRolePolicy`, `iam:DeleteRolePolicy`, `iam:TagRole`, `iam:UntagRole` so SST can manage Lambda execution roles.

**Trade-off accepted:** `PowerUserAccess` is broad. The "right" answer is a custom enumerated policy. Tightening this is a tracked follow-up. The trust policy already restricts *who* can assume the role to runs originating from this repo's `main` branch.

### Wiring into `sst.config.ts`

Inside `run()`:
```ts
if (stage === "staging") {
  await import("./infra/github-oidc");
}
```

The module exports nothing at runtime; it just creates the resources via Pulumi side-effects. Role ARN is exposed as an SST output for copying into the workflow / repo variable.

## Bootstrap & rollout order

This is a one-time setup, performed by the maintainer on their laptop after merging this branch.

1. Merge `ci/staging-auto-deploy` to `main`.
2. `AWS_PROFILE=wanderwise npx sst deploy --stage staging` locally — creates the OIDC provider + role.
3. Copy the role ARN from SST output.
4. In GitHub: Settings → Secrets and variables → Actions → Variables tab → set `AWS_DEPLOY_ROLE_ARN` to the role ARN.
5. (Optional, recommended) Settings → Environments → create `staging` environment. No protection rules required initially.
6. Trigger a no-op push to `main` (or use `workflow_dispatch`) to confirm the deploy workflow runs end-to-end.
7. Settings → Branches → Add rule for `main`: require status checks `typecheck`, `lint`, `build` to pass before merge.

## Validation

We'll consider implementation complete when:
- `npx tsc --noEmit && npm run lint && npm run build` passes locally with all new files in place.
- `sst.config.ts` typechecks against the new `infra/github-oidc.ts` import.
- Both workflow YAML files pass `actionlint` (or fail with only stylistic warnings).
- A throwaway PR against this branch triggers `pr-validate.yml` and the three required checks appear.

## Files touched

- `.github/workflows/pr-validate.yml` (new)
- `.github/workflows/deploy-staging.yml` (new)
- `infra/github-oidc.ts` (new)
- `sst.config.ts` (small edit — conditional import)

## Open questions

None — all design choices made during brainstorming on 2026-04-25.
