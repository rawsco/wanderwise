"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "./TagInput";

const schema = z.object({
  name: z.string().min(1, "Name required"),
  type: z.enum(["adult", "child", "dog", "cat"]),
  yearOfBirth: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface ProfileFormProps {
  profileId?: string;
  defaultValues?: Partial<FormValues & { likes: string[]; dislikes: string[] }>;
}

const typeLabels: Record<string, string> = {
  adult: "👤 Adult",
  child: "🧒 Child",
  dog: "🐶 Dog",
  cat: "🐱 Cat",
};

export function ProfileForm({ profileId, defaultValues }: ProfileFormProps) {
  const router = useRouter();
  const [likes, setLikes] = useState<string[]>(defaultValues?.likes ?? []);
  const [dislikes, setDislikes] = useState<string[]>(defaultValues?.dislikes ?? []);
  const currentYear = new Date().getFullYear();

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: { type: "adult", ...defaultValues },
  });

  const type = watch("type");

  async function onSubmit(data: FormValues) {
    const url = profileId ? `/api/profiles/${profileId}` : "/api/profiles";
    const method = profileId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, likes, dislikes }),
    });
    if (res.ok) {
      router.push("/profiles");
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" placeholder="e.g. Emma, Buddy" {...register("name")} />
        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Type</Label>
        <div className="grid grid-cols-4 gap-2">
          {(["adult", "child", "dog", "cat"] as const).map(t => (
            <label key={t} className="cursor-pointer">
              <input type="radio" value={t} {...register("type")} className="sr-only peer" />
              <div className="text-center p-2 rounded-lg border border-gray-200 text-sm peer-checked:border-emerald-500 peer-checked:bg-emerald-50 hover:bg-gray-50 transition-colors">
                {typeLabels[t]}
              </div>
            </label>
          ))}
        </div>
      </div>

      {(type === "adult" || type === "child") && (
        <div className="space-y-1.5">
          <Label htmlFor="yearOfBirth">Year of birth (optional)</Label>
          <Input id="yearOfBirth" type="number" min={1900} max={currentYear} placeholder={`e.g. ${currentYear - 8}`} {...register("yearOfBirth", { valueAsNumber: true })} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Input id="notes" placeholder="e.g. Vegetarian, needs dog-friendly accommodation" {...register("notes")} />
      </div>

      <div className="space-y-1.5">
        <Label>Likes</Label>
        <p className="text-xs text-gray-400">Press Enter or comma to add. These will help personalise stop suggestions.</p>
        <TagInput tags={likes} onChange={setLikes} placeholder="e.g. hiking, craft beer, photography…" color="emerald" />
      </div>

      <div className="space-y-1.5">
        <Label>Dislikes</Label>
        <TagInput tags={dislikes} onChange={setDislikes} placeholder="e.g. seafood, crowded places…" color="red" />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : profileId ? "Save changes" : "Create profile"}
      </Button>
    </form>
  );
}
