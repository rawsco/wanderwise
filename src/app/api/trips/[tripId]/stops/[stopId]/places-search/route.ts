import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-helpers";
import { StopEntity } from "@/lib/db/stop.entity";
import { searchPlaces } from "@/lib/places-search";

const schema = z.object({
  query: z.string().trim().min(1).max(200),
  radiusKm: z.number().int().positive().max(500),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string; stopId: string }> }
) {
  let authed = false;
  try {
    await requireAuth();
    authed = true;

    const { tripId, stopId } = await params;
    const { query, radiusKm } = schema.parse(await req.json());

    const stopResult = await StopEntity.get({ tripId, stopId }).go();
    if (!stopResult.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const results = await searchPlaces({
      stopId,
      stopLat: stopResult.data.lat,
      stopLng: stopResult.data.lng,
      query,
      radiusKm,
    });

    return NextResponse.json({ results });
  } catch (err) {
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[places-search] failed:", message, err instanceof Error ? err.stack : "");
    if (message.startsWith("Places API")) {
      return NextResponse.json({ error: message }, { status: 502 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
