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
  members?: { name: string; type: string; yearOfBirth?: number }[];
}

const BOOKING_SYSTEM = `You are a travel advisor briefing your client on where their stop currently stands. Write as flowing prose — two or three short paragraphs — the way you'd talk them through it over a coffee. Never use bullet points, lists, markdown, headings, or dashes to separate items. Weave the facts into sentences.

Open with what's booked and when, folding the dates, nights, check-in and check-out times naturally into the prose. If the booking is still an enquiry or pending, say so plainly and nudge them to confirm; if it's confirmed, reassure them it's locked in.

Work the traveller's own notes into the narrative — pitch numbers, confirmation references, contact names, arrival instructions — as established fact. Don't contradict them, don't introduce them with "the notes say", just speak as though you know.

If the group includes children, dogs, or cats, work their needs in naturally in a sentence. Close with a short, confident line of colour about the place itself — only if you actually know it. Keep the whole thing under 180 words, friendly and conversational, and skip any "Here is a summary" preamble.`;

const LOCATION_SYSTEM = `You are a friendly, practical campervan trip planning assistant.
Given a stop on a UK/European road trip, write a short summary for motorhome travellers.

Guidelines:
- Keep the total under 200 words.
- Use plain text with short paragraphs separated by blank lines — no markdown headings or bullets.
- Start with a one-sentence character sketch of the location.
- Mention what's nearby and worth doing.
- Include any practical motorhome-relevant notes (parking, hookup, dump points) only if well-known. Do not invent facts.
- If the travel group includes dogs, children, or pets, tailor one sentence to them.
- Friendly, conversational tone. No headings, no "Here is a summary" preamble.`;

function describeMembers(members?: StopSummaryInput["members"]): string {
  if (!members || members.length === 0) return "";
  const currentYear = new Date().getFullYear();
  const parts = members.map(m => {
    if (m.type === "dog") return `${m.name} (dog)`;
    if (m.type === "cat") return `${m.name} (cat)`;
    if (m.yearOfBirth) return `${m.name} (${m.type}, age ${currentYear - m.yearOfBirth})`;
    return `${m.name} (${m.type})`;
  });
  return `Travelling with: ${parts.join(", ")}.`;
}

function hasBookingDetails(input: StopSummaryInput): boolean {
  return Boolean(
    input.departureDate ||
    input.checkInTime ||
    input.checkOutTime ||
    input.bookingStatus ||
    (input.notes && input.notes.length > 0)
  );
}

export async function generateStopSummary(input: StopSummaryInput): Promise<string> {
  const bookingFocused = hasBookingDetails(input);

  const lines = [
    `Stop: ${input.name}`,
    `Address: ${input.address}`,
  ];
  if (input.arrivalDate) lines.push(`Arriving: ${input.arrivalDate}${input.checkInTime ? ` (check in ${input.checkInTime})` : ""}`);
  if (input.departureDate) lines.push(`Departing: ${input.departureDate}${input.checkOutTime ? ` (check out ${input.checkOutTime})` : ""}`);
  if (input.nights) lines.push(`Staying: ${input.nights} night${input.nights === 1 ? "" : "s"}`);
  if (input.bookingStatus) lines.push(`Booking status: ${input.bookingStatus}`);

  if (input.notes && input.notes.length > 0) {
    lines.push("", "Traveller's own notes (treat as fact):");
    for (const n of input.notes) {
      lines.push(`- ${n.text.replace(/\s+/g, " ").trim()}`);
    }
  }

  const membersLine = describeMembers(input.members);
  if (membersLine) lines.push("", membersLine);

  lines.push("", "Write the summary now.");

  return generateText({
    messages: [
      { role: "system", content: bookingFocused ? BOOKING_SYSTEM : LOCATION_SYSTEM },
      { role: "user", content: lines.join("\n") },
    ],
    temperature: 0.7,
    maxTokens: 500,
  });
}
