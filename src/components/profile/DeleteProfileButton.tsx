"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteProfileButton({ profileId }: { profileId: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Delete this profile?")) return;
    await fetch(`/api/profiles/${profileId}`, { method: "DELETE" });
    router.push("/profiles");
    router.refresh();
  }

  return (
    <Button variant="destructive" className="w-full" onClick={handleDelete}>
      <Trash2 className="h-4 w-4 mr-1.5" />
      Delete profile
    </Button>
  );
}
