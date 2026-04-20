export function sortStopsByDate<T extends { order: number; arrivalDate?: string }>(stops: T[]): T[] {
  return [...stops].sort((a, b) => {
    const aHasDate = !!a.arrivalDate;
    const bHasDate = !!b.arrivalDate;
    if (aHasDate && bHasDate) return a.arrivalDate!.localeCompare(b.arrivalDate!);
    if (!aHasDate && !bHasDate) return a.order - b.order;
    // No-date stop: order 0 = start (goes first), otherwise end (goes last)
    if (!aHasDate) return a.order === 0 ? -1 : 1;
    return b.order === 0 ? 1 : -1;
  });
}
