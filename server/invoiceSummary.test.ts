import { describe, expect, it } from "vitest";
import { summarizeMonthlyInvoices } from "./invoiceSummary";

describe("summarizeMonthlyInvoices", () => {
  it("separates income from expenses in the same month", () => {
    const summary = summarizeMonthlyInvoices([
      {
        createdAt: new Date("2026-03-10"),
        invoiceDate: "2026-03-10",
        amount: "100",
        category: "אחר",
        flowDirection: "expense",
      },
      {
        createdAt: new Date("2026-03-15"),
        invoiceDate: "2026-03-15",
        amount: "250",
        category: "אחר",
        flowDirection: "income",
      },
    ]);

    expect(summary).toHaveLength(1);
    expect(summary[0].total).toBe(100);
    expect(summary[0].expenseTotal).toBe(100);
    expect(summary[0].incomeTotal).toBe(250);
    expect(summary[0].netTotal).toBe(150);
    expect(summary[0].flowCounts.expense).toBe(1);
    expect(summary[0].flowCounts.income).toBe(1);
  });

  it("uses extractedData flowDirection when the column is missing", () => {
    const summary = summarizeMonthlyInvoices([
      {
        createdAt: new Date("2026-04-01"),
        amount: "180",
        category: "אחר",
        extractedData: {
          flowDirection: "income",
          amount: 180,
        },
      },
    ]);

    expect(summary[0].incomeTotal).toBe(180);
    expect(summary[0].expenseTotal).toBe(0);
    expect(summary[0].flowCounts.income).toBe(1);
  });

  it("tracks unknown flowDirection without counting it as expense", () => {
    const summary = summarizeMonthlyInvoices([
      {
        createdAt: new Date("2026-05-01"),
        amount: "90",
        category: "אחר",
        flowDirection: "unknown",
      },
    ]);

    expect(summary[0].unknownTotal).toBe(90);
    expect(summary[0].expenseTotal).toBe(0);
    expect(summary[0].incomeTotal).toBe(0);
    expect(summary[0].flowCounts.unknown).toBe(1);
  });
});
