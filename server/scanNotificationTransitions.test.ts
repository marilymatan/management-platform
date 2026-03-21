import { describe, expect, it } from "vitest";
import { getAnalysisPollInterval, mergeScanStatuses } from "@shared/scanNotificationTransitions";

describe("mergeScanStatuses", () => {
  it("should record baseline without completions", () => {
    const prev = new Map<string, string>();
    const { next, newlyCompleted } = mergeScanStatuses(
      prev,
      [
        { sessionId: "a", status: "pending" },
        { sessionId: "b", status: "completed" },
      ],
      true,
    );
    expect(newlyCompleted).toEqual([]);
    expect(next.get("a")).toBe("pending");
    expect(next.get("b")).toBe("completed");
  });

  it("should detect transition to completed", () => {
    const prev = new Map<string, string>([
      ["a", "processing"],
      ["b", "completed"],
    ]);
    const { next, newlyCompleted } = mergeScanStatuses(
      prev,
      [
        { sessionId: "a", status: "completed" },
        { sessionId: "b", status: "completed" },
      ],
      false,
    );
    expect(newlyCompleted).toEqual(["a"]);
    expect(next.get("a")).toBe("completed");
  });

  it("should not emit when new session appears as completed", () => {
    const prev = new Map<string, string>([["a", "pending"]]);
    const { next, newlyCompleted } = mergeScanStatuses(
      prev,
      [
        { sessionId: "a", status: "pending" },
        { sessionId: "c", status: "completed" },
      ],
      false,
    );
    expect(newlyCompleted).toEqual([]);
    expect(next.get("c")).toBe("completed");
  });
});

describe("getAnalysisPollInterval", () => {
  it("polls recent in-flight analyses", () => {
    expect(
      getAnalysisPollInterval(
        {
          sessionId: "a",
          status: "pending",
          createdAt: new Date("2026-03-21T10:00:00.000Z"),
        },
        { nowMs: new Date("2026-03-21T10:05:00.000Z").getTime(), intervalMs: 12_000 },
      )
    ).toBe(12_000);
  });

  it("stops polling stale in-flight analyses", () => {
    expect(
      getAnalysisPollInterval(
        {
          sessionId: "a",
          status: "processing",
          startedAt: new Date("2026-03-21T09:00:00.000Z"),
        },
        { nowMs: new Date("2026-03-21T10:05:00.000Z").getTime(), maxAgeMs: 15 * 60 * 1000 },
      )
    ).toBe(false);
  });

  it("uses the most recent heartbeat when available", () => {
    expect(
      getAnalysisPollInterval(
        {
          sessionId: "a",
          status: "processing",
          createdAt: new Date("2026-03-21T09:00:00.000Z"),
          startedAt: new Date("2026-03-21T09:30:00.000Z"),
          lastHeartbeatAt: new Date("2026-03-21T10:03:30.000Z"),
        },
        { nowMs: new Date("2026-03-21T10:05:00.000Z").getTime(), intervalMs: 9_000 },
      )
    ).toBe(9_000);
  });
});
