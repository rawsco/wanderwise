"use client";

import { Map, Marker, Polyline, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useState } from "react";
import { pinIcon, startEndPinIcon, checkerPinIcon } from "./pin-icons";

interface Stop {
  stopId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface TripMapProps {
  stops: Stop[];
}

function isSamePlace(a: Stop, b: Stop): boolean {
  return Math.abs(a.lat - b.lat) < 0.005 && Math.abs(a.lng - b.lng) < 0.005;
}

const SINGLE_STOP_ZOOM = 12;
const FIT_PADDING_PX = 64;

function FitToStops({ stops }: { stops: Stop[] }) {
  const map = useMap();
  // Re-fit only when positions change, so date/booking edits don't snap the
  // user out of any pan/zoom they have done manually.
  const positionKey = stops.map(s => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`).join("|");

  useEffect(() => {
    if (!map || stops.length === 0) return;

    if (stops.length === 1) {
      map.setCenter({ lat: stops[0].lat, lng: stops[0].lng });
      map.setZoom(SINGLE_STOP_ZOOM);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    for (const s of stops) {
      bounds.extend({ lat: s.lat, lng: s.lng });
    }

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    if (Math.abs(ne.lat() - sw.lat()) < 0.005 && Math.abs(ne.lng() - sw.lng()) < 0.005) {
      map.setCenter({ lat: stops[0].lat, lng: stops[0].lng });
      map.setZoom(SINGLE_STOP_ZOOM);
      return;
    }

    map.fitBounds(bounds, FIT_PADDING_PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, positionKey]);

  return null;
}

export function TripMap({ stops }: TripMapProps) {
  const [activeStop, setActiveStop] = useState<string | null>(null);

  const center = stops.length > 0
    ? { lat: stops[0].lat, lng: stops[0].lng }
    : { lat: 54.5, lng: -4 };

  const path = stops.map(s => ({ lat: s.lat, lng: s.lng }));

  const startEqualsEnd = stops.length > 1 &&
    isSamePlace(stops[0], stops[stops.length - 1]);

  function iconForStop(i: number) {
    if (i === 0 && startEqualsEnd) return startEndPinIcon();
    if (i === stops.length - 1 && startEqualsEnd) return null; // rendered on start marker
    if (i === 0) return pinIcon("#059669", "S");
    if (i === stops.length - 1 && stops.length > 1) return checkerPinIcon();
    return pinIcon("#2563eb", String(i));
  }

  return (
    <Map
      defaultCenter={center}
      defaultZoom={stops.length > 1 ? 6 : 5}
      className="w-full h-full rounded-xl"
      gestureHandling="greedy"
    >
      <FitToStops stops={stops} />
      {stops.map((stop, i) => {
        const icon = iconForStop(i);
        if (icon === null) return null;
        return (
          <Marker
            key={stop.stopId}
            position={{ lat: stop.lat, lng: stop.lng }}
            icon={icon}
            onClick={() => setActiveStop(stop.stopId)}
          />
        );
      })}

      {activeStop && (() => {
        const stop = stops.find(s => s.stopId === activeStop);
        if (!stop) return null;
        return (
          <InfoWindow
            position={{ lat: stop.lat, lng: stop.lng }}
            onCloseClick={() => setActiveStop(null)}
          >
            <div className="text-sm">
              <p className="font-semibold">{stop.name}</p>
              <p className="text-gray-500 text-xs">{stop.address}</p>
            </div>
          </InfoWindow>
        );
      })()}

      {path.length > 1 && (
        <Polyline
          path={path}
          strokeColor="#059669"
          strokeWeight={3}
          strokeOpacity={0.8}
        />
      )}
    </Map>
  );
}
