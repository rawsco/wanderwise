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
        aws: { region: REGION, profile: "wanderwise" },
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

    const media = isCloudStage ? new sst.aws.Bucket("Media") : undefined;

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

    const callbackUrls = stageDomain
      ? [`https://${stageDomain.name}/api/auth/callback/cognito`]
      : ["http://localhost:3000/api/auth/callback/cognito"];

    const logoutUrls = stageDomain
      ? [`https://${stageDomain.name}`]
      : ["http://localhost:3000"];

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
      },
    });

    return {
      url: appUrl,
      cognitoIssuer,
    };
  },
});
