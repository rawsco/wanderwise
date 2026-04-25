# Staging Auto-Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate staging deploys by adding two GitHub Actions workflows (PR validation + auto-deploy on merge to `main`) and an SST-managed IAM OIDC role so GitHub can authenticate to AWS without long-lived secrets.

**Architecture:** Two workflow files in `.github/workflows/` plus a new SST infra module (`infra/github-oidc.ts`) wired into `sst.config.ts` only when the stage is `staging`. PR validation runs `tsc + lint + build` in parallel; merge-to-main triggers `sst deploy --stage staging` after assuming an IAM role via OIDC.

**Tech Stack:** GitHub Actions, AWS OIDC, SST v3 (Pulumi-based), `aws-actions/configure-aws-credentials@v4`, Node 20.

**Spec:** `docs/superpowers/specs/2026-04-25-staging-auto-deploy-design.md`

**Branch:** `ci/staging-auto-deploy` (already created and on `HEAD` for this work).

---

## Project context for the implementer

This project has **no test suite**. The validation command of record is:

```bash
npx tsc --noEmit && npm run lint && npm run build
```

That command must pass after every code-affecting task. There is no `npm test`. Where the TDD-style "write failing test first" pattern doesn't fit (workflow YAML, infra-as-code that creates real AWS resources), this plan substitutes:

- **`npx tsc --noEmit`** for any TypeScript file you create or change
- **`actionlint`** for any GitHub Actions workflow YAML (install on demand: `brew install actionlint`; if unavailable, use `node -e 'require("yaml").parse(...)'` or `npx yaml-lint <file>` as a sanity fallback)
- **`npm run lint && npm run build`** at the end of the work to confirm nothing else broke

SST v3 makes `aws` and `pulumi` available as globals inside `sst.config.ts` and any file imported from it via `await import(...)` — **do not add `import * as aws from "@pulumi/aws"`**. The triple-slash reference `/// <reference path="./.sst/platform/config.d.ts" />` at the top of `sst.config.ts` provides those types; new infra modules need the same reference.

Do **not** run `sst deploy` as part of executing this plan. The deploy is a separate bootstrap step the user runs on their own laptop after the branch merges (see Task 5). Running `sst deploy` from the agent would create real AWS resources without authorization.

---

## File structure

| Path | New / Modify | Responsibility |
|---|---|---|
| `infra/github-oidc.ts` | New | Look up or create the GitHub OIDC identity provider in IAM; create the `GitHubActionsDeploy` IAM role with trust policy + permissions; export the role ARN. |
| `sst.config.ts` | Modify | Conditionally `await import("./infra/github-oidc")` when `stage === "staging"`; surface role ARN in stage outputs. |
| `.github/workflows/pr-validate.yml` | New | Three parallel jobs (typecheck, lint, build) on every PR targeting `main`. |
| `.github/workflows/deploy-staging.yml` | New | Single job: assume role via OIDC and run `sst deploy --stage staging` on push to `main` (and on `workflow_dispatch`). |

---

## Task 1: Create the SST OIDC infra module

**Files:**
- Create: `infra/github-oidc.ts`

**Why first:** Everything else (workflows, bootstrap) depends on this role existing in AWS. Get the typecheck-clean infra code in place before the workflows that reference it.

- [ ] **Step 1: Create `infra/github-oidc.ts` with the lookup-or-create OIDC provider and the role.**

