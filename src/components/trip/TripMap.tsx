"use client";

import { Map, Marker, Polyline, InfoWindow } from "@vis.gl/react-google-maps";
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

function pinIcon(bg: string, text: string, size = 30): string {
  const r = size / 2;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="${bg}" stroke="white" stroke-width="2.5"/>` +
    `<text x="${r}" y="${r + 4}" text-anchor="middle" fill="white" font-size="${Math.floor(size * 0.4)}" font-weight="bold" font-family="Arial,sans-serif">${text}</text>` +
    `</svg>`
  )}`;
}

function startEndPinIcon(size = 30): string {
  const r = size / 2;
  const sq = Math.floor(size / 5);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<defs>` +
    `<pattern id="ck2" width="${sq * 2}" height="${sq * 2}" patternUnits="userSpaceOnUse">` +
    `<rect width="${sq * 2}" height="${sq * 2}" fill="white"/>` +
    `<rect width="${sq}" height="${sq}" fill="#111"/>` +
    `<rect x="${sq}" y="${sq}" width="${sq}" height="${sq}" fill="#111"/>` +
    `</pattern>` +
    `<clipPath id="clc2"><circle cx="${r}" cy="${r}" r="${r - 1}"/></clipPath>` +
    `<clipPath id="cll2"><rect x="0" y="0" width="${r}" height="${size}"/></clipPath>` +
    `<clipPath id="clr2"><rect x="${r}" y="0" width="${r}" height="${size}"/></clipPath>` +
    `</defs>` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="#059669"/>` +
    `<rect x="${r}" y="0" width="${r}" height="${size}" fill="url(#ck2)" clip-path="url(#clc2)"/>` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="none" stroke="white" stroke-width="2.5"/>` +
    `<text x="${r}" y="${r + 4}" text-anchor="middle" fill="white" font-size="${Math.floor(size * 0.4)}" font-weight="bold" font-family="Arial,sans-serif" stroke="#059669" stroke-width="2" paint-order="stroke">S</text>` +
    `</svg>`
  )}`;
}

function checkerPinIcon(size = 30): string {
  const r = size / 2;
  const sq = Math.floor(size / 5);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<defs>` +
    `<pattern id="ck" width="${sq * 2}" height="${sq * 2}" patternUnits="userSpaceOnUse">` +
    `<rect width="${sq * 2}" height="${sq * 2}" fill="white"/>` +
    `<rect width="${sq}" height="${sq}" fill="#111"/>` +
    `<rect x="${sq}" y="${sq}" width="${sq}" height="${sq}" fill="#111"/>` +
    `</pattern>` +
    `<clipPath id="cl"><circle cx="${r}" cy="${r}" r="${r - 1}"/></clipPath>` +
    `</defs>` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="white" stroke="white" stroke-width="2.5"/>` +
    `<rect width="${size}" height="${size}" fill="url(#ck)" clip-path="url(#cl)"/>` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="rgba(0,0,0,0.15)" clip-path="url(#cl)"/>` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="none" stroke="white" stroke-width="2.5"/>` +
    `<text x="${r}" y="${r + 4}" text-anchor="middle" fill="white" font-size="${Math.floor(size * 0.4)}" font-weight="bold" font-family="Arial,sans-serif" stroke="#222" stroke-width="3" paint-order="stroke">E</text>` +
    `</svg>`
  )}`;
}

function isSamePlace(a: Stop, b: Stop): boolean {
  return Math.abs(a.lat - b.lat) < 0.005 && Math.abs(a.lng - b.lng) < 0.005;
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
