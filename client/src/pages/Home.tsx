import { useState, useCallback, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { nanoid } from "nanoid";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/FileUpload";
import { CoverageCards } from "@/components/CoverageCards";
import { FinancialSummary } from "@/components/FinancialSummary";
import { PolicyChatbot } from "@/components/PolicyChatbot";
import { DuplicateCoveragesAlert } from "@/components/DuplicateCoveragesAlert";
import { PersonalizedInsights } from "@/components/PersonalizedInsights";
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
} from "lucide-react";
import type { UploadedFile, PolicyAnalysis } from "@shared/insurance";

const STEPS = [
  { icon: <FileSearch className="size-5" />, title: "העלה", desc: "העלה קבצי PDF של הפוליסה" },
  { icon: <Sparkles className="size-5" />, title: "סריקה", desc: "AI סורק את הפרטים" },
  { icon: <LayoutDashboard className="size-5" />, title: "תוצאות", desc: "צפה בכיסויים והמלצות" },
];

function getRequestedAnalysisFileFilter() {
  if (typeof window === "undefined") {
    return null;
  }
  const value = new URLSearchParams(window.location.search).get("file");
  return value?.trim() ? value : null;
}

function resolveSelectedFileFilter(result: PolicyAnalysis | null, requestedFileFilter: string | null) {
  if (!result || !requestedFileFilter) {
    return null;
  }
  const availableSourceFiles = Array.from(
    new Set(
      result.coverages
        .map((coverage) => coverage.sourceFile)
        .filter((name): name is string => Boolean(name?.trim()))
    )
  );
  return availableSourceFiles.includes(requestedFileFilter) ? requestedFileFilter : null;
}

