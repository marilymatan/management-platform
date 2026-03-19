# דוח אבטחת מידע — מנתח פוליסות ביטוח

**תאריך:** 14 במרץ 2026  
**גרסה:** 1.0  
**סטטוס:** מאובטח

---

## 1. סיכום מנהלים

המערכת עברה חיזוק אבטחה מקיף הכולל חסימה גיאוגרפית (ישראל בלבד), הגנה מפני SQL Injection ו-XSS, אכיפת גישה פרטית, הגבלת קצב בקשות, וכותרות אבטחה מתקדמות. כל הנתונים הרגישים מוצפנים ומאוחסנים בצורה מאובטחת.

---

## 2. מיפוי נתונים — איפה כל דבר נשמר ומעובד

| סוג נתון | מיקום אחסון | הצפנה | גישה |
|---|---|---|---|
| **פרטי משתמש** (שם, אימייל, תפקיד) | TiDB Database (טבלת `users`) | הצפנת SSL בתעבורה | רק המשתמש עצמו + אדמין |
| **פוליסות ביטוח (PDF)** | S3 Storage (bucket מאובטח) | הצפנת SSL בתעבורה + at-rest | רק המשתמש שהעלה |
| **תוצאות ניתוח פוליסה** | TiDB Database (טבלת `analyses`) | הצפנת SSL בתעבורה | רק המשתמש שיצר |
| **היסטוריית צ'אט** | TiDB Database (טבלת `chatMessages`) | הצפנת SSL בתעבורה | רק המשתמש שיצר |
| **טוקני Gmail** (access/refresh) | TiDB Database (טבלת `gmailConnections`) | **הצפנת AES-256-GCM** + SSL | רק המשתמש עצמו |
| **חשבוניות מ-Gmail** | TiDB Database (טבלת `smartInvoices`) | הצפנת SSL בתעבורה | רק המשתמש עצמו |
| **קבצי PDF מצורפים (חשבוניות)** | S3 Storage | הצפנת SSL בתעבורה + at-rest | רק המשתמש עצמו |
| **Session cookies** | דפדפן המשתמש | חתימת JWT + HttpOnly + Secure | רק הדפדפן של המשתמש |
| **לוגי שימוש API** | TiDB Database (טבלת `apiUsageLogs`) | הצפנת SSL בתעבורה | רק אדמין |

---

## 3. הגנות שהוטמעו

### 3.1 חסימה גיאוגרפית (Israel Only)

המערכת חוסמת כל בקשה שמגיעה מ-IP שאינו ישראלי. ההגנה מבוססת על **geoip-lite** (MaxMind database).

- **מדינות מותרות:** ישראל (IL) בלבד
- **IPs פרטיים:** מותרים (localhost, 192.168.x.x, 10.x.x.x) — לפיתוח
- **סביבת פיתוח:** חסימה מושבתת ב-development mode
- **נתיבים פטורים:** `/api/health` בלבד
- **לוגים:** כל חסימה נרשמת עם IP, מדינה, ונתיב

### 3.2 הגנה מפני SQL Injection

- **Drizzle ORM** — כל השאילתות משתמשות ב-parameterized queries. אין שום מקום בקוד שבו מחרוזות משתמש מוכנסות ישירות ל-SQL
- **Zod validation** — כל קלט מאומת עם סכמת Zod לפני שמגיע ל-DB
- **helper function** — `hasSqlInjectionPatterns()` זמינה לבדיקות נוספות

### 3.3 הגנה מפני XSS (Cross-Site Scripting)

- **React auto-escaping** — React מבצע escaping אוטומטי של כל output ל-DOM
- **Content-Security-Policy** — CSP header מגביל מקורות סקריפטים, סגנונות, ותמונות
- **X-XSS-Protection** — הגנה לדפדפנים ישנים
- **sanitizeHtml()** — פונקציית עזר להסרת תגיות HTML מקלט

### 3.4 כותרות אבטחה

| כותרת | ערך | תפקיד |
|---|---|---|
| `X-Frame-Options` | `DENY` | מניעת clickjacking |
| `X-Content-Type-Options` | `nosniff` | מניעת MIME type sniffing |
| `X-XSS-Protection` | `1; mode=block` | הגנת XSS לדפדפנים ישנים |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | הגבלת referrer |
| `Permissions-Policy` | `camera=(), microphone=()...` | חסימת תכונות מסוכנות |
| `Content-Security-Policy` | מפורט | הגבלת מקורות תוכן |
| `Strict-Transport-Security` | `max-age=31536000` | אכיפת HTTPS (שנה) |

### 3.5 הגבלת קצב בקשות (Rate Limiting)

| נתיב | מגבלה | חלון זמן |
|---|---|---|
| `/api/trpc/*` | 60 בקשות | דקה |
| `/api/oauth/*` | 10 בקשות | דקה |
| `/api/gmail/*` | 10 בקשות | דקה |

### 3.6 אכיפת גישה פרטית

- **כל ה-procedures** (upload, analyze, chat, getChatHistory, getAnalysis) הם `protectedProcedure` — דורשים session מאומת
- **Frontend** — כל הדפים דורשים התחברות (`redirectOnUnauthenticated: true`)
- **Admin procedures** — דורשים `role === 'admin'` בנוסף ל-session
- **Gmail procedures** — כולם `protectedProcedure` עם בדיקת `ctx.user`

### 3.7 הצפנת טוקני Gmail

- טוקני Gmail (access token, refresh token) מוצפנים עם **AES-256-GCM** לפני שמירה ב-DB
- מפתח ההצפנה נגזר מ-`JWT_SECRET` באמצעות SHA-256
- כל טוקן מוצפן עם IV ייחודי (12 bytes)
- Authentication tag (16 bytes) מאומת בפענוח

---

## 4. בדיקות אבטחה

כל ההגנות נבדקות ב-69 טסטים אוטומטיים:

- **24 טסטים** — security.test.ts (geo-blocking, headers, XSS, SQL injection)
- **9 טסטים** — policy.test.ts (כולל בדיקת דחיית בקשות לא מאומתות)
- **28 טסטים** — gmail.integration.test.ts
- **7 טסטים** — admin.usage.test.ts
- **1 טסט** — auth.logout.test.ts

---

## 5. המלצות לעתיד

1. **WAF (Web Application Firewall)** — שכבת הגנה נוספת ברמת ה-CDN
2. **2FA** — אימות דו-שלבי למשתמשים
3. **Audit log** — לוג מפורט של כל פעולה רגישה (כניסה, יציאה, שינוי הרשאות)
4. **Penetration testing** — בדיקת חדירה מקצועית
5. **GDPR compliance** — מנגנון מחיקת נתונים אישיים לפי בקשת המשתמש
