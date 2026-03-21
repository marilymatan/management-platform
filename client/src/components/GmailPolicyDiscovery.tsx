import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatGmailConnectionSummary } from "@/lib/gmailConnections";
import { trpc } from "@/lib/trpc";
import { FileText, Loader2, Mail, RefreshCw, Sparkles } from "lucide-react";

type GmailPolicyDiscoveryProps = {
  returnTo?: string;
  compact?: boolean;
  title?: string;
  description?: string;
  onImported?: (sessionIds: string[]) => void;
};

function buildCandidateKey(candidate: {
  connectionId: number;
  gmailMessageId: string;
  attachmentId: string;
}) {
  return `${candidate.connectionId}:${candidate.gmailMessageId}:${candidate.attachmentId}`;
}

function getArtifactLabel(value?: string | null) {
  if (value === "renewal_notice") return "חידוש";
  if (value === "premium_notice") return "פרמיה";
  if (value === "coverage_update") return "עדכון כיסוי";
  if (value === "claim_update") return "תביעה";
  return "פוליסה";
}

function getCategoryLabel(value?: string | null) {
  if (value === "health") return "בריאות";
  if (value === "life") return "חיים";
  if (value === "car") return "רכב";
  if (value === "home") return "דירה";
  return "ביטוח";
}

export function GmailPolicyDiscovery({
  returnTo = "/",
  compact = false,
  title = "פוליסות שזוהו ב-Gmail",
  description = "לומי מצאה מסמכי פוליסה או חידוש עם PDF, ואת/ה בוחר/ת מה לייבא לניתוח.",
  onImported,
}: GmailPolicyDiscoveryProps) {
  const utils = trpc.useUtils();
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const { data: connectionStatus } = trpc.gmail.connectionStatus.useQuery();
  const { data: authUrlData } = trpc.gmail.getAuthUrl.useQuery({ returnTo });
  const candidatesQuery = trpc.gmail.discoverPolicies.useQuery(
    { daysBack: 365 },
    {
      enabled: Boolean(connectionStatus?.connected),
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    }
  );
  const importMutation = trpc.gmail.importPolicyPdf.useMutation({
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const candidates = candidatesQuery.data ?? [];
  const connectionSummary = formatGmailConnectionSummary(connectionStatus?.connections);
  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selectedKeys.includes(buildCandidateKey(candidate))),
    [candidates, selectedKeys]
  );

  useEffect(() => {
    setSelectedKeys((current) => current.filter((key) => candidates.some((candidate) => buildCandidateKey(candidate) === key)));
  }, [candidates]);

  function toggleCandidate(key: string) {
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  async function handleImportSelected() {
    if (selectedCandidates.length === 0) {
      toast.error("בחר לפחות מסמך אחד לייבוא");
      return;
    }

    const createdSessionIds: string[] = [];
    for (const candidate of selectedCandidates) {
      const result = await importMutation.mutateAsync({
        connectionId: candidate.connectionId,
        gmailMessageId: candidate.gmailMessageId,
        attachmentId: candidate.attachmentId,
        filename: candidate.attachmentName,
        insuranceCategory:
          candidate.insuranceCategory === "health"
          || candidate.insuranceCategory === "life"
          || candidate.insuranceCategory === "car"
          || candidate.insuranceCategory === "home"
            ? candidate.insuranceCategory
            : null,
      });
      createdSessionIds.push(result.sessionId);
    }

    await Promise.all([
      utils.policy.getUserAnalyses.invalidate(),
      utils.gmail.getInsuranceDiscoveries.invalidate(),
      utils.gmail.discoverPolicies.invalidate(),
      utils.insuranceScore.getDashboard.invalidate(),
      utils.savings.getReport.invalidate(),
    ]);
    setSelectedKeys([]);
    toast.success(`נשלחו ${createdSessionIds.length} מסמכים לניתוח ברקע`);
    onImported?.(createdSessionIds);
  }

  function handleConnect() {
    if (authUrlData?.url) {
      window.location.href = authUrlData.url;
    }
  }

  return (
    <Card data-testid="gmail-policy-discovery">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-primary" />
              <h3 className="text-base font-semibold">{title}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
            {connectionStatus?.connected && (
              <div
                className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900"
                data-testid="gmail-policy-connected-account"
              >
                <span className="font-medium">Gmail מחובר:</span>
                <span className="font-semibold truncate">{connectionSummary.label}</span>
                <span className="text-emerald-700/70">• {connectionSummary.detail}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!connectionStatus?.connected ? (
              <Button onClick={handleConnect} className="gap-1.5">
                <Sparkles className="size-4" />
                חבר Gmail
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => candidatesQuery.refetch()}
                disabled={candidatesQuery.isFetching}
                className="gap-1.5"
              >
                <RefreshCw className={`size-4 ${candidatesQuery.isFetching ? "animate-spin" : ""}`} />
                רענן גילוי
              </Button>
            )}
          </div>
        </div>

        {!connectionStatus?.connected ? (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            כדי שלומי ימצא פוליסות ישירות מהמייל, צריך לחבר קודם את Gmail.
          </div>
        ) : candidatesQuery.isLoading ? (
          <div className="rounded-xl border p-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            מחפש מסמכי פוליסה ו־PDF ב-Gmail ב־12 החודשים האחרונים...
          </div>
        ) : candidatesQuery.error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">לא הצלחנו להשלים את חיפוש הפוליסות</p>
            <p className="text-sm text-muted-foreground">
              אפשר לנסות שוב, או להמשיך להעלות פוליסות ידנית אם כבר יש קבצים זמינים.
            </p>
            <Button variant="outline" size="sm" onClick={() => candidatesQuery.refetch()} className="gap-1.5">
              <RefreshCw className="size-4" />
              נסה שוב
            </Button>
          </div>
        ) : candidates.length === 0 ? (
          <div className="rounded-xl border p-4 text-sm text-muted-foreground">
            לא זוהו כרגע PDF-ים ביטוחיים ב-Gmail ב־365 הימים האחרונים. אפשר להעלות PDF ידנית או לנסות רענון בהמשך.
          </div>
        ) : (
          <>
            <div className={`grid ${compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"} gap-3`}>
              {candidates.map((candidate) => {
                const key = buildCandidateKey(candidate);
                const isChecked = selectedKeys.includes(key);
                return (
                  <div
                    key={key}
                    className={`rounded-xl border p-4 space-y-3 transition-colors ${isChecked ? "border-primary bg-primary/5" : "border-border"}`}
                    data-testid={`gmail-policy-candidate-${candidate.gmailMessageId}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox checked={isChecked} onCheckedChange={() => toggleCandidate(key)} aria-label={`בחר ${candidate.attachmentName}`} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{candidate.attachmentName}</p>
                          <Badge variant="outline">{getArtifactLabel(candidate.artifactType)}</Badge>
                          <Badge variant="outline">{getCategoryLabel(candidate.insuranceCategory)}</Badge>
                          {candidate.alreadyKnown && <Badge variant="outline">כבר זוהה בעבר</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{candidate.subject}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span>{candidate.provider || candidate.from}</span>
                          <span>·</span>
                          <span>{new Date(candidate.date).toLocaleDateString("he-IL")}</span>
                        </div>
                      </div>
                      <FileText className="size-4 text-primary shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">
                נבחרו {selectedCandidates.length} מתוך {candidates.length} מסמכים
              </p>
              <Button onClick={handleImportSelected} disabled={selectedCandidates.length === 0 || importMutation.isPending} className="gap-1.5">
                {importMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                נתח מסמכים נבחרים
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
