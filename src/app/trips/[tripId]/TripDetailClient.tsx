"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { TripMap } from "@/components/trip/TripMap";
import { StopList } from "@/components/stop/StopList";
import { StopSearch } from "@/components/stop/StopSearch";
import { DriveSegments } from "@/components/stop/DriveSegments";
import { Map, List, GripVertical } from "lucide-react";
import { sortStopsByDate } from "@/lib/stops";

const PANEL_MIN = 260;
const PANEL_MAX = 640;
const PANEL_DEFAULT = 384;
const PANEL_STORAGE_KEY = "wanderwise.tripPanelWidth";

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

interface Segment {
  duration: string;
  distance: string;
}

interface Props {
  tripId: string;
  initialStops: Stop[];
  tripStartDate?: string;
  tripEndDate?: string;
}

export function TripDetailClient({ tripId, initialStops, tripStartDate, tripEndDate }: Props) {
  const [stops, setStops] = useState<Stop[]>(initialStops);
  const [segments, setSegments] = useState<Segment[]>([]);

  // Suggest arrival = last intermediate stop's departure, otherwise trip start.
  const suggestedArrivalDate = useMemo(() => {
    const intermediates = stops.filter(s => s.kind === "intermediate");
    for (let i = intermediates.length - 1; i >= 0; i--) {
      if (intermediates[i].departureDate) return intermediates[i].departureDate;
    }
    return tripStartDate;
  }, [stops, tripStartDate]);

  const bookedRanges = useMemo(() => {
    return stops
      .filter(s => s.kind === "intermediate")
      .filter(s => s.arrivalDate && s.departureDate)
      .map(s => ({ from: s.arrivalDate!, to: s.departureDate! }));
  }, [stops]);

  const handleStopAdded = useCallback((stop: Stop) => {
    setStops(prev => sortStopsByDate([...prev, stop]));
  }, []);

  const handleRemove = useCallback(async (stopId: string) => {
    await fetch(`/api/trips/${tripId}/stops/${stopId}`, { method: "DELETE" });
    setStops(prev => prev.filter(s => s.stopId !== stopId).map((s, i) => ({ ...s, order: i })));
  }, [tripId]);

  const handleUpdateDates = useCallback(async (
    stopId: string,
    arrivalDate: string,
    departureDate: string,
    checkInTime: string,
    checkOutTime: string,
  ) => {
    setStops(prev => sortStopsByDate(prev.map(s =>
      s.stopId === stopId ? {
        ...s,
        arrivalDate: arrivalDate || undefined,
        departureDate: departureDate || undefined,
        checkInTime: checkInTime || undefined,
        checkOutTime: checkOutTime || undefined,
      } : s
    )));
    await fetch(`/api/trips/${tripId}/stops/${stopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        arrivalDate: arrivalDate || undefined,
        departureDate: departureDate || undefined,
        checkInTime: checkInTime || undefined,
        checkOutTime: checkOutTime || undefined,
      }),
    });
  }, [tripId]);

  const handleUpdateBookingStatus = useCallback(async (stopId: string, status: "enquiry" | "pending" | "confirmed") => {
    setStops(prev => prev.map(s => s.stopId === stopId ? { ...s, bookingStatus: status } : s));
    await fetch(`/api/trips/${tripId}/stops/${stopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingStatus: status }),
    });
  }, [tripId]);

  const handleSegmentsLoaded = useCallback((segs: Segment[]) => {
    setSegments(segs);
  }, []);

  const [mobileTab, setMobileTab] = useState<"route" | "map">("route");

  const desktopContainerRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!stored) return;
    const n = parseInt(stored, 10);
    if (Number.isFinite(n)) setPanelWidth(Math.max(PANEL_MIN, Math.min(PANEL_MAX, n)));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      const container = desktopContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const next = rect.right - e.clientX;
      setPanelWidth(Math.max(PANEL_MIN, Math.min(PANEL_MAX, next)));
    }
    function onUp() {
      setDragging(false);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  useEffect(() => {
    if (dragging) return;
    localStorage.setItem(PANEL_STORAGE_KEY, String(panelWidth));
  }, [panelWidth, dragging]);

  const routePanel = (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Add a stop</p>
        <StopSearch
          tripId={tripId}
          onStopAdded={handleStopAdded}
          placeholder="Search for a place to stay…"
          defaultArrivalDate={suggestedArrivalDate}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          disabledRanges={bookedRanges}
        />
      </div>

      <DriveSegments stops={stops} onSegmentsLoaded={handleSegmentsLoaded} />

      {stops.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Route · {stops.length} {stops.length === 1 ? "stop" : "stops"}
          </p>
          <StopList
            stops={stops}
            onRemove={handleRemove}
            onUpdateDates={handleUpdateDates}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
          />
        </div>
      )}
    </div>
  );

  const mapPanel = (
    <div className="h-[calc(100dvh-180px)] rounded-xl overflow-hidden border border-gray-200">
      <TripMap stops={stops} />
    </div>
  );

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!} libraries={["places"]}>
      {/* Mobile tab bar */}
      <div className="lg:hidden flex rounded-xl border border-gray-200 overflow-hidden mb-4 bg-white">
        <button
          type="button"
          onClick={() => setMobileTab("route")}
          className="flex-1 flex items-center justify-center gap-2 min-h-11 py-3 text-sm font-medium transition-colors"
          style={{
            backgroundColor: mobileTab === "route" ? "#059669" : "transparent",
            color: mobileTab === "route" ? "#ffffff" : "#6b7280",
          }}
        >
          <List className="h-4 w-4" />
          Route
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("map")}
          className="flex-1 flex items-center justify-center gap-2 min-h-11 py-3 text-sm font-medium transition-colors"
          style={{
            backgroundColor: mobileTab === "map" ? "#059669" : "transparent",
            color: mobileTab === "map" ? "#ffffff" : "#6b7280",
          }}
        >
          <Map className="h-4 w-4" />
          Map
        </button>
      </div>

      {/* Mobile: show active tab only */}
      <div className="lg:hidden">
        {mobileTab === "route" ? routePanel : mapPanel}
      </div>

      {/* Desktop: side by side with draggable divider */}
      <div ref={desktopContainerRef} className="hidden lg:flex flex-row items-stretch">
        <div className="flex-1 min-w-0 h-[600px] rounded-xl overflow-hidden border border-gray-200">
          <TripMap stops={stops} />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize stops panel"
          onMouseDown={() => setDragging(true)}
          className="group relative flex items-center justify-center w-4 mx-1 cursor-col-resize select-none"
        >
          <div
            className="h-16 w-1 rounded-full bg-gray-300 group-hover:bg-emerald-500 transition-colors"
            style={{ backgroundColor: dragging ? "#059669" : undefined }}
          />
          <GripVertical
            className="absolute h-4 w-4 text-white pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ opacity: dragging ? 1 : undefined }}
          />
        </div>
        <div style={{ width: panelWidth }} className="shrink-0 min-w-0">
          {routePanel}
        </div>
      </div>
    </APIProvider>
  );
}
