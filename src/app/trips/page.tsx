import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { TripEntity } from "@/lib/db/trip.entity";
import { StopEntity } from "@/lib/db/stop.entity";
import { TripCard } from "@/components/trip/TripCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function TripsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const tripsResult = await TripEntity.query.byUser({ userId: session.user.id }).go();
  const trips = tripsResult.data;

  const tripsWithStopCounts = await Promise.all(
    trips.map(async (trip) => {
      const stops = await StopEntity.query.byTrip({ tripId: trip.tripId }).go();
      return { ...trip, stopCount: stops.data.length };
    })
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Trips</h1>
        <Link href="/trips/new">
          <Button>
            <Plus className="h-4 w-4 mr-1.5" />
            New trip
          </Button>
        </Link>
      </div>

      {tripsWithStopCounts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 mb-4">No trips yet. Start planning your first adventure!</p>
          <Link href="/trips/new">
            <Button>
              <Plus className="h-4 w-4 mr-1.5" />
              Plan a trip
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tripsWithStopCounts.map(trip => (
            <TripCard
              key={trip.tripId}
              tripId={trip.tripId}
              name={trip.name}
              description={trip.description}
              startDate={trip.startDate}
              endDate={trip.endDate}
              adults={trip.adults ?? 1}
              dogs={trip.dogs ?? 0}
              stopCount={trip.stopCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}
