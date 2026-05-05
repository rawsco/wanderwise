"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, X, Plus, Star } from "lucide-react";

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

interface Props {
  tripId: string;
  stopId: string;
  results: SearchResult[];
  onResults: (results: SearchResult[]) => void;
  onClear: () => void;
  onAddSearchResult: (result: SearchResult) => Promise<void>;
}

const RADIUS_PRESETS_KM = [5, 10, 25, 50, 100] as const;
type RadiusKm = typeof RADIUS_PRESETS_KM[number];

export function ActivitySearch({ tripId, stopId, results, onResults, onClear, onAddSearchResult }: Props) {
  const [query, setQuery] = useState("");
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(10);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didSearch, setDidSearch] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  async function runSearch() {
    const text = query.trim();
    if (!text) return;
    setSearching(true);
    setError(null);

    try {
      const res = await fetch(`/api/trips/${tripId}/stops/${stopId}/places-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, radiusKm }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const detail = typeof body?.error === "string" ? body.error : `HTTP ${res.status}`;
        console.error("[activity-search] server error", res.status, body);
        setError(`Search failed: ${detail}`);
        return;
      }

      const json = (await res.json()) as { results: SearchResult[] };
      onResults(json.results);
      setDidSearch(true);
    } catch (err) {
      console.error("[activity-search] network error", err);
      setError(err instanceof Error ? `Search failed: ${err.message}` : "Search failed — try again.");
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQuery("");
    setError(null);
    setDidSearch(false);
    onClear();
  }

  async function handleAdd(result: SearchResult) {
    setAdding(result.placeId);
    await onAddSearchResult(result);
    setAdding(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-gray-500 mr-1">Within</span>
        {RADIUS_PRESETS_KM.map(km => {
          const active = km === radiusKm;
          return (
            <button
              key={km}
              type="button"
              onClick={() => setRadiusKm(km)}
              className="text-xs font-medium rounded-full px-2.5 py-1 border transition-colors"
              style={{
                backgroundColor: active ? "#059669" : "white",
                color: active ? "white" : "#4b5563",
                borderColor: active ? "#059669" : "#e5e7eb",
              }}
            >
              {km} km
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") runSearch(); }}
          placeholder="Search pubs, restaurants, attractions…"
          className="h-11 text-base flex-1 min-w-0"
          autoComplete="off"
        />
        <Button
          onClick={runSearch}
          disabled={searching || !query.trim()}
          className="h-11 px-4 shrink-0"
        >
          {searching
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Search className="h-4 w-4" />
          }
        </Button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {didSearch && !searching && (
        <div className="flex items-center justify-between text-xs">
          {results.length > 0 ? (
            <p className="text-gray-600">
              Top {results.length} {results.length === 1 ? "result" : "results"} — pick from the list or tap a pin.
            </p>
          ) : (
            <p className="text-gray-500">
              No results within {radiusKm} km. Try widening the range or a different search.
            </p>
          )}
          <button
            onClick={clearSearch}
            className="text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map(r => {
            const isAdding = adding === r.placeId;
            return (
              <div
                key={r.placeId}
                className="rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{r.name}</p>
                    {r.category && (
                      <p className="text-xs text-gray-500">{r.category}</p>
                    )}
                    <p className="text-xs text-gray-500 truncate mt-0.5">{r.address}</p>
                    {(r.rating != null || r.userRatingCount != null) && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-700">
                        {r.rating != null && (
                          <>
                            <Star className="h-3 w-3" style={{ fill: "#f59e0b", color: "#f59e0b" }} />
                            <span className="font-medium">{r.rating.toFixed(1)}</span>
                          </>
                        )}
                        {r.userRatingCount != null && (
                          <span className="text-gray-400">({r.userRatingCount.toLocaleString()})</span>
                        )}
                      </div>
                    )}
                    {r.summary && (
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{r.summary}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAdd(r)}
                    disabled={isAdding}
                    className="shrink-0 h-8 text-xs px-2.5"
                  >
                    {isAdding
                      ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      : <Plus className="h-3 w-3 mr-1" />
                    }
                    Add
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
