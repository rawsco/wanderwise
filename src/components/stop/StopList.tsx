"use client";

import { ChevronUp, ChevronDown, Trash2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Stop {
  stopId: string;
  tripId: string;
  order: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  arrivalDate?: string;
  departureDate?: string;
}

interface StopListProps {
  stops: Stop[];
  onMove: (stopId: string, direction: "up" | "down") => void;
  onRemove: (stopId: string) => void;
}

export function StopList({ stops, onMove, onRemove }: StopListProps) {
  if (stops.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No stops yet. Search above to add your first stop.</p>
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {stops.map((stop, i) => (
        <li key={stop.stopId}>
          <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-white transition-colors">
            <span className="flex-shrink-0 h-6 w-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
              {i === 0 ? "S" : i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900 truncate">{stop.name}</p>
              <p className="text-xs text-gray-500 truncate">{stop.address}</p>
              {(stop.arrivalDate || stop.departureDate) && (
                <p className="text-xs text-emerald-600 mt-1">
                  {stop.arrivalDate && `Arrive ${new Date(stop.arrivalDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                  {stop.arrivalDate && stop.departureDate && " · "}
                  {stop.departureDate && `Depart ${new Date(stop.departureDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => onMove(stop.stopId, "up")}>
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === stops.length - 1} onClick={() => onMove(stop.stopId, "down")}>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => onRemove(stop.stopId)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {i < stops.length - 1 && (
            <div className="pl-9 py-1 text-xs text-gray-300">↓</div>
          )}
        </li>
      ))}
    </ol>
  );
}
