import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { TripEntity } from "@/lib/db/trip.entity";
import { StopEntity } from "@/lib/db/stop.entity";
import { ArrowLeft, MapPin } from "lucide-react";
import { StopDetailClient } from "./StopDetailClient";
import { sortStopsByDate } from "@/lib/stops";
import { getPlaceContact, findPlaceContact } from "@/lib/places";
import type { StopNote } from "@/types/stop";

// Always read fresh — the cached summary updates server-side when
// booking fields change, and we don't want any RSC caching to serve
// the previous summary after that update.
export const dynamic = "force-dynamic";

export default async function StopDetailPage({
  params,
}: {
  params: Promise<{ tripId: string; stopId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { tripId, stopId } = await params;

  const [tripResult, stopsResult] = await Promise.all([
    TripEntity.query.byUser({ userId: session.user.id })
      .where(({ tripId: tid }, { eq }) => eq(tid, tripId))
      .go(),
    StopEntity.query.byTrip({ tripId }).go(),
  ]);

  const trip = tripResult.data[0];
  if (!trip) notFound();

  const allStops = sortStopsByDate(stopsResult.data);
  const stop = allStops.find(s => s.stopId === stopId);
  if (!stop) notFound();

  const stopIndex = allStops.findIndex(s => s.stopId === stopId);
  const isStart = stopIndex === 0;
  const isEnd = stopIndex === allStops.length - 1 && allStops.length > 1;
  if (isStart || isEnd) redirect(`/trips/${tripId}`);
  const stopLabel = `Stop ${stopIndex}`;
  const labelColor = "text-blue-600 bg-blue-50";

  const contact = stop.placeId
    ? await getPlaceContact(stop.placeId)
    : await findPlaceContact(stop.name, stop.address);

  const notes: StopNote[] = (stop.notes as StopNote[] | undefined) ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <Link
          href={`/trips/${tripId}`}
          className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {trip.name}
        </Link>
        <div className="flex items-start gap-3">
          <div>
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1 ${labelColor}`}>
              {stopLabel}
            </span>
            <h1 className="text-2xl font-bold text-gray-900">{stop.name}</h1>
            <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {stop.address}
            </p>
          </div>
        </div>
      </div>

      <StopDetailClient
        stop={{
          stopId: stop.stopId,
          tripId,
          name: stop.name,
          address: stop.address,
          arrivalDate: stop.arrivalDate,
          departureDate: stop.departureDate,
          checkInTime: stop.checkInTime,
          checkOutTime: stop.checkOutTime,
          bookingStatus: stop.bookingStatus as "enquiry" | "pending" | "confirmed" | undefined,
        }}
        initialNotes={notes}
        contact={contact}
        initialSummary={stop.summary}
        initialSummaryGeneratedAt={stop.summaryGeneratedAt}
        initialSummaryHash={stop.summaryHash}
      />
    </div>
  );
}
