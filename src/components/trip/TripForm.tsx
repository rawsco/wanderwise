"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

const baseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
});

type FormValues = z.infer<typeof baseSchema>;

interface Anchor {
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
}

interface Profile {
  profileId: string;
  name: string;
  type: string;
}

const typeEmoji: Record<string, string> = { adult: "👤", child: "🧒", dog: "🐶", cat: "🐱" };

interface TripFormProps {
  tripId?: string;
  defaultValues?: Partial<FormValues & {
    memberIds: string[];
    startLocation: Anchor;
    endLocation: Anchor;
  }>;
  profiles: Profile[];
}

export function TripForm(props: TripFormProps) {
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!} libraries={["places"]}>
      <TripFormInner {...props} />
    </APIProvider>
  );
}

function TripFormInner({ tripId, defaultValues, profiles }: TripFormProps) {
  const router = useRouter();
  const isEdit = Boolean(tripId);
  const [memberIds, setMemberIds] = useState<string[]>(defaultValues?.memberIds ?? []);
  const [startLocation, setStartLocation] = useState<Anchor | null>(defaultValues?.startLocation ?? null);
  const [endLocation, setEndLocation] = useState<Anchor | null>(defaultValues?.endLocation ?? null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(baseSchema) as any,
    defaultValues,
  });

  function toggleMember(id: string) {
    setMemberIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  }

  async function onSubmit(data: FormValues) {
    setSubmitError(null);

    if (!startLocation || !endLocation) {
      setSubmitError("Pick both a start and an end location.");
      return;
    }
    if (data.endDate < data.startDate) {
      setSubmitError("End date must be on or after the start date.");
      return;
    }

    const url = tripId ? `/api/trips/${tripId}` : "/api/trips";
    const method = tripId ? "PATCH" : "POST";
    const body = { ...data, memberIds, startLocation, endLocation };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const trip = await res.json();
      router.push(`/trips/${tripId ?? trip.tripId}`);
      router.refresh();
      return;
    }

    const err = await res.json().catch(() => null);
    setSubmitError(err?.error ?? "Something went wrong saving the trip.");
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
          {errors.startDate && <p className="text-xs text-red-500">{errors.startDate.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endDate">End date</Label>
          <Input id="endDate" type="date" {...register("endDate")} />
          {errors.endDate && <p className="text-xs text-red-500">{errors.endDate.message}</p>}
        </div>
      </div>

      <AnchorPicker
        label="Start location"
        placeholder="Where does the trip begin?"
        value={startLocation}
        onChange={setStartLocation}
      />
      <AnchorPicker
        label="End location"
        placeholder="Where does the trip end?"
        value={endLocation}
        onChange={setEndLocation}
      />

      <div className="space-y-1.5">
        <Label>Who&apos;s coming?</Label>
        {profiles.length === 0 ? (
          <p className="text-xs text-gray-400">
            No profiles yet.{" "}
            <Link href="/profiles/new" className="text-emerald-600 hover:underline">Add your travelling group</Link> first.
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

      {submitError && (
        <p className="text-sm text-red-500">{submitError}</p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : tripId ? "Save changes" : "Create trip"}
      </Button>
    </form>
  );
}

interface AnchorPickerProps {
  label: string;
  placeholder: string;
  value: Anchor | null;
  onChange: (anchor: Anchor | null) => void;
}

function AnchorPicker({ label, placeholder, value, onChange }: AnchorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const placesLib = useMapsLibrary("places");
  const [inputValue, setInputValue] = useState("");

  // Re-attach autocomplete each time the input mounts (it only mounts
  // when `value` is null — the selected-place card replaces it
  // otherwise, so the input is unmounted and the listener would be
  // stale on remount).
  const inputMounted = value === null;

  useEffect(() => {
    if (!placesLib || !inputMounted || !inputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ["name", "formatted_address", "geometry", "place_id"],
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) return;
      onChange({
        name: place.name ?? "",
        address: place.formatted_address ?? "",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: place.place_id,
      });
      setInputValue("");
    });

    return () => {
      google.maps.event.removeListener(listener);
      google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [placesLib, inputMounted, onChange]);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {value ? (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 overflow-hidden">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{value.name}</p>
            <p className="text-xs text-gray-500 truncate">{value.address}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0"
            aria-label={`Clear ${label}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          className="h-11 text-base"
          autoComplete="off"
        />
      )}
    </div>
  );
}
