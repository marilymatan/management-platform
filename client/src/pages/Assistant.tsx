import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  LayoutDashboard,
  Users,
  Shield,
  FolderOpen,
  Loader2,
  ArrowLeft,
} from "lucide-react";

const toneClasses = {
  neutral: "bg-muted/60 text-muted-foreground border-border",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
} as const;

const systemMessage: Message = {
  role: "system",
  content: "אתה לומי, עוזר אישי חכם לביטוחים, למשפחה, למסמכים ולמיילים הביטוחיים של הבית.",
};

export default function Assistant() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
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
  }, [homeContextQuery.data, historyQuery.data]);

  const quickLinks = useMemo(() => ([
    { label: "בית", path: "/", icon: LayoutDashboard },
    { label: "ביטוחים", path: "/insurance", icon: Shield },
    { label: "המשפחה שלי", path: "/family", icon: Users },
    { label: "מסמכים", path: "/documents", icon: FolderOpen },
  ]), []);

  const handleSend = (content: string) => {
    setMessages((prev) => [...prev, { role: "user", content }]);
    chatMutation.mutate({ message: content });
  };

  if (!user) return null;

  if (!initializedRef.current && (homeContextQuery.isLoading || historyQuery.isLoading)) {
    return (
      <div className="page-container">
        <Card className="animate-fade-in-up">
          <CardContent className="py-16 text-center space-y-4">
            <div className="relative size-12 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
            <p className="text-sm text-muted-foreground">לומי אוסף את ההקשר שלך...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6" data-testid="assistant-page">
      <div className="animate-fade-in-up space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="size-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">לומי</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                שאל אותי כל דבר על הביטוחים, הילדים, המסמכים והמיילים הביטוחיים של הבית
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
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div className="animate-fade-in-up stagger-1">
          <AIChatBox
            messages={messages}
            onSendMessage={handleSend}
            isLoading={chatMutation.isPending}
            placeholder="שאל/י את לומי שאלה..."
            height="720px"
            emptyStateMessage="שאל/י את לומי כל שאלה על התיק הביטוחי, המשפחה והמסמכים של הבית"
            suggestedPrompts={homeContextQuery.data?.suggestedPrompts ?? []}
            className="border-border/60 shadow-sm"
          />
        </div>

        <div className="space-y-4 animate-fade-in-up stagger-2">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-amber-500" />
                <h2 className="text-sm font-semibold">תובנות אחרונות</h2>
              </div>
              <div className="space-y-3">
                {homeContextQuery.data?.highlights?.map((highlight, index) => (
                  <div
                    key={`${highlight.title}-${index}`}
                    className={`rounded-xl border p-3 ${toneClasses[highlight.tone]}`}
                  >
                    <p className="text-sm font-semibold">{highlight.title}</p>
                    <p className="text-xs mt-1 leading-relaxed">{highlight.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ArrowLeft className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">עבור במהירות לעמודים החשובים</h2>
              </div>
              <div className="space-y-2">
                {quickLinks.map((link) => (
                  <Button
                    key={link.path}
                    variant="outline"
                    className="w-full justify-between rounded-xl h-11"
                    onClick={() => setLocation(link.path)}
                  >
                    <span className="flex items-center gap-2">
                      <link.icon className="size-4" />
                      {link.label}
                    </span>
                    <ArrowLeft className="size-4 opacity-50" />
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {chatMutation.isPending && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                לומי חושב על תשובה שמתבססת על הנתונים שלך
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
