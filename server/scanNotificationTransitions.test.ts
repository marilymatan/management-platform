import { describe, expect, it } from "vitest";
import { mergeScanStatuses } from "@shared/scanNotificationTransitions";

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
