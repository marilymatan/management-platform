import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ArrowRight, LogOut, Mail, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Card>
          <CardContent className="pt-6">
            <p>אנא התחבר כדי לצפות בפרופיל שלך</p>
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
                <p className="text-xs text-muted-foreground">הפרופיל שלך</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setLocation("/dashboard")}
              className="gap-2"
            >
              <ArrowRight className="size-4" />
              חזור לדשבורד
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-2xl">
        {/* Profile Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="size-5" />
              פרטים אישיים
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Name */}
            <div>
              <Label htmlFor="name" className="text-sm font-medium">
                שם מלא
              </Label>
              <Input
                id="name"
                value={user.name || ""}
                disabled
                className="mt-2 bg-muted"
              />
            </div>

            {/* Email */}
            <div>
              <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                <Mail className="size-4" />
                דוא״ל
              </Label>
              <Input
                id="email"
                value={user.email || ""}
                disabled
                className="mt-2 bg-muted"
              />
            </div>

            {/* Login Method */}
            <div>
              <Label htmlFor="loginMethod" className="text-sm font-medium">
                שיטת התחברות
              </Label>
              <Input
                id="loginMethod"
                value={user.loginMethod || "Google"}
                disabled
                className="mt-2 bg-muted"
              />
            </div>


          </CardContent>
        </Card>

        {/* Account Actions */}
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader>
            <CardTitle className="text-red-900">פעולות חשבון</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleLogout}
              variant="destructive"
              className="w-full gap-2"
              size="lg"
            >
              <LogOut className="size-4" />
              התנתקות
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              אתה יכול להתחבר מחדש בכל עת
            </p>
          </CardContent>
        </Card>

        {/* Info Section */}
        <Card className="mt-6 bg-blue-50/50 border-blue-200">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-900">
              <strong>טיפ:</strong> כל הניתוחים שלך נשמרים בבטחה בחשבונך. אתה יכול לצפות בהם בכל עת מהדשבורד שלך.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
