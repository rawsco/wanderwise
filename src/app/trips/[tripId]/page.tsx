import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { TripEntity } from "@/lib/db/trip.entity";
import { StopEntity } from "@/lib/db/stop.entity";
import { TripMap } from "@/components/trip/TripMap";
import { StopList } from "@/components/stop/StopList";
import { StopSearch } from "@/components/stop/StopSearch";
import { DriveSegments } from "@/components/stop/DriveSegments";
import { Button } from "@/components/ui/button";
import { Calendar, Users, Dog, Pencil, ArrowLeft } from "lucide-react";
import { TripDetailClient } from "./TripDetailClient";

export default async function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { tripId } = await params;

  const tripResult = await TripEntity.query
    .byUser({ userId: session.user.id })
    .where(({ tripId: tid }, { eq }) => eq(tid, tripId))
    .go();

  const trip = tripResult.data[0];
  if (!trip) notFound();

  const stopsResult = await StopEntity.query.byTrip({ tripId }).go();
  const stops = stopsResult.data.sort((a, b) => a.order - b.order);

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <Link href="/trips" className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> All trips
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{trip.name}</h1>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
            {(trip.startDate || trip.endDate) && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {trip.startDate ? new Date(trip.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "TBD"}
                {" – "}
                {trip.endDate ? new Date(trip.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "TBD"}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {trip.adults} {trip.adults === 1 ? "adult" : "adults"}
            </span>
            {(trip.dogs ?? 0) > 0 && (
              <span className="flex items-center gap-1.5">
                <Dog className="h-4 w-4" />
                {trip.dogs} {trip.dogs === 1 ? "dog" : "dogs"}
              </span>
            )}
          </div>
        </div>
        <Link href={`/trips/${tripId}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        </Link>
      </div>

      <TripDetailClient tripId={tripId} initialStops={stops} />
    </div>
  );
}
