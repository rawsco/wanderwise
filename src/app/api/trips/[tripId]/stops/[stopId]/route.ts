import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-helpers";
import { StopEntity } from "@/lib/db/stop.entity";

const updateSchema = z.object({
  order: z.number().int().min(0).optional(),
  arrivalDate: z.string().optional(),
  departureDate: z.string().optional(),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  bookingStatus: z.enum(["enquiry", "pending", "confirmed"]).optional(),
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

    await StopEntity.update({ tripId, stopId }).set(data).go();

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

    await StopEntity.delete({ tripId, stopId }).go();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
