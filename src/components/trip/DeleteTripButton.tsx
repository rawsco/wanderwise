"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

interface DeleteTripButtonProps {
  tripId: string;
  tripName: string;
  className?: string;
}

export function DeleteTripButton({ tripId, tripName, className }: DeleteTripButtonProps) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Delete "${tripName}"? This permanently removes the trip and all its stops.`)) return;
    await fetch(`/api/trips/${tripId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button
      type="button"
      aria-label="Delete trip"
      onClick={handleDelete}
      className={`inline-flex items-center justify-center h-9 w-9 rounded-md cursor-pointer text-gray-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors ${className ?? ""}`}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
