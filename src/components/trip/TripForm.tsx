"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Profile {
  profileId: string;
  name: string;
  type: string;
}

const typeEmoji: Record<string, string> = { adult: "👤", child: "🧒", dog: "🐶", cat: "🐱" };

interface TripFormProps {
  tripId?: string;
  defaultValues?: Partial<FormValues & { memberIds: string[] }>;
  profiles: Profile[];
}

export function TripForm({ tripId, defaultValues, profiles }: TripFormProps) {
  const router = useRouter();
  const [memberIds, setMemberIds] = useState<string[]>(defaultValues?.memberIds ?? []);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues,
  });

  function toggleMember(id: string) {
    setMemberIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  }

  async function onSubmit(data: FormValues) {
    const url = tripId ? `/api/trips/${tripId}` : "/api/trips";
    const method = tripId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, memberIds }),
    });
    if (res.ok) {
      const trip = await res.json();
      router.push(`/trips/${tripId ?? trip.tripId}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Trip name</Label>
        <Input id="name" placeholder="e.g. Scottish Highlands Adventure" {...register("name")} />
        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Input id="description" placeholder="A quick summary of the trip" {...register("description")} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="startDate">Start date</Label>
          <Input id="startDate" type="date" {...register("startDate")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endDate">End date</Label>
          <Input id="endDate" type="date" {...register("endDate")} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Who&apos;s coming?</Label>
        {profiles.length === 0 ? (
          <p className="text-xs text-gray-400">
            No profiles yet.{" "}
            <a href="/profiles/new" className="text-emerald-600 hover:underline">Add your travelling group</a> first.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {profiles.map(p => (
              <label key={p.profileId} className="cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={memberIds.includes(p.profileId)}
                  onChange={() => toggleMember(p.profileId)}
                />
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 peer-checked:border-emerald-500 peer-checked:bg-emerald-50 hover:bg-gray-50 transition-colors text-sm">
                  <span>{typeEmoji[p.type] ?? "👤"}</span>
                  <span className="font-medium truncate">{p.name}</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : tripId ? "Save changes" : "Create trip"}
      </Button>
    </form>
  );
}
