import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAuth } from "@/lib/auth-helpers";
import { StopEntity } from "@/lib/db/stop.entity";
import { TripEntity } from "@/lib/db/trip.entity";
import { refreshSummaryIfStale } from "@/lib/stops";

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().optional(),
  arrivalDate: z.string().min(1),
  departureDate: z.string().optional(),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await requireAuth();
    const { tripId } = await params;
    const body = await req.json();
    const data = createSchema.parse(body);

    const tripResult = await TripEntity.query.byUser({ userId: user.id })
      .where(({ tripId: tid }, { eq }) => eq(tid, tripId))
      .go();
    const trip = tripResult.data[0];
    if (!trip) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (trip.startDate && data.arrivalDate < trip.startDate) {
      return NextResponse.json(
        { error: `Arrival date must be on or after the trip start (${trip.startDate}).` },
        { status: 400 }
      );
    }
    if (trip.endDate && data.arrivalDate > trip.endDate) {
      return NextResponse.json(
        { error: `Arrival date must be on or before the trip end (${trip.endDate}).` },
        { status: 400 }
      );
    }
    if (data.departureDate && data.departureDate < data.arrivalDate) {
      return NextResponse.json(
        { error: "Departure date must be on or after arrival." },
        { status: 400 }
      );
    }
    if (trip.endDate && data.departureDate && data.departureDate > trip.endDate) {
      return NextResponse.json(
        { error: `Departure date must be on or before the trip end (${trip.endDate}).` },
        { status: 400 }
      );
    }

    const existing = await StopEntity.query.byTrip({ tripId }).go();
    const order = existing.data.length;
    const stopId = randomUUID();

    await StopEntity.put({
      stopId,
      tripId,
      order,
      kind: "intermediate",
      ...data,
    }).go();

    await refreshSummaryIfStale(tripId, stopId);

    return NextResponse.json(
      { stopId, tripId, order, kind: "intermediate", ...data },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
