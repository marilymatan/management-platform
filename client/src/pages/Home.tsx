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
import { PolicyNames } from "@/components/PolicyNames";
import { FileFilter } from "@/components/FileFilter";
import { PolicyChatbot } from "@/components/PolicyChatbot";
import {
  Shield,
  FileSearch,
  LayoutDashboard,
  Banknote,
  MessageCircle,
  Loader2,
  LogOut,
  LayoutGrid,
  User,
  FileText,
} from "lucide-react";
import type { UploadedFile, PolicyAnalysis } from "@shared/insurance";

export default function Home() {
  const { user, logout } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/analysis/:sessionId");
  
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<PolicyAnalysis | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState("coverages");
  const [selectedFileFilter, setSelectedFileFilter] = useState<string | null>(null);

  const uploadMutation = trpc.policy.upload.useMutation();
  const analyzeMutation = trpc.policy.analyze.useMutation();
  const getAnalysisMutation = trpc.policy.getAnalysis.useQuery(
    { sessionId: params?.sessionId || "" },
    { enabled: !!params?.sessionId }
  );
  const linkToUserMutation = trpc.policy.linkToUser.useMutation();

  // Load analysis if viewing from URL
  useEffect(() => {
    if (getAnalysisMutation.data && params?.sessionId) {
      setSessionId(params.sessionId);
      setAnalysisResult(getAnalysisMutation.data.result);
      
      // Link to user if authenticated
      if (user && !getAnalysisMutation.data.result?.generalInfo?.policyName?.includes("לא צוין")) {
        linkToUserMutation.mutate({ sessionId: params.sessionId });
      }
    }
  }, [getAnalysisMutation.data, params?.sessionId, user]);

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
      // Convert files to base64
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

      // Upload files
      const result = await uploadMutation.mutateAsync({ files: fileData });
      setSessionId(result.sessionId);
      setFiles(prev => prev.map(f => ({ ...f, status: "uploaded" as const })));
      setIsUploading(false);

      // Start analysis
      setIsAnalyzing(true);
      setFiles(prev => prev.map(f => ({ ...f, status: "analyzing" as const })));

      const analysisResponse = await analyzeMutation.mutateAsync({
        sessionId: result.sessionId,
      });

      setAnalysisResult(analysisResponse.result);
      setFiles(prev => prev.map(f => ({ ...f, status: "done" as const })));
      setIsAnalyzing(false);
      
      // Link to user if authenticated
      if (user) {
        await linkToUserMutation.mutateAsync({ sessionId: result.sessionId });
      }
      
      toast.success("הניתוח הושלם בהצלחה!");
    } catch (error: any) {
      setIsUploading(false);
      setIsAnalyzing(false);
      setFiles(prev => prev.map(f => ({ ...f, status: "error" as const, error: error.message })));
      toast.error("שגיאה בניתוח הפוליסה: " + (error.message || "נסה שוב"));
    }
  }, [files, uploadMutation, analyzeMutation, user, linkToUserMutation]);

  const handleReset = useCallback(() => {
    setFiles([]);
    setSessionId(null);
    setAnalysisResult(null);
    setIsUploading(false);
    setIsAnalyzing(false);
    setActiveTab("coverages");
  }, []);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5">
                <Shield className="size-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">מנתח פוליסות ביטוח</h1>
                <p className="text-xs text-muted-foreground">ניתוח חכם של פוליסות ביטוח באמצעות AI</p>
              </div>
            </div>
            {user && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation("/dashboard")}
                  className="gap-2"
                >
                  <LayoutGrid className="size-4" />
                  דשבורד
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation("/profile")}
                  className="gap-2"
                >
                  <User className="size-4" />
                  פרופיל
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await logout();
                  }}
                  className="gap-2"
                >
                  <LogOut className="size-4" />
                  התנתקות
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* Upload Section */}
        {!analysisResult && (
          <div className="max-w-2xl mx-auto">
            {/* Hero */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-2">
                הבן את הפוליסה שלך בקלות
              </h2>
              <p className="text-muted-foreground">
                העלה את קובץ ה-PDF של פוליסת הביטוח שלך וקבל ניתוח מפורט של כל הכיסויים, העלויות והתנאים
              </p>
            </div>

            {/* Steps */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { icon: <FileSearch className="size-5" />, title: "העלה", desc: "העלה קבצי PDF" },
                { icon: <Loader2 className="size-5" />, title: "ניתוח", desc: "AI מנתח את הפוליסה" },
                { icon: <LayoutDashboard className="size-5" />, title: "תוצאות", desc: "צפה בכיסויים" },
              ].map((step, i) => (
                <div key={i} className="text-center">
                  <div className="rounded-full bg-primary/10 p-3 w-fit mx-auto mb-2">
                    {step.icon}
                  </div>
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>
              ))}
            </div>

            <FileUpload
              files={files}
              onFilesSelected={handleFilesSelected}
              onRemoveFile={handleRemoveFile}
              onAnalyze={handleAnalyze}
              isUploading={isUploading}
              isAnalyzing={isAnalyzing}
              hasResults={!!analysisResult}
            />

            {/* Loading state with progress */}
            {isAnalyzing && (
              <Card className="mt-6 border-primary/20 bg-primary/5">
                <CardContent className="py-6 text-center">
                  <Loader2 className="size-8 text-primary animate-spin mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">
                    מנתח את הפוליסה... זה עשוי לקחת עד דקה
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ה-AI קורא ומנתח את כל הפרטים בפוליסה שלך
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Results Dashboard */}
        {analysisResult && (
          <div className="space-y-6">
            {/* Summary Banner */}
            <Card className="bg-gradient-to-l from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="py-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="rounded-xl bg-primary/10 p-2.5 shrink-0 mt-0.5">
                        <Shield className="size-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* PDF file badges */}
                        {analysisResult.generalInfo.policyNames && analysisResult.generalInfo.policyNames.length > 0 ? (
                          <div className="flex flex-wrap gap-2 mb-2 justify-end" dir="rtl">
                            {analysisResult.generalInfo.policyNames.map((name) => (
                              <button
                                key={name}
                                onClick={() => {
                                  setSelectedFileFilter(selectedFileFilter === name ? null : name);
                                  setActiveTab("coverages");
                                }}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
                                  selectedFileFilter === name
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "bg-white text-foreground border-border hover:bg-primary/5 hover:border-primary/40"
                                }`}
                              >
                                <FileText className="size-3.5 shrink-0" />
                                <span className="max-w-[200px] truncate">{name}</span>
                              </button>
                            ))}
                            {selectedFileFilter && (
                              <button
                                onClick={() => setSelectedFileFilter(null)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground border border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 transition-all"
                              >
                                הצג הכל
                              </button>
                            )}
                          </div>
                        ) : (
                          <h2 className="text-lg font-bold text-foreground mb-1">ניתוח הפוליסה הושלם</h2>
                        )}
                        <p className="text-sm text-muted-foreground text-right" dir="rtl">
                          {analysisResult.summary}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReset}
                    className="shrink-0"
                  >
                    ניתוח חדש
                  </Button>
                </div>
              </CardContent>
            </Card>



            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
              <TabsList className="w-full justify-start bg-muted/50 p-1">
                <TabsTrigger value="coverages" className="gap-1.5 text-sm">
                  <LayoutDashboard className="size-4" />
                  כיסויים
                </TabsTrigger>
                <TabsTrigger value="financial" className="gap-1.5 text-sm">
                  <Banknote className="size-4" />
                  מידע כללי ועלויות
                </TabsTrigger>
                <TabsTrigger value="chat" className="gap-1.5 text-sm">
                  <MessageCircle className="size-4" />
                  שאלות ותשובות
                </TabsTrigger>
              </TabsList>

              <TabsContent value="coverages" className="mt-4">
                <CoverageCards coverages={analysisResult.coverages} selectedFileFilter={selectedFileFilter} />
              </TabsContent>

              <TabsContent value="financial" className="mt-4">
                <FinancialSummary
                  generalInfo={analysisResult.generalInfo}
                  coverages={analysisResult.coverages}
                  summary={analysisResult.summary}
                />
              </TabsContent>

              <TabsContent value="chat" className="mt-4">
                {sessionId && <PolicyChatbot sessionId={sessionId} />}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-6 bg-muted/30">
        <div className="container text-center">
          <p className="text-xs text-muted-foreground">
            הכלי מספק ניתוח ראשוני בלבד ואינו מהווה ייעוץ משפטי או ביטוחי. יש לבדוק את הפוליסה המקורית לפרטים מלאים.
          </p>
        </div>
      </footer>
    </div>
  );
}
