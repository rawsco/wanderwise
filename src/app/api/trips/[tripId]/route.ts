import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-helpers";
import { TripEntity } from "@/lib/db/trip.entity";
import { StopEntity } from "@/lib/db/stop.entity";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await requireAuth();
    const { tripId } = await params;

    const tripResult = await TripEntity.query.byUser({ userId: user.id }).where(
      ({ tripId: tid }, { eq }) => eq(tid, tripId)
    ).go();

    if (!tripResult.data[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const stopsResult = await StopEntity.query.byTrip({ tripId }).go();

    return NextResponse.json({ ...tripResult.data[0], stops: stopsResult.data });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await requireAuth();
    const { tripId } = await params;
    const body = await req.json();
    const data = updateSchema.parse(body);

    // Authorise the trip belongs to this user before touching anchor stops.
    const owned = await TripEntity.query.byUser({ userId: user.id })
      .where(({ tripId: tid }, { eq }) => eq(tid, tripId))
      .go();
    if (!owned.data[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await TripEntity.update({ userId: user.id, tripId })
      .set({ ...data, updatedAt: new Date().toISOString() })
      .go();

    // If the trip's start/end dates moved, propagate to the anchor stops.
    if (data.startDate || data.endDate) {
      const stopsResult = await StopEntity.query.byTrip({ tripId }).go();
      const updates: Promise<unknown>[] = [];
      for (const stop of stopsResult.data) {
        if (stop.kind === "start" && data.startDate && stop.arrivalDate !== data.startDate) {
          updates.push(
            StopEntity.update({ tripId, stopId: stop.stopId })
              .set({ arrivalDate: data.startDate })
              .go()
          );
        }
        if (stop.kind === "end" && data.endDate && stop.arrivalDate !== data.endDate) {
          updates.push(
            StopEntity.update({ tripId, stopId: stop.stopId })
              .set({ arrivalDate: data.endDate })
              .go()
          );
        }
      }
      await Promise.all(updates);
    }

    return NextResponse.json({ tripId, ...data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await requireAuth();
    const { tripId } = await params;

    await TripEntity.delete({ userId: user.id, tripId }).go();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
