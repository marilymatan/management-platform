export const PROFILE_LABELS: Record<string, string> = {
  single: "רווק/ה",
  married: "נשוי/אה",
  divorced: "גרוש/ה",
  widowed: "אלמן/ה",
  salaried: "שכיר/ה",
  self_employed: "עצמאי/ת",
  business_owner: "בעל/ת עסק",
  student: "סטודנט/ית",
  retired: "פנסיונר/ית",
  unemployed: "לא עובד/ת",
  male: "זכר",
  female: "נקבה",
  other: "אחר",
  below_5k: "מתחת ל-5,000 ₪",
  "5k_10k": "5,000-10,000 ₪",
  "10k_15k": "10,000-15,000 ₪",
  "15k_25k": "15,000-25,000 ₪",
  "25k_40k": "25,000-40,000 ₪",
  above_40k: "מעל 40,000 ₪",
};

export function buildProfileContext(profile: any): string {
  const parts: string[] = [];

  if (profile?.dateOfBirth) {
    const age = Math.floor(
      (Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    );
    parts.push(`גיל: ${age}`);
  }
  if (profile?.gender) parts.push(`מין: ${PROFILE_LABELS[profile.gender] || profile.gender}`);
  if (profile?.maritalStatus) {
    parts.push(`מצב משפחתי: ${PROFILE_LABELS[profile.maritalStatus] || profile.maritalStatus}`);
  }
  if ((profile?.numberOfChildren ?? 0) > 0) {
    parts.push(`מספר ילדים: ${profile.numberOfChildren}`);
    if (profile?.childrenAges) parts.push(`גילאי ילדים: ${profile.childrenAges}`);
  }
  if (profile?.employmentStatus) {
    parts.push(`תעסוקה: ${PROFILE_LABELS[profile.employmentStatus] || profile.employmentStatus}`);
  }
  if (profile?.incomeRange) {
    parts.push(`הכנסה חודשית: ${PROFILE_LABELS[profile.incomeRange] || profile.incomeRange}`);
  }
  if (profile?.businessName) parts.push(`שם העסק: ${profile.businessName}`);
  if (profile?.businessTaxId) parts.push(`מספר מזהה עסקי: ${profile.businessTaxId}`);
  if (profile?.businessEmailDomains) {
    parts.push(`דומיינים או מיילים עסקיים: ${profile.businessEmailDomains}`);
  }
  if (profile?.ownsApartment) parts.push("בעלות על דירה: כן");
  if (profile?.hasActiveMortgage) parts.push("משכנתא פעילה: כן");
  if ((profile?.numberOfVehicles ?? 0) > 0) parts.push(`מספר רכבים: ${profile.numberOfVehicles}`);
  if (profile?.hasExtremeSports) parts.push("ספורט אקסטרימי או תחביבים מסוכנים: כן");
  if (profile?.hasSpecialHealthConditions) {
    parts.push("מצב בריאותי מיוחד: כן");
    if (profile?.healthConditionsDetails) {
      parts.push(`פרטי מצב בריאותי: ${profile.healthConditionsDetails}`);
    }
  }
  if (profile?.hasPets) parts.push("חיות מחמד: כן");

  return parts.join("\n");
}

export function formatIls(value: number) {
  return `₪${Math.round(value).toLocaleString("he-IL")}`;
}

export function formatMonthLabel(monthKey?: string) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-");
  const monthLabels: Record<string, string> = {
    "01": "ינואר",
    "02": "פברואר",
    "03": "מרץ",
    "04": "אפריל",
    "05": "מאי",
    "06": "יוני",
    "07": "יולי",
    "08": "אוגוסט",
    "09": "ספטמבר",
    "10": "אוקטובר",
    "11": "נובמבר",
    "12": "דצמבר",
  };
  return `${monthLabels[month] ?? month} ${year}`;
}
