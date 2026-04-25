import { StopEntity } from "./db/stop.entity";
import { generateStopSummary } from "./stop-summary";
import { bookingHash, type BookingHashFields } from "./booking-hash";
import type { StopNote } from "@/types/stop";

export type StopKind = "start" | "intermediate" | "end";

export interface SortableStop {
  order: number;
  kind?: StopKind;
  arrivalDate?: string;
}

/**
 * Anchor stops are first-class and pinned by `kind` regardless of date:
 * the stop with `kind: "start"` always comes first, `kind: "end"` always
 * comes last. Intermediates sort chronologically between them.
 *
 * For backwards compatibility with stops written before `kind` existed,
 * fall back to the legacy "order=0 is start, last is end" inference.
 */
export function sortStopsByDate<T extends SortableStop>(stops: T[]): T[] {
  const inferred = stops.map(s => ({ stop: s, kind: inferKind(s, stops) }));

  const start = inferred.filter(x => x.kind === "start").map(x => x.stop);
  const end = inferred.filter(x => x.kind === "end").map(x => x.stop);
  const middle = inferred
    .filter(x => x.kind === "intermediate")
    .map(x => x.stop)
    .sort((a, b) => {
      if (a.arrivalDate && b.arrivalDate) return a.arrivalDate.localeCompare(b.arrivalDate);
      if (a.arrivalDate) return -1;
      if (b.arrivalDate) return 1;
      return a.order - b.order;
    });

  return [...start, ...middle, ...end];
}

function inferKind<T extends SortableStop>(stop: T, all: T[]): StopKind {
  if (stop.kind) return stop.kind;
  if (stop.order === 0) return "start";
  const maxOrder = Math.max(...all.map(s => s.order));
  if (stop.order === maxOrder && all.length > 1) return "end";
  return "intermediate";
}

// ---- Cached summary (auto-regenerate on booking-relevant change) ----

function nightsBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function hasBookingContent(input: BookingHashFields): boolean {
  return Boolean(
    input.arrivalDate ||
    input.departureDate ||
    (input.notes && input.notes.length > 0)
  );
}

export type StopSummary = {
  summary?: string;
  summaryGeneratedAt?: string;
  summaryHash?: string;
};

/**
 * Resolve the current summary for a stop, regenerating only if the
 * booking-relevant fields have changed since the last successful
 * generation. Called lazily — typically when the user opens the
 * Summary tab — so we never burn tokens on a write the user may
 * never look at.
 *
 * Cheap when cached. Failures fall back to the cached summary so
 * the user still sees the previous one rather than nothing.
 */
export async function ensureFreshSummary(
  tripId: string,
  stopId: string
): Promise<StopSummary | null> {
  const result = await StopEntity.get({ tripId, stopId }).go();
  const stop = result.data;
  if (!stop) return null;

  const notesArr = stop.notes as StopNote[] | undefined;
  const notes = notesArr?.map(n => ({ text: n.text, createdAt: n.createdAt }));

  const fields: BookingHashFields = {
    name: stop.name,
    address: stop.address,
    arrivalDate: stop.arrivalDate,
    departureDate: stop.departureDate,
    checkInTime: stop.checkInTime,
    checkOutTime: stop.checkOutTime,
    bookingStatus: stop.bookingStatus as "enquiry" | "pending" | "confirmed" | undefined,
    notes,
  };

  const hash = await bookingHash(fields);
  const cached: StopSummary = {
    summary: stop.summary,
    summaryGeneratedAt: stop.summaryGeneratedAt,
    summaryHash: stop.summaryHash,
  };

  if (hash === stop.summaryHash) {
    console.log("[stop-summary] cache hit", { stopId, hash });
    return cached;
  }
  if (!hasBookingContent(fields)) {
    console.log("[stop-summary] no booking content, skipping", { stopId });
    return cached;
  }

  console.log("[stop-summary] regenerating", { stopId, oldHash: stop.summaryHash, newHash: hash });

  const nights = stop.arrivalDate && stop.departureDate
    ? nightsBetween(stop.arrivalDate, stop.departureDate)
    : undefined;

  try {
    const summary = await generateStopSummary({ ...fields, nights, notes });
    const generatedAt = new Date().toISOString();
    await StopEntity.update({ tripId, stopId })
      .set({ summary, summaryHash: hash, summaryGeneratedAt: generatedAt })
      .go();
    console.log("[stop-summary] saved", { stopId, length: summary.length });
    return { summary, summaryGeneratedAt: generatedAt, summaryHash: hash };
  } catch (err) {
    console.error("[stop-summary] refresh failed", { tripId, stopId, err });
    return cached;
  }
}
