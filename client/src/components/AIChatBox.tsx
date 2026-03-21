import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIChatBoxProps = {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  height?: string | number;
  emptyStateMessage?: string;
  suggestedPrompts?: string[];
  title?: string;
  description?: string;
};

export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "Type your message...",
  className,
  height = "600px",
  emptyStateMessage = "Start a conversation with AI",
  suggestedPrompts,
  title,
  description,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const displayMessages = messages.filter((msg) => msg.role !== "system");
  const showHeader = Boolean(title || description);

  const scrollToBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement | null;

    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [displayMessages.length, isLoading]);

  const focusInput = () => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const sendMessage = (content: string) => {
    const trimmedInput = content.trim();
    if (!trimmedInput || isLoading) return;

    onSendMessage(trimmedInput);
    focusInput();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    onSendMessage(trimmedInput);
    setInput("");
    focusInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <section
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-card/95 text-card-foreground shadow-sm",
        className
      )}
      style={{ height }}
    >
      {showHeader ? (
        <div className="border-b border-border/60 bg-muted/20 px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-4xl items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </div>
              <div className="space-y-1">
                {title ? <p className="text-sm font-semibold sm:text-base">{title}</p> : null}
                {description ? (
                  <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
              {displayMessages.length > 0 ? `${displayMessages.length} הודעות בשיחה` : "מוכן לשאלה הראשונה"}
            </div>
          </div>
        </div>
      ) : null}

      <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {displayMessages.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
              <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-full border border-border/70 bg-muted/40 text-primary">
                  <Sparkles className="size-6" />
                </div>
                <div className="space-y-2">
                  <p className="text-base font-medium text-foreground">{emptyStateMessage}</p>
                  <p className="text-sm text-muted-foreground">
                    אפשר להתחיל עם אחת מההצעות למטה או לכתוב שאלה משלך.
                  </p>
                </div>
                {suggestedPrompts && suggestedPrompts.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    {suggestedPrompts.map((prompt, index) => (
                      <button
                        key={`${prompt}-${index}`}
                        type="button"
                        onClick={() => sendMessage(prompt)}
                        disabled={isLoading}
                        className="rounded-full border border-border/70 bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div
              className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6"
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {displayMessages.map((message, index) => (
                <article
                  key={`${message.role}-${index}`}
                  className={cn("flex", message.role === "user" ? "justify-end" : "items-start gap-3")}
                >
                  {message.role === "assistant" ? (
                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-primary">
                      <Sparkles className="size-4" />
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      message.role === "user"
                        ? "max-w-[85%] sm:max-w-2xl"
                        : "flex-1 max-w-3xl"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-[1.75rem] px-4 py-3 sm:px-5 sm:py-4",
                        message.role === "user"
                          ? "border border-border/70 bg-secondary text-foreground shadow-xs"
                          : "border border-border/60 bg-background shadow-xs"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <div
                          className="prose prose-sm max-w-none text-end text-sm leading-relaxed text-foreground dark:prose-invert prose-headings:text-foreground prose-p:my-0 prose-p:leading-relaxed prose-strong:text-foreground prose-ul:my-3 prose-ol:my-3 [&_ol]:pe-6 [&_p]:text-end [&_ul]:pe-6 [&_li]:text-end"
                          dir="rtl"
                        >
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-end text-sm leading-relaxed sm:text-[15px]">
                          {message.content}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              ))}

              {isLoading ? (
                <article className="flex items-start gap-3">
                  <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-primary">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="rounded-[1.75rem] border border-border/60 bg-background px-4 py-3 shadow-xs">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      <span>לומי חושב על זה...</span>
                    </div>
                  </div>
                </article>
              ) : null}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="border-t border-border/60 bg-muted/20 px-4 py-4 sm:px-6">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-4xl flex-col gap-3">
          <div className="flex items-end gap-3 rounded-[1.75rem] border border-border/70 bg-background px-4 py-3 shadow-xs transition-shadow focus-within:ring-2 focus-within:ring-ring/20">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="min-h-[56px] max-h-40 border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 sm:text-base"
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isLoading}
              aria-label="שלח הודעה"
              className="size-10 rounded-full shadow-sm"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </Button>
          </div>
          <p className="px-1 text-xs text-muted-foreground">Enter לשליחה, Shift+Enter לשורה חדשה</p>
        </form>
      </div>
    </section>
  );
}
