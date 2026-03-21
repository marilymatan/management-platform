export type ScanStatusEntry = { sessionId: string; status: string };

export type ScanPollingEntry = ScanStatusEntry & {
  createdAt?: string | Date | null;
  startedAt?: string | Date | null;
  lastHeartbeatAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type ScanPollOptions = {
  intervalMs?: number;
  maxAgeMs?: number;
  nowMs?: number;
};

const DEFAULT_SCAN_POLL_INTERVAL_MS = 20_000;
const DEFAULT_SCAN_POLL_MAX_AGE_MS = 15 * 60 * 1000;

function toTimeMs(value: string | Date | null | undefined) {
  if (value == null) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function getEntryActivityMs(entry: ScanPollingEntry) {
  return (
    toTimeMs(entry.lastHeartbeatAt) ??
    toTimeMs(entry.startedAt) ??
    toTimeMs(entry.updatedAt) ??
    toTimeMs(entry.createdAt)
  );
}

function asArray(entryOrEntries: ScanPollingEntry | ScanPollingEntry[] | null | undefined) {
  if (!entryOrEntries) return [];
  return Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
}

export function getAnalysisPollInterval(
  entryOrEntries: ScanPollingEntry | ScanPollingEntry[] | null | undefined,
  options: ScanPollOptions = {},
): number | false {
  const intervalMs = options.intervalMs ?? DEFAULT_SCAN_POLL_INTERVAL_MS;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_SCAN_POLL_MAX_AGE_MS;
  const nowMs = options.nowMs ?? Date.now();

  const shouldPoll = asArray(entryOrEntries).some((entry) => {
    if (entry.status !== "pending" && entry.status !== "processing") {
      return false;
    }

    const activityMs = getEntryActivityMs(entry);
    if (activityMs == null) {
      return true;
    }

    return nowMs - activityMs <= maxAgeMs;
  });

  return shouldPoll ? intervalMs : false;
}

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
