// Isomorphic hash of the booking-relevant fields the stop summary
// depends on. Same module is imported by the server (Node) and the
// client (browser); both use Web Crypto's SHA-256 so the hex digests
// compare cleanly across environments.
//
// Bumping `PROMPT_VERSION` invalidates every cached summary the next
// time the user opens the Summary tab.

export const PROMPT_VERSION = "v3";

export interface BookingHashFields {
  name: string;
  address: string;
  arrivalDate?: string;
  departureDate?: string;
  checkInTime?: string;
  checkOutTime?: string;
  bookingStatus?: "enquiry" | "pending" | "confirmed";
  notes?: { text: string }[];
}

export async function bookingHash(input: BookingHashFields): Promise<string> {
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
  const buf = new TextEncoder().encode(sig);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
