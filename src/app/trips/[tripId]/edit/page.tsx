import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { TripEntity } from "@/lib/db/trip.entity";
import { TripForm } from "@/components/trip/TripForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function EditTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { tripId } = await params;

  const result = await TripEntity.query
    .byUser({ userId: session.user.id })
    .where(({ tripId: tid }, { eq }) => eq(tid, tripId))
    .go();

  const trip = result.data[0];
  if (!trip) notFound();

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Edit trip</CardTitle>
        </CardHeader>
        <CardContent>
          <TripForm
            tripId={tripId}
            defaultValues={{
              name: trip.name,
              description: trip.description,
              startDate: trip.startDate?.split("T")[0],
              endDate: trip.endDate?.split("T")[0],
              adults: trip.adults,
              dogs: trip.dogs,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
