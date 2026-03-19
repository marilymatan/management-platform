import { useState, useEffect } from "react";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";

interface PolicyChatbotProps {
  sessionId: string;
}

export function PolicyChatbot({ sessionId }: PolicyChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: "אני עוזר וירטואלי לפוליסות ביטוח. אני יכול לענות על שאלות לגבי הפוליסה שהעלית.",
    },
  ]);

  // Load existing chat history
  const { data: history } = trpc.policy.getChatHistory.useQuery({ sessionId });

  useEffect(() => {
    if (history && history.length > 0) {
      setMessages([
        {
          role: "system",
          content: "אני עוזר וירטואלי לפוליסות ביטוח. אני יכול לענות על שאלות לגבי הפוליסה שהעלית.",
        },
        ...history.map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
      ]);
    }
  }, [history]);

  const chatMutation = trpc.policy.chat.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: data.response },
      ]);
    },
    onError: (error) => {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `שגיאה: ${error.message}. נסה שוב.` },
      ]);
    },
  });

  const handleSend = (content: string) => {
    setMessages(prev => [...prev, { role: "user", content }]);
    chatMutation.mutate({ sessionId, message: content });
  };

  return (
    <AIChatBox
      messages={messages}
      onSendMessage={handleSend}
      isLoading={chatMutation.isPending}
      placeholder="שאל שאלה על הפוליסה..."
      height="500px"
      emptyStateMessage="שאל אותי כל שאלה על הפוליסה שלך"
      suggestedPrompts={[
        "מה הכיסויים העיקריים בפוליסה?",
        "מה ההשתתפות העצמית לניתוח?",
        "האם יש כיסוי לטיפולי שיניים?",
        "מה תקופת האכשרה?",
      ]}
    />
  );
}
