import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { TripEntity } from "@/lib/db/trip.entity";
import { StopEntity } from "@/lib/db/stop.entity";
import { ProfileEntity } from "@/lib/db/profile.entity";
import { TripCard } from "@/components/trip/TripCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function TripsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const [tripsResult, profilesResult] = await Promise.all([
    TripEntity.query.byUser({ userId: session.user.id }).go(),
    ProfileEntity.query.byUser({ userId: session.user.id }).go(),
  ]);

  const profileMap = Object.fromEntries(profilesResult.data.map(p => [p.profileId, p]));

  const tripsWithDetails = await Promise.all(
    tripsResult.data.map(async (trip) => {
      const stops = await StopEntity.query.byTrip({ tripId: trip.tripId }).go();
      const members = (trip.memberIds ?? []).map(id => profileMap[id]).filter(Boolean);
      return { ...trip, stopCount: stops.data.length, members };
    })
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Trips</h1>
        <Link href="/trips/new">
          <Button><Plus className="h-4 w-4 mr-1.5" />New trip</Button>
        </Link>
      </div>

      {tripsWithDetails.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 mb-4">No trips yet. Start planning your first adventure!</p>
          <Link href="/trips/new">
            <Button><Plus className="h-4 w-4 mr-1.5" />Plan a trip</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tripsWithDetails.map(trip => (
            <TripCard
              key={trip.tripId}
              tripId={trip.tripId}
              name={trip.name}
              description={trip.description}
              startDate={trip.startDate}
              endDate={trip.endDate}
              members={trip.members}
              stopCount={trip.stopCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}
