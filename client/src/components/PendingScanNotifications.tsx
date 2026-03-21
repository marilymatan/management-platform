import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { getAnalysisPollInterval, mergeScanStatuses } from "@shared/scanNotificationTransitions";

type AnalysisRow = {
  sessionId: string;
  status: string;
  createdAt?: string | Date | null;
  startedAt?: string | Date | null;
  lastHeartbeatAt?: string | Date | null;
  updatedAt?: string | Date | null;
  analysisResult?: { generalInfo?: { policyName?: string | null } | null } | null;
};

const PROMPT_KEY = "lumi-scan-notif-prompt-dismissed";

function getPolicyLabel(row: AnalysisRow) {
  const name = row.analysisResult?.generalInfo?.policyName;
  if (typeof name === "string" && name.trim().length > 0) {
    return name.trim();
  }
  return "סריקת פוליסה";
}

export function PendingScanNotifications() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [promptDismissed, setPromptDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(PROMPT_KEY) === "1";
  });
  const statusMapRef = useRef(new Map<string, string>());
  const baselineEstablishedRef = useRef(false);

  const { data } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: Boolean(user) && location !== "/login",
    refetchInterval: query => getAnalysisPollInterval(query.state.data as AnalysisRow[] | undefined, { intervalMs: 20_000 }),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!user) {
      baselineEstablishedRef.current = false;
      statusMapRef.current = new Map();
    }
  }, [user]);

  useEffect(() => {
    if (!user || location === "/login") return;
    if (data === undefined) return;

    const list = (data ?? []) as AnalysisRow[];

    if (!baselineEstablishedRef.current) {
      const { next } = mergeScanStatuses(statusMapRef.current, list, true);
      statusMapRef.current = next;
      baselineEstablishedRef.current = true;
      return;
    }

    const { next, newlyCompleted } = mergeScanStatuses(statusMapRef.current, list, false);
    statusMapRef.current = next;

    for (const sessionId of newlyCompleted) {
      const row = list.find(r => r.sessionId === sessionId);
      if (!row) continue;
      const label = getPolicyLabel(row);
      toast.success(`הסריקה הושלמה: ${label}`, {
        duration: 10000,
        action: {
          label: "פתיחה",
          onClick: () => {
            window.location.assign(`/insurance/${sessionId}`);
          },
        },
      });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("הסריקה הושלמה", {
            body: `${label} מוכנה לצפייה`,
            tag: `lumi-scan-${sessionId}`,
          });
        } catch {}
      }
    }
  }, [data, user, location]);

  const list = (data ?? []) as AnalysisRow[];
  const hasInFlight = list.some(
    row => row.status === "pending" || row.status === "processing",
  );
  const canPrompt =
    typeof Notification !== "undefined" &&
    Notification.permission === "default" &&
    hasInFlight &&
    !promptDismissed &&
    Boolean(user) &&
    location !== "/login";

  if (!canPrompt) {
    return null;
  }

  return (
    <div
      className="fixed bottom-24 z-40 max-w-md rounded-lg border border-border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80 end-4 start-auto"
      dir="rtl"
      data-testid="scan-notification-prompt"
      role="region"
      aria-label="הפעלת התראות על סיום סריקה"
    >
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-foreground">התראה כשהסריקה מסתיימת</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            אפשר לקבל התראת דפדפן גם כשאתם בלשונית אחרת. לא נשלח דבר ללא אישור.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              data-testid="scan-notification-enable"
              onClick={async () => {
                try {
                  await Notification.requestPermission();
                } catch {}
                window.localStorage.setItem(PROMPT_KEY, "1");
                setPromptDismissed(true);
              }}
            >
              הפעלת התראות
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="scan-notification-prompt-dismiss"
              onClick={() => {
                window.localStorage.setItem(PROMPT_KEY, "1");
                setPromptDismissed(true);
              }}
            >
              לא עכשיו
            </Button>
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="סגירת ההודעה"
          data-testid="scan-notification-prompt-close"
          onClick={() => {
            window.localStorage.setItem(PROMPT_KEY, "1");
            setPromptDismissed(true);
          }}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
