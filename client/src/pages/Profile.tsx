import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, LogOut, Mail, User as UserIcon, Info } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Profile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  if (!user) {
    return (
      <div className="min-h-full flex items-center justify-center p-8">
        <Card className="max-w-sm w-full text-center">
          <CardContent className="pt-8 pb-6">
            <Shield className="size-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">אנא התחבר כדי לצפות בפרופיל שלך</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    setLocation("/");
    toast.success("התנתקת בהצלחה");
  };

  const userInitials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)
    : "U";

  return (
    <div className="page-container max-w-2xl mx-auto">
      <div className="text-center mb-8 animate-fade-in-up">
        <Avatar className="size-20 mx-auto mb-4 border-4 border-primary/10">
          <AvatarFallback className="bg-primary/8 text-primary text-2xl font-bold">
            {userInitials}
          </AvatarFallback>
        </Avatar>
        <h2 className="text-xl font-bold">{user.name}</h2>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      <Card className="mb-5 animate-fade-in-up stagger-1">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="size-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <UserIcon className="size-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold">פרטים אישיים</h3>
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">שם מלא</Label>
              <Input id="name" value={user.name || ""} disabled className="mt-1.5 bg-muted/40" />
            </div>
            <div>
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Mail className="size-3" />
                דוא״ל
              </Label>
              <Input id="email" value={user.email || ""} disabled className="mt-1.5 bg-muted/40" />
            </div>
            <div>
              <Label htmlFor="loginMethod" className="text-xs font-medium text-muted-foreground">שיטת התחברות</Label>
              <Input id="loginMethod" value={user.loginMethod || "Google"} disabled className="mt-1.5 bg-muted/40" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-200/60 bg-red-50/30 mb-5 animate-fade-in-up stagger-2">
        <CardContent className="pt-5 pb-5">
          <h3 className="text-sm font-semibold text-red-900 mb-3">פעולות חשבון</h3>
          <Button onClick={handleLogout} variant="destructive" className="w-full gap-2" size="lg">
            <LogOut className="size-4" />
            התנתקות
          </Button>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            אתה יכול להתחבר מחדש בכל עת
          </p>
        </CardContent>
      </Card>

      <Card className="bg-blue-50/30 border-blue-200/60 animate-fade-in-up stagger-3">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
              <Info className="size-4 text-blue-600" />
            </div>
            <p className="text-sm text-blue-900/80">
              כל הניתוחים שלך נשמרים בבטחה בחשבונך. אתה יכול לצפות בהם בכל עת מהדשבורד שלך.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
