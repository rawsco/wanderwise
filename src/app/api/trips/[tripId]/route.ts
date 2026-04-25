import { NextResponse } from "next/server";
import { z } from "zod";
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

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
  startLocation: anchorSchema.optional(),
  endLocation: anchorSchema.optional(),
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

    // Trip table only stores trip metadata — strip the anchor location
    // payloads before persisting trip fields; anchor stops are updated
    // separately below.
    const { startLocation, endLocation, ...tripPatch } = data;
    await TripEntity.update({ userId: user.id, tripId })
      .set({ ...tripPatch, updatedAt: new Date().toISOString() })
      .go();

    // Trip-level changes invalidate every stop's cached summary so the
    // next view regenerates against the new context. We clear the
    // summaryHash rather than the summary text, so the user briefly
    // still sees the previous summary before the fresh one swaps in.
    const stopsResult = await StopEntity.query.byTrip({ tripId }).go();
    const stopUpdates: Promise<unknown>[] = [];
    for (const stop of stopsResult.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setFields: Record<string, any> = {};
      let touched = false;

      // Propagate trip date changes to the anchor stops' arrivalDate.
      if (stop.kind === "start" && data.startDate && stop.arrivalDate !== data.startDate) {
        setFields.arrivalDate = data.startDate;
        touched = true;
      }
      if (stop.kind === "end" && data.endDate && stop.arrivalDate !== data.endDate) {
        setFields.arrivalDate = data.endDate;
        touched = true;
      }

      // Apply anchor location changes from the trip edit form.
      if (stop.kind === "start" && startLocation) {
        Object.assign(setFields, startLocation);
        touched = true;
      }
      if (stop.kind === "end" && endLocation) {
        Object.assign(setFields, endLocation);
        touched = true;
      }

      const shouldInvalidate = Boolean(stop.summaryHash);
      if (!touched && !shouldInvalidate) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let chain: any = StopEntity.update({ tripId, stopId: stop.stopId });
      if (Object.keys(setFields).length > 0) chain = chain.set(setFields);
      if (shouldInvalidate) chain = chain.remove(["summaryHash"]);
      stopUpdates.push(chain.go());
    }
    await Promise.all(stopUpdates);

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
