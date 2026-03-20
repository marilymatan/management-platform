export type InvoiceSummaryFlowDirection = "expense" | "income" | "unknown";

export type MonthlyInvoiceCategorySummary = {
  category: string;
  total: number;
  count: number;
};

export type MonthlyInvoiceSummary = {
  month: string;
  total: number;
  expenseTotal: number;
  incomeTotal: number;
  netTotal: number;
  unknownTotal: number;
  flowCounts: Record<InvoiceSummaryFlowDirection, number>;
  categories: MonthlyInvoiceCategorySummary[];
  incomeCategories: MonthlyInvoiceCategorySummary[];
};

type SummaryInvoice = {
  amount?: string | null;
  extractedData?: unknown;
  invoiceDate?: string | Date | null;
  createdAt: string | Date;
  category?: string | null;
  customCategory?: string | null;
  flowDirection?: string | null;
};

function getInvoiceAmount(inv: SummaryInvoice): number {
  let amount = parseFloat(inv.amount ?? "0");
  if ((!amount || isNaN(amount)) && inv.extractedData && typeof inv.extractedData === "object") {
    const extractedData = inv.extractedData as Record<string, unknown>;
    if (typeof extractedData.amount === "number") amount = extractedData.amount;
    else if (typeof extractedData.amount === "string") amount = parseFloat(extractedData.amount) || 0;
  }
  return isNaN(amount) ? 0 : amount;
}

function getInvoiceFlowDirection(inv: SummaryInvoice): InvoiceSummaryFlowDirection {
  if (inv.flowDirection === "expense" || inv.flowDirection === "income" || inv.flowDirection === "unknown") {
    return inv.flowDirection;
  }
  if (inv.extractedData && typeof inv.extractedData === "object") {
    const flowDirection = (inv.extractedData as Record<string, unknown>).flowDirection;
    if (flowDirection === "expense" || flowDirection === "income" || flowDirection === "unknown") {
      return flowDirection;
    }
  }
  return "expense";
}

export function summarizeMonthlyInvoices(invoices: SummaryInvoice[]): MonthlyInvoiceSummary[] {
  const monthMap: Record<string, {
    month: string;
    total: number;
    expenseTotal: number;
    incomeTotal: number;
    netTotal: number;
    unknownTotal: number;
    flowCounts: Record<InvoiceSummaryFlowDirection, number>;
    categories: Record<string, MonthlyInvoiceCategorySummary>;
    incomeCategories: Record<string, MonthlyInvoiceCategorySummary>;
  }> = {};

  for (const inv of invoices) {
    const category = inv.customCategory ?? inv.category ?? "אחר";
    const dateSource = inv.invoiceDate ?? inv.createdAt;
    const date = new Date(dateSource);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap[monthKey]) {
      monthMap[monthKey] = {
        month: monthKey,
        total: 0,
        expenseTotal: 0,
        incomeTotal: 0,
        netTotal: 0,
        unknownTotal: 0,
        flowCounts: { expense: 0, income: 0, unknown: 0 },
        categories: {},
        incomeCategories: {},
      };
    }

    const amount = getInvoiceAmount(inv);
    const flowDirection = getInvoiceFlowDirection(inv);
    monthMap[monthKey].flowCounts[flowDirection]++;

    if (flowDirection === "income") {
      if (!monthMap[monthKey].incomeCategories[category]) {
        monthMap[monthKey].incomeCategories[category] = { category, total: 0, count: 0 };
      }
      monthMap[monthKey].incomeCategories[category].total += amount;
      monthMap[monthKey].incomeCategories[category].count++;
      monthMap[monthKey].incomeTotal += amount;
      monthMap[monthKey].netTotal += amount;
      continue;
    }

    if (flowDirection === "unknown") {
      monthMap[monthKey].unknownTotal += amount;
      continue;
    }

    if (!monthMap[monthKey].categories[category]) {
      monthMap[monthKey].categories[category] = { category, total: 0, count: 0 };
    }
    monthMap[monthKey].categories[category].total += amount;
    monthMap[monthKey].categories[category].count++;
    monthMap[monthKey].total += amount;
    monthMap[monthKey].expenseTotal += amount;
    monthMap[monthKey].netTotal -= amount;
  }

  return Object.values(monthMap)
    .map((month) => ({
      month: month.month,
      total: month.total,
      expenseTotal: month.expenseTotal,
      incomeTotal: month.incomeTotal,
      netTotal: month.netTotal,
      unknownTotal: month.unknownTotal,
      flowCounts: month.flowCounts,
      categories: Object.values(month.categories).sort((a, b) => b.total - a.total),
      incomeCategories: Object.values(month.incomeCategories).sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}
