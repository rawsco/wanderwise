import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { TripEntity } from "@/lib/db/trip.entity";
import { Navbar } from "./Navbar";

export async function NavbarShell() {
  const session = await getServerSession(authOptions);

  let inProgressCount = 0;
  let inProgressTripId: string | undefined;

  if (session?.user?.id) {
    const today = new Date().toISOString().slice(0, 10);
    const result = await TripEntity.query.byUser({ userId: session.user.id }).go();
    const inProgress = result.data.filter((t) => {
      const start = t.startDate?.slice(0, 10);
      const end = t.endDate?.slice(0, 10);
      return !!start && !!end && start <= today && today <= end;
    });
    inProgressCount = inProgress.length;
    if (inProgressCount === 1) inProgressTripId = inProgress[0].tripId;
  }

  return <Navbar inProgressCount={inProgressCount} inProgressTripId={inProgressTripId} />;
}
