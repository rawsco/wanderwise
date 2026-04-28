"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Map, ListChecks, BookOpen, Phone, Globe, Loader2, Trash2, Send, Sparkles, Pencil, Check, X } from "lucide-react";
import { BookingConfirmButton } from "@/components/stop/BookingConfirmButton";
import { bookingHash } from "@/lib/booking-hash";
import type { StopNote } from "@/types/stop";
import type { PlaceContact } from "@/lib/places";

interface Stop {
  stopId: string;
  tripId: string;
  name: string;
  address: string;
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
  initialSummaryHash?: string;
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

export function StopDetailClient({ stop, initialNotes, contact, initialSummary, initialSummaryGeneratedAt, initialSummaryHash }: Props) {
  const [tab, setTab] = useState<Tab>("booking");
  const [notes, setNotes] = useState<StopNote[]>(initialNotes);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = useState<"enquiry" | "pending" | "confirmed" | undefined>(stop.bookingStatus);
  const [summary, setSummary] = useState<string | undefined>(initialSummary);
  const [summaryAt, setSummaryAt] = useState<string | undefined>(initialSummaryGeneratedAt);
  const [summaryHash, setSummaryHash] = useState<string | undefined>(initialSummaryHash);
  const [summaryRegenerating, setSummaryRegenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Lazy-fetch the summary when the tab is opened. We pre-compute the
  // expected hash from the same booking inputs the server uses; if it
  // differs from the stored hash we know the server is going to
  // regenerate and we clear the visible summary up-front so no stale
  // text is shown while the new one is being produced.
  useEffect(() => {
    if (tab !== "summary") return;
    let cancelled = false;

    (async () => {
      const expected = await bookingHash({
        name: stop.name,
        address: stop.address,
        arrivalDate: stop.arrivalDate,
        departureDate: stop.departureDate,
        checkInTime: stop.checkInTime,
        checkOutTime: stop.checkOutTime,
        bookingStatus,
        notes: notes.map(n => ({ text: n.text })),
      });
      if (cancelled) return;

      const willRegen = expected !== summaryHash;
      const startedAt = Date.now();
      if (willRegen) {
        setSummary(undefined);
        setSummaryAt(undefined);
        setSummaryRegenerating(true);
      }

      try {
        const res = await fetch(`/api/trips/${stop.tripId}/stops/${stop.stopId}/summary`, { method: "POST" });
        const json = await res.json();
        if (cancelled) return;

        // If we cleared the summary up-front, hold the shimmer for at
        // least ~600ms so a fast regen doesn't flash sub-frame and feel
        // like nothing happened.
        if (willRegen) {
          const MIN_SHIMMER_MS = 600;
          const elapsed = Date.now() - startedAt;
          if (elapsed < MIN_SHIMMER_MS) {
            await new Promise(r => setTimeout(r, MIN_SHIMMER_MS - elapsed));
          }
          if (cancelled) return;
        }

        if (json.summary) {
          setSummary(json.summary);
          setSummaryAt(json.summaryGeneratedAt);
          if (json.summaryHash) setSummaryHash(json.summaryHash);
        }
      } catch (err) {
        console.error("[stop-summary] fetch failed", err);
      } finally {
        if (!cancelled) setSummaryRegenerating(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tab, stop, bookingStatus, notes, summaryHash]);

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

  function startEdit(note: StopNote) {
    setEditingId(note.noteId);
    setEditText(note.text);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
    setEditError(null);
  }

  async function saveEdit(noteId: string) {
    const text = editText.trim();
    if (!text) {
      setEditError("Note cannot be empty");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const res = await fetch(`/api/trips/${stop.tripId}/stops/${stop.stopId}/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId, text }),
    });
    if (res.ok) {
      const updated: StopNote = await res.json();
      setNotes(prev => prev.map(n => (n.noteId === noteId ? updated : n)));
      setEditingId(null);
      setEditText("");
    } else {
      setEditError("Could not save changes");
    }
    setEditSaving(false);
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
            value={bookingStatus}
            onChange={setBookingStatus}
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
                      {editingId === note.noteId ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(note.noteId);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            rows={3}
                            autoFocus
                            className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-base text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          />
                          {editError && (
                            <p className="text-xs text-red-600" role="alert">{editError}</p>
                          )}
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              className="h-7 text-xs px-2.5"
                              onClick={() => saveEdit(note.noteId)}
                              disabled={editSaving}
                            >
                              {editSaving
                                ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                : <Check className="h-3 w-3 mr-1" />
                              }
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs px-2.5"
                              onClick={cancelEdit}
                              disabled={editSaving}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.text}</p>
                          <div className="flex items-center justify-between mt-1.5">
                            <p className="text-[11px] text-gray-400" suppressHydrationWarning>{formatNoteDate(note.createdAt)}</p>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => startEdit(note)}
                                className="text-gray-300 hover:text-emerald-500 p-1"
                                aria-label="Edit note"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => deleteNote(note.noteId)}
                                disabled={deleting === note.noteId}
                                className="text-gray-300 hover:text-red-400 p-1"
                                aria-label="Delete note"
                              >
                                {deleting === note.noteId
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Trash2 className="h-3.5 w-3.5" />
                                }
                              </button>
                            </div>
                          </div>
                        </>
                      )}
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
            {summaryRegenerating ? (
              <div className="space-y-2 py-1" aria-busy="true" aria-live="polite">
                <div className="shimmer" style={{ height: 14, width: "100%" }}></div>
                <div className="shimmer" style={{ height: 14, width: "92%" }}></div>
                <div className="shimmer" style={{ height: 14, width: "75%" }}></div>
                <div className="shimmer" style={{ height: 14, width: "85%" }}></div>
              </div>
            ) : summary ? (
              <>
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{summary}</p>
                {summaryAt && (
                  <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                    Generated {new Date(summaryAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}
              </>
            ) : (
              <div className="py-6 text-center">
                <Sparkles className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-500">
                  A summary will appear here once you&apos;ve added arrival dates or notes for this stop.
                </p>
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
