import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAuth } from "@/lib/auth-helpers";
import { StopEntity } from "@/lib/db/stop.entity";
import type { Activity } from "@/types/stop";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().optional(),
  note: z.string().trim().max(2000).optional(),
});

const updateSchema = z.object({
  activityId: z.string().min(1),
  note: z.string().trim().max(2000).optional(),
});

const deleteSchema = z.object({
  activityId: z.string().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string; stopId: string }> }
) {
  try {
    await requireAuth();
    const { tripId, stopId } = await params;
    const input = createSchema.parse(await req.json());

    const result = await StopEntity.get({ tripId, stopId }).go();
    if (!result.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing: Activity[] = (result.data.activities as Activity[] | undefined) ?? [];
    const maxOrder = existing.reduce((m, a) => (a.order > m ? a.order : m), -1);

    const activity: Activity = {
      activityId: randomUUID(),
      name: input.name,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      placeId: input.placeId,
      note: input.note || undefined,
      order: maxOrder + 1,
      source: "user",
      createdAt: new Date().toISOString(),
    };

    await StopEntity.update({ tripId, stopId }).set({ activities: [...existing, activity] }).go();

    return NextResponse.json(activity, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ tripId: string; stopId: string }> }
) {
  try {
    await requireAuth();
    const { tripId, stopId } = await params;
    const { activityId, note } = updateSchema.parse(await req.json());

    const result = await StopEntity.get({ tripId, stopId }).go();
    if (!result.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing: Activity[] = (result.data.activities as Activity[] | undefined) ?? [];
    const target = existing.find(a => a.activityId === activityId);
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated: Activity = { ...target, note: note || undefined };
    const next = existing.map(a => (a.activityId === activityId ? updated : a));
    await StopEntity.update({ tripId, stopId }).set({ activities: next }).go();

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ tripId: string; stopId: string }> }
) {
  try {
    await requireAuth();
    const { tripId, stopId } = await params;
    const { activityId } = deleteSchema.parse(await req.json());

    const result = await StopEntity.get({ tripId, stopId }).go();
    if (!result.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing: Activity[] = (result.data.activities as Activity[] | undefined) ?? [];
    await StopEntity.update({ tripId, stopId })
      .set({ activities: existing.filter(a => a.activityId !== activityId) })
      .go();

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