```ts
/// <reference path="../.sst/platform/config.d.ts" />

const OIDC_URL = "https://token.actions.githubusercontent.com";
const GITHUB_REPO = "rawsco/wanderwise";

// AWS no longer requires a thumbprint to validate the OIDC token signature
// (it does this server-side now), but the Pulumi AWS provider still accepts
// the field. Include the well-known GitHub thumbprint for compatibility.
const GITHUB_OIDC_THUMBPRINT = "6938fd4d98bab03faadb97b34396831e3780aea1";

export async function setupGitHubOidc() {
  // Look up an existing OIDC provider for GitHub Actions. The provider is
  // a singleton per AWS account — if another project in this account has
  // already created one we must reference it instead of trying to create
  // a duplicate (which fails).
  const existing = await aws.iam
    .getOpenIdConnectProvider({ url: OIDC_URL })
    .catch(() => null);

  const providerArn = existing
    ? existing.arn
    : new aws.iam.OpenIdConnectProvider("GitHubOIDC", {
        url: OIDC_URL,
        clientIdLists: ["sts.amazonaws.com"],
        thumbprintLists: [GITHUB_OIDC_THUMBPRINT],
      }).arn;

  const role = new aws.iam.Role("GitHubActionsDeploy", {
    name: "GitHubActionsDeploy",
    description:
      "Assumed by GitHub Actions via OIDC to deploy the staging stage of WanderWise.",
    assumeRolePolicy: $jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Federated: providerArn },
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: {
            StringEquals: {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            },
            StringLike: {
              "token.actions.githubusercontent.com:sub": [
                `repo:${GITHUB_REPO}:ref:refs/heads/main`,
                `repo:${GITHUB_REPO}:environment:staging`,
              ],
            },
          },
        },
      ],
    }),
  });

  // PowerUserAccess covers the bulk of what SST needs (CloudFormation,
  // Lambda, S3, DynamoDB, CloudFront, Cognito, Route53, ACM, etc.) but
  // explicitly excludes IAM. SST creates Lambda execution roles, so we
  // need to grant just enough IAM separately. Tightening this is a
  // tracked follow-up — see the design spec.
  new aws.iam.RolePolicyAttachment("GitHubActionsDeployPowerUser", {
    role: role.name,
    policyArn: "arn:aws:iam::aws:policy/PowerUserAccess",
  });

  new aws.iam.RolePolicy("GitHubActionsDeployIam", {
    role: role.name,
    policy: $jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "iam:AttachRolePolicy",
            "iam:CreateRole",
            "iam:CreateServiceLinkedRole",
            "iam:DeleteRole",
            "iam:DeleteRolePolicy",
            "iam:DetachRolePolicy",
            "iam:GetRole",
            "iam:GetRolePolicy",
            "iam:ListAttachedRolePolicies",
            "iam:ListRolePolicies",
            "iam:PassRole",
            "iam:PutRolePolicy",
            "iam:TagRole",
            "iam:UntagRole",
            "iam:UpdateAssumeRolePolicy",
          ],
          Resource: "*",
        },
      ],
    }),
  });

  return { roleArn: role.arn };
}
```

Notes on the code:
- `$jsonStringify` is an SST global helper that handles `Output<T>` values — using `JSON.stringify` directly on `providerArn` (a Pulumi `Output`) would serialize the proxy object, not the resolved string.
- The triple-slash reference path is `../.sst/platform/config.d.ts` — *one extra `..`* compared to `sst.config.ts` because this file is one level deeper.
- The lookup-or-create pattern means re-running `sst deploy --stage staging` after the provider exists is a no-op for the provider itself; only the role lifecycle is managed by this stack.

- [ ] **Step 2: Typecheck.**

Run: `npx tsc --noEmit`
Expected: Exit 0, no errors. Specifically verify that `infra/github-oidc.ts` doesn't appear in any error output.

If `aws` or `$jsonStringify` is reported as undefined, the triple-slash reference path is wrong — confirm `../.sst/platform/config.d.ts` resolves from the file's location.

- [ ] **Step 3: Commit.**

```bash
git add infra/github-oidc.ts
git commit -m "feat(infra): add GitHub Actions OIDC role module"
```

---

## Task 2: Wire `infra/github-oidc.ts` into `sst.config.ts`

**Files:**
- Modify: `sst.config.ts` (add staging-only import + extend stage outputs)

- [ ] **Step 1: Add the conditional import after the `Nextjs` block, before the final `return`.**

Find the existing block (currently at `sst.config.ts:145-176`):

```ts
    new sst.aws.Nextjs("Web", {
      // ... existing config ...
    });

    return {
      url: appUrl,
      cognitoIssuer,
    };
```

Replace it with:

```ts
    new sst.aws.Nextjs("Web", {
      // ... existing config (unchanged) ...
    });

    // ---- CI/CD: GitHub Actions OIDC role (staging only) ----
    // Production tag-deploy is a planned follow-up and will need its own
    // role with a different trust-policy `sub` condition.
    let githubActionsRoleArn: $util.Output<string> | undefined;
    if (stage === "staging") {
      const { setupGitHubOidc } = await import("./infra/github-oidc");
      const oidc = await setupGitHubOidc();
      githubActionsRoleArn = oidc.roleArn;
    }

    return {
      url: appUrl,
      cognitoIssuer,
      ...(githubActionsRoleArn ? { githubActionsRoleArn } : {}),
    };
```

Notes:
- Leave the `Nextjs(...)` config exactly as it is — only add the OIDC block between it and the `return`.
- `$util.Output` is the SST/Pulumi global type alias for `pulumi.Output`. If TypeScript complains, use `Output<string>` (also globally available via the SST reference) or just drop the explicit type and let inference handle it: `let githubActionsRoleArn: Awaited<ReturnType<typeof setupGitHubOidc>>["roleArn"] | undefined;`.
- The conditional spread on the return object keeps the dev-stage and production-stage shapes unchanged.

