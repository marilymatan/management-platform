import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Loader2,
} from "lucide-react";

const toneClasses = {
  neutral: "border-border/60 bg-background text-muted-foreground shadow-xs",
  info: "border-primary/20 bg-primary/10 text-primary shadow-xs",
  success: "border-success/20 bg-success/10 text-success shadow-xs",
  warning: "border-warning/30 bg-warning/20 text-warning-foreground shadow-xs",
} as const;

const systemMessage: Message = {
  role: "system",
  content: "אתה לומי, עוזר אישי חכם לביטוחים, למשפחה, למסמכים ולמיילים הביטוחיים של הבית.",
};

export default function Assistant() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [messages, setMessages] = useState<Message[]>([systemMessage]);
  const [slowContextLoad, setSlowContextLoad] = useState(false);
  const initializedRef = useRef(false);

  const homeContextQuery = trpc.assistant.getHomeContext.useQuery(undefined, {
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const historyQuery = trpc.assistant.getChatHistory.useQuery(undefined, {
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const chatMutation = trpc.assistant.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    },
    onError: (error) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `לא הצלחתי לענות כרגע. ${error.message || "נסה שוב בעוד רגע."}`,
        },
      ]);
    },
  });

  useEffect(() => {
    if (initializedRef.current) return;
    if (homeContextQuery.isError || historyQuery.isError) {
      initializedRef.current = true;
      setMessages([
        systemMessage,
        {
          role: "assistant",
          content:
            "לא הצלחתי לטעון את כל ההקשר מהשרת. אפשר לנסות שוב או לכתוב שאלה ולומי יענה לפי מה שזמין.",
        },
      ]);
      return;
    }
    if (!homeContextQuery.data || historyQuery.data === undefined) return;

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
  }, [homeContextQuery.data, homeContextQuery.isError, historyQuery.data, historyQuery.isError]);

  useEffect(() => {
    if (initializedRef.current || homeContextQuery.isError || historyQuery.isError) {
      return;
    }
    if (!homeContextQuery.isPending && !historyQuery.isPending) {
      return;
    }
    const timer = window.setTimeout(() => setSlowContextLoad(true), 25_000);
    return () => window.clearTimeout(timer);
  }, [homeContextQuery.isPending, homeContextQuery.isError, historyQuery.isPending, historyQuery.isError]);

  useEffect(() => {
    if (initializedRef.current) {
      setSlowContextLoad(false);
    }
  }, [homeContextQuery.data, historyQuery.data, homeContextQuery.isError, historyQuery.isError]);

  const handleSend = (content: string) => {
    setMessages((prev) => [...prev, { role: "user", content }]);
    chatMutation.mutate({ message: content });
  };

  if (!user) return null;

  if (
    !initializedRef.current
    && !homeContextQuery.isError
    && !historyQuery.isError
    && (homeContextQuery.isPending || historyQuery.isPending)
  ) {
    return (
      <div className="page-container" data-testid="assistant-page">
        <div className="mx-auto flex min-h-[60vh] max-w-4xl items-center justify-center">
          <div className="animate-fade-in-up flex flex-col items-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-primary shadow-xs">
              <Sparkles className="size-5" />
            </div>
            <div className="space-y-2">
              <p className="text-xl font-semibold tracking-tight">לומי טוען את ההקשר שלך</p>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>אוסף פוליסות, מסמכים והיסטוריית צ׳אט</span>
              </div>
              {slowContextLoad ? (
                <div className="flex flex-col items-center gap-3 pt-2">
                  <p className="text-sm text-muted-foreground">זה לוקח יותר מהרגיל. אפשר לנסות לרענן.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="assistant-context-retry"
                    onClick={() => {
                      void Promise.all([homeContextQuery.refetch(), historyQuery.refetch()]);
                    }}
                  >
                    נסה שוב
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" data-testid="assistant-page">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="animate-fade-in-up px-2 pt-1">
          <div className="mx-auto max-w-3xl space-y-5 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1.5 text-sm text-muted-foreground shadow-xs">
              <Sparkles className="size-4 text-primary" />
              <span>עוזר הביטוח של הבית</span>
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">לומי</h1>
              <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                שאל אותי כל דבר על הביטוחים, הילדים, המסמכים והמיילים הביטוחיים של הבית
              </p>
            </div>

            {homeContextQuery.data?.chips?.length ? (
              <div
                className="flex flex-wrap items-center justify-center gap-3"
                data-testid="assistant-summary-chips"
              >
                {homeContextQuery.data.chips.map((chip, index) => (
                  <Badge
                    key={`${chip.label}-${index}`}
                    variant="outline"
                    className={`rounded-full px-4 py-2 text-sm font-medium ${toneClasses[chip.tone]}`}
                  >
                    {chip.label}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <div className="animate-fade-in-up stagger-1" data-testid="assistant-chat-shell">
          <AIChatBox
            messages={messages}
            onSendMessage={handleSend}
            isLoading={chatMutation.isPending}
            title="שיחה עם לומי"
            description="תשובות על הפוליסות, המסמכים והמיילים הביטוחיים של הבית"
            placeholder="שאל את לומי על הביטוחים, המסמכים והבית"
            height="clamp(540px, calc(100vh - 250px), 760px)"
            emptyStateMessage="שאל/י את לומי כל שאלה על התיק הביטוחי, המשפחה והמסמכים של הבית"
            suggestedPrompts={homeContextQuery.data?.suggestedPrompts ?? []}
            className="border-border/60 bg-card/90 shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}