export default function Home() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/insurance/:sessionId");

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<PolicyAnalysis | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState("coverages");
  const [selectedFileFilter, setSelectedFileFilter] = useState<string | null>(null);
  const requestedSessionId = params?.sessionId && params.sessionId !== "new" ? params.sessionId : null;
  const requestedFileFilter = getRequestedAnalysisFileFilter();
  const isViewingSavedAnalysis = Boolean(requestedSessionId);

  const uploadMutation = trpc.policy.upload.useMutation();
  const analyzeMutation = trpc.policy.analyze.useMutation();
  const getAnalysisQuery = trpc.policy.getAnalysis.useQuery(
    { sessionId: requestedSessionId ?? "" },
    { enabled: !!requestedSessionId, retry: false }
  );
  const linkToUserMutation = trpc.policy.linkToUser.useMutation();

  useEffect(() => {
    if (!requestedSessionId) {
      setFiles([]);
      setIsUploading(false);
      setIsAnalyzing(false);
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
    setIsAnalyzing(false);
  }, [requestedSessionId]);

  useEffect(() => {
    if (!requestedSessionId || !getAnalysisQuery.data?.result) {
      return;
    }
    setSessionId(requestedSessionId);
    setAnalysisResult(getAnalysisQuery.data.result);
    if (user && !getAnalysisQuery.data.result.generalInfo?.policyName?.includes("לא צוין")) {
      linkToUserMutation.mutate({ sessionId: requestedSessionId });
    }
  }, [getAnalysisQuery.data?.result, requestedSessionId, user]);

  useEffect(() => {
    setSelectedFileFilter(resolveSelectedFileFilter(analysisResult, requestedFileFilter));
  }, [analysisResult, requestedFileFilter]);

  const handleFilesSelected = useCallback((newFiles: File[]) => {
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
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setFiles(prev => prev.map(f => ({ ...f, status: "uploading" as const })));

    try {
      const fileData = await Promise.all(
        files.map(async (f) => {
          const fileObj = (f as any)._file as File;
          const arrayBuffer = await fileObj.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce(
              (data, byte) => data + String.fromCharCode(byte),
              ""
            )
          );
          return { name: f.name, size: f.size, base64 };
        })
      );

      const result = await uploadMutation.mutateAsync({ files: fileData });
      setSessionId(result.sessionId);
      setFiles(prev => prev.map(f => ({ ...f, status: "uploaded" as const })));
      setIsUploading(false);

      setIsAnalyzing(true);
      setFiles(prev => prev.map(f => ({ ...f, status: "analyzing" as const })));

      const analysisResponse = await analyzeMutation.mutateAsync({
        sessionId: result.sessionId,
      });

      setAnalysisResult(analysisResponse.result);
      setFiles(prev => prev.map(f => ({ ...f, status: "done" as const })));
      setIsAnalyzing(false);

      if (user) {
        await linkToUserMutation.mutateAsync({ sessionId: result.sessionId });
      }

      toast.success("הסריקה הושלמה בהצלחה!");
    } catch (error: any) {
      setIsUploading(false);
      setIsAnalyzing(false);
      setFiles(prev => prev.map(f => ({ ...f, status: "error" as const, error: error.message })));
      toast.error("שגיאה בסריקת הפוליסה: " + (error.message || "נסה שוב"));
    }
  }, [files, uploadMutation, analyzeMutation, user, linkToUserMutation]);

  const handleReset = useCallback(() => {
    setFiles([]);
    setSessionId(null);
    setAnalysisResult(null);
    setIsUploading(false);
    setIsAnalyzing(false);
    setActiveTab("coverages");
    setSelectedFileFilter(null);
    setLocation("/insurance/new");
  }, [setLocation]);

  const handleSelectedFileFilterChange = useCallback((nextFilter: string | null) => {
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
  }, [requestedSessionId]);

  const currentStep = isAnalyzing ? 1 : analysisResult ? 2 : 0;
  const isSavedAnalysisLoading =
    isViewingSavedAnalysis &&
    !analysisResult &&
    (getAnalysisQuery.isLoading || getAnalysisQuery.isFetching || (!getAnalysisQuery.data && !getAnalysisQuery.error));
  const hasSavedAnalysisError =
    isViewingSavedAnalysis &&
    !analysisResult &&
    !isSavedAnalysisLoading &&
    Boolean(getAnalysisQuery.error || !getAnalysisQuery.data?.result);

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
                  <span className="text-xs font-medium text-blue-100">סריקת פוליסות עם AI</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
                  הבן את הפוליסה שלך בקלות
                </h2>
                <p className="text-sm md:text-base text-blue-100/80 max-w-lg mx-auto leading-relaxed">
                  העלה את קובץ ה-PDF של פוליסת הביטוח שלך וקבל סריקה מפורטת של כל הכיסויים, העלויות והתנאים
                </p>
              </div>

              <div className="relative z-10 flex items-center justify-center gap-3 mt-8">
                {STEPS.map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className={`rounded-full p-2.5 transition-all duration-300 ${
                        i <= currentStep
                          ? "bg-white text-[#1a2744]"
                          : "bg-white/10 text-white/50"
                      }`}>
                        {i < currentStep ? (
                          <CheckCircle2 className="size-5" />
                        ) : (
                          step.icon
                        )}
                      </div>
                      <span className={`text-xs font-medium ${
                        i <= currentStep ? "text-white" : "text-white/40"
                      }`}>
                        {step.title}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`w-12 md:w-20 h-px mb-5 transition-colors duration-300 ${
                        i < currentStep ? "bg-white/50" : "bg-white/15"
                      }`} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-fade-in-up stagger-2">
              <FileUpload
                files={files}
                onFilesSelected={handleFilesSelected}
                onRemoveFile={handleRemoveFile}
                onAnalyze={handleAnalyze}
                isUploading={isUploading}
                isAnalyzing={isAnalyzing}
                hasResults={!!analysisResult}
              />
            </div>

            {isAnalyzing && (
              <Card className="mt-6 border-primary/20 bg-primary/5 animate-fade-in-up">
                <CardContent className="py-8 text-center">
                  <div className="relative size-14 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto size-6 text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    סורק את הפוליסה...
                  </p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    ה-AI קורא וסורק את כל הפרטים — זה עשוי לקחת עד דקה
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {isSavedAnalysisLoading && (
        <div className="page-container">
          <div className="max-w-2xl mx-auto">
            <Card className="border-primary/20 bg-primary/5 animate-fade-in-up">
              <CardContent className="py-12 text-center">
                <div className="relative size-14 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <Loader2 className="absolute inset-0 m-auto size-6 text-primary" />
                </div>
                <p className="text-base font-semibold text-foreground">טוען את הסריקה שבחרת</p>
                <p className="text-sm text-muted-foreground mt-2">
                  לומי מכין עכשיו את תוצאת הסריקה והסינון שביקשת
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {hasSavedAnalysisError && (
        <div className="page-container">
          <div className="max-w-2xl mx-auto">
            <Card className="animate-fade-in-up">
              <CardContent className="py-12 text-center">
                <div className="size-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
                  <FileText className="size-7 text-muted-foreground/50" />
                </div>
                <p className="text-base font-semibold text-foreground">
                  {getAnalysisQuery.error ? "לא הצלחנו לטעון את הסריקה" : "לא מצאנו את הסריקה שבחרת"}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  אפשר לחזור לעמוד הביטוחים או לנסות שוב.
                </p>
                <div className="flex items-center justify-center gap-3 mt-6">
                  <Button variant="outline" onClick={() => setLocation("/insurance")}>
                    חזרה לביטוחים
                  </Button>
                  <Button onClick={() => getAnalysisQuery.refetch()}>
                    נסה שוב
                  </Button>
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
                  {analysisResult.generalInfo.policyNames && analysisResult.generalInfo.policyNames.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {analysisResult.generalInfo.policyNames.map((name) => (
                        <button
                          key={name}
                          onClick={() => {
                            handleSelectedFileFilterChange(selectedFileFilter === name ? null : name);
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
                    <h2 className="text-xl font-bold text-white mb-2">סריקת הפוליסה הושלמה</h2>
                  )}

                  <p className="text-sm text-blue-100/70 leading-relaxed max-w-2xl">
                    {analysisResult.summary}
                  </p>

                  <div className="flex flex-wrap gap-2 mt-4">
                    {analysisResult.coverages && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm px-3 py-1 text-xs font-medium text-blue-100">
                        <Shield className="size-3" />
                        {analysisResult.coverages.length} כיסויים
                      </span>
                    )}
                    {analysisResult.generalInfo.monthlyPremium && analysisResult.generalInfo.monthlyPremium !== "לא צוין בפוליסה" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm px-3 py-1 text-xs font-medium text-blue-100">
                        <Banknote className="size-3" />
                        {analysisResult.generalInfo.monthlyPremium}
                      </span>
                    )}
                    {analysisResult.generalInfo.endDate && analysisResult.generalInfo.endDate !== "לא צוין בפוליסה" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm px-3 py-1 text-xs font-medium text-blue-100">
                        תקף עד {analysisResult.generalInfo.endDate}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  onClick={handleReset}
                  className="bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur-sm shrink-0 gap-2"
                >
                  <ArrowLeft className="size-4" />
                  סריקה חדשה
                </Button>
              </div>
            </div>
          </div>

          {analysisResult.duplicateCoverages && analysisResult.duplicateCoverages.length > 0 && (
            <DuplicateCoveragesAlert
              duplicates={analysisResult.duplicateCoverages}
              coverages={analysisResult.coverages}
            />
          )}

          {analysisResult.personalizedInsights && analysisResult.personalizedInsights.length > 0 && (
            <PersonalizedInsights insights={analysisResult.personalizedInsights} />
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="animate-fade-in-up stagger-2">
            <TabsList className="w-full justify-start bg-card border p-1.5 rounded-xl gap-1">
              <TabsTrigger value="coverages" className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                <LayoutDashboard className="size-4" />
                כיסויים
              </TabsTrigger>
              <TabsTrigger value="financial" className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                <Banknote className="size-4" />
                מידע כללי ועלויות
              </TabsTrigger>
              <TabsTrigger value="chat" className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                <MessageCircle className="size-4" />
                שאלות ותשובות
              </TabsTrigger>
            </TabsList>

            <TabsContent value="coverages" className="mt-5">
              <CoverageCards coverages={analysisResult.coverages} selectedFileFilter={selectedFileFilter} />
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
