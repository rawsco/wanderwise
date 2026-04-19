import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { TripEntity } from "@/lib/db/trip.entity";
import { ProfileEntity } from "@/lib/db/profile.entity";
import { TripForm } from "@/components/trip/TripForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function EditTripPage({ params }: { params: Promise<{ tripId: string }> }) {
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

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><CardTitle>Edit trip</CardTitle></CardHeader>
        <CardContent>
          <TripForm
            tripId={tripId}
            profiles={profilesResult.data}
            defaultValues={{
              name: trip.name,
              description: trip.description,
              startDate: trip.startDate?.split("T")[0],
              endDate: trip.endDate?.split("T")[0],
              memberIds: trip.memberIds ?? [],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
