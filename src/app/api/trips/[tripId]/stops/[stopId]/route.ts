import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-helpers";
import { StopEntity } from "@/lib/db/stop.entity";

const updateSchema = z.object({
  order: z.number().int().min(0).optional(),
  arrivalDate: z.string().optional(),
  departureDate: z.string().optional(),
  name: z.string().optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ tripId: string; stopId: string }> }
) {
  try {
    await requireAuth();
    const { tripId, stopId } = await params;
    const body = await req.json();
    const data = updateSchema.parse(body);

    const existing = await StopEntity.query
      .byTrip({ tripId })
      .where(({ stopId: sid }, { eq }) => eq(sid, stopId))
      .go();

    const stop = existing.data[0];
    if (!stop) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await StopEntity.update({ tripId, order: stop.order, stopId })
      .set(data)
      .go();

    return NextResponse.json({ stopId, tripId, ...data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ tripId: string; stopId: string }> }
) {
  try {
    await requireAuth();
    const { tripId, stopId } = await params;

    const existing = await StopEntity.query
      .byTrip({ tripId })
      .where(({ stopId: sid }, { eq }) => eq(sid, stopId))
      .go();

    const stop = existing.data[0];
    if (!stop) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await StopEntity.delete({ tripId, order: stop.order, stopId }).go();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
