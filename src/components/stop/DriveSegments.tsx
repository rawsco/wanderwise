"use client";

import { useEffect } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

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
  const routesLib = useMapsLibrary("routes");

  useEffect(() => {
    if (!routesLib || stops.length < 2) return;

    const service = new routesLib.DirectionsService();
    const pairs = stops.slice(0, -1).map((_, i) => ({ origin: stops[i], destination: stops[i + 1] }));

    Promise.all(
      pairs.map(({ origin, destination }) =>
        new Promise<Segment>((resolve) => {
          service.route(
            {
              origin: { lat: origin.lat, lng: origin.lng },
              destination: { lat: destination.lat, lng: destination.lng },
              travelMode: routesLib.TravelMode.DRIVING,
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
    ).then(onSegmentsLoaded);
  }, [routesLib, stops, onSegmentsLoaded]);

  return null;
}
