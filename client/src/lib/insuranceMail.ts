export type InsuranceMailExtractedData = {
  description?: string;
  invoiceNumber?: string | null;
  pdfUrl?: string;
  pdfFilename?: string;
  fromEmail?: string;
  currency?: string;
  amount?: number | string | null;
  issuerName?: string | null;
  recipientName?: string | null;
  documentType?: string;
  confidence?: number;
};

export type InsuranceMailLike = {
  provider?: string | null;
  category?: string | null;
  customCategory?: string | null;
  amount?: string | number | null;
  subject?: string | null;
  sourceEmail?: string | null;
  invoiceDate?: string | Date | null;
  createdAt?: string | Date | null;
  extractedData?: unknown;
};

const INSURANCE_MAIL_KEYWORDS = [
  "ביטוח",
  "פוליסה",
  "פרמיה",
  "חידוש",
  "כיסוי",
  "תביעה",
  "ביטוחי",
  "insurance",
  "policy",
  "premium",
  "renewal",
  "claim",
];

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

export function getInsuranceMailExtractedData(item: { extractedData?: unknown }): InsuranceMailExtractedData {
  if (!item.extractedData || typeof item.extractedData !== "object") {
    return {};
  }
  return item.extractedData as InsuranceMailExtractedData;
}

export function getInsuranceMailAmount(item: InsuranceMailLike): number {
  if (item.amount != null) {
    const parsed = Number(item.amount);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const extracted = getInsuranceMailExtractedData(item);
  if (typeof extracted.amount === "number" && extracted.amount > 0) {
    return extracted.amount;
  }
  if (typeof extracted.amount === "string") {
    const parsed = Number.parseFloat(extracted.amount);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

export function getInsuranceMailCurrencySymbol(item: InsuranceMailLike) {
  const extracted = getInsuranceMailExtractedData(item);
  if (extracted.currency === "USD") return "$";
  if (extracted.currency === "EUR") return "EUR";
  return "₪";
}

export function formatInsuranceMailAmount(item: InsuranceMailLike, amount = getInsuranceMailAmount(item)) {
  return `${getInsuranceMailCurrencySymbol(item)}${amount.toLocaleString("he-IL")}`;
}

export function getInsuranceMailSearchText(item: InsuranceMailLike) {
  const extracted = getInsuranceMailExtractedData(item);
  return normalizeText([
    item.provider,
    item.category,
    item.customCategory,
    item.subject,
    item.sourceEmail,
    extracted.description,
    extracted.invoiceNumber,
    extracted.fromEmail,
    extracted.pdfFilename,
    extracted.issuerName,
    extracted.recipientName,
  ].filter(Boolean).join(" "));
}

export function isInsuranceRelatedInvoice(item: InsuranceMailLike) {
  if (item.customCategory === "ביטוח" || item.category === "ביטוח") {
    return true;
  }

  const searchableText = getInsuranceMailSearchText(item);
  return INSURANCE_MAIL_KEYWORDS.some((keyword) => searchableText.includes(keyword));
}

export function hasInsuranceMailAttachment(item: InsuranceMailLike) {
  return Boolean(getInsuranceMailExtractedData(item).pdfUrl);
}

export function getInsuranceMailDate(item: InsuranceMailLike) {
  const candidate = item.invoiceDate ?? item.createdAt ?? null;
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
