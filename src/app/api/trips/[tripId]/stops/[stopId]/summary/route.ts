import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { StopEntity } from "@/lib/db/stop.entity";
import { TripEntity } from "@/lib/db/trip.entity";
import { ProfileEntity } from "@/lib/db/profile.entity";
import { generateStopSummary } from "@/lib/stop-summary";
import type { StopNote } from "@/types/stop";

export const maxDuration = 25;

function nightsBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ tripId: string; stopId: string }> }
) {
  try {
    const user = await requireAuth();
    const { tripId, stopId } = await params;

    const [stopResult, tripResult] = await Promise.all([
      StopEntity.get({ tripId, stopId }).go(),
      TripEntity.query.byUser({ userId: user.id })
        .where(({ tripId: tid }, { eq }) => eq(tid, tripId))
        .go(),
    ]);

    const stop = stopResult.data;
    const trip = tripResult.data[0];
    if (!stop || !trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const memberIds = trip.memberIds ?? [];
    let members: { name: string; type: string; yearOfBirth?: number }[] = [];
    if (memberIds.length > 0) {
      const profilesResult = await ProfileEntity.query.byUser({ userId: user.id }).go();
      const profileMap = Object.fromEntries(profilesResult.data.map(p => [p.profileId, p]));
      members = memberIds
        .map(id => profileMap[id])
        .filter(Boolean)
        .map(p => ({ name: p.name, type: p.type, yearOfBirth: p.yearOfBirth }));
    }

    const nights = stop.arrivalDate && stop.departureDate
      ? nightsBetween(stop.arrivalDate, stop.departureDate)
      : undefined;

    const notes = (stop.notes as StopNote[] | undefined)?.map(n => ({
      text: n.text,
      createdAt: n.createdAt,
    }));

    const summary = await generateStopSummary({
      name: stop.name,
      address: stop.address,
      arrivalDate: stop.arrivalDate,
      departureDate: stop.departureDate,
      checkInTime: stop.checkInTime,
      checkOutTime: stop.checkOutTime,
      nights,
      bookingStatus: stop.bookingStatus as "enquiry" | "pending" | "confirmed" | undefined,
      notes,
      members,
    });

    const generatedAt = new Date().toISOString();
    await StopEntity.update({ tripId, stopId })
      .set({ summary, summaryGeneratedAt: generatedAt })
      .go();

    return NextResponse.json({ summary, summaryGeneratedAt: generatedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
