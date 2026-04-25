import { generateText } from "./ai";

export interface StopSummaryInput {
  name: string;
  address: string;
  arrivalDate?: string;
  departureDate?: string;
  checkInTime?: string;
  checkOutTime?: string;
  nights?: number;
  bookingStatus?: "enquiry" | "pending" | "confirmed";
  notes?: { text: string; createdAt: string }[];
}

const SYSTEM_PROMPT = `Summarise the booking. Lead with status (the word "confirmed" or "unconfirmed", verbatim from FACTS), then the practical details: dates, check-in/out times, nights, and any notes that affect arrival or stay. Plain prose, one or two short sentences, max 60 words. Do not describe the place, scenery, area, or weather — they're not in FACTS. No preamble, no sign-off.

Example FACTS:
Ardrhu House
Onich, Fort William, Scotland
Arriving: 2025-05-05 (check in 15:00)
Departing: 2025-05-08 (check out 11:00)
Staying: 3 nights
Booking status: unconfirmed

Good: Booking is unconfirmed at Ardrhu House — 5–8 May, 3 nights, check-in 15:00 on the 5th, check-out 11:00 on the 8th.
Bad: "Cosy Highland retreat, perfect for Ben Nevis." (None of that is in FACTS.)`;

export async function generateStopSummary(input: StopSummaryInput): Promise<string> {
  const lines = ["FACTS", input.name, input.address];

  if (input.arrivalDate) lines.push(`Arriving: ${input.arrivalDate}${input.checkInTime ? ` (check in ${input.checkInTime})` : ""}`);
  if (input.departureDate) lines.push(`Departing: ${input.departureDate}${input.checkOutTime ? ` (check out ${input.checkOutTime})` : ""}`);
  if (input.nights) lines.push(`Staying: ${input.nights} night${input.nights === 1 ? "" : "s"}`);

  // Binary status — anything that isn't an explicit "confirmed" is unconfirmed.
  const status = input.bookingStatus === "confirmed" ? "confirmed" : "unconfirmed";
  lines.push(`Booking status: ${status}`);

  if (input.notes?.length) {
    lines.push("", "Notes (verbatim facts):");
    for (const n of input.notes) {
      lines.push(`- ${n.text.replace(/\s+/g, " ").trim()}`);
    }
  }

  return generateText({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: lines.join("\n") },
    ],
    temperature: 0.2,
    maxTokens: 200,
  });
}
