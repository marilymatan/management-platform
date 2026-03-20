import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import type { PersonalizedInsight } from "@shared/insurance";

const typeConfig = {
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50 border-amber-200/60",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    badgeBg: "bg-amber-100 text-amber-800 border-amber-200",
    label: "חסר כיסוי",
  },
  recommendation: {
    icon: Lightbulb,
    bg: "bg-blue-50 border-blue-200/60",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    badgeBg: "bg-blue-100 text-blue-800 border-blue-200",
    label: "המלצה",
  },
  positive: {
    icon: CheckCircle2,
    bg: "bg-green-50 border-green-200/60",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    badgeBg: "bg-green-100 text-green-800 border-green-200",
    label: "כיסוי מתאים",
  },
};

const priorityLabels: Record<string, string> = {
  high: "דחיפות גבוהה",
  medium: "חשוב",
  low: "כדאי לשקול",
};

const priorityOrder = { high: 0, medium: 1, low: 2 };

interface PersonalizedInsightsProps {
  insights: PersonalizedInsight[];
}

export function PersonalizedInsights({ insights }: PersonalizedInsightsProps) {
  const [expanded, setExpanded] = useState(false);

  if (!insights || insights.length === 0) return null;

  const sorted = [...insights].sort(
    (a, b) =>
      (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
  );

  const warnings = sorted.filter((i) => i.type === "warning");
  const recommendations = sorted.filter((i) => i.type === "recommendation");
  const positives = sorted.filter((i) => i.type === "positive");

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/3 to-primary/8 animate-fade-in-up">
      <CardContent className="pt-5 pb-5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full gap-3 mb-1"
        >
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserCheck className="size-5 text-primary" />
            </div>
            <div className="text-right">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary" />
                המלצות מותאמות אישית
              </h3>
              <p className="text-xs text-muted-foreground">
                על בסיס הפרופיל האישי שלך
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {warnings.length > 0 && (
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                {warnings.length} אזהרות
              </Badge>
            )}
            {expanded ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {expanded && (
          <div className="mt-4 space-y-3">
            {sorted.map((insight) => {
              const config = typeConfig[insight.type];
              const Icon = config.icon;

              return (
                <div
                  key={insight.id}
                  className={`rounded-xl border p-4 ${config.bg} transition-all`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`size-8 rounded-lg ${config.iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon className={`size-4 ${config.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h4 className="text-sm font-semibold">{insight.title}</h4>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.badgeBg}`}>
                          {config.label}
                        </Badge>
                        {insight.priority === "high" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-100 text-red-800 border-red-200">
                            {priorityLabels[insight.priority]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {insight.description}
                      </p>
                      {insight.relevantCoverage && insight.relevantCoverage !== "" && (
                        <p className="text-xs text-muted-foreground/70 mt-1.5">
                          כיסוי קשור: {insight.relevantCoverage}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
