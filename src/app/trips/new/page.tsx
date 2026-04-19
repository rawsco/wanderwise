import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ProfileEntity } from "@/lib/db/profile.entity";
import { TripForm } from "@/components/trip/TripForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewTripPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const profilesResult = await ProfileEntity.query.byUser({ userId: session.user.id }).go();

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><CardTitle>Plan a new trip</CardTitle></CardHeader>
        <CardContent>
          <TripForm profiles={profilesResult.data} />
        </CardContent>
      </Card>
    </div>
  );
}
