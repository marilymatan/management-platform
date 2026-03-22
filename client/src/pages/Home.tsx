import { useState, useCallback, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { nanoid } from "nanoid";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileUpload } from "@/components/FileUpload";
import { ManualPolicyEntry } from "@/components/ManualPolicyEntry";
import { CoverageCards } from "@/components/CoverageCards";
import { FinancialSummary } from "@/components/FinancialSummary";
import { PolicyChatbot } from "@/components/PolicyChatbot";
import { DuplicateCoveragesAlert } from "@/components/DuplicateCoveragesAlert";
import { PersonalizedInsights } from "@/components/PersonalizedInsights";
import {
  POLICY_ANALYSIS_BATCH_SIZE,
  getAnalysisProgressSnapshot,
} from "@shared/analysisProgress";
import { getAnalysisPollInterval } from "@shared/scanNotificationTransitions";
import {
  Shield,
  FileSearch,
  LayoutDashboard,
  Banknote,
  MessageCircle,
  Loader2,
  FileText,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  Upload,
} from "lucide-react";
import type { UploadedFile, PolicyAnalysis } from "@shared/insurance";

type UploadProgressState = {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
};

type UploadablePolicyFile = {
  name: string;
  size: number;
  file: File;
};

type PolicyUploadResponse = {
  sessionId: string;
  totalFileCount?: number;
};

const STEPS = [
  {
    icon: <FileSearch className="size-5" />,
    title: "העלה",
    desc: "העלה קבצי PDF של הפוליסה",
  },
  {
    icon: <Sparkles className="size-5" />,
    title: "סריקה",
    desc: "AI סורק את הפרטים",
  },
  {
    icon: <LayoutDashboard className="size-5" />,
    title: "תוצאות",
    desc: "צפה בכיסויים והמלצות",
  },
];

const PENDING_ANALYSIS_REFETCH_MS = 3_000;
const PENDING_ANALYSIS_STALE_MS = 90_000;

function getRequestedAnalysisFileFilter() {
  if (typeof window === "undefined") {
    return null;
  }
  const value = new URLSearchParams(window.location.search).get("file");
  return value?.trim() ? value : null;
}

function getRequestedAnalysisCoverageCategory() {
  if (typeof window === "undefined") {
    return null;
  }
  const value = new URLSearchParams(window.location.search).get(
    "coverageCategory"
  );
  return value?.trim() ? value : null;
}

function resolveSelectedFileFilter(
  result: PolicyAnalysis | null,
  requestedFileFilter: string | null
) {
  if (!result || !requestedFileFilter) {
    return null;
  }
  const availableSourceFiles = Array.from(
    new Set(
      result.coverages
        .map(coverage => coverage.sourceFile)
        .filter((name): name is string => Boolean(name?.trim()))
    )
  );
  return availableSourceFiles.includes(requestedFileFilter)
    ? requestedFileFilter
    : null;
}

function hasSpecifiedPolicyValue(value?: string | null) {
  return Boolean(
    value && value !== "לא צוין בפוליסה" && value !== "לא מצוין בפוליסה"
  );
}

function formatUploadBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSupportedUploadFile(file: File) {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

function buildPolicyUploadUrl(sessionId?: string | null) {
  if (!sessionId) {
    return "/api/policies/upload";
  }
  const params = new URLSearchParams({ sessionId });
  return `/api/policies/upload?${params.toString()}`;
}

function uploadPolicyFilesWithProgress(
  files: UploadablePolicyFile[],
  onProgress: (progress: UploadProgressState) => void,
  options?: {
    sessionId?: string | null;
  }
) {
  return new Promise<PolicyUploadResponse>((resolve, reject) => {
    const formData = new FormData();
    const knownTotalBytes = files.reduce((sum, file) => sum + file.size, 0);

    files.forEach(file => {
      formData.append("files", file.file, file.name);
    });

    const request = new XMLHttpRequest();
    request.open("POST", buildPolicyUploadUrl(options?.sessionId));
    request.withCredentials = true;

    request.upload.addEventListener("progress", event => {
      const totalBytes =
        event.lengthComputable && event.total > 0
          ? event.total
          : knownTotalBytes;
      const loadedBytes = event.lengthComputable ? event.loaded : 0;
      const percent =
        totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0;
      onProgress({
        loadedBytes,
        totalBytes,
        percent,
      });
    });

    request.addEventListener("load", () => {
      let payload: any = null;
      try {
        payload = request.responseText
          ? JSON.parse(request.responseText)
          : null;
      } catch {
        payload = null;
      }
      if (request.status >= 200 && request.status < 300) {
        onProgress({
          loadedBytes: knownTotalBytes,
          totalBytes: knownTotalBytes,
          percent: 100,
        });
        resolve(payload as PolicyUploadResponse);
        return;
      }
      reject(
        new Error(payload?.message || payload?.error || "שגיאה בהעלאת הקבצים")
      );
    });

    request.addEventListener("error", () => {
      reject(new Error("שגיאת רשת בהעלאת הקבצים"));
    });

    request.send(formData);
  });
}

export default function Home() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/insurance/:sessionId");
  const utils = trpc.useUtils();

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<PolicyAnalysis | null>(
    null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<UploadProgressState | null>(null);
  const [isAppendingFiles, setIsAppendingFiles] = useState(false);
  const [appendUploadProgress, setAppendUploadProgress] =
    useState<UploadProgressState | null>(null);
  const [appendSelectedFileCount, setAppendSelectedFileCount] = useState(0);
  const [intakeMode, setIntakeMode] = useState("upload");
  const [activeTab, setActiveTab] = useState("coverages");
  const [selectedFileFilter, setSelectedFileFilter] = useState<string | null>(
    null
  );
  const kickedPendingSessionRef = useRef<string | null>(null);
  const appendFileInputRef = useRef<HTMLInputElement | null>(null);
  const requestedSessionId =
    params?.sessionId && params.sessionId !== "new" ? params.sessionId : null;
  const requestedFileFilter = getRequestedAnalysisFileFilter();
  const requestedCoverageCategory = getRequestedAnalysisCoverageCategory();
  const isViewingSavedAnalysis = Boolean(requestedSessionId);

  const analyzeMutation = trpc.policy.analyze.useMutation();
  const getAnalysisQuery = trpc.policy.getAnalysis.useQuery(
    { sessionId: requestedSessionId ?? "" },
    {
      enabled: !!requestedSessionId,
      retry: false,
      refetchInterval: query =>
        getAnalysisPollInterval(query.state.data, {
          intervalMs:
            query.state.data?.status === "pending"
              ? PENDING_ANALYSIS_REFETCH_MS
              : 10_000,
        }),
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    }
  );

  useEffect(() => {
    kickedPendingSessionRef.current = null;
    if (!requestedSessionId) {
      setFiles([]);
      setIsUploading(false);
      setUploadProgress(null);
      setIsAppendingFiles(false);
      setAppendUploadProgress(null);
      setAppendSelectedFileCount(0);
      setActiveTab("coverages");
      setSessionId(null);
      setAnalysisResult(null);
      setSelectedFileFilter(null);
      return;
    }
    setSessionId(requestedSessionId);
    setAnalysisResult(null);
    setSelectedFileFilter(null);
    setActiveTab("coverages");
    setFiles([]);
    setIsUploading(false);
    setUploadProgress(null);
    setIsAppendingFiles(false);
    setAppendUploadProgress(null);
    setAppendSelectedFileCount(0);
  }, [requestedSessionId]);

  useEffect(() => {
    if (!requestedSessionId) {
      return;
    }
    setSessionId(requestedSessionId);
    if (
      getAnalysisQuery.data?.status === "completed" &&
      getAnalysisQuery.data.result
    ) {
      setAnalysisResult(getAnalysisQuery.data.result);
      void utils.policy.getUserAnalyses.invalidate();
      return;
    }
    setAnalysisResult(null);
  }, [
    getAnalysisQuery.data?.result,
    getAnalysisQuery.data?.status,
    requestedSessionId,
    utils,
  ]);

  useEffect(() => {
    if (!requestedSessionId || !getAnalysisQuery.data) {
      return;
    }

    if (
      getAnalysisQuery.data.status !== "pending" ||
      getAnalysisQuery.data.startedAt ||
      (getAnalysisQuery.data.attemptCount ?? 0) > 0 ||
      kickedPendingSessionRef.current === requestedSessionId
    ) {
      return;
    }

    kickedPendingSessionRef.current = requestedSessionId;

    void analyzeMutation
      .mutateAsync({ sessionId: requestedSessionId })
      .then(async result => {
        if (result.status === "completed" && result.result) {
          setAnalysisResult(result.result);
        }

        await Promise.all([
          getAnalysisQuery.refetch(),
          utils.policy.getUserAnalyses.invalidate(),
        ]);
      })
      .catch(() => {
        kickedPendingSessionRef.current = null;
      });
  }, [
    analyzeMutation,
    getAnalysisQuery.data,
    getAnalysisQuery.refetch,
    requestedSessionId,
    utils.policy.getUserAnalyses,
  ]);

  useEffect(() => {
    setSelectedFileFilter(
      resolveSelectedFileFilter(analysisResult, requestedFileFilter)
    );
  }, [analysisResult, requestedFileFilter]);

  const handleFilesSelected = useCallback((newFiles: File[]) => {
    setUploadProgress(null);
    const uploadedFiles: UploadedFile[] = newFiles.map(f => ({
      id: nanoid(8),
      name: f.name,
      size: f.size,
      status: "pending" as const,
      _file: f,
    }));
    setFiles(prev => [...prev, ...uploadedFiles]);
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setUploadProgress(null);
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (files.length === 0) return;

    const uploadableFiles = files
      .filter((file): file is UploadedFile & { _file: File } =>
        Boolean(file._file)
      )
      .map(file => ({
        name: file.name,
        size: file.size,
        file: file._file,
      }));
    if (uploadableFiles.length === 0) {
      toast.error("לא בחרת קבצים תקינים להעלאה");
      return;
    }

    setIsUploading(true);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    setUploadProgress({
      loadedBytes: 0,
      totalBytes,
      percent: 0,
    });
    setFiles(prev => prev.map(f => ({ ...f, status: "uploading" as const })));

    try {
      const result = await uploadPolicyFilesWithProgress(
        uploadableFiles,
        setUploadProgress
      );
      setSessionId(result.sessionId);
      setFiles(prev => prev.map(f => ({ ...f, status: "queued" as const })));
      setIsUploading(false);
      await utils.policy.getUserAnalyses.invalidate();
      toast.success("הקבצים הועלו. הסריקה ממשיכה ברקע.");
      setLocation(`/insurance/${result.sessionId}`);
    } catch (error: any) {
      setIsUploading(false);
      setUploadProgress(null);
      setFiles(prev =>
        prev.map(f => ({
          ...f,
          status: "error" as const,
          error: error.message,
        }))
      );
      toast.error("שגיאה בהעלאת הפוליסה: " + (error.message || "נסה שוב"));
    }
  }, [files, setLocation, utils.policy.getUserAnalyses]);

  const handleAppendFiles = useCallback(
    async (newFiles: File[]) => {
      if (!requestedSessionId || newFiles.length === 0) {
        return;
      }

      const uploadableFiles = newFiles
        .filter(isSupportedUploadFile)
        .map(file => ({
          name: file.name,
          size: file.size,
          file,
        }));
      if (uploadableFiles.length === 0) {
        toast.error("אפשר להוסיף רק PDF או תמונות של מסמכים");
        return;
      }

      if (uploadableFiles.length !== newFiles.length) {
        toast.error(
          "חלק מהקבצים דולגו כי אפשר להוסיף רק PDF או תמונות של מסמכים"
        );
      }

      setIsAppendingFiles(true);
      setAppendSelectedFileCount(uploadableFiles.length);
      const totalBytes = uploadableFiles.reduce(
        (sum, file) => sum + file.size,
        0
      );
      setAppendUploadProgress({
        loadedBytes: 0,
        totalBytes,
        percent: 0,
      });

      try {
        const result = await uploadPolicyFilesWithProgress(
          uploadableFiles,
          setAppendUploadProgress,
          { sessionId: requestedSessionId }
        );
        const refreshed = await getAnalysisQuery.refetch();
        await utils.policy.getUserAnalyses.invalidate();

        setIsAppendingFiles(false);
        setAppendUploadProgress(null);
        setAppendSelectedFileCount(0);
        setSelectedFileFilter(null);
        setActiveTab("coverages");
        if (typeof window !== "undefined") {
          const searchParams = new URLSearchParams(window.location.search);
          searchParams.delete("file");
          const nextPath = searchParams.toString()
            ? `/insurance/${requestedSessionId}?${searchParams.toString()}`
            : `/insurance/${requestedSessionId}`;
          window.history.replaceState(window.history.state, "", nextPath);
        }
        if (refreshed.data?.status !== "completed") {
          setAnalysisResult(null);
        }
        toast.success(
          result.totalFileCount
            ? `הוספנו ${uploadableFiles.length} קבצים. לומי מעדכן עכשיו את הסקירה עם ${result.totalFileCount} קבצים יחד.`
            : "הקבצים נוספו. לומי מעדכן עכשיו את הסקירה."
        );
      } catch (error: any) {
        setIsAppendingFiles(false);
        setAppendUploadProgress(null);
        setAppendSelectedFileCount(0);
        toast.error(
          "לא הצלחנו להוסיף קבצים לסריקה: " + (error.message || "נסה שוב")
        );
      }
    },
    [getAnalysisQuery.refetch, requestedSessionId, utils.policy.getUserAnalyses]
  );

  const handleAppendFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      e.target.value = "";
      if (selectedFiles.length === 0) {
        return;
      }
      await handleAppendFiles(selectedFiles);
    },
    [handleAppendFiles]
  );

  const handleRetryAnalysis = useCallback(async () => {
    if (!requestedSessionId) {
      return;
    }
    const isPendingRetry = getAnalysisQuery.data?.status === "pending";
    try {
      await analyzeMutation.mutateAsync({ sessionId: requestedSessionId });
      await Promise.all([
        getAnalysisQuery.refetch(),
        utils.policy.getUserAnalyses.invalidate(),
      ]);
      toast.success(
        isPendingRetry
          ? "לומי מנסה להתחיל את העיבוד שוב."
          : "הסריקה חזרה לתור העיבוד."
      );
    } catch (error: any) {
      toast.error(
        (isPendingRetry
          ? "לא הצלחנו להתחיל את העיבוד: "
          : "לא הצלחנו להחזיר את הסריקה לעיבוד: ") +
          (error.message || "נסה שוב")
      );
    }
  }, [
    analyzeMutation,
    getAnalysisQuery.data?.status,
    getAnalysisQuery.refetch,
    requestedSessionId,
    utils.policy.getUserAnalyses,
  ]);

  const handleReset = useCallback(() => {
    setFiles([]);
    setSessionId(null);
    setAnalysisResult(null);
    setIsUploading(false);
    setUploadProgress(null);
    setIsAppendingFiles(false);
    setAppendUploadProgress(null);
    setAppendSelectedFileCount(0);
    setActiveTab("coverages");
    setSelectedFileFilter(null);
    setLocation("/insurance/new");
  }, [setLocation]);

  const handleSelectedFileFilterChange = useCallback(
    (nextFilter: string | null) => {
      setSelectedFileFilter(nextFilter);
      setActiveTab("coverages");
      if (!requestedSessionId) {
        return;
      }
      const searchParams = new URLSearchParams(window.location.search);
      if (nextFilter) {
        searchParams.set("file", nextFilter);
      } else {
        searchParams.delete("file");
      }
      const nextPath = searchParams.toString()
        ? `/insurance/${requestedSessionId}?${searchParams.toString()}`
        : `/insurance/${requestedSessionId}`;
      window.history.replaceState(window.history.state, "", nextPath);
    },
    [requestedSessionId]
  );

  const analysisStatus = getAnalysisQuery.data?.status ?? null;
  const isQueuedAnalysis = analysisStatus === "pending";
  const analysisProgress = getAnalysisProgressSnapshot({
    status: analysisStatus,
    files: getAnalysisQuery.data?.files,
    processedFileCount: getAnalysisQuery.data?.processedFileCount,
    activeBatchFileCount: getAnalysisQuery.data?.activeBatchFileCount,
  });
  const analysisFileCount = Array.isArray(getAnalysisQuery.data?.files)
    ? getAnalysisQuery.data.files.length
    : 0;
  const heroPremiumLabel = analysisResult
    ? (() => {
        const info = analysisResult.generalInfo;
        if (
          info.premiumPaymentPeriod === "annual" &&
          hasSpecifiedPolicyValue(info.annualPremium)
        ) {
          return `${info.annualPremium} לשנה`;
        }
        if (hasSpecifiedPolicyValue(info.monthlyPremium)) {
          return `${info.monthlyPremium} לחודש`;
        }
        if (hasSpecifiedPolicyValue(info.annualPremium)) {
          return `${info.annualPremium} לשנה`;
        }
        return null;
      })()
    : null;
  const isPendingAnalysisStale =
    analysisStatus === "pending" &&
    getAnalysisPollInterval(getAnalysisQuery.data, {
      nowMs: Date.now(),
      maxAgeMs: PENDING_ANALYSIS_STALE_MS,
    }) === false;
  const isProcessingAnalysisStale =
    analysisStatus === "processing" &&
    getAnalysisPollInterval(getAnalysisQuery.data, { nowMs: Date.now() }) ===
      false;
  const isSavedAnalysisStale =
    isViewingSavedAnalysis &&
    !analysisResult &&
    (isPendingAnalysisStale || isProcessingAnalysisStale);
  const currentStep = analysisResult ? 2 : 0;
  const isSavedAnalysisLoading =
    isViewingSavedAnalysis &&
    !analysisResult &&
    !analysisStatus &&
    (getAnalysisQuery.isPending || getAnalysisQuery.isFetching);
  const isSavedAnalysisPending =
    isViewingSavedAnalysis &&
    !analysisResult &&
    !isSavedAnalysisStale &&
    (analysisStatus === "pending" || analysisStatus === "processing");
  const hasSavedAnalysisError =
    isViewingSavedAnalysis &&
    !analysisResult &&
    !isSavedAnalysisLoading &&
    !isSavedAnalysisPending &&
    !isSavedAnalysisStale &&
    Boolean(
      getAnalysisQuery.error ||
        analysisStatus === "error" ||
        !getAnalysisQuery.data
    );
  const canAppendFiles = Boolean(
    requestedSessionId && analysisResult && !isAppendingFiles
  );

  return (
    <div className="min-h-full">
      {!analysisResult && !isViewingSavedAnalysis && (
        <div className="page-container">
          <div className="max-w-2xl mx-auto">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-[#1a2744] via-[#1e3a5f] to-[#2563eb] p-8 md:p-10 mb-8 animate-fade-in-up">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE4YzMuMzE0IDAgNi0yLjY4NiA2LTZzLTIuNjg2LTYtNi02LTYgMi42ODYtNiA2IDIuNjg2IDYgNiA2em0wIDJjLTQuNDE4IDAtOCAzLjU4Mi04IDhzMy41ODIgOCA4IDggOC0zLjU4MiA4LTgtMy41ODItOC04LTh6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-40" />

              <div className="relative z-10 text-center">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-4 py-1.5 mb-5">
                  <Shield className="size-4 text-blue-300" />
                  <span className="text-xs font-medium text-blue-100">
                    סריקת פוליסות עם AI
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
                  הבן את הפוליסה שלך בקלות
                </h2>
                <p className="text-sm md:text-base text-blue-100/80 max-w-lg mx-auto leading-relaxed">
                  העלה PDF, צלם מסמך, או הזן פוליסה ידנית כדי לקבל תמונה מהירה
                  של הכיסויים, העלויות והתנאים
                </p>
              </div>

              <div className="relative z-10 flex items-center justify-center gap-3 mt-8">
                {STEPS.map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={`rounded-full p-2.5 transition-all duration-300 ${
                          i <= currentStep
                            ? "bg-white text-[#1a2744]"
                            : "bg-white/10 text-white/50"
                        }`}
                      >
                        {i < currentStep ? (
                          <CheckCircle2 className="size-5" />
                        ) : (
                          step.icon
                        )}
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          i <= currentStep ? "text-white" : "text-white/40"
                        }`}
                      >
                        {step.title}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div
                        className={`w-12 md:w-20 h-px mb-5 transition-colors duration-300 ${
                          i < currentStep ? "bg-white/50" : "bg-white/15"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-fade-in-up stagger-2">
              <Tabs value={intakeMode} onValueChange={setIntakeMode} dir="rtl">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="upload">PDF או צילום</TabsTrigger>
                  <TabsTrigger value="manual">הזנה ידנית</TabsTrigger>
                </TabsList>
                <TabsContent value="upload">
                  <FileUpload
                    files={files}
                    onFilesSelected={handleFilesSelected}
                    onRemoveFile={handleRemoveFile}
                    onAnalyze={handleAnalyze}
                    isUploading={isUploading}
                    isProcessing={false}
                    hasResults={!!analysisResult}
                  />
                </TabsContent>
                <TabsContent value="manual">
                  <ManualPolicyEntry />
                </TabsContent>
              </Tabs>
            </div>

            {isUploading && (
              <Card className="mt-6 border-primary/20 bg-primary/5 animate-fade-in-up">
                <CardContent
                  className="p-5"
                  data-testid="policy-uploading-card"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-4">
                    <div className="relative size-12 shrink-0">
                      <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      <Loader2 className="absolute inset-0 m-auto size-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            מעלה את הקבצים...
                          </p>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            ברגע שההעלאה תסתיים, העיבוד ימשיך ברקע גם אם תסגור
                            את הדפדפן
                          </p>
                        </div>
                        {uploadProgress ? (
                          <p
                            className="text-xl font-bold text-foreground"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {uploadProgress.percent}%
                          </p>
                        ) : null}
                      </div>
                      {uploadProgress ? (
                        <div className="space-y-2">
                          <Progress
                            value={uploadProgress.percent}
                            aria-label={`התקדמות העלאת קבצים ${uploadProgress.percent} אחוז`}
                          />
                          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span>
                              {formatUploadBytes(uploadProgress.loadedBytes)}{" "}
                              מתוך{" "}
                              {formatUploadBytes(uploadProgress.totalBytes)}
                            </span>
                            <span>{files.length} קבצים</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {isSavedAnalysisLoading && (
        <div className="page-container">
          <div className="max-w-2xl mx-auto">
            <Card
              className="border-primary/20 bg-primary/5 animate-fade-in-up"
              data-testid="policy-analysis-loading"
            >
              <CardContent className="py-12 text-center">
                <div className="relative size-14 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <Loader2 className="absolute inset-0 m-auto size-6 text-primary" />
                </div>
                <p className="text-base font-semibold text-foreground">
                  טוען את הסריקה שבחרת
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  לומי מכין עכשיו את תוצאת הסריקה והסינון שביקשת
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {isSavedAnalysisPending && (
        <div className="page-container">
          <div className="max-w-2xl mx-auto">
            <Card
              className="border-primary/20 bg-primary/5 animate-fade-in-up"
              data-testid="policy-analysis-pending"
            >
              <CardContent className="py-12 text-center">
                <div className="relative size-14 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <Sparkles className="absolute inset-0 m-auto size-6 text-primary" />
                </div>
                <p className="text-base font-semibold text-foreground">
                  {analysisStatus === "processing"
                    ? "הפוליסה שלך נמצאת עכשיו בעיבוד"
                    : "הקבצים בתור לעיבוד"}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {isQueuedAnalysis
                    ? "לומי כבר שמר את הקבצים ומנסה להתחיל את הסריקה ברקע. אפשר להישאר בעמוד, לצאת ממנו או לסגור את הדפדפן."
                    : "אפשר לצאת מהעמוד או לסגור את הדפדפן. לומי ממשיך לעבד את הפוליסה ברקע והתוצאות יופיעו כאן כשהן יהיו מוכנות."}
                </p>
                {analysisProgress ? (
                  <div className="mt-5 rounded-2xl border border-primary/15 bg-background/80 p-4 text-start space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {isQueuedAnalysis
                            ? "קבצים שנשמרו לסריקה"
                            : "התקדמות הסריקה"}
                        </p>
                        <p
                          className="text-2xl font-bold text-foreground"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {isQueuedAnalysis
                            ? analysisProgress.totalFiles
                            : `${analysisProgress.visibleFileCount}/${analysisProgress.totalFiles}`}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed text-end">
                        {isQueuedAnalysis
                          ? `לומי יתחיל לעבד אוטומטית בקבוצות של עד ${POLICY_ANALYSIS_BATCH_SIZE} קבצים.`
                          : `לומי מחלק את הסריקה לקבוצות של עד ${POLICY_ANALYSIS_BATCH_SIZE} קבצים כדי לשמור על יציבות ומהירות.`}
                      </p>
                    </div>
                    {isQueuedAnalysis ? (
                      <div
                        className="space-y-2"
                        data-testid="policy-analysis-queued-progress"
                      >
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span>ממתין להתחלת עיבוד</span>
                          <span>{analysisProgress.totalFiles} קבצים בתור</span>
                        </div>
                        <div
                          className="relative h-2 overflow-hidden rounded-full bg-primary/15"
                          aria-hidden="true"
                        >
                          <div className="absolute inset-y-0 end-0 w-1/3 rounded-full bg-primary animate-queue-progress" />
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground text-end">
                          ברגע שהסריקה תתחיל, לומי יציג כאן אחוזי התקדמות
                          אמיתיים במקום מצב ההמתנה.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span>קצב הסריקה הפעילה</span>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>
                            {Math.round(analysisProgress.progressPercent)}%
                          </span>
                        </div>
                        <Progress
                          value={analysisProgress.progressPercent}
                          aria-label={`התקדמות סריקת פוליסה ${Math.round(analysisProgress.progressPercent)} אחוז`}
                        />
                      </div>
                    )}
                  </div>
                ) : getAnalysisQuery.data?.files?.length ? (
                  <p className="text-xs text-muted-foreground mt-3">
                    נשמרו {getAnalysisQuery.data.files.length} קבצים לסריקה
                  </p>
                ) : null}
                <div className="flex items-center justify-center gap-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/insurance")}
                  >
                    חזרה לביטוחים
                  </Button>
                  <Button
                    onClick={
                      isQueuedAnalysis
                        ? handleRetryAnalysis
                        : () => getAnalysisQuery.refetch()
                    }
                    disabled={
                      isQueuedAnalysis
                        ? analyzeMutation.isPending
                        : getAnalysisQuery.isFetching
                    }
                    data-testid={
                      isQueuedAnalysis ? "policy-analysis-kick" : undefined
                    }
                  >
                    {isQueuedAnalysis
                      ? analyzeMutation.isPending
                        ? "מנסה להתחיל עיבוד..."
                        : "נסה להתחיל עיבוד"
                      : "רענן סטטוס"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {isSavedAnalysisStale && (
        <div className="page-container">
          <div className="max-w-2xl mx-auto">
            <Card
              className="border-amber-200 bg-amber-50/70 animate-fade-in-up"
              data-testid="policy-analysis-stale"
            >
              <CardContent className="py-12 text-center">
                <div className="relative size-14 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full border-2 border-amber-200" />
                  <Sparkles className="absolute inset-0 m-auto size-6 text-amber-600" />
                </div>
                <p className="text-base font-semibold text-foreground">
                  נראה שהסריקה נתקעה בדרך
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  לומי לא קיבל עדכון חדש מהעיבוד בזמן הצפוי. אפשר להחזיר את
                  הסריקה לתור ולנסות שוב.
                </p>
                {getAnalysisQuery.data?.attemptCount ? (
                  <p className="text-xs text-muted-foreground mt-3">
                    ניסיון עיבוד אחרון: {getAnalysisQuery.data.attemptCount}
                  </p>
                ) : null}
                <div className="flex items-center justify-center gap-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/insurance")}
                  >
                    חזרה לביטוחים
                  </Button>
                  <Button
                    onClick={handleRetryAnalysis}
                    disabled={analyzeMutation.isPending}
                    data-testid="policy-analysis-retry-stale"
                  >
                    {analyzeMutation.isPending
                      ? "מחזיר לעיבוד..."
                      : "הפעל עיבוד מחדש"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {hasSavedAnalysisError && (
        <div className="page-container">
          <div className="max-w-2xl mx-auto">
            <Card
              className="animate-fade-in-up"
              data-testid="policy-analysis-error"
            >
              <CardContent className="py-12 text-center">
                <div className="size-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
                  <FileText className="size-7 text-muted-foreground/50" />
                </div>
                <p className="text-base font-semibold text-foreground">
                  {analysisStatus === "error"
                    ? "הסריקה נכשלה"
                    : getAnalysisQuery.error
                      ? "לא הצלחנו לטעון את הסריקה"
                      : "לא מצאנו את הסריקה שבחרת"}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {analysisStatus === "error"
                    ? getAnalysisQuery.data?.errorMessage ||
                      "אירעה שגיאה בעיבוד הפוליסה. אפשר להחזיר אותה לתור ולנסות שוב."
                    : "אפשר לחזור לעמוד הביטוחים או לנסות שוב."}
                </p>
                <div className="flex items-center justify-center gap-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/insurance")}
                  >
                    חזרה לביטוחים
                  </Button>
                  {analysisStatus === "error" ? (
                    <Button
                      onClick={handleRetryAnalysis}
                      disabled={analyzeMutation.isPending}
                      data-testid="policy-analysis-retry"
                    >
                      {analyzeMutation.isPending
                        ? "מחזיר לעיבוד..."
                        : "נסה שוב"}
                    </Button>
                  ) : (
                    <Button onClick={() => getAnalysisQuery.refetch()}>
                      נסה שוב
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {analysisResult && (
        <div className="page-container space-y-6">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-[#1a2744] via-[#1e3a5f] to-[#2563eb] p-6 md:p-8 animate-fade-in-up">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE4YzMuMzE0IDAgNi0yLjY4NiA2LTZzLTIuNjg2LTYtNi02LTYgMi42ODYtNiA2IDIuNjg2IDYgNiA2em0wIDJjLTQuNDE4IDAtOCAzLjU4Mi04IDhzMy41ODIgOCA4IDggOC0zLjU4MiA4LTgtMy41ODItOC04LTh6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-40" />

            <div className="relative z-10">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  {analysisResult.generalInfo.policyNames &&
                  analysisResult.generalInfo.policyNames.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {analysisResult.generalInfo.policyNames.map(name => (
                        <button
                          key={name}
                          onClick={() => {
                            handleSelectedFileFilterChange(
                              selectedFileFilter === name ? null : name
                            );
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            selectedFileFilter === name
                              ? "bg-white text-[#1a2744] shadow-md"
                              : "bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm"
                          }`}
                        >
                          <FileText className="size-3.5 shrink-0" />
                          <span className="max-w-[200px] truncate">{name}</span>
                        </button>
                      ))}
                      {selectedFileFilter && (
                        <button
                          onClick={() => handleSelectedFileFilterChange(null)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-white/60 border border-white/20 hover:bg-white/10 transition-all"
                        >
                          הצג הכל
                        </button>
                      )}
                    </div>
                  ) : (
                    <h2 className="text-xl font-bold text-white mb-2">
                      סריקת הפוליסה הושלמה
                    </h2>
                  )}

                  <p className="text-sm text-blue-100/70 leading-relaxed max-w-2xl">
                    {analysisResult.summary}
                  </p>

                  <div className="flex flex-wrap gap-2 mt-4">
                    {analysisFileCount > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm px-3 py-1 text-xs font-medium text-blue-100">
                        <FileText className="size-3" />
                        {analysisFileCount} קבצים בסריקה
                      </span>
                    )}
                    {analysisResult.coverages && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm px-3 py-1 text-xs font-medium text-blue-100">
                        <Shield className="size-3" />
                        {analysisResult.coverages.length} כיסויים
                      </span>
                    )}
                    {heroPremiumLabel && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm px-3 py-1 text-xs font-medium text-blue-100">
                        <Banknote className="size-3" />
                        {heroPremiumLabel}
                      </span>
                    )}
                    {analysisResult.generalInfo.endDate &&
                      analysisResult.generalInfo.endDate !==
                        "לא צוין בפוליסה" && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm px-3 py-1 text-xs font-medium text-blue-100">
                          תקף עד {analysisResult.generalInfo.endDate}
                        </span>
                      )}
                  </div>
                </div>
                <div className="shrink-0 space-y-2">
                  <input
                    ref={appendFileInputRef}
                    type="file"
                    accept=".pdf,image/*"
                    multiple
                    onChange={handleAppendFileInput}
                    className="hidden"
                    data-testid="policy-append-input"
                    aria-label="הוסף עוד קבצים לאותה סריקה"
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      onClick={() => appendFileInputRef.current?.click()}
                      disabled={!canAppendFiles}
                      className="bg-white text-[#1a2744] hover:bg-white/90 border-0 shrink-0 gap-2"
                      data-testid="policy-append-files-button"
                    >
                      {isAppendingFiles ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      {isAppendingFiles
                        ? "מוסיף קבצים..."
                        : "הוסף קבצים לסריקה"}
                    </Button>
                    <Button
                      onClick={handleReset}
                      className="bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur-sm shrink-0 gap-2"
                    >
                      <ArrowLeft className="size-4" />
                      סריקה חדשה
                    </Button>
                  </div>
                  <p className="text-xs text-blue-100/70 text-end max-w-xs leading-relaxed">
                    אפשר להוסיף עד 10 קבצים בכל הוספה. לומי יריץ מחדש את אותה
                    סקירה עם כל המסמכים יחד.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {isAppendingFiles && appendUploadProgress && (
            <Card
              className="border-primary/20 bg-primary/5 animate-fade-in-up"
              data-testid="policy-append-uploading-card"
            >
              <CardContent className="p-5" role="status" aria-live="polite">
                <div className="flex items-start gap-4">
                  <div className="relative size-12 shrink-0">
                    <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <Upload className="absolute inset-0 m-auto size-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          מוסיף קבצים לאותה סריקה...
                        </p>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          בסיום ההעלאה לומי יריץ מחדש את הסקירה עם כל הקבצים
                          הקיימים והחדשים יחד
                        </p>
                      </div>
                      <p
                        className="text-xl font-bold text-foreground"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {appendUploadProgress.percent}%
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Progress
                        value={appendUploadProgress.percent}
                        aria-label={`התקדמות הוספת קבצים ${appendUploadProgress.percent} אחוז`}
                      />
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>
                          {formatUploadBytes(appendUploadProgress.loadedBytes)}{" "}
                          מתוך{" "}
                          {formatUploadBytes(appendUploadProgress.totalBytes)}
                        </span>
                        <span>{appendSelectedFileCount} קבצים</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {analysisResult.duplicateCoverages &&
            analysisResult.duplicateCoverages.length > 0 && (
              <DuplicateCoveragesAlert
                duplicates={analysisResult.duplicateCoverages}
                coverages={analysisResult.coverages}
              />
            )}

          {analysisResult.personalizedInsights &&
            analysisResult.personalizedInsights.length > 0 && (
              <PersonalizedInsights
                insights={analysisResult.personalizedInsights}
              />
            )}

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            dir="rtl"
            className="animate-fade-in-up stagger-2"
          >
            <TabsList className="w-full justify-start bg-card border p-1.5 rounded-xl gap-1">
              <TabsTrigger
                value="coverages"
                className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <LayoutDashboard className="size-4" />
                כיסויים
              </TabsTrigger>
              <TabsTrigger
                value="financial"
                className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <Banknote className="size-4" />
                מידע כללי ועלויות
              </TabsTrigger>
              <TabsTrigger
                value="chat"
                className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <MessageCircle className="size-4" />
                שאלות ותשובות
              </TabsTrigger>
            </TabsList>

            <TabsContent value="coverages" className="mt-5">
              <CoverageCards
                coverages={analysisResult.coverages}
                selectedFileFilter={selectedFileFilter}
                initialCategoryFilter={requestedCoverageCategory}
              />
            </TabsContent>

            <TabsContent value="financial" className="mt-5">
              <FinancialSummary
                generalInfo={analysisResult.generalInfo}
                coverages={analysisResult.coverages}
                summary={analysisResult.summary}
              />
            </TabsContent>

            <TabsContent value="chat" className="mt-5">
              {sessionId && <PolicyChatbot sessionId={sessionId} />}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
