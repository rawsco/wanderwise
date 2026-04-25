import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAuth } from "@/lib/auth-helpers";
import { TripEntity } from "@/lib/db/trip.entity";
import { StopEntity } from "@/lib/db/stop.entity";

const anchorSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  memberIds: z.array(z.string()).default([]),
  startLocation: anchorSchema,
  endLocation: anchorSchema,
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
    const { startLocation, endLocation, ...trip } = createSchema.parse(body);

    const tripId = randomUUID();
    const now = new Date().toISOString();

    await TripEntity.put({
      tripId,
      userId: user.id,
      ...trip,
      createdAt: now,
      updatedAt: now,
    }).go();

    await Promise.all([
      StopEntity.put({
        tripId,
        stopId: randomUUID(),
        order: 0,
        kind: "start",
        arrivalDate: trip.startDate,
        ...startLocation,
      }).go(),
      StopEntity.put({
        tripId,
        stopId: randomUUID(),
        order: 1,
        kind: "end",
        arrivalDate: trip.endDate,
        ...endLocation,
      }).go(),
    ]);

    return NextResponse.json({ tripId, userId: user.id, ...trip }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
