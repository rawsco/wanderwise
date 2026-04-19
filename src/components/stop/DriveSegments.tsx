"use client";

import { useEffect, useState } from "react";

interface Stop {
  lat: number;
  lng: number;
}

interface Segment {
  duration: string;
  distance: string;
}

interface DriveSegmentsProps {
  stops: Stop[];
  onSegmentsLoaded: (segments: Segment[]) => void;
}

export function DriveSegments({ stops, onSegmentsLoaded }: DriveSegmentsProps) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (stops.length < 2 || !window.google) return;

    setLoading(true);
    const service = new window.google.maps.DirectionsService();
    const pairs = stops.slice(0, -1).map((_, i) => ({ origin: stops[i], destination: stops[i + 1] }));

    Promise.all(
      pairs.map(({ origin, destination }) =>
        new Promise<Segment>((resolve) => {
          service.route(
            {
              origin: { lat: origin.lat, lng: origin.lng },
              destination: { lat: destination.lat, lng: destination.lng },
              travelMode: window.google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
              if (status === "OK" && result?.routes[0]?.legs[0]) {
                const leg = result.routes[0].legs[0];
                resolve({ duration: leg.duration?.text ?? "–", distance: leg.distance?.text ?? "–" });
              } else {
                resolve({ duration: "–", distance: "–" });
              }
            }
          );
        })
      )
    ).then(segments => {
      onSegmentsLoaded(segments);
      setLoading(false);
    });
  }, [stops, onSegmentsLoaded]);

  if (loading) return <p className="text-xs text-gray-400 pl-9">Calculating drive times…</p>;
  return null;
}
