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
