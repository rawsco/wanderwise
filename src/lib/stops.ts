import { createHash } from "crypto";
import { StopEntity } from "./db/stop.entity";
import { generateStopSummary } from "./stop-summary";
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

/**
 * Bumped whenever the prompt template in `stop-summary.ts` changes
 * meaningfully — invalidates every cached summary so they regenerate
 * against the new prompt.
 */
const PROMPT_VERSION = "v3";

interface BookingHashFields {
  name: string;
  address: string;
  arrivalDate?: string;
  departureDate?: string;
  checkInTime?: string;
  checkOutTime?: string;
  bookingStatus?: "enquiry" | "pending" | "confirmed";
  notes?: { text: string }[];
}

/**
 * Hash the booking-relevant fields the summary depends on. The booking
 * status is collapsed to confirmed/unconfirmed (matching the prompt),
 * so e.g. moving "pending" → "enquiry" doesn't trigger a regen.
 */
export function bookingHash(input: BookingHashFields): string {
  const sig = JSON.stringify([
    PROMPT_VERSION,
    input.name,
    input.address,
    input.arrivalDate ?? null,
    input.departureDate ?? null,
    input.checkInTime ?? null,
    input.checkOutTime ?? null,
    input.bookingStatus === "confirmed" ? "confirmed" : "unconfirmed",
    [...(input.notes ?? [])].map(n => n.text).sort(),
  ]);
  return createHash("sha256").update(sig).digest("hex").slice(0, 16);
}

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

/**
 * Re-generate the cached summary if the booking-relevant fields have
 * changed since the last successful generation. Cheap no-op when
 * nothing material changed. Failures are swallowed so the calling
 * write still succeeds — stale summary is preferable to a 500.
 */
export async function refreshSummaryIfStale(
  tripId: string,
  stopId: string
): Promise<void> {
  const result = await StopEntity.get({ tripId, stopId }).go();
  const stop = result.data;
  if (!stop) return;

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

  const hash = bookingHash(fields);
  if (hash === stop.summaryHash) return;
  if (!hasBookingContent(fields)) return;

  const nights = stop.arrivalDate && stop.departureDate
    ? nightsBetween(stop.arrivalDate, stop.departureDate)
    : undefined;

  try {
    const summary = await generateStopSummary({ ...fields, nights, notes });
    await StopEntity.update({ tripId, stopId })
      .set({
        summary,
        summaryHash: hash,
        summaryGeneratedAt: new Date().toISOString(),
      })
      .go();
  } catch (err) {
    console.error("[stops] summary refresh failed", { tripId, stopId, err });
  }
}

/**
 * Force-regenerate the cached summary, ignoring the hash check.
 * Used by the manual "Regenerate" button in the UI.
 */
export async function forceRefreshSummary(
  tripId: string,
  stopId: string
): Promise<{ summary: string; summaryGeneratedAt: string } | null> {
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

  const nights = stop.arrivalDate && stop.departureDate
    ? nightsBetween(stop.arrivalDate, stop.departureDate)
    : undefined;

  const summary = await generateStopSummary({ ...fields, nights, notes });
  const generatedAt = new Date().toISOString();
  const hash = bookingHash(fields);

  await StopEntity.update({ tripId, stopId })
    .set({ summary, summaryHash: hash, summaryGeneratedAt: generatedAt })
    .go();

  return { summary, summaryGeneratedAt: generatedAt };
}
