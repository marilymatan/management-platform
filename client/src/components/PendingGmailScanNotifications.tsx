import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type GmailScanJob = {
  jobId: string;
  status: string;
  errorMessage?: string | null;
  result?: {
    scanned?: number | null;
    saved?: number | null;
    discoveriesSaved?: number | null;
  } | null;
};

function isActiveStatus(status?: string | null) {
  return status === "pending" || status === "processing";
}

function buildCompletionMessage(job: GmailScanJob) {
  const scanned = job.result?.scanned ?? 0;
  const saved = job.result?.saved ?? 0;
  const discoveriesSaved = job.result?.discoveriesSaved ?? 0;

  if (saved === 0 && discoveriesSaved === 0) {
    return `סריקת Gmail הושלמה. נסרקו ${scanned} מיילים ולא זוהו פריטים חדשים.`;
  }

  return `סריקת Gmail הושלמה. נסרקו ${scanned} מיילים, נשמרו ${saved} פריטים וזוהו ${discoveriesSaved} ממצאים ביטוחיים.`;
}

export function PendingGmailScanNotifications() {
  const { user } = useAuth();
  const [location] = useLocation();
  const utils = trpc.useUtils();
  const previousRef = useRef<{ jobId: string | null; status: string | null }>({
    jobId: null,
    status: null,
  });

  const { data } = trpc.gmail.getScanStatus.useQuery(undefined, {
    enabled: Boolean(user) && location !== "/login",
    refetchInterval: (query) => {
      const job = query.state.data as GmailScanJob | undefined;
      return job && isActiveStatus(job.status) ? 3000 : false;
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (!user) {
      previousRef.current = { jobId: null, status: null };
    }
  }, [user]);

  useEffect(() => {
    if (!data) {
      previousRef.current = { jobId: null, status: null };
      return;
    }

    const previous = previousRef.current;
    const transitionedFromActive =
      previous.jobId === data.jobId && isActiveStatus(previous.status);

    if (transitionedFromActive && data.status === "completed") {
      toast.success(buildCompletionMessage(data));
      void Promise.all([
        utils.gmail.getInvoices.invalidate(),
        utils.gmail.getInsuranceDiscoveries.invalidate(),
        utils.gmail.connectionStatus.invalidate(),
        utils.gmail.discoverPolicies.invalidate(),
        utils.monitoring.getMonthlyReport.invalidate(),
        utils.savings.getReport.invalidate(),
        utils.insuranceScore.getDashboard.invalidate(),
        utils.actions.list.invalidate(),
      ]);
    }

    if (transitionedFromActive && data.status === "error") {
      toast.error(data.errorMessage || "לא הצלחנו להשלים את סריקת Gmail");
      void utils.gmail.getScanStatus.invalidate();
    }

    previousRef.current = {
      jobId: data.jobId,
      status: data.status,
    };
  }, [data, utils.actions.list, utils.gmail.connectionStatus, utils.gmail.discoverPolicies, utils.gmail.getInsuranceDiscoveries, utils.gmail.getInvoices, utils.gmail.getScanStatus, utils.insuranceScore.getDashboard, utils.monitoring.getMonthlyReport, utils.savings.getReport]);

  return null;
}
