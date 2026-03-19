import { Button } from "@/components/ui/button";
import { Home, SearchX } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="text-center max-w-sm animate-fade-in-up">
        <div className="size-20 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-6">
          <SearchX className="size-10 text-muted-foreground/40" />
        </div>
        <h1 className="text-5xl font-bold text-foreground mb-2">404</h1>
        <h2 className="text-lg font-semibold text-foreground mb-2">העמוד לא נמצא</h2>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          העמוד שחיפשת לא קיים. ייתכן שהוא הועבר או נמחק.
        </p>
        <Button onClick={() => setLocation("/")} size="lg" className="gap-2">
          <Home className="size-4" />
          חזרה לדף הבית
        </Button>
      </div>
    </div>
  );
}
