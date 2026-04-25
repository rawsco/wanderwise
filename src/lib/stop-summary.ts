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
  members?: {
    name: string;
    type: string;
    yearOfBirth?: number;
    likes?: string[];
    dislikes?: string[];
  }[];
}

const SYSTEM_PROMPT = `You restate a road-trip stop's booking facts in one short paragraph.

You know NOTHING about this place beyond what is written under FACTS. The name and address are labels — they tell you nothing about the building, scenery, area, weather, or what is nearby. Adjectives like "charming", "cosy", "rustic", "scenic", "Highland", "peaceful" are banned. Words like "views", "fireplace", "trails", "countryside", "retreat" are banned. Phrases like "perfect base", "sense of adventure", "unwind", "explore nearby" are banned.

Allowed content — ONLY:
- the stop name (as a name, not a description)
- the dates, check-in/out times, nights
- the booking status (note if not confirmed)
- the traveller's own notes — restate as fact
- named members with their supplied likes/dislikes (one short reference, only if relevant)

Output one short paragraph. Maximum 80 words. Plain prose. No markdown. No preamble. No closing pleasantry.

EXAMPLE

FACTS
Stop name: Ardrhu House
Address: Onich, Fort William, Scotland
Arriving: 2025-05-05 (check in 15:00)
Departing: 2025-05-08 (check out 11:00)
Staying: 3 nights
Booking status: confirmed

Travelling group:
- Ross (adult, age 42)

GOOD output:
Ardrhu House is confirmed for three nights, 5–8 May, with check-in at 15:00 on the 5th and check-out at 11:00 on the 8th. Ross is the only one staying.

BAD output (do not do this):
Your cozy stay at Ardrhu House in the heart of Fort William is confirmed for three nights. Nestled in the Highlands with sweeping views, it's the perfect base for exploring Ben Nevis. (Banned: "cozy", "heart of", "Nestled", "Highlands", "sweeping views", "perfect base", "exploring Ben Nevis" — none of that is in FACTS.)`;

function describeMembers(members?: StopSummaryInput["members"]): string[] {
  if (!members || members.length === 0) return [];
  const currentYear = new Date().getFullYear();
  const lines: string[] = ["Travelling group:"];
  for (const m of members) {
    let header: string;
    if (m.type === "dog") header = `- ${m.name} (dog)`;
    else if (m.type === "cat") header = `- ${m.name} (cat)`;
    else if (m.yearOfBirth) header = `- ${m.name} (${m.type}, age ${currentYear - m.yearOfBirth})`;
    else header = `- ${m.name} (${m.type})`;
    lines.push(header);
    if (m.likes && m.likes.length > 0) lines.push(`    likes: ${m.likes.join(", ")}`);
    if (m.dislikes && m.dislikes.length > 0) lines.push(`    dislikes: ${m.dislikes.join(", ")}`);
  }
  return lines;
}

export async function generateStopSummary(input: StopSummaryInput): Promise<string> {
  const lines = [
    "FACTS",
    `Stop name: ${input.name}`,
    `Address: ${input.address}`,
  ];
  if (input.arrivalDate) lines.push(`Arriving: ${input.arrivalDate}${input.checkInTime ? ` (check in ${input.checkInTime})` : ""}`);
  if (input.departureDate) lines.push(`Departing: ${input.departureDate}${input.checkOutTime ? ` (check out ${input.checkOutTime})` : ""}`);
  if (input.nights) lines.push(`Staying: ${input.nights} night${input.nights === 1 ? "" : "s"}`);
  if (input.bookingStatus) lines.push(`Booking status: ${input.bookingStatus}`);

  if (input.notes && input.notes.length > 0) {
    lines.push("", "Traveller's own notes (verbatim facts):");
    for (const n of input.notes) {
      lines.push(`- ${n.text.replace(/\s+/g, " ").trim()}`);
    }
  }

  const memberLines = describeMembers(input.members);
  if (memberLines.length > 0) lines.push("", ...memberLines);

  lines.push("", "Write the summary now using ONLY the facts above. Anything not above is unknown to you.");

  return generateText({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: lines.join("\n") },
    ],
    temperature: 0.2,
    maxTokens: 400,
  });
}
