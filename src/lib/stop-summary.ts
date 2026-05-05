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
  activities?: { name: string; note?: string }[];
}

const SYSTEM_PROMPT = `Summarise the booking. Lead with status (the word "confirmed" or "unconfirmed", verbatim from FACTS), then practical booking details: dates, check-in/out times, nights, and any notes that affect arrival or stay.

If "Things to do" entries are present, weave them into one or two short sentences after the booking line. Use the note text in parentheses where it adds practical context (e.g. "book ahead", "free parking", "closed Mondays"). Cover up to 4 activities by name; if there are more, end with "and N more". Note text is a verbatim fact — quote or paraphrase tightly, never invent.

Plain prose. Max 100 words. Do not describe place, scenery, area, weather, ratings, or what the activities themselves involve — none of that is in FACTS. No preamble, no sign-off.

Example FACTS:
Ardrhu House
Onich, Fort William, Scotland
Arriving: 2025-05-05 (check in 15:00)
Departing: 2025-05-08 (check out 11:00)
Staying: 3 nights
Booking status: unconfirmed

Things to do (verbatim facts):
- The Lochleven Seafood Cafe — book ahead at weekends
- Glen Nevis visitor centre — free parking until 5pm

Good: Booking is unconfirmed at Ardrhu House — 5–8 May, 3 nights, check-in 15:00 on the 5th, check-out 11:00 on the 8th. Planned stops: The Lochleven Seafood Cafe (book ahead at weekends) and Glen Nevis visitor centre (free parking until 5pm).
Bad: "Cosy Highland retreat, perfect for Ben Nevis. The seafood cafe is highly rated." (Neither claim is in FACTS.)`;

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

  if (input.activities?.length) {
    lines.push("", "Things to do (verbatim facts):");
    for (const a of input.activities) {
      const noteSuffix = a.note ? ` — ${a.note.replace(/\s+/g, " ").trim()}` : "";
      lines.push(`- ${a.name}${noteSuffix}`);
    }
  }

  return generateText({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: lines.join("\n") },
    ],
    temperature: 0.2,
    maxTokens: 220,
  });
}
