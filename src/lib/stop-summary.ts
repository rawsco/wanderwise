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

const SYSTEM_PROMPT = `Restate the FACTS as one short paragraph (max 80 words, plain prose, no markdown). The name and address are labels only — say nothing about the place, scenery, weather, or what's nearby. Cover dates, times, nights, status, notes (as fact), and named members with relevant likes/dislikes. No preamble, no sign-off.

Example FACTS:
Ardrhu House
Onich, Fort William, Scotland
Arriving: 2025-05-05 (check in 15:00)
Departing: 2025-05-08 (check out 11:00)
Staying: 3 nights
Booking status: confirmed
Group: Ross (adult, 42)

Good: Ardrhu House is confirmed for three nights, 5–8 May, check-in 15:00 on the 5th, check-out 11:00 on the 8th. Ross is the only one staying.
Bad: "Your cosy Highland retreat is the perfect base for Ben Nevis." (None of that is in FACTS.)`;

function describeMembers(members?: StopSummaryInput["members"]): string[] {
  if (!members || members.length === 0) return [];
  const yr = new Date().getFullYear();
  const lines: string[] = ["Group:"];
  for (const m of members) {
    const age = m.yearOfBirth ? `, ${yr - m.yearOfBirth}` : "";
    const isAnimal = m.type === "dog" || m.type === "cat";
    let line = `- ${m.name} (${isAnimal ? m.type : `${m.type}${age}`})`;
    const tags: string[] = [];
    if (m.likes?.length) tags.push(`likes ${m.likes.join(", ")}`);
    if (m.dislikes?.length) tags.push(`dislikes ${m.dislikes.join(", ")}`);
    if (tags.length) line += `; ${tags.join("; ")}`;
    lines.push(line);
  }
  return lines;
}

export async function generateStopSummary(input: StopSummaryInput): Promise<string> {
  const lines = ["FACTS", input.name, input.address];

  if (input.arrivalDate) lines.push(`Arriving: ${input.arrivalDate}${input.checkInTime ? ` (check in ${input.checkInTime})` : ""}`);
  if (input.departureDate) lines.push(`Departing: ${input.departureDate}${input.checkOutTime ? ` (check out ${input.checkOutTime})` : ""}`);
  if (input.nights) lines.push(`Staying: ${input.nights} night${input.nights === 1 ? "" : "s"}`);
  if (input.bookingStatus) lines.push(`Booking status: ${input.bookingStatus}`);

  if (input.notes?.length) {
    lines.push("", "Notes (verbatim facts):");
    for (const n of input.notes) {
      lines.push(`- ${n.text.replace(/\s+/g, " ").trim()}`);
    }
  }

  const memberLines = describeMembers(input.members);
  if (memberLines.length) lines.push("", ...memberLines);

  return generateText({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: lines.join("\n") },
    ],
    temperature: 0.2,
    maxTokens: 150,
  });
}
