import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { TripEntity } from "@/lib/db/trip.entity";
import { ensureFreshSummary } from "@/lib/stops";

export const maxDuration = 25;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ tripId: string; stopId: string }> }
) {
  try {
    const user = await requireAuth();
    const { tripId, stopId } = await params;

    const tripResult = await TripEntity.query.byUser({ userId: user.id })
      .where(({ tripId: tid }, { eq }) => eq(tid, tripId))
      .go();
    if (!tripResult.data[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await ensureFreshSummary(tripId, stopId);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
