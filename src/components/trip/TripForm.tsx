"use client";

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
  adults: z.number().int().min(1),
  dogs: z.number().int().min(0),
});

type FormValues = z.infer<typeof schema>;

interface TripFormProps {
  tripId?: string;
  defaultValues?: Partial<FormValues>;
}

export function TripForm({ tripId, defaultValues }: TripFormProps) {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: { adults: 1, dogs: 0, ...defaultValues },
  });

  async function onSubmit(data: FormValues) {
    const url = tripId ? `/api/trips/${tripId}` : "/api/trips";
    const method = tripId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="adults">Adults</Label>
          <Input id="adults" type="number" min={1} {...register("adults")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dogs">Dogs 🐾</Label>
          <Input id="dogs" type="number" min={0} {...register("dogs")} />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : tripId ? "Save changes" : "Create trip"}
      </Button>
    </form>
  );
}
