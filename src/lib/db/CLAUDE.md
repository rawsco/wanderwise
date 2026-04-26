## ElectroDB patterns

**String attributes return `string`, not union types.** If an attribute is defined as `type: "string"` in the entity, ElectroDB infers it as `string | undefined`, not a union like `"enquiry" | "pending" | "confirmed"`. Cast at the boundary where DB data enters a typed component:

```ts
bookingStatus: s.bookingStatus as "enquiry" | "pending" | "confirmed" | undefined
```

To avoid the cast entirely, define enum-like attributes with the array syntax:

```ts
bookingStatus: { type: ["enquiry", "pending", "confirmed"] as const }
```

ElectroDB will then infer the correct union type automatically.

**Query results are always in `.data`.** Every `.go()` call returns `{ data: [...] }` — never the array directly.

```ts
const result = await StopEntity.query.byTrip({ tripId }).go();
const stops = result.data; // Stop[]
```

**Entity key structure.** Stops use `tripId` as PK and `stopId` as SK (see `byTrip` index). Always query stops via `StopEntity.query.byTrip({ tripId })` — never scan the table.

**Table is provisioned by SST** in cloud stages, not at runtime. Per-stage tables (`wanderwise-{stage}`) are defined in `sst.config.ts`.

For local dev with DynamoDB Local (`docker compose up -d`), the table is **not** auto-created. Run `bin/lib/bootstrap-stack.sh` from the repo (or worktree) root after `docker compose up`. The script:
- Polls DynamoDB Local + MinIO for up to 30 s each so transient startup races are absorbed.
- Creates the DynamoDB table (`pk`/`sk` + GSI1) using the same schema as `sst.config.ts`.
- Creates the MinIO bucket.
- Idempotent — re-running treats `ResourceInUseException` / `BucketAlreadyOwnedByYou` as success.

`bin/start-ticket` worktrees: the autonomous skill (`.claude/commands/ticket-work.md` Phase 4d) runs the script automatically after starting Docker, before the dev server. If you spin up a worktree manually, run it yourself.

The symptom if you skip it: login succeeds in Cognito but the auth callback throws `Cannot do operations on a non-existent table` and redirects to `/api/auth/error`.
