import { describe, expect, it } from "vitest";
import { formatGmailConnectionSummary, getConnectedGmailEmails } from "@/lib/gmailConnections";

describe("gmail connection display helpers", () => {
  it("normalizes and deduplicates connected gmail emails", () => {
    const emails = getConnectedGmailEmails([
      { email: "first@gmail.com" },
      { email: " first@gmail.com " },
      { email: "second@gmail.com" },
      { email: null },
    ]);

    expect(emails).toEqual(["first@gmail.com", "second@gmail.com"]);
  });

  it("describes a single connected gmail account clearly", () => {
    const summary = formatGmailConnectionSummary([{ email: "user@example.com" }]);

    expect(summary).toEqual({
      emails: ["user@example.com"],
      label: "user@example.com",
      detail: "חשבון Gmail מחובר ומוכן לסריקה.",
      connected: true,
    });
  });

  it("handles multiple gmail connections with a short summary label", () => {
    const summary = formatGmailConnectionSummary([
      { email: "primary@example.com" },
      { email: "backup@example.com" },
    ]);

    expect(summary).toEqual({
      emails: ["primary@example.com", "backup@example.com"],
      label: "primary@example.com ועוד 1 חשבונות",
      detail: "כמה חשבונות Gmail מחוברים לאותו משתמש.",
      connected: true,
    });
  });
});
