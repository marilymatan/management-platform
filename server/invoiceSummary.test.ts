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

  it("falls back to extracted string amounts and defaults missing flow direction to expense", () => {
    const summary = summarizeMonthlyInvoices([
      {
        createdAt: new Date("2026-06-01"),
        amount: "not-a-number",
        category: "ביטוח",
        extractedData: {
          amount: "145.5",
        },
      },
    ]);

    expect(summary[0].expenseTotal).toBe(145.5);
    expect(summary[0].flowCounts.expense).toBe(1);
    expect(summary[0].categories[0]).toEqual({
      category: "ביטוח",
      total: 145.5,
      count: 1,
    });
  });

  it("uses custom categories and sorts months and category totals in descending order", () => {
    const summary = summarizeMonthlyInvoices([
      {
        createdAt: new Date("2026-02-03"),
        amount: "80",
        category: "כללי",
        customCategory: "ביטוח נסיעות",
        flowDirection: "expense",
      },
      {
        createdAt: new Date("2026-02-04"),
        amount: "210",
        category: "כללי",
        customCategory: "ביטוח בריאות",
        flowDirection: "expense",
      },
      {
        createdAt: new Date("2026-01-10"),
        amount: "50",
        category: "כללי",
        flowDirection: "expense",
      },
    ]);

    expect(summary.map((month) => month.month)).toEqual(["2026-02", "2026-01"]);
    expect(summary[0].categories.map((category) => category.category)).toEqual([
      "ביטוח בריאות",
      "ביטוח נסיעות",
    ]);
    expect(summary[0].categories[0].total).toBe(210);
  });

  it("uses numeric extracted amounts and the fallback category when no category is provided", () => {
    const summary = summarizeMonthlyInvoices([
      {
        createdAt: new Date("2026-07-01"),
        amount: null,
        extractedData: {
          amount: 66,
        },
      },
      {
        createdAt: new Date("2026-07-02"),
        amount: "NaN",
      },
    ]);

    expect(summary[0].expenseTotal).toBe(66);
    expect(summary[0].categories).toEqual([
      {
        category: "אחר",
        total: 66,
        count: 2,
      },
    ]);
  });
});
