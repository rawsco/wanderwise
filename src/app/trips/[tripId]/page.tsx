import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { TripEntity } from "@/lib/db/trip.entity";
import { StopEntity } from "@/lib/db/stop.entity";
import { ProfileEntity } from "@/lib/db/profile.entity";
import { Button } from "@/components/ui/button";
import { Calendar, Pencil, ArrowLeft } from "lucide-react";
import { TripDetailClient } from "./TripDetailClient";

const typeEmoji: Record<string, string> = { adult: "👤", child: "🧒", dog: "🐶", cat: "🐱" };

export default async function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { tripId } = await params;

  const [tripResult, profilesResult] = await Promise.all([
    TripEntity.query.byUser({ userId: session.user.id })
      .where(({ tripId: tid }, { eq }) => eq(tid, tripId))
      .go(),
    ProfileEntity.query.byUser({ userId: session.user.id }).go(),
  ]);

  const trip = tripResult.data[0];
  if (!trip) notFound();

  const stopsResult = await StopEntity.query.byTrip({ tripId }).go();
  const stops = stopsResult.data.sort((a, b) => a.order - b.order);

  const profileMap = Object.fromEntries(profilesResult.data.map(p => [p.profileId, p]));
  const members = (trip.memberIds ?? []).map(id => profileMap[id]).filter(Boolean);

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
            {members.length > 0 && (
              <span className="flex items-center gap-1.5">
                {members.map(m => (
                  <span key={m.profileId} title={m.name}>{typeEmoji[m.type] ?? "👤"}</span>
                ))}
                <span>{members.map(m => m.name).join(", ")}</span>
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
