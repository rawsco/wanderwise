import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAuth } from "@/lib/auth-helpers";
import { StopEntity } from "@/lib/db/stop.entity";

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().optional(),
  arrivalDate: z.string().optional(),
  departureDate: z.string().optional(),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    await requireAuth();
    const { tripId } = await params;
    const body = await req.json();
    const data = createSchema.parse(body);

    const existing = await StopEntity.query.byTrip({ tripId }).go();
    const order = existing.data.length;
    const stopId = randomUUID();

    await StopEntity.put({ stopId, tripId, order, ...data }).go();

    return NextResponse.json({ stopId, tripId, order, ...data }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
