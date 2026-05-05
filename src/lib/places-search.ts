import { createHash } from "crypto";
import { SearchCacheEntity } from "./db/search-cache.entity";

export interface SearchResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingCount?: number;
  summary?: string;
  category?: string;
}

const CACHE_TTL_DAYS = 30;

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.editorialSummary",
  "places.primaryTypeDisplayName",
].join(",");

interface PlacesApiResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    rating?: number;
    userRatingCount?: number;
    editorialSummary?: { text?: string };
    primaryTypeDisplayName?: { text?: string };
  }>;
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function hashQuery(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function boundsForRadius(centerLat: number, centerLng: number, km: number) {
  const latDelta = km / 111;
  const lngDelta = km / (111 * Math.cos((centerLat * Math.PI) / 180));
  return {
    south: centerLat - latDelta,
    north: centerLat + latDelta,
    west: centerLng - lngDelta,
    east: centerLng + lngDelta,
  };
}

function logCacheEvent(result: "hit" | "miss", fields: Record<string, unknown>) {
  // Structured log line — picked up by CloudWatch Logs in deployed stages.
  // Define metric filters on { $.event = "places_search_cache" && $.result = "hit" }
  // and ".result = "miss" } to publish PlacesSearchCacheHit / PlacesSearchCacheMiss
  // CloudWatch metrics. Hit-rate dashboard = hit / (hit + miss).
  console.log(JSON.stringify({ event: "places_search_cache", result, ...fields }));
}

async function getCached(
  stopId: string,
  queryHash: string,
  radiusKm: number,
): Promise<SearchResult[] | null> {
  const result = await SearchCacheEntity.get({ stopId, queryHash, radiusKm }).go();
  if (!result.data) return null;

  // Belt-and-braces: DynamoDB TTL deletes items eventually (up to 48h lag),
  // so check expiry on read too. Items with no ttl (legacy) are treated as
  // expired and re-fetched.
  const ttl = result.data.ttl;
  if (typeof ttl !== "number" || ttl < Math.floor(Date.now() / 1000)) return null;

  return (result.data.results as SearchResult[] | undefined) ?? null;
}

async function putCached(
  stopId: string,
  queryHash: string,
  radiusKm: number,
  results: SearchResult[],
): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + CACHE_TTL_DAYS * 24 * 60 * 60;
  await SearchCacheEntity.put({
    stopId,
    queryHash,
    radiusKm,
    results,
    ttl,
  }).go();
}

async function callGoogle(
  query: string,
  stopLat: number,
  stopLng: number,
  radiusKm: number,
): Promise<SearchResult[]> {
  // TODO(prod): switch to a server-only Maps API key with HTTP referer/IP
  // restrictions; the NEXT_PUBLIC_ key is currently shared with the browser.
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");

  const { south, north, west, east } = boundsForRadius(stopLat, stopLng, radiusKm);

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      locationRestriction: {
        rectangle: {
          low: { latitude: south, longitude: west },
          high: { latitude: north, longitude: east },
        },
      },
      maxResultCount: 5,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Places API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as PlacesApiResponse;

  return (data.places ?? [])
    .filter(p => p.id && p.location)
    .map(p => ({
      placeId: p.id!,
      name: p.displayName?.text ?? "",
      address: p.formattedAddress ?? "",
      lat: p.location!.latitude,
      lng: p.location!.longitude,
      rating: p.rating,
      userRatingCount: p.userRatingCount,
      summary: p.editorialSummary?.text,
      category: p.primaryTypeDisplayName?.text,
    }));
}

export async function searchPlaces(args: {
  stopId: string;
  stopLat: number;
  stopLng: number;
  query: string;
  radiusKm: number;
}): Promise<SearchResult[]> {
  const { stopId, stopLat, stopLng, radiusKm } = args;
  const normalized = normalizeQuery(args.query);
  const queryHash = hashQuery(normalized);

  const cached = await getCached(stopId, queryHash, radiusKm);
  if (cached) {
    logCacheEvent("hit", { stopId, queryHash, radiusKm });
    return cached;
  }

  logCacheEvent("miss", { stopId, queryHash, radiusKm });
  const results = await callGoogle(normalized, stopLat, stopLng, radiusKm);
  await putCached(stopId, queryHash, radiusKm, results);
  return results;
}
