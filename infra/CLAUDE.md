## Deployment notes (SST + OpenNext + AWS)

### Sharp on Lambda — non-obvious

Sharp ships native bindings keyed to `os/cpu/libc`. `npm install` on a
macOS dev host pulls `sharp-darwin-arm64`, so the bundle that ships
to a `linux-x64` Lambda has no usable binary and the photo route
500s.

The install step in `open-next.config.ts` is what gets it right.
Two specific gotchas:

1. **Use `additionalArgs: "--cpu=x64"`, not `arch: "x64"`.** OpenNext
   3.9 emits the deprecated `npm --arch=...` flag, which modern npm
   silently ignores — it then resolves to the host's CPU
   (`linux-arm64` on Apple Silicon dev boxes), not Lambda's.
2. **Set `libc: "glibc"`.** Without it, `@img/sharp-libvips-linux-x64`
   refuses to install with `EBADPLATFORM`. OpenNext pipes stdio so the
   failure is silent; you only find out at runtime.

To verify the bundle is right after a deploy:

```bash
ls .open-next/server-functions/default/node_modules/@img/
# expect: sharp-linux-x64 and sharp-libvips-linux-x64
```

### Turbopack vs webpack for builds

`serverExternalPackages: ["sharp"]` in `next.config.ts` is honoured
correctly by **webpack** but **not by Turbopack** — Turbopack rewrites
externals to hashed module IDs (`sharp-20c6a5da84e2135f`) that don't
exist on disk at runtime.

`package.json`'s build script uses `next build --webpack` for this
reason. `next dev` still uses Turbopack (faster HMR). If you switch
back to Turbopack for builds, native deps that need to stay external
will break the same way Sharp did.

### Lambda reserved env vars

`AWS_REGION` is reserved by the Lambda runtime — setting it via
`environment` in `sst.aws.Nextjs` fails the deploy with
`InvalidParameterValueException`. Lambda populates it automatically;
only set custom region vars (e.g. `BEDROCK_REGION`, `S3_REGION`,
`COGNITO_REGION`) if your code reads from them.

### Cognito Managed Login

The Cognito hosted UI has two versions:

- **Classic** — older, limited CSS injection.
- **Managed Login** — modern, themable via a JSON settings blob.

To serve Managed Login, **both** of these must be set:

- `aws.cognito.UserPoolDomain` with `managedLoginVersion: 2`
- `aws.cognito.ManagedLoginBranding` resource attached to the
  user pool client

Without `managedLoginVersion: 2`, the branding resource exists but
the classic UI is still served — it looks like nothing changed.

The settings JSON in `infra/cognito-branding-settings.json` is the
default Cognito theme with the AWS-blue palette swapped for emerald.
To regenerate after a Cognito schema change:

```bash
aws cognito-idp describe-managed-login-branding \
  --user-pool-id ... \
  --managed-login-branding-id ... \
  --return-merged-resources \
  --query 'ManagedLoginBranding.Settings'
```

### Cognito sign-out

`signOut()` from NextAuth only clears the local session cookie. The
Cognito hosted-UI session persists, so the next sign-in click silently
re-authenticates. Always use `signOutFully()` from
`src/lib/cognito-signout.ts`, which chains a redirect to Cognito's
`/logout` endpoint. Requires `NEXT_PUBLIC_COGNITO_DOMAIN` and
`NEXT_PUBLIC_COGNITO_CLIENT_ID` to be exposed to the browser.

### Cognito redirect URIs

Cognito refuses non-`localhost` HTTP callback URLs — only
`localhost` is exempted from the HTTPS requirement. LAN-IP
testing (e.g. iPhone hitting `http://192.168.x.x:3000`) needs HTTPS
locally (mkcert or a tunnel) before it'll work against any
Cognito pool.

### S3 bucket for user uploads

`sst.aws.Bucket` defaults to private. Avatar URLs returned by
`getObjectUrl()` are direct S3 (`https://{bucket}.s3.{region}.amazonaws.com/...`),
which 403 from the browser unless the bucket has a public-read
policy. Set `access: "public"` on the bucket — the upload itself
uses the Lambda's IAM role (no public write).

### Debugging "it just failed" in cloud

API routes that catch errors with `console.error(err)` and return a
generic 500 (e.g. the photo route's "Upload failed") are opaque from
the browser. CloudWatch is the source of truth:

```bash
aws logs tail /aws/lambda/wanderwise-{stage}-WebServerEuwest2Function-XXX \
  --since 5m \
  --filter-pattern '?Error ?Cannot ?denied' \
  --profile wanderwise \
  | grep -v "DEP0169\|trace-deprecation"
```

The deprecation noise grep is needed because Node 24's `url.parse`
warning floods every invocation with red ERROR-tagged lines that
aren't actually errors.

### AWS CLI auth + SST

SST/Pulumi reads credentials from the standard AWS SDK chain. The
AWS CLI's `login` credential type used by Kiro IDE is NOT in that
chain — `aws sts get-caller-identity` works but `sst deploy` fails
with `no EC2 IMDS role found`.

Fix: configure a normal SSO profile (`[profile wanderwise]` with
`sso_session = ...` block in `~/.aws/config`), `aws sso login --profile
wanderwise` once a session, and reference it in `sst.config.ts`:

```ts
providers: { aws: { region: REGION, profile: "wanderwise" } }
```

The SSO start URL lives in the Cognito-style portal redirect — find
via `curl -sI https://d-XXXXXX.awsapps.com/start` and look for
`portal.sso.{region}.amazonaws.com` in the response headers if you
need to discover the SSO region.
