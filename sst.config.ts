// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

const REGION = "eu-west-2";

const STAGE_DOMAINS: Record<string, { name: string; zone: string }> = {
  staging: {
    name: "wanderwise-staging.weewanderers.co.uk",
    zone: "Z011832317BZMZRCUQPIJ",
  },
  production: {
    name: "wanderwise.weewanderers.co.uk",
    zone: "Z0116626S7NZFG5U50OJ",
  },
};

export default $config({
  app(input) {
    return {
      name: "wanderwise",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage ?? ""),
      home: "aws",
      providers: {
        // Locally we authenticate via the `wanderwise` SSO profile. In CI
        // (GitHub Actions) credentials are injected as env vars by
        // aws-actions/configure-aws-credentials and there is no profile —
        // the SDK picks them up automatically when no profile is set.
        aws: {
          region: REGION,
          ...(process.env.CI ? {} : { profile: "wanderwise" }),
        },
      },
    };
  },
  async run() {
    const fs = await import("fs");
    const path = await import("path");

    const brandingSettings = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "infra/cognito-branding-settings.json"),
        "utf8",
      ),
    );

    const stage = $app.stage;
    const isCloudStage = stage === "staging" || stage === "production";
    const stageDomain = STAGE_DOMAINS[stage];

    // ---- Storage (cloud stages only — dev uses Docker DynamoDB Local + MinIO) ----
    const table = isCloudStage
      ? new sst.aws.Dynamo("Table", {
          fields: {
            pk: "string",
            sk: "string",
            gsi1pk: "string",
            gsi1sk: "string",
          },
          primaryIndex: { hashKey: "pk", rangeKey: "sk" },
          globalIndexes: {
            GSI1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
          },
        })
      : undefined;

    const media = isCloudStage
      ? new sst.aws.Bucket("Media", { access: "public" })
      : undefined;

    // ---- Auth (every stage gets its own Cognito pool) ----
    const userPool = new sst.aws.CognitoUserPool("UserPool", {
      usernames: ["email"],
      transform: {
        userPool: (args) => {
          args.autoVerifiedAttributes = ["email"];
          args.passwordPolicies = {
            minimumLength: 8,
            requireLowercase: true,
            requireUppercase: true,
            requireNumbers: true,
            requireSymbols: false,
          };
        },
      },
    });

    // Hosted UI domain (Cognito prefix; globally unique).
    // Adds a stage-prefixed subdomain under amazoncognito.com.
    // managedLoginVersion: 2 enables the modern Managed Login experience.
    new aws.cognito.UserPoolDomain("UserPoolDomain", {
      userPoolId: userPool.id,
      domain: `wanderwise-${stage}`,
      managedLoginVersion: 2,
    });

    // Per-worktree dev servers (spawned by bin/start-ticket) bind to a LAN
    // IP so other devices can hit them. Cognito does an exact-match check
    // on redirect_uri AND requires https for any host other than localhost
    // (`InvalidParameterException: cannot use the HTTP protocol`). The
    // worktree dev server therefore runs `next dev --experimental-https`
    // (driven by .claude/commands/ticket-work.md Phase 4d) which serves a
    // self-signed cert; testers click through the browser warning once per
    // device per origin.
    //
    // Set WANDERWISE_LAN_DEV_HOST to your machine's LAN IP (e.g.
    // 192.168.50.155) before running `sst deploy --stage dev` so worktree
    // ports 3100..3119 are accepted as OAuth redirect targets. The range
    // matches what bin/lib/ports.sh allocates from (base 3100). Without
    // this, auth in the worktree test env fails with redirect_mismatch.
    const lanDevHost = process.env.WANDERWISE_LAN_DEV_HOST;
    const devCallbackUrls = [
      "http://localhost:3000/api/auth/callback/cognito",
      ...(lanDevHost
        ? Array.from(
            { length: 20 },
            (_, i) =>
              `https://${lanDevHost}:${3100 + i}/api/auth/callback/cognito`,
          )
        : []),
    ];
    const devLogoutUrls = [
      "http://localhost:3000",
      ...(lanDevHost
        ? Array.from(
            { length: 20 },
            (_, i) => `https://${lanDevHost}:${3100 + i}`,
          )
        : []),
    ];

    const callbackUrls = stageDomain
      ? [`https://${stageDomain.name}/api/auth/callback/cognito`]
      : devCallbackUrls;

    const logoutUrls = stageDomain
      ? [`https://${stageDomain.name}`]
      : devLogoutUrls;

    const userPoolClient = userPool.addClient("WebClient", {
      transform: {
        client: (args) => {
          args.callbackUrls = callbackUrls;
          args.logoutUrls = logoutUrls;
          args.generateSecret = true;
          args.allowedOauthFlows = ["code"];
          args.allowedOauthFlowsUserPoolClient = true;
          args.allowedOauthScopes = ["email", "openid", "profile"];
          args.supportedIdentityProviders = ["COGNITO"];
          args.explicitAuthFlows = [
            "ALLOW_USER_SRP_AUTH",
            "ALLOW_REFRESH_TOKEN_AUTH",
          ];
        },
      },
    });

    // ---- Managed Login branding (WanderWise theme) ----
    new aws.cognito.ManagedLoginBranding("UserPoolBranding", {
      userPoolId: userPool.id,
      clientId: userPoolClient.id,
      settings: JSON.stringify(brandingSettings),
    });

    // ---- Outputs (always shown after deploy) ----
    const cognitoIssuer = $interpolate`https://cognito-idp.${REGION}.amazonaws.com/${userPool.id}`;

    if (!isCloudStage) {
      // Dev stage: nothing else to provision. Surface the Cognito values so the
      // user can drop them into .env.local for `npm run dev`.
      return {
        COGNITO_CLIENT_ID: userPoolClient.id,
        COGNITO_CLIENT_SECRET: userPoolClient.secret,
        COGNITO_ISSUER: cognitoIssuer,
        COGNITO_REGION: REGION,
      };
    }

    // ---- Cloud-only resources below ----

    // Secrets — set via `npx sst secret set NextAuthSecret <value>` etc.
    const nextAuthSecret = new sst.Secret("NextAuthSecret");
    const googleMapsKey = new sst.Secret("GoogleMapsApiKey");

    const appUrl = `https://${stageDomain!.name}`;

    new sst.aws.Nextjs("Web", {
      domain: {
        name: stageDomain!.name,
        dns: sst.aws.dns({ zone: stageDomain!.zone }),
      },
      link: [table!, media!, nextAuthSecret, googleMapsKey],
      permissions: [
        {
          actions: ["bedrock:InvokeModel"],
          resources: [
            "arn:aws:bedrock:*::foundation-model/amazon.nova-*",
            "arn:aws:bedrock:*::foundation-model/anthropic.claude-*",
          ],
        },
      ],
      environment: {
        AI_PROVIDER: "bedrock",
        BEDROCK_REGION: REGION,
        BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
        DYNAMODB_TABLE_NAME: table!.name,
        S3_BUCKET: media!.name,
        S3_REGION: REGION,
        COGNITO_REGION: REGION,
        COGNITO_CLIENT_ID: userPoolClient.id,
        COGNITO_CLIENT_SECRET: userPoolClient.secret,
        COGNITO_ISSUER: cognitoIssuer,
        NEXT_PUBLIC_COGNITO_DOMAIN: `wanderwise-${stage}.auth.${REGION}.amazoncognito.com`,
        NEXT_PUBLIC_COGNITO_CLIENT_ID: userPoolClient.id,
        NEXTAUTH_URL: appUrl,
        NEXTAUTH_SECRET: nextAuthSecret.value,
        // NEXT_PUBLIC_ vars must be in `environment` (not just `link`) so
        // Next.js can inline them into the client bundle at build time.
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: googleMapsKey.value,
      },
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
  },
});
