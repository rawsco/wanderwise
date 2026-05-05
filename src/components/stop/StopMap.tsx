"use client";

import { Map, Marker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { pinIcon, activityPinIcon, searchResultPinIcon } from "@/components/trip/pin-icons";
import type { Activity } from "@/types/stop";
import type { SearchResult } from "./ActivitySearch";

interface StopMapProps {
  stop: { name: string; address: string; lat: number; lng: number };
  activities: Activity[];
  searchResults?: SearchResult[];
  onAddSearchResult?: (result: SearchResult) => Promise<void>;
}

const SINGLE_POINT_ZOOM = 14;
const FIT_PADDING_PX = 48;

function FitToPoints({
  points,
}: {
  points: { lat: number; lng: number }[];
}) {
  const map = useMap();
  const positionKey = points.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");

  useEffect(() => {
    if (!map || points.length === 0) return;

    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(SINGLE_POINT_ZOOM);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    for (const p of points) bounds.extend(p);

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    if (Math.abs(ne.lat() - sw.lat()) < 0.005 && Math.abs(ne.lng() - sw.lng()) < 0.005) {
      map.setCenter(points[0]);
      map.setZoom(SINGLE_POINT_ZOOM);
      return;
    }

    map.fitBounds(bounds, FIT_PADDING_PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, positionKey]);

  return null;
}

export function StopMap({ stop, activities, searchResults = [], onAddSearchResult }: StopMapProps) {
  const [activeActivity, setActiveActivity] = useState<string | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [activeResult, setActiveResult] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const points = [
    { lat: stop.lat, lng: stop.lng },
    ...activities.map(a => ({ lat: a.lat, lng: a.lng })),
    ...searchResults.map(r => ({ lat: r.lat, lng: r.lng })),
  ];

  function closeAll() {
    setActiveActivity(null);
    setStopOpen(false);
    setActiveResult(null);
  }

  async function handleAdd(result: SearchResult) {
    if (!onAddSearchResult) return;
    setAdding(result.placeId);
    await onAddSearchResult(result);
    setAdding(null);
    setActiveResult(null);
  }

  return (
    <div className="h-56 w-full">
      <Map
        defaultCenter={{ lat: stop.lat, lng: stop.lng }}
        defaultZoom={SINGLE_POINT_ZOOM}
        className="w-full h-full"
        gestureHandling="greedy"
        disableDefaultUI
      >
        <FitToPoints points={points} />

        <Marker
          position={{ lat: stop.lat, lng: stop.lng }}
          icon={pinIcon("#2563eb", "•")}
          onClick={() => {
            closeAll();
            setStopOpen(true);
          }}
        />

        {activities.map(a => (
          <Marker
            key={a.activityId}
            position={{ lat: a.lat, lng: a.lng }}
            icon={activityPinIcon()}
            onClick={() => {
              closeAll();
              setActiveActivity(a.activityId);
            }}
          />
        ))}

        {searchResults.map(r => (
          <Marker
            key={`search-${r.placeId}`}
            position={{ lat: r.lat, lng: r.lng }}
            icon={searchResultPinIcon()}
            onClick={() => {
              closeAll();
              setActiveResult(r.placeId);
            }}
          />
        ))}

        {stopOpen && (
          <InfoWindow
            position={{ lat: stop.lat, lng: stop.lng }}
            onCloseClick={() => setStopOpen(false)}
          >
            <div className="text-sm">
              <p className="font-semibold">{stop.name}</p>
              <p className="text-gray-500 text-xs">{stop.address}</p>
            </div>
          </InfoWindow>
        )}

        {activeActivity && (() => {
          const a = activities.find(x => x.activityId === activeActivity);
          if (!a) return null;
          return (
            <InfoWindow
              position={{ lat: a.lat, lng: a.lng }}
              onCloseClick={() => setActiveActivity(null)}
            >
              <div className="text-sm">
                <p className="font-semibold">{a.name}</p>
                <p className="text-gray-500 text-xs">{a.address}</p>
              </div>
            </InfoWindow>
          );
        })()}

        {activeResult && (() => {
          const r = searchResults.find(x => x.placeId === activeResult);
          if (!r) return null;
          const isAdding = adding === r.placeId;
          return (
            <InfoWindow
              position={{ lat: r.lat, lng: r.lng }}
              onCloseClick={() => setActiveResult(null)}
            >
              <div className="text-sm space-y-2 min-w-[180px]">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-gray-500 text-xs">{r.address}</p>
                </div>
                <button
                  onClick={() => handleAdd(r)}
                  disabled={isAdding}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium px-2.5 py-1.5 transition-colors"
                  style={{
                    backgroundColor: "#059669",
                    color: "white",
                    opacity: isAdding ? 0.7 : 1,
                  }}
                >
                  {isAdding
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Plus className="h-3 w-3" />
                  }
                  Add to things to do
                </button>
              </div>
            </InfoWindow>
          );
        })()}
      </Map>
    </div>
  );
}