- [ ] **Step 2: Typecheck.**

Run: `npx tsc --noEmit`
Expected: Exit 0.

If the type of `githubActionsRoleArn` causes friction, simplest fallback:

```ts
let githubActionsRoleArn: ReturnType<typeof setupGitHubOidc> extends Promise<infer R>
  ? R["roleArn"]
  : never | undefined;
```

…is overkill. Prefer the inferred form by deleting the type annotation entirely:

```ts
let githubActionsRoleArn;
if (stage === "staging") {
  const { setupGitHubOidc } = await import("./infra/github-oidc");
  ({ roleArn: githubActionsRoleArn } = await setupGitHubOidc());
}
```

- [ ] **Step 3: Lint.**

Run: `npm run lint`
Expected: Exit 0, no errors related to `sst.config.ts`. (ESLint may not lint this file at all — that's fine.)

- [ ] **Step 4: Commit.**

```bash
git add sst.config.ts
git commit -m "feat(infra): wire GitHub OIDC module into staging stage"
```

---

## Task 3: Create the PR validation workflow

**Files:**
- Create: `.github/workflows/pr-validate.yml`

- [ ] **Step 1: Create the directory if it doesn't exist.**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write the workflow file.**

Path: `.github/workflows/pr-validate.yml`

```yaml
name: PR validate

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

concurrency:
  group: pr-validate-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint

  build:
    name: Build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
```

Notes:
- All three jobs are independent and run in parallel — no `needs:` dependencies.
- The job *names* (`Typecheck`, `Lint`, `Build`) are what GitHub branch-protection sees. The user will reference these names when configuring required checks.
- `npm run build` invokes `next build --webpack` (per `package.json`). 15-minute timeout is generous; typical run is 1–3 minutes.
- No AWS auth, no secrets — `permissions: { contents: read }` is the minimum for `actions/checkout`.

- [ ] **Step 3: Validate the YAML.**

Run: `actionlint .github/workflows/pr-validate.yml`
Expected: Exit 0, no output.

If `actionlint` is not installed:
- Fallback A: `brew install actionlint` (macOS), then re-run.
- Fallback B: `npx --package=yaml -- node -e 'console.log(require("yaml").parse(require("fs").readFileSync(".github/workflows/pr-validate.yml","utf8")))'` — this only checks YAML parsing, not workflow semantics.

Either is acceptable; actionlint is preferred.

- [ ] **Step 4: Commit.**

```bash
git add .github/workflows/pr-validate.yml
git commit -m "ci: add PR validation workflow (typecheck, lint, build)"
```

---

## Task 4: Create the staging deploy workflow

**Files:**
- Create: `.github/workflows/deploy-staging.yml`

- [ ] **Step 1: Write the workflow file.**

Path: `.github/workflows/deploy-staging.yml`

```yaml
name: Deploy staging

on:
  push:
    branches: [main]
  workflow_dispatch:

# OIDC requires id-token: write. contents: read is enough for checkout.
permissions:
  id-token: write
  contents: read

# Queue deploys; never cancel a deploy mid-flight — CloudFormation can
# end up stuck in UPDATE_IN_PROGRESS if a stack update is interrupted.
concurrency:
  group: deploy-staging
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy to staging
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: eu-west-2

      - name: Deploy
        run: npx sst deploy --stage staging
```

Notes:
- `environment: staging` ties this run to the GitHub `staging` environment, which matches one of the two `sub` patterns in the IAM trust policy. The user will create the `staging` environment in the GitHub UI as part of bootstrap (Task 5).
- `${{ vars.AWS_DEPLOY_ROLE_ARN }}` reads from a *repo variable* (Settings → Secrets and variables → Actions → Variables). It is *not* a secret — role ARNs aren't sensitive — but storing it as a variable keeps it out of the YAML.
- No `--yes` / `--force` flag needed; `sst deploy` is non-interactive in CI by default.
- The `Deploy` step name is explicit so it's easy to identify in the run log.

- [ ] **Step 2: Validate the YAML.**

Run: `actionlint .github/workflows/deploy-staging.yml`
Expected: Exit 0.

(Same fallback options as Task 3 if `actionlint` is unavailable.)

- [ ] **Step 3: Commit.**

```bash
git add .github/workflows/deploy-staging.yml
git commit -m "ci: add staging deploy workflow with OIDC AWS auth"
```

---

## Task 5: Final validation and bootstrap notes

**Files:**
- None (validation only).

- [ ] **Step 1: Run the full project validation gauntlet.**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: All three commands exit 0. The `build` step runs `next build --webpack` and must succeed end-to-end.

If any of them fail, do *not* proceed. Triage:
- `tsc` errors → almost certainly in `infra/github-oidc.ts` or `sst.config.ts`. Re-read Task 1 / Task 2.
- `lint` errors → ESLint may not cover `infra/` and `sst.config.ts`; if it does and complains, fix in place.
- `build` errors → unrelated to this work *unless* `sst.config.ts` has a syntax error that breaks the Next.js config import chain. Roll back the `sst.config.ts` change, re-run, and bisect.

- [ ] **Step 2: Confirm the four files exist with the right shapes.**

```bash
ls -la infra/github-oidc.ts \
        .github/workflows/pr-validate.yml \
        .github/workflows/deploy-staging.yml
git diff main -- sst.config.ts | head -40
```

Expected:
- The three new files all exist.
- `git diff main -- sst.config.ts` shows only the OIDC block addition + return-shape extension (no unrelated changes).

- [ ] **Step 3: Push the branch.**

```bash
git push -u origin ci/staging-auto-deploy
```

- [ ] **Step 4: Append the bootstrap runbook to the spec.**

This is the runbook the user follows *after* merging the branch. The spec already contains it, but cross-link from the plan so it's discoverable when someone re-reads the plan. No file edit required — just confirm the user knows the next steps:

1. Merge `ci/staging-auto-deploy` to `main` via PR.
2. On their laptop: `AWS_PROFILE=wanderwise npx sst deploy --stage staging`. This first run creates the OIDC provider (if needed) and the IAM role.
3. Copy the `githubActionsRoleArn` output from the SST CLI.
4. In GitHub: Settings → Secrets and variables → Actions → **Variables** tab → New repository variable: name `AWS_DEPLOY_ROLE_ARN`, value = the ARN from step 3.
5. In GitHub: Settings → Environments → New environment → name `staging`. No protection rules required at this stage.
6. Trigger a verification run: Actions → "Deploy staging" → Run workflow on `main`. Confirm the OIDC handshake works and `sst deploy` completes.
7. Settings → Branches → Branch protection rule for `main` → require status checks: `Typecheck`, `Lint`, `Build`.

- [ ] **Step 5: Open the PR.**

If `gh` CLI is available (the user did not have it installed at brainstorm time — verify):

```bash
gh pr create --base main --head ci/staging-auto-deploy \
  --title "ci: automate staging deploys via GitHub Actions" \
  --body "$(cat <<'EOF'
## Summary
- Add PR validation workflow (typecheck, lint, build).
- Add staging deploy workflow triggered on push to main.
- Add SST-managed IAM OIDC role so GitHub Actions can deploy without long-lived AWS keys.

See `docs/superpowers/specs/2026-04-25-staging-auto-deploy-design.md` for the full design and `docs/superpowers/plans/2026-04-25-staging-auto-deploy.md` for the implementation breakdown.

## Test plan
- [ ] CI runs `pr-validate.yml` against this PR — three checks (Typecheck, Lint, Build) all pass.
- [ ] After merge, deploy bootstrap (see plan Task 5) is performed by the maintainer.
- [ ] First `Deploy staging` run completes successfully on a follow-up commit to main.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

If `gh` is not installed, the URL `https://github.com/rawsco/wanderwise/pull/new/ci/staging-auto-deploy` will be printed by the `git push` in Step 3 — open it in a browser and use the same title/body manually.

---

## Spec self-review (notes from plan author)

Coverage check against the spec sections:

- **Architecture diagram (spec §Architecture)** — covered by Tasks 1–4 producing the four files in the diagram.
- **Component 1: pr-validate.yml** — Task 3.
- **Component 2: deploy-staging.yml** — Task 4.
- **Component 3: infra/github-oidc.ts** — Task 1, with sst.config.ts wiring in Task 2.
- **Bootstrap order (spec §Bootstrap & rollout order)** — Task 5 Step 4 lists each step; this is operator work, not agent work.
- **Validation (spec §Validation)** — Task 5 Step 1 (full gauntlet) + per-task `tsc` and `actionlint` runs.

No spec section is left without a task. No placeholders found on the second pass. Function/method names are consistent (`setupGitHubOidc` → `oidc.roleArn` → output key `githubActionsRoleArn`).
