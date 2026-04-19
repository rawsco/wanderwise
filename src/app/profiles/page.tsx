import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ProfileEntity } from "@/lib/db/profile.entity";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function ProfilesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const result = await ProfileEntity.query.byUser({ userId: session.user.id }).go();
  const profiles = result.data;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Travelling group</h1>
          <p className="text-sm text-gray-500 mt-0.5">Profiles for everyone coming along</p>
        </div>
        <Link href="/profiles/new">
          <Button>
            <Plus className="h-4 w-4 mr-1.5" />
            Add profile
          </Button>
        </Link>
      </div>

      {profiles.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 mb-4">No profiles yet. Add your family and pets to personalise your trips.</p>
          <Link href="/profiles/new">
            <Button><Plus className="h-4 w-4 mr-1.5" />Add first profile</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map(p => (
            <ProfileCard
              key={p.profileId}
              profileId={p.profileId}
              name={p.name}
              type={p.type}
              age={p.age}
              notes={p.notes}
              likes={p.likes ?? []}
              dislikes={p.dislikes ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
