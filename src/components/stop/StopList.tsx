"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2, MapPin, Pencil, Check, X, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker, type DateRange } from "@/components/ui/date-picker";

interface Stop {
  stopId: string;
  tripId: string;
  order: number;
  kind?: "start" | "intermediate" | "end";
  name: string;
  address: string;
  lat: number;
  lng: number;
  arrivalDate?: string;
  departureDate?: string;
  checkInTime?: string;
  checkOutTime?: string;
  bookingStatus?: "enquiry" | "pending" | "confirmed";
}

interface StopListProps {
  stops: Stop[];
  onRemove: (stopId: string) => void;
  onUpdateDates: (stopId: string, arrivalDate: string, departureDate: string, checkInTime: string, checkOutTime: string) => void;
  tripStartDate?: string;
  tripEndDate?: string;
}

function nightsBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function addNights(date: string, n: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}


function TripNightsSummary({ stops, tripStartDate, tripEndDate }: {
  stops: Stop[];
  tripStartDate?: string;
  tripEndDate?: string;
}) {
  if (!tripStartDate || !tripEndDate) return null;
  const totalNights = nightsBetween(tripStartDate, tripEndDate);
  if (totalNights <= 0) return null;

  const middleStops = stops.filter(s => s.kind === "intermediate");

  // For each night, find which stop covers it (if any)
  type NightInfo = { status: "confirmed" | "pending" | "enquiry" | "gap" | "overlap"; stopIndex: number | null };
  const nights: NightInfo[] = Array.from({ length: totalNights }, (_, i) => {
    const nightDate = addNights(tripStartDate, i);
    const covering = middleStops
      .map((s, idx) => ({ s, idx }))
      .filter(({ s }) => s.arrivalDate && s.departureDate && nightDate >= s.arrivalDate && nightDate < s.departureDate);
    if (covering.length > 1) return { status: "overlap", stopIndex: null };
    if (covering.length === 1) return {
      status: covering[0].s.bookingStatus ?? "enquiry",
      stopIndex: covering[0].idx,
    };
    return { status: "gap", stopIndex: null };
  });

  // Compute runs of consecutive nights with same stop/status for labels
  type Run = { status: NightInfo["status"]; stopIndex: number | null; length: number; startNight: number };
  const runs: Run[] = [];
  nights.forEach((n, i) => {
    const last = runs[runs.length - 1];
    if (last && last.status === n.status && last.stopIndex === n.stopIndex) {
      last.length++;
    } else {
      runs.push({ status: n.status, stopIndex: n.stopIndex, length: 1, startNight: i });
    }
  });

  const confirmedCount = nights.filter(n => n.status === "confirmed").length;
  const pendingCount = nights.filter(n => n.status === "pending").length;
  const enquiryCount = nights.filter(n => n.status === "enquiry").length;
  const overlapCount = nights.filter(n => n.status === "overlap").length;
  const gapCount = nights.filter(n => n.status === "gap").length;
  const allConfirmed = confirmedCount === totalNights;

  return (
    <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      {/* Stop labels above their segments */}
      <div className="flex mb-0.5">
        {runs.map((run, i) => {
          const isStop = run.status === "confirmed" || run.status === "pending" || run.status === "enquiry";
          return (
            <div key={i} className="overflow-hidden text-center" style={{ flex: run.length }}>
              {isStop && run.stopIndex !== null && (
                <span
                  className="text-[9px] font-semibold leading-none block truncate px-0.5"
                  style={{ color: run.status === "confirmed" ? "#047857" : run.status === "pending" ? "#1d4ed8" : "#9ca3af" }}
                >
                  {middleStops[run.stopIndex]?.name?.split(",")[0] ?? `Stop ${run.stopIndex + 1}`}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Night segments */}
      <div className="flex gap-px rounded overflow-hidden h-4">
        {runs.map((run, i) => (
          <div
            key={i}
            className="h-full"
            style={{
              flex: run.length,
              backgroundColor:
                run.status === "confirmed" ? "#10b981" :
                run.status === "pending"   ? "#3b82f6" :
                run.status === "enquiry"   ? "#9ca3af" :
                run.status === "overlap"   ? "#ef4444" :
                "#e5e7eb",
            }}
            title={
              run.status === "confirmed" ? `${run.length}n — ${middleStops[run.stopIndex!]?.name ?? ""} · confirmed` :
              run.status === "pending"   ? `${run.length}n — ${middleStops[run.stopIndex!]?.name ?? ""} · pending` :
              run.status === "enquiry"   ? `${run.length}n — ${middleStops[run.stopIndex!]?.name ?? ""} · enquiry` :
              run.status === "overlap"   ? `${run.length}n overlap` :
              `${run.length}n no stop planned`
            }
          />
        ))}
      </div>

      {/* Date labels */}
      <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
        <span>{formatDate(tripStartDate)}</span>
        {totalNights > 6 && <span>{formatDate(addNights(tripStartDate, Math.floor(totalNights / 2)))}</span>}
        <span>{formatDate(tripEndDate)}</span>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-xs mt-1.5 pt-1.5 border-t border-gray-200">
        <span className="text-gray-500">{confirmedCount}/{totalNights} confirmed</span>
        {overlapCount > 0 && (
          <span className="text-red-600 font-medium flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />{overlapCount} overlap
          </span>
        )}
{overlapCount === 0 && gapCount === 0 && pendingCount > 0 && enquiryCount === 0 && (
          <span className="text-blue-600">{pendingCount} pending</span>
        )}
        {overlapCount === 0 && gapCount === 0 && enquiryCount > 0 && (
          <span className="text-gray-400">{enquiryCount} enquiry{pendingCount > 0 ? ` · ${pendingCount} pending` : ""}</span>
        )}
        {allConfirmed && overlapCount === 0 && (
          <span className="text-emerald-600 font-medium">All confirmed ✓</span>
        )}
      </div>
    </div>
  );
}


function StopItem({
  stop,
  index,
  isStart,
  isEnd,
  tripStartDate,
  tripEndDate,
  disabledRanges,
  onRemove,
  onUpdateDates,
}: {
  stop: Stop;
  index: number;
  isStart: boolean;
  isEnd: boolean;
  tripStartDate?: string;
  tripEndDate?: string;
  disabledRanges?: DateRange[];
  onRemove: (stopId: string) => void;
  onUpdateDates: (stopId: string, arrivalDate: string, departureDate: string, checkInTime: string, checkOutTime: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  const existingNights =
    stop.arrivalDate && stop.departureDate
      ? nightsBetween(stop.arrivalDate, stop.departureDate)
      : 1;

  const [draftArrival, setDraftArrival] = useState(stop.arrivalDate ?? "");
  const [draftNights, setDraftNights] = useState<number | "">(existingNights);
  const [draftCheckIn, setDraftCheckIn] = useState(stop.checkInTime ?? "");
  const [draftCheckOut, setDraftCheckOut] = useState(stop.checkOutTime ?? "");

  function openEdit() {
    setDraftArrival(stop.arrivalDate ?? "");
    setDraftNights(
      stop.arrivalDate && stop.departureDate
        ? nightsBetween(stop.arrivalDate, stop.departureDate)
        : 1
    );
    setDraftCheckIn(stop.checkInTime ?? "");
    setDraftCheckOut(stop.checkOutTime ?? "");
    setEditing(true);
  }

  function saveDates() {
    if (draftArrival && draftNights !== "" && draftNights > 0) {
      onUpdateDates(stop.stopId, draftArrival, addNights(draftArrival, draftNights), draftCheckIn, draftCheckOut);
    } else if (!draftArrival) {
      onUpdateDates(stop.stopId, "", "", draftCheckIn, draftCheckOut);
    }
    setEditing(false);
  }

  const nights =
    stop.arrivalDate && stop.departureDate
      ? nightsBetween(stop.arrivalDate, stop.departureDate)
      : null;

  const badgeBg = isStart ? "bg-emerald-600" : isEnd ? "" : "bg-blue-600";
  const badgeLabel = isStart ? "S" : isEnd ? "E" : String(index);
  const badgeStyle = isEnd ? {
    background: "conic-gradient(#111 90deg, white 90deg 180deg, #111 180deg 270deg, white 270deg)",
    backgroundSize: "8px 8px",
    outline: "2px solid #e5e7eb",
    textShadow: "0 0 3px #000, 0 0 3px #000",
  } : {};

  return (
    <div className={`flex items-start gap-3 p-3 lg:p-3 rounded-lg border transition-colors ${
      isStart || isEnd
        ? "border-gray-200 bg-white"
        : "border-gray-100 bg-gray-50 hover:bg-white"
    }`}>
      <span
        className={`flex-shrink-0 h-6 w-6 rounded-full ${badgeBg} text-white text-xs font-bold flex items-center justify-center mt-0.5`}
        style={badgeStyle}
      >
        {badgeLabel}
      </span>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900 truncate">{stop.name}</p>
        <p className="text-xs text-gray-500 truncate">{stop.address}</p>


        {!isStart && !isEnd && (
          editing ? (
            <div className="mt-2 space-y-2 overflow-hidden">
              <div className="grid grid-cols-2 gap-2 overflow-hidden">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-[10px] text-gray-400">Arrival date</p>
                  <DatePicker
                    value={draftArrival}
                    onChange={setDraftArrival}
                    min={tripStartDate}
                    max={tripEndDate}
                    disabledRanges={disabledRanges}
                    placeholder="Select date"
                  />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="text-[10px] text-gray-400">Nights</p>
                  <Input
                    type="number"
                    min={1}
                    value={draftNights}
                    onChange={e => setDraftNights(e.target.value === "" ? "" : parseInt(e.target.value))}
                    placeholder="nights"
                    className="h-11 w-full min-w-0"
                  />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="text-[10px] text-gray-400">Check-in</p>
                  <Input
                    type="time"
                    step={1800}
                    value={draftCheckIn}
                    onChange={e => setDraftCheckIn(e.target.value)}
                    className="h-11 w-full min-w-0"
                  />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="text-[10px] text-gray-400">Check-out</p>
                  <Input
                    type="time"
                    step={1800}
                    value={draftCheckOut}
                    onChange={e => setDraftCheckOut(e.target.value)}
                    className="h-11 w-full min-w-0"
                  />
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" className="h-6 text-xs px-2" onClick={saveDates}>
                  <Check className="h-3 w-3 mr-1" />Save
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditing(false)}>
                  <X className="h-3 w-3 mr-1" />Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={openEdit}
              className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 group"
            >
              <span>
                {stop.arrivalDate
                  ? `${formatDate(stop.arrivalDate)}${nights !== null ? ` · ${nights} night${nights !== 1 ? "s" : ""}` : ""}`
                  : <span className="text-gray-400 group-hover:text-blue-600">Add dates</span>
                }
              </span>
              <Pencil className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )
        )}
      </div>

      <div className="flex items-center gap-0.5 flex-shrink-0">
        {isStart || isEnd ? (
          <Link
            href={`/trips/${stop.tripId}/edit`}
            aria-label={`Edit ${isStart ? "start" : "end"} location`}
            className="h-11 w-11 lg:h-8 lg:w-8 flex items-center justify-center rounded-md text-gray-400 hover:text-blue-600 hover:bg-accent transition-colors"
          >
            <Pencil className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
          </Link>
        ) : (
          <>
            <Link
              href={`/trips/${stop.tripId}/stops/${stop.stopId}`}
              aria-label={`Manage ${stop.name}`}
              className="h-11 w-11 lg:h-8 lg:w-8 flex items-center justify-center rounded-md text-gray-400 hover:text-blue-600 hover:bg-accent transition-colors"
            >
              <ArrowRight className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
            </Link>
            <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8 text-red-400 hover:text-red-600" onClick={() => onRemove(stop.stopId)}>
              <Trash2 className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function StopList({ stops, onRemove, onUpdateDates, tripStartDate, tripEndDate }: StopListProps) {
  if (stops.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No stops yet. Add your starting point above.</p>
      </div>
    );
  }

  const middleStops = stops.filter(s => s.kind === "intermediate");
  const allRanges: Array<{ stopId: string; range: DateRange }> = middleStops
    .filter(s => s.arrivalDate && s.departureDate)
    .map(s => ({ stopId: s.stopId, range: { from: s.arrivalDate!, to: s.departureDate! } }));

  return (
    <div>
      <TripNightsSummary stops={stops} tripStartDate={tripStartDate} tripEndDate={tripEndDate} />
      <ol className="space-y-1.5">
        {stops.map((stop, i) => {
          const isStart = stop.kind === "start";
          const isEnd = stop.kind === "end";
          const siblingRanges = allRanges.filter(r => r.stopId !== stop.stopId).map(r => r.range);
          return (
            <li key={stop.stopId}>
              <StopItem
                stop={stop}
                index={i}
                isStart={isStart}
                isEnd={isEnd}
                tripStartDate={tripStartDate}
                tripEndDate={tripEndDate}
                disabledRanges={siblingRanges}
                onRemove={onRemove}
                onUpdateDates={onUpdateDates}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
