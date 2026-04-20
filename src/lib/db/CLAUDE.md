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

**Table is auto-created on first request** by `src/lib/db/bootstrap.ts`. No manual setup needed for local dev beyond `docker compose up -d`.
