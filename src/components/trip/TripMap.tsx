"use client";

import { APIProvider, Map, Marker, Polyline, InfoWindow } from "@vis.gl/react-google-maps";
import { useState } from "react";

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

export function TripMap({ stops }: TripMapProps) {
  const [activeStop, setActiveStop] = useState<string | null>(null);

  const center = stops.length > 0
    ? { lat: stops[0].lat, lng: stops[0].lng }
    : { lat: 54.5, lng: -4 };

  const path = stops.map(s => ({ lat: s.lat, lng: s.lng }));

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <Map
        defaultCenter={center}
        defaultZoom={stops.length > 1 ? 6 : 5}
        className="w-full h-full rounded-xl"
        gestureHandling="greedy"
      >
        {stops.map((stop, i) => (
          <Marker
            key={stop.stopId}
            position={{ lat: stop.lat, lng: stop.lng }}
            label={{ text: String(i + 1), color: "white", fontWeight: "bold" }}
            onClick={() => setActiveStop(stop.stopId)}
          />
        ))}

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
    </APIProvider>
  );
}
