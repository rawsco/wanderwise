import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><CardTitle>Add a profile</CardTitle></CardHeader>
        <CardContent><ProfileForm /></CardContent>
      </Card>
    </div>
  );
}
