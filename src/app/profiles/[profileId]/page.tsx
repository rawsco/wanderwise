import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ProfileEntity } from "@/lib/db/profile.entity";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { AvatarUploader } from "@/components/profile/AvatarUploader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteProfileButton } from "@/components/profile/DeleteProfileButton";
import { getObjectUrl } from "@/lib/s3";

export default async function EditProfilePage({ params }: { params: Promise<{ profileId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { profileId } = await params;
  const result = await ProfileEntity.query.byUser({ userId: session.user.id })
    .where(({ profileId: pid }, { eq }) => eq(pid, profileId))
    .go();

  const profile = result.data[0];
  if (!profile) notFound();

  const avatarLgUrl = profile.avatarLg ? getObjectUrl(profile.avatarLg) : null;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <Card>
        <CardHeader><CardTitle>Edit profile</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <AvatarUploader
            profileId={profileId}
            name={profile.name}
            type={profile.type}
            currentSrc={avatarLgUrl}
          />
          <ProfileForm
            profileId={profileId}
            defaultValues={{
              name: profile.name,
              type: profile.type,
              age: profile.age,
              notes: profile.notes,
              likes: profile.likes ?? [],
              dislikes: profile.dislikes ?? [],
            }}
          />
        </CardContent>
      </Card>
      <DeleteProfileButton profileId={profileId} />
    </div>
  );
}
