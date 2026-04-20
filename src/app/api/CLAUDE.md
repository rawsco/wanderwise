## API route patterns

**Every route starts with `requireAuth()`.** It throws on an unauthenticated request; the outer catch returns 401. Always the first line in the try block:

```ts
const user = await requireAuth(); // throws → caught → 401
```

**Validate the request body with Zod.** Define a schema, call `.parse(body)`, catch `ZodError` → 400:

```ts
const data = schema.parse(await req.json());
// ...
} catch (err) {
  if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Note: the catch block handles both auth errors and Zod errors. Auth errors fall through the `ZodError` check and always return 401, which is correct.

**Use enum validation in Zod for union string fields.** Even though the ElectroDB entity stores `bookingStatus` as `string`, the API route validates it as an enum:

```ts
bookingStatus: z.enum(["enquiry", "pending", "confirmed"]).optional()
```

This is the guard that prevents invalid values reaching the DB.
