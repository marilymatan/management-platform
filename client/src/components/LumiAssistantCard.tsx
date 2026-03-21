import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";

const toneClasses = {
  neutral: "bg-muted/60 text-muted-foreground border-border",
  info: "bg-primary/10 text-primary border-primary/20",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/20 text-warning-foreground border-warning/30",
} as const;

const systemMessage: Message = {
  role: "system",
  content: "אתה לומי, עוזר אישי חכם לביטוחים, למשפחה, למסמכים ולמיילים הביטוחיים של הבית.",
};

type LumiAssistantCardProps = {
  dataTestId?: string;
  height?: string | number;
};

export function LumiAssistantCard({
  dataTestId = "home-lumi-chat",
  height = "620px",
}: LumiAssistantCardProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([systemMessage]);
  const initializedRef = useRef(false);

  const homeContextQuery = trpc.assistant.getHomeContext.useQuery(undefined, {
    enabled: !!user,
  });
  const historyQuery = trpc.assistant.getChatHistory.useQuery(undefined, {
    enabled: !!user,
  });

  const chatMutation = trpc.assistant.chat.useMutation({
    onSuccess: (data) => {
      setMessages((previous) => [...previous, { role: "assistant", content: data.response }]);
    },
    onError: (error) => {
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: `לא הצלחתי לענות כרגע. ${error.message || "נסה שוב בעוד רגע."}`,
        },
      ]);
    },
  });

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    if (!homeContextQuery.data || historyQuery.data === undefined) {
      return;
    }
    if (historyQuery.data.length > 0) {
      setMessages([systemMessage, ...historyQuery.data]);
    } else {
      setMessages([
        systemMessage,
        {
          role: "assistant",
          content: homeContextQuery.data.greeting,
        },
      ]);
    }
    initializedRef.current = true;
  }, [homeContextQuery.data, historyQuery.data]);

  if (!user) {
    return null;
  }

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm" data-testid={dataTestId}>
      <CardContent className="p-0">
        <div className="border-b border-border/60 bg-muted/20 px-5 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-2xl bg-gradient-to-br from-primary to-chart-1 flex items-center justify-center text-primary-foreground shadow-sm">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">לומי בתוך הבית</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    אפשר לשאול על כל הפוליסות, המסמכים, המשפחה והמיילים במקום אחד.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {homeContextQuery.data?.chips?.map((chip, index) => (
                  <Badge
                    key={`${chip.label}-${index}`}
                    variant="outline"
                    className={`rounded-full px-3 py-1 text-xs font-medium ${toneClasses[chip.tone]}`}
                  >
                    {chip.label}
                  </Badge>
                ))}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setLocation("/assistant")}
            >
              למסך הצ'אט המלא
              <ArrowLeft className="size-4" />
            </Button>
          </div>
        </div>

        {!initializedRef.current && (homeContextQuery.isLoading || historyQuery.isLoading) ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              לומי אוסף את ההקשר שלך
            </div>
          </div>
        ) : (
          <AIChatBox
            messages={messages}
            onSendMessage={(content) => {
              setMessages((previous) => [...previous, { role: "user", content }]);
              chatMutation.mutate({ message: content });
            }}
            isLoading={chatMutation.isPending}
            placeholder="שאל את לומי על כל מה שזוהה אצלך"
            height={height}
            emptyStateMessage="שאלו את לומי כל שאלה על התיק הביטוחי, המשפחה והמסמכים של הבית"
            suggestedPrompts={homeContextQuery.data?.suggestedPrompts ?? []}
            className="rounded-none border-0 shadow-none"
          />
        )}
      </CardContent>
    </Card>
  );
}
