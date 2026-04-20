<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Agent rules for WanderWise

## Validation — run before marking any task done

```bash
npx tsc --noEmit && npm run lint && npm run build
```

All three must pass. There is no test suite yet.

## DynamoDB / ElectroDB

- **Never use the AWS SDK DynamoDB clients directly.** Always go through the ElectroDB entity files in `src/lib/db/*.entity.ts`.
- **Never hardcode the table name.** It comes from the `DYNAMODB_TABLE_NAME` environment variable.
- **Never add a top-level attribute to an entity** without updating the ElectroDB schema in that entity file — unregistered attributes will be silently ignored on reads.
- ElectroDB queries return `{ data, cursor }` — always destructure `.data`.
- New access patterns require a new GSI defined in the entity file, not an ad-hoc `scan`.

## Auth

- Every API route **must** call `requireAuth()` from `src/lib/auth-helpers.ts` before touching data.
- Never expose `password` (hash) in any API response — exclude it explicitly.
- Never trust session data passed from the client; always read from the server-side session.

## Image uploads

- Always go through helpers in `src/lib/s3.ts` — never call S3 directly.
- Sharp resizing (small/medium/large) must happen server-side, before the upload.
- Never store image data in DynamoDB; store only the S3 key or public URL.

## API routes

- Follow the existing REST conventions: `GET /api/trips`, `POST /api/trips`, `GET /api/trips/[id]`, etc.
- Return consistent error shapes: `{ error: string }` with appropriate HTTP status codes.
- Keep database logic out of route handlers — put it in `src/lib/` files.

## Components

- UI primitives live in `src/components/ui/` — reuse before creating new ones.
- Server components are the default in App Router. Only add `"use client"` when genuinely needed (interactivity, browser APIs, hooks).
- Use `SessionProvider` (already in `src/app/providers.tsx`) for client-side session access; don't wrap it again.

## What not to do

- Don't run `npm install` without confirming with the user first.
- Don't add a state management library (Redux, Zustand, etc.) — the project uses component-level state and NextAuth context.
- Don't add a new ORM or DB client — ElectroDB is the data layer.
- Don't create a Dockerfile or CI config unless explicitly asked.
