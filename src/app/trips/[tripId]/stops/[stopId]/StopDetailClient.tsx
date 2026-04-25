"use client";

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Map, ListChecks, BookOpen, Phone, Globe, Loader2, Trash2, Send, Sparkles, RefreshCw } from "lucide-react";
import { BookingConfirmButton } from "@/components/stop/BookingConfirmButton";
import type { StopNote } from "@/types/stop";
import type { PlaceContact } from "@/lib/places";

interface Stop {
  stopId: string;
  tripId: string;
  arrivalDate?: string;
  departureDate?: string;
  checkInTime?: string;
  checkOutTime?: string;
  bookingStatus?: "enquiry" | "pending" | "confirmed";
}

interface Props {
  stop: Stop;
  initialNotes: StopNote[];
  contact: PlaceContact;
  initialSummary?: string;
  initialSummaryGeneratedAt?: string;
}

type Tab = "booking" | "summary" | "todo" | "checklist";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatNoteDate(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

function nightsBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

export function StopDetailClient({ stop, initialNotes, contact, initialSummary, initialSummaryGeneratedAt }: Props) {
  const [tab, setTab] = useState<Tab>("booking");
  const [notes, setNotes] = useState<StopNote[]>(initialNotes);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | undefined>(initialSummary);
  const [summaryAt, setSummaryAt] = useState<string | undefined>(initialSummaryGeneratedAt);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function generateSummary() {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/trips/${stop.tripId}/stops/${stop.stopId}/summary`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setSummaryError(json.error ?? "Failed to generate summary");
      } else {
        setSummary(json.summary);
        setSummaryAt(json.summaryGeneratedAt);
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Failed to generate summary");
    }
    setSummaryLoading(false);
  }

  const nights = stop.arrivalDate && stop.departureDate
    ? nightsBetween(stop.arrivalDate, stop.departureDate)
    : null;

  async function submitNote() {
    const text = noteText.trim();
    if (!text) return;
    setSaving(true);
    const res = await fetch(`/api/trips/${stop.tripId}/stops/${stop.stopId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const note = await res.json();
      setNotes(prev => [...prev, note]);
      setNoteText("");
    }
    setSaving(false);
  }

  async function deleteNote(noteId: string) {
    setDeleting(noteId);
    await fetch(`/api/trips/${stop.tripId}/stops/${stop.stopId}/notes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId }),
    });
    setNotes(prev => prev.filter(n => n.noteId !== noteId));
    setDeleting(null);
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "booking", label: "Booking", icon: <BookOpen className="h-4 w-4" /> },
    { id: "summary", label: "Summary", icon: <Sparkles className="h-4 w-4" /> },
    { id: "todo", label: "Things to do", icon: <Map className="h-4 w-4" /> },
    { id: "checklist", label: "Checklist", icon: <ListChecks className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-white">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: tab === t.id ? "#059669" : "transparent",
              color: tab === t.id ? "white" : "#6b7280",
            }}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Booking tab */}
      {tab === "booking" && (
        <div className="space-y-4">

          {/* Stay details */}
          {(stop.arrivalDate || stop.departureDate || stop.checkInTime || stop.checkOutTime) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  Stay details
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                {stop.arrivalDate && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Arrival</p>
                    <p className="font-medium">{formatDate(stop.arrivalDate)}</p>
                    {stop.checkInTime && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" /> Check in {stop.checkInTime}
                      </p>
                    )}
                  </div>
                )}
                {stop.departureDate && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Departure</p>
                    <p className="font-medium">{formatDate(stop.departureDate)}</p>
                    {stop.checkOutTime && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" /> Check out {stop.checkOutTime}
                      </p>
                    )}
                  </div>
                )}
                {nights !== null && (
                  <div className="col-span-2 pt-2 border-t border-gray-100">
                    <p className="text-gray-500">{nights} night{nights !== 1 ? "s" : ""}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <BookingConfirmButton
            tripId={stop.tripId}
            stopId={stop.stopId}
            initialStatus={stop.bookingStatus}
          />

          {/* Contact details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                Contact details
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contact.phone || contact.website ? (
                <div className="space-y-3 text-sm">
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex items-center gap-2 text-gray-700 hover:text-emerald-600 transition-colors"
                    >
                      <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                      {contact.phone}
                    </a>
                  )}
                  {contact.website && (
                    <a
                      href={contact.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-gray-700 hover:text-emerald-600 transition-colors"
                    >
                      <Globe className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="truncate">{contact.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No contact details found for this location.</p>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-gray-400" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Existing notes — newest first */}
              {notes.length > 0 && (
                <div className="space-y-3">
                  {[...notes].reverse().map(note => (
                    <div key={note.noteId} className="group relative rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.text}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-[11px] text-gray-400" suppressHydrationWarning>{formatNoteDate(note.createdAt)}</p>
                        <button
                          onClick={() => deleteNote(note.noteId)}
                          disabled={deleting === note.noteId}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 p-1"
                        >
                          {deleting === note.noteId
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />
                          }
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add note */}
              <div className="space-y-2">
                <textarea
                  ref={textareaRef}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitNote(); }}
                  placeholder="Add a note — confirmation number, contact name, pitch details…"
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <Button
                  onClick={submitNote}
                  disabled={saving || !noteText.trim()}
                  size="sm"
                  className="w-full h-10"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
                  Add note
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Summary tab */}
      {tab === "summary" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gray-400" />
              AI summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary ? (
              <>
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{summary}</p>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  {summaryAt && (
                    <p className="text-[11px] text-gray-400">
                      Generated {new Date(summaryAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                  <Button
                    onClick={generateSummary}
                    disabled={summaryLoading}
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                  >
                    {summaryLoading
                      ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      : <RefreshCw className="h-3 w-3 mr-1" />
                    }
                    Regenerate
                  </Button>
                </div>
              </>
            ) : summaryLoading ? (
              <div className="py-8 text-center text-gray-400">
                <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                <p className="text-sm">Generating summary…</p>
              </div>
            ) : (
              <div className="py-6 text-center">
                <Sparkles className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-500 mb-3">Get an AI-generated overview of this stop, tailored to your travel group.</p>
                <Button onClick={generateSummary} size="sm" className="h-9">
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Generate summary
                </Button>
              </div>
            )}
            {summaryError && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                {summaryError}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Things to do tab */}
      {tab === "todo" && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Map className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No activities planned yet</p>
            <p className="text-xs mt-1">AI-powered suggestions coming soon.</p>
          </CardContent>
        </Card>
      )}

      {/* Checklist tab */}
      {tab === "checklist" && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <ListChecks className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No checklist items yet</p>
            <p className="text-xs mt-1">AI-generated checklists coming soon.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
