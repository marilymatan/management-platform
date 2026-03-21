export type ScanStatusEntry = { sessionId: string; status: string };

export function mergeScanStatuses(
  prev: Map<string, string>,
  items: ScanStatusEntry[],
  establishBaseline: boolean,
): { next: Map<string, string>; newlyCompleted: string[] } {
  const newlyCompleted: string[] = [];
  if (establishBaseline) {
    const next = new Map<string, string>();
    for (const a of items) {
      next.set(a.sessionId, a.status);
    }
    return { next, newlyCompleted: [] };
  }
  const next = new Map(prev);
  for (const a of items) {
    const was = next.get(a.sessionId);
    if (was === undefined) {
      next.set(a.sessionId, a.status);
      continue;
    }
    if (was !== "completed" && a.status === "completed") {
      newlyCompleted.push(a.sessionId);
    }
    next.set(a.sessionId, a.status);
  }
  return { next, newlyCompleted };
}
