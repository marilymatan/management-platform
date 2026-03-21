export type GmailConnectionLike = {
  id?: number;
  email?: string | null;
  lastSyncedAt?: string | Date | null;
  lastSyncCount?: number | null;
};

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim();
  return trimmed ? trimmed : null;
}

export function getConnectedGmailEmails(connections?: GmailConnectionLike[] | null) {
  const emails = (connections ?? [])
    .map((connection) => normalizeEmail(connection.email))
    .filter((email): email is string => Boolean(email));
  return Array.from(new Set(emails));
}

export function formatGmailConnectionSummary(connections?: GmailConnectionLike[] | null) {
  const emails = getConnectedGmailEmails(connections);
  if (emails.length === 0) {
    return {
      emails,
      label: "לא נמצא מייל מחובר",
      detail: "אין עדיין חשבון Gmail מקושר לחשבון הזה.",
      connected: false,
    };
  }

  if (emails.length === 1) {
    return {
      emails,
      label: emails[0],
      detail: "חשבון Gmail מחובר ומוכן לסריקה.",
      connected: true,
    };
  }

  return {
    emails,
    label: `${emails[0]} ועוד ${emails.length - 1} חשבונות`,
    detail: "כמה חשבונות Gmail מחוברים לאותו משתמש.",
    connected: true,
  };
}
