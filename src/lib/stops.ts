export type StopKind = "start" | "intermediate" | "end";

export interface SortableStop {
  order: number;
  kind?: StopKind;
  arrivalDate?: string;
}

/**
 * Anchor stops are first-class and pinned by `kind` regardless of date:
 * the stop with `kind: "start"` always comes first, `kind: "end"` always
 * comes last. Intermediates sort chronologically between them.
 *
 * For backwards compatibility with stops written before `kind` existed,
 * fall back to the legacy "order=0 is start, last is end" inference.
 */
export function sortStopsByDate<T extends SortableStop>(stops: T[]): T[] {
  const inferred = stops.map(s => ({ stop: s, kind: inferKind(s, stops) }));

  const start = inferred.filter(x => x.kind === "start").map(x => x.stop);
  const end = inferred.filter(x => x.kind === "end").map(x => x.stop);
  const middle = inferred
    .filter(x => x.kind === "intermediate")
    .map(x => x.stop)
    .sort((a, b) => {
      if (a.arrivalDate && b.arrivalDate) return a.arrivalDate.localeCompare(b.arrivalDate);
      if (a.arrivalDate) return -1;
      if (b.arrivalDate) return 1;
      return a.order - b.order;
    });

  return [...start, ...middle, ...end];
}

function inferKind<T extends SortableStop>(stop: T, all: T[]): StopKind {
  if (stop.kind) return stop.kind;
  if (stop.order === 0) return "start";
  const maxOrder = Math.max(...all.map(s => s.order));
  if (stop.order === maxOrder && all.length > 1) return "end";
  return "intermediate";
}
