import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAuth } from "@/lib/auth-helpers";
import { StopEntity } from "@/lib/db/stop.entity";
import type { StopNote } from "@/types/stop";

const createSchema = z.object({
  text: z.string().min(1).max(2000),
});

const updateSchema = z.object({
  noteId: z.string().min(1),
  text: z.string().min(1).max(2000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string; stopId: string }> }
) {
  try {
    await requireAuth();
    const { tripId, stopId } = await params;
    const { text } = createSchema.parse(await req.json());

    const result = await StopEntity.get({ tripId, stopId }).go();
    if (!result.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing: StopNote[] = (result.data.notes as StopNote[] | undefined) ?? [];
    const note: StopNote = { noteId: randomUUID(), text, createdAt: new Date().toISOString() };
    await StopEntity.update({ tripId, stopId }).set({ notes: [...existing, note] }).go();

    return NextResponse.json(note, { status: 201 });
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
    const { noteId, text } = updateSchema.parse(await req.json());

    const result = await StopEntity.get({ tripId, stopId }).go();
    if (!result.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing: StopNote[] = (result.data.notes as StopNote[] | undefined) ?? [];
    const idx = existing.findIndex(n => n.noteId === noteId);
    if (idx === -1) return NextResponse.json({ error: "Note not found" }, { status: 404 });

    const updated: StopNote = { ...existing[idx], text };
    const next = [...existing.slice(0, idx), updated, ...existing.slice(idx + 1)];
    await StopEntity.update({ tripId, stopId }).set({ notes: next }).go();

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
    const { noteId } = await req.json();

    const result = await StopEntity.get({ tripId, stopId }).go();
    if (!result.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing: StopNote[] = (result.data.notes as StopNote[] | undefined) ?? [];
    await StopEntity.update({ tripId, stopId }).set({ notes: existing.filter(n => n.noteId !== noteId) }).go();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
