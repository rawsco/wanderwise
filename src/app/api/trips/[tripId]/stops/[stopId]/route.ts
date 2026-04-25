import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-helpers";
import { StopEntity } from "@/lib/db/stop.entity";
import { TripEntity } from "@/lib/db/trip.entity";

const updateSchema = z.object({
  order: z.number().int().min(0).optional(),
  arrivalDate: z.string().optional(),
  departureDate: z.string().optional(),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  bookingStatus: z.enum(["enquiry", "pending", "confirmed"]).optional(),
  name: z.string().optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ tripId: string; stopId: string }> }
) {
  try {
    const user = await requireAuth();
    const { tripId, stopId } = await params;
    const body = await req.json();
    const data = updateSchema.parse(body);

    const [existing, tripResult] = await Promise.all([
      StopEntity.get({ tripId, stopId }).go(),
      TripEntity.query.byUser({ userId: user.id })
        .where(({ tripId: tid }, { eq }) => eq(tid, tripId))
        .go(),
    ]);

    const stop = existing.data;
    const trip = tripResult.data[0];
    if (!stop || !trip) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const kind = stop.kind ?? inferKind(stop.order);

    // Anchor stops: address-editable, but kind-fixed dates managed via trip.
    if (kind === "start" || kind === "end") {
      if (data.arrivalDate || data.departureDate) {
        return NextResponse.json(
          { error: `Edit the trip's ${kind === "start" ? "start" : "end"} date to move this stop.` },
          { status: 400 }
        );
      }
    } else {
      if (data.arrivalDate && trip.startDate && data.arrivalDate < trip.startDate) {
        return NextResponse.json(
          { error: `Arrival date must be on or after the trip start (${trip.startDate}).` },
          { status: 400 }
        );
      }
      if (data.arrivalDate && trip.endDate && data.arrivalDate > trip.endDate) {
        return NextResponse.json(
          { error: `Arrival date must be on or before the trip end (${trip.endDate}).` },
          { status: 400 }
        );
      }
      if (data.departureDate && trip.endDate && data.departureDate > trip.endDate) {
        return NextResponse.json(
          { error: `Departure date must be on or before the trip end (${trip.endDate}).` },
          { status: 400 }
        );
      }
      const newArrival = data.arrivalDate ?? stop.arrivalDate;
      const newDeparture = data.departureDate ?? stop.departureDate;
      if (newArrival && newDeparture && newDeparture < newArrival) {
        return NextResponse.json(
          { error: "Departure date must be on or after arrival." },
          { status: 400 }
        );
      }
    }

    await StopEntity.update({ tripId, stopId }).set(data).go();

    return NextResponse.json({ stopId, tripId, ...data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ tripId: string; stopId: string }> }
) {
  try {
    await requireAuth();
    const { tripId, stopId } = await params;

    const existing = await StopEntity.get({ tripId, stopId }).go();
    const stop = existing.data;
    if (stop && (stop.kind === "start" || stop.kind === "end")) {
      return NextResponse.json(
        { error: "Anchor stops can't be deleted — only edited via the trip." },
        { status: 400 }
      );
    }

    await StopEntity.delete({ tripId, stopId }).go();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

function inferKind(order: number): "start" | "intermediate" | "end" {
  // For pre-`kind` rows, fall back to legacy positional inference.
  if (order === 0) return "start";
  return "intermediate";
}
