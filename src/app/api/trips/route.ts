import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAuth } from "@/lib/auth-helpers";
import { TripEntity } from "@/lib/db/trip.entity";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  adults: z.number().int().min(1).default(1),
  dogs: z.number().int().min(0).default(0),
});

export async function GET() {
  try {
    const user = await requireAuth();
    const result = await TripEntity.query.byUser({ userId: user.id }).go();
    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const data = createSchema.parse(body);

    const tripId = randomUUID();
    const now = new Date().toISOString();

    await TripEntity.put({
      tripId,
      userId: user.id,
      ...data,
      createdAt: now,
      updatedAt: now,
    }).go();

    return NextResponse.json({ tripId, userId: user.id, ...data }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
