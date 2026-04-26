@AGENTS.md

# WanderWise

Trip planning app. Users build trips, add stops on a map, and manage travelling group profiles (people + pets).

## Commands

```bash
# Local dev (requires Docker)
docker compose up -d          # DynamoDB Local (:8000) + MinIO (:9000/console :9001)
npm run dev                   # Next.js + Turbopack on :3000

# Type check / lint
npx tsc --noEmit
npm run lint

# Build
npm run build
```

Copy `.env.local.example` to `.env.local` before running locally and fill in `NEXTAUTH_SECRET` (any `openssl rand -base64 32`) and the `COGNITO_*` values from `sst dev` / AWS Console output.

**For ticket-work worktrees** (LAN-accessible test envs spun up by `bin/start-ticket`): once, set `WANDERWISE_LAN_DEV_HOST=<your-LAN-ip>` and run `sst deploy --stage dev` so worktree ports `3100..3119` are pre-registered as Cognito OAuth callback URLs. The dev server runs over **HTTPS with a self-signed cert** (`next dev --experimental-https`) because Cognito refuses non-`https` callbacks for any host except `localhost`. First time you hit `https://<lan>:<port>` on a new browser/device, click "Advanced → Proceed" past the cert warning; subsequent hits are silent. Without all this, login in the worktree test env fails with either `redirect_mismatch` or "cannot use the HTTP protocol". See `sst.config.ts`.

## Architecture

**Stack:** Next.js 16 App Router · TypeScript · ElectroDB + DynamoDB · NextAuth v4 · Tailwind CSS 4

**Auth:** NextAuth v4 Credentials provider, JWT strategy. `role` and `id` added to the JWT in `src/lib/auth.ts` and exposed on `session.user`. Session type is augmented in `src/types/next-auth.d.ts`.

**Database:** Single DynamoDB table, all entities managed via ElectroDB. Table is auto-created on first request by `src/lib/db/bootstrap.ts`. Local dev uses `DYNAMODB_ENDPOINT` env var pointing to the Docker container.

**Storage:** AWS S3 in production, MinIO locally. Sharp resizes profile avatars into small/medium/large variants server-side before upload. All S3 operations go through `src/lib/s3.ts`.

**Google Maps:** `@vis.gl/react-google-maps` for trip/stop map UI. API key in `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Use the classic `google.maps.places.Autocomplete` API attached to a plain `<input>` ref — **not** the `PlaceAutocompleteElement` web component. The web component uses Shadow DOM which breaks iOS dark mode (can't override `color-scheme`) and takes over the full screen on iOS when focused.

## Key lib files

- `src/lib/db/client.ts` — DynamoDB client config
- `src/lib/db/bootstrap.ts` — table auto-creation on startup
- `src/lib/db/*.entity.ts` — ElectroDB entity definitions (User, Trip, Stop, Profile)
- `src/lib/auth.ts` — NextAuth options + Credentials provider
- `src/lib/auth-helpers.ts` — `requireAuth()` server-side guard for API routes
- `src/lib/s3.ts` — S3/MinIO client, `uploadPhoto`, `getPhotoUrl`
- `src/lib/stops.ts` — stop business logic

## Data model summary

```
User → Trip (members[]) → Stop (lat/lng, dates, booking status)
User → Profile (type: adult|child|dog|cat, avatar small/medium/large, likes/dislikes, birthYear)
```

DynamoDB single-table: all entities share one table. Access patterns are defined in the entity files via ElectroDB indexes — never query DynamoDB directly.

## iOS / mobile rules

- All `<Input>` components use `text-base` (16px minimum) — prevents iOS Safari auto-zoom on focus.
- Viewport export in `layout.tsx` includes `maximumScale: 1, userScalable: false`.
- `next.config.ts` has `allowedDevOrigins: ["192.168.50.20"]` — required for React hydration when accessing the dev server from an iPhone on the local network. Without it, Next.js blocks the HMR websocket and React doesn't hydrate, causing native form submits.
- Date/time inputs on iOS have a minimum intrinsic width. Always put them inside a `min-w-0 overflow-hidden` container with `w-full min-w-0` on the input itself.

## Tailwind CSS — critical rules

**Never use dynamic class lookups for colors.** Tailwind v4 JIT purges any class name that isn't a literal string in the source. Object lookups and ternaries that build class names are purged on fresh compile and appear to work only while the dev-server cache is warm.

Wrong:
```tsx
// Purged on fresh compile — color disappears after restart
className={`h-full ${run.status === "confirmed" ? "bg-emerald-500" : "bg-red-200"}`}
```

Right:
```tsx
// Inline style survives — always use hex for programmatic colors
className="h-full"
style={{ backgroundColor: run.status === "confirmed" ? "#10b981" : "#fecaca" }}
```

This applies to text colors, background colors, border colors — any color that is chosen at runtime.

## Responsive layout — critical rules

`lg` (1024 px) is the **only** breakpoint used to split mobile vs desktop layout. Never change it to `md` or any other value. The pattern used throughout the app:

```tsx
{/* Mobile only */}
<div className="lg:hidden">...</div>

{/* Desktop only */}
<div className="hidden lg:flex">...</div>
```

Changing `lg` to `md` makes the mobile layout bleed onto mid-size desktops and breaks the side-by-side desktop view. Do not change these breakpoints when editing nearby code.

## When things break unexpectedly

Run `npx tsc --noEmit` first. TypeScript compile errors can cause pages to fail silently in dev and the symptom looks like a layout or styling problem. Don't assume Tailwind purging until TypeScript is clean.

## ElectroDB string attributes

ElectroDB returns `string` for string attributes, not the union type defined in the entity. Cast at the boundary where DB data enters a typed component interface:

```ts
bookingStatus: s.bookingStatus as "enquiry" | "pending" | "confirmed" | undefined
```

## Clean up dead props when moving features

When a feature moves to a different page (e.g. booking confirm button moved from StopList to the stop detail page), remove the prop that drove it. Leaving a stale prop with a mismatched type causes a TypeScript error that breaks the build. Check for unused props in any component touched by the move.

## Testing

No test suite yet. Validate changes with:

```bash
npx tsc --noEmit && npm run lint
```
