import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
} from "@/components/ui/form";
import {
  Settings as SettingsIcon,
  LogOut,
  Mail,
  User as UserIcon,
  Heart,
  Briefcase,
  Home,
  Car,
  Activity,
  Save,
  CalendarDays,
  Baby,
  Users,
  Loader2,
  CheckCircle2,
  Sparkles,
  Zap,
  DollarSign,
  MessageSquare,
  FileText,
  Info,
  TrendingUp,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const profileSchema = z.object({
  dateOfBirth: z.string().nullable().optional(),
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
  maritalStatus: z.enum(["single", "married", "divorced", "widowed"]).nullable().optional(),
  numberOfChildren: z.number().min(0).max(20).optional(),
  childrenAges: z.string().nullable().optional(),
  employmentStatus: z.enum(["salaried", "self_employed", "business_owner", "student", "retired", "unemployed"]).nullable().optional(),
  incomeRange: z.enum(["below_5k", "5k_10k", "10k_15k", "15k_25k", "25k_40k", "above_40k"]).nullable().optional(),
  ownsApartment: z.boolean().optional(),
  hasActiveMortgage: z.boolean().optional(),
  numberOfVehicles: z.number().min(0).max(10).optional(),
  hasExtremeSports: z.boolean().optional(),
  hasSpecialHealthConditions: z.boolean().optional(),
  healthConditionsDetails: z.string().nullable().optional(),
  hasPets: z.boolean().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const MARITAL_OPTIONS = [
  { value: "single", label: "רווק/ה" },
  { value: "married", label: "נשוי/אה" },
  { value: "divorced", label: "גרוש/ה" },
  { value: "widowed", label: "אלמן/ה" },
];

const GENDER_OPTIONS = [
  { value: "male", label: "זכר" },
  { value: "female", label: "נקבה" },
  { value: "other", label: "אחר" },
];

const EMPLOYMENT_OPTIONS = [
  { value: "salaried", label: "שכיר/ה" },
  { value: "self_employed", label: "עצמאי/ת" },
  { value: "business_owner", label: "בעל/ת עסק" },
  { value: "student", label: "סטודנט/ית" },
  { value: "retired", label: "פנסיונר/ית" },
  { value: "unemployed", label: "לא עובד/ת" },
];

const INCOME_OPTIONS = [
  { value: "below_5k", label: "מתחת ל-5,000 ₪" },
  { value: "5k_10k", label: "5,000 - 10,000 ₪" },
  { value: "10k_15k", label: "10,000 - 15,000 ₪" },
  { value: "15k_25k", label: "15,000 - 25,000 ₪" },
  { value: "25k_40k", label: "25,000 - 40,000 ₪" },
  { value: "above_40k", label: "מעל 40,000 ₪" },
];

function computeCompleteness(values: ProfileFormValues): number {
  const fields = [
    values.dateOfBirth,
    values.gender,
    values.maritalStatus,
    values.employmentStatus,
    values.incomeRange,
  ];
  const boolFields = [
    values.ownsApartment !== undefined,
    values.numberOfVehicles !== undefined && values.numberOfVehicles !== null,
  ];
  const filled = fields.filter(Boolean).length + boolFields.filter(Boolean).length;
  return Math.round((filled / 7) * 100);
}

function formatCost(cost: number) {
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

export default function Settings() {
  const { user, logout } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

  const profileQuery = trpc.profile.get.useQuery(undefined, { enabled: !!user });
  const updateMutation = trpc.profile.update.useMutation();
  const uploadImageMutation = trpc.profile.uploadImage.useMutation();
  const { data: profileImageUrl } = trpc.profile.getImageUrl.useQuery(undefined, { enabled: !!user });
  const { data: usage } = trpc.policy.myUsage.useQuery(undefined, { enabled: !!user });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const utils = trpc.useUtils();

  const isAdmin = user?.role === "admin";
  const { data: adminStats } = trpc.admin.platformStats.useQuery(undefined, {
    enabled: !!user && isAdmin,
  });
  const { data: allUsers } = trpc.admin.allUsers.useQuery(undefined, {
    enabled: !!user && isAdmin,
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      dateOfBirth: null,
      gender: null,
      maritalStatus: null,
      numberOfChildren: 0,
      childrenAges: null,
      employmentStatus: null,
      incomeRange: null,
      ownsApartment: false,
      hasActiveMortgage: false,
      numberOfVehicles: 0,
      hasExtremeSports: false,
      hasSpecialHealthConditions: false,
      healthConditionsDetails: null,
      hasPets: false,
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      const p = profileQuery.data;
      form.reset({
        dateOfBirth: p.dateOfBirth ? p.dateOfBirth.split("T")[0] : null,
        gender: p.gender as any,
        maritalStatus: p.maritalStatus as any,
        numberOfChildren: p.numberOfChildren ?? 0,
        childrenAges: p.childrenAges,
        employmentStatus: p.employmentStatus as any,
        incomeRange: p.incomeRange as any,
        ownsApartment: p.ownsApartment ?? false,
        hasActiveMortgage: p.hasActiveMortgage ?? false,
        numberOfVehicles: p.numberOfVehicles ?? 0,
        hasExtremeSports: p.hasExtremeSports ?? false,
        hasSpecialHealthConditions: p.hasSpecialHealthConditions ?? false,
        healthConditionsDetails: p.healthConditionsDetails,
        hasPets: p.hasPets ?? false,
      });
    }
  }, [profileQuery.data, form]);

  const watchedValues = form.watch();
  const completeness = useMemo(() => computeCompleteness(watchedValues), [watchedValues]);
  const numberOfChildren = form.watch("numberOfChildren") ?? 0;
  const ownsApartment = form.watch("ownsApartment") ?? false;
  const hasSpecialHealth = form.watch("hasSpecialHealthConditions") ?? false;

  const onSubmit = async (data: ProfileFormValues) => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync(data);
      await utils.profile.get.invalidate();
      toast.success("הפרופיל עודכן בהצלחה");
    } catch {
      toast.error("שגיאה בעדכון הפרופיל");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await uploadImageMutation.mutateAsync({ name: file.name, base64 });
      utils.profile.getImageUrl.invalidate();
      utils.profile.get.invalidate();
      toast.success("התמונה עודכנה בהצלחה");
    } catch {
      toast.error("שגיאה בהעלאת התמונה");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!user) return null;

  const userInitials = user.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)
    : "U";

  const usageRows = usage?.rows ?? [];
  const dailyData = (adminStats?.dailyUsage ?? []).map((d) => ({
    date: d.date,
    calls: Number(d.calls),
    tokens: Number(d.tokens),
  }));

  return (
    <div className="page-container max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6 animate-fade-in-up">
        <div className="size-10 rounded-xl bg-muted flex items-center justify-center">
          <SettingsIcon className="size-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-bold">הגדרות</h2>
          <p className="text-xs text-muted-foreground">פרופיל, שימוש וניהול</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="animate-fade-in-up stagger-1">
        <TabsList className="w-full justify-start bg-card border p-1.5 rounded-xl gap-1 mb-6">
          <TabsTrigger value="profile" className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <UserIcon className="size-4" />
            פרופיל
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Zap className="size-4" />
            שימוש
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="admin" className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Activity className="size-4" />
              ניהול
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile">
          <div className="text-center mb-6">
            <div className="relative inline-block">
              <Avatar className="size-20 mx-auto mb-4 border-4 border-primary/10">
                {profileImageUrl && <AvatarImage src={profileImageUrl} alt={user.name || "Profile"} />}
                <AvatarFallback className="bg-primary/8 text-primary text-2xl font-bold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="absolute bottom-3 right-0 size-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {uploadingImage ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
            <h2 className="text-xl font-bold">{user.name}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>

          <Card className="mb-5">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-primary/8 flex items-center justify-center">
                    <Sparkles className="size-4 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold">השלמת פרופיל</h3>
                </div>
                <span className="text-sm font-medium text-muted-foreground">{completeness}%</span>
              </div>
              <Progress value={completeness} className="h-2 mb-2" />
              <p className="text-xs text-muted-foreground">
                {completeness < 100
                  ? "השלם את הפרופיל שלך כדי לקבל המלצות מותאמות אישית"
                  : "הפרופיל שלך מלא! ההמלצות שלנו יותאמו למצבך האישי"}
              </p>
            </CardContent>
          </Card>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="size-8 rounded-lg bg-primary/8 flex items-center justify-center">
                      <UserIcon className="size-4 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold">פרטים אישיים</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">שם מלא</Label>
                      <Input value={user.name || ""} disabled className="mt-1.5 bg-muted/40" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Mail className="size-3" />
                        דוא״ל
                      </Label>
                      <Input value={user.email || ""} disabled className="mt-1.5 bg-muted/40" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="dateOfBirth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                              <CalendarDays className="size-3" />
                              תאריך לידה
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                value={field.value || ""}
                                onChange={(e) => field.onChange(e.target.value || null)}
                                className="mt-1.5"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground">מין</FormLabel>
                            <Select
                              value={field.value || ""}
                              onValueChange={(val) => field.onChange(val || null)}
                            >
                              <FormControl>
                                <SelectTrigger className="mt-1.5 w-full">
                                  <SelectValue placeholder="בחר/י" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {GENDER_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="size-8 rounded-lg bg-pink-500/8 flex items-center justify-center">
                      <Heart className="size-4 text-pink-500" />
                    </div>
                    <h3 className="text-sm font-semibold">מצב משפחתי</h3>
                  </div>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="maritalStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <Users className="size-3" />
                            סטטוס
                          </FormLabel>
                          <Select
                            value={field.value || ""}
                            onValueChange={(val) => field.onChange(val || null)}
                          >
                            <FormControl>
                              <SelectTrigger className="mt-1.5 w-full">
                                <SelectValue placeholder="בחר/י מצב משפחתי" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {MARITAL_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="numberOfChildren"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <Baby className="size-3" />
                            מספר ילדים
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              max={20}
                              value={field.value ?? 0}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              className="mt-1.5"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    {numberOfChildren > 0 && (
                      <FormField
                        control={form.control}
                        name="childrenAges"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground">גילאי ילדים</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="לדוגמה: 3, 7, 12"
                                value={field.value || ""}
                                onChange={(e) => field.onChange(e.target.value || null)}
                                className="mt-1.5"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="size-8 rounded-lg bg-blue-500/8 flex items-center justify-center">
                      <Briefcase className="size-4 text-blue-500" />
                    </div>
                    <h3 className="text-sm font-semibold">תעסוקה וכלכלה</h3>
                  </div>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="employmentStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground">סטטוס תעסוקתי</FormLabel>
                          <Select
                            value={field.value || ""}
                            onValueChange={(val) => field.onChange(val || null)}
                          >
                            <FormControl>
                              <SelectTrigger className="mt-1.5 w-full">
                                <SelectValue placeholder="בחר/י סטטוס" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {EMPLOYMENT_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="incomeRange"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground">טווח הכנסה חודשית</FormLabel>
                          <Select
                            value={field.value || ""}
                            onValueChange={(val) => field.onChange(val || null)}
                          >
                            <FormControl>
                              <SelectTrigger className="mt-1.5 w-full">
                                <SelectValue placeholder="בחר/י טווח" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {INCOME_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="size-8 rounded-lg bg-amber-500/8 flex items-center justify-center">
                      <Home className="size-4 text-amber-500" />
                    </div>
                    <h3 className="text-sm font-semibold">נכסים ורכוש</h3>
                  </div>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="ownsApartment"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-4">
                          <FormLabel className="text-sm font-normal flex items-center gap-2 cursor-pointer">
                            <Home className="size-4 text-muted-foreground" />
                            דירה/בית בבעלותך?
                          </FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    {ownsApartment && (
                      <FormField
                        control={form.control}
                        name="hasActiveMortgage"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between gap-4 pr-6">
                            <FormLabel className="text-sm font-normal text-muted-foreground cursor-pointer">
                              משכנתא פעילה?
                            </FormLabel>
                            <FormControl>
                              <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={form.control}
                      name="numberOfVehicles"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <Car className="size-3" />
                            מספר רכבים בבעלותך
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              max={10}
                              value={field.value ?? 0}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              className="mt-1.5"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="size-8 rounded-lg bg-green-500/8 flex items-center justify-center">
                      <Activity className="size-4 text-green-500" />
                    </div>
                    <h3 className="text-sm font-semibold">בריאות ואורח חיים</h3>
                  </div>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="hasExtremeSports"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-4">
                          <FormLabel className="text-sm font-normal flex items-center gap-2 cursor-pointer">
                            <Activity className="size-4 text-muted-foreground" />
                            ספורט אקסטרימי / תחביבים מסוכנים?
                          </FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="hasSpecialHealthConditions"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-4">
                          <FormLabel className="text-sm font-normal flex items-center gap-2 cursor-pointer">
                            <Heart className="size-4 text-muted-foreground" />
                            מצב בריאותי מיוחד / מחלה כרונית?
                          </FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    {hasSpecialHealth && (
                      <FormField
                        control={form.control}
                        name="healthConditionsDetails"
                        render={({ field }) => (
                          <FormItem className="pr-6">
                            <FormLabel className="text-xs font-medium text-muted-foreground">פרטים נוספים (אופציונלי)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="לדוגמה: סוכרת, אסתמה..."
                                value={field.value || ""}
                                onChange={(e) => field.onChange(e.target.value || null)}
                                className="mt-1.5"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={form.control}
                      name="hasPets"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-4">
                          <FormLabel className="text-sm font-normal cursor-pointer">חיות מחמד?</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Button type="submit" className="w-full gap-2" size="lg" disabled={saving}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : completeness === 100 && profileQuery.data ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Save className="size-4" />
                )}
                {saving ? "שומר..." : "שמור פרופיל"}
              </Button>
            </form>
          </Form>

          <Card className="border-red-200/60 bg-red-50/30 mt-5">
            <CardContent className="pt-5 pb-5">
              <h3 className="text-sm font-semibold text-red-900 mb-3">פעולות חשבון</h3>
              <Button onClick={() => { logout(); setLocation("/"); toast.success("התנתקת בהצלחה"); }} variant="destructive" className="w-full gap-2" size="lg">
                <LogOut className="size-4" />
                התנתקות
              </Button>
              <p className="text-[11px] text-muted-foreground text-center mt-2">אתה יכול להתחבר מחדש בכל עת</p>
            </CardContent>
          </Card>

          <Card className="bg-blue-50/30 border-blue-200/60 mt-5">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start gap-3">
                <div className="size-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Info className="size-4 text-blue-600" />
                </div>
                <p className="text-sm text-blue-900/80">
                  המידע שלך נשמר בצורה מאובטחת ומשמש אך ורק לצורך התאמת המלצות אישיות. סריקות עתידיות יכללו המלצות מותאמות למצבך האישי.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage">
          <div className="grid grid-cols-2 gap-4 mb-6">
            {[
              { icon: <FileText className="size-5" />, label: "סריקות", value: usage?.analyzeCount ?? 0, color: "bg-violet-100 text-violet-600" },
              { icon: <MessageSquare className="size-5" />, label: "שאלות צ׳אט", value: usage?.chatCount ?? 0, color: "bg-blue-100 text-blue-600" },
            ].map((stat, i) => (
              <Card key={i}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className={`size-10 rounded-xl flex items-center justify-center ${stat.color}`}>
                      {stat.icon}
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                      <p className="text-xl font-bold">{stat.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="px-5 py-4 border-b">
                <h3 className="text-sm font-semibold">היסטוריית שימוש</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">תאריך</th>
                      <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageRows.map((row) => {
                      const actionLabels: Record<string, string> = {
                        analyze: "סריקה",
                        chat: "צ׳אט",
                        scan: "סריקה",
                        alert: "התראה",
                      };
                      const label = actionLabels[row.action] ?? row.action;
                      return (
                        <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(row.createdAt).toLocaleString("he-IL")}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={row.action === "analyze" ? "default" : "secondary"} className="text-[11px]">
                              {label}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                    {usageRows.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-4 py-12 text-center">
                          <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                            <Zap className="size-6 text-muted-foreground/40" />
                          </div>
                          <p className="text-sm text-muted-foreground">אין נתוני שימוש עדיין</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

        </TabsContent>

        {isAdmin && (
          <TabsContent value="admin">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              {[
                { key: "totalUsers", icon: Users, label: "סה״כ משתמשים", color: "bg-blue-100 text-blue-600" },
                { key: "activeUsersThisMonth", icon: TrendingUp, label: "פעילים החודש", color: "bg-emerald-100 text-emerald-600" },
                { key: "totalAnalyses", icon: FileText, label: "סריקות", color: "bg-violet-100 text-violet-600" },
                { key: "totalCalls", icon: Zap, label: "סה״כ קריאות", color: "bg-amber-100 text-amber-600" },
                { key: "totalTokens", icon: Activity, label: "טוקנים", color: "bg-cyan-100 text-cyan-600", format: "tokens" },
                { key: "totalCost", icon: DollarSign, label: "עלות מוערכת", color: "bg-rose-100 text-rose-600", format: "cost" },
              ].map((stat) => {
                const val = (adminStats as any)?.[stat.key] ?? 0;
                const display = stat.format === "tokens" ? formatTokens(val) : stat.format === "cost" ? formatCost(val) : val;
                return (
                  <Card key={stat.key}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-3">
                        <div className={`size-9 rounded-xl flex items-center justify-center ${stat.color}`}>
                          <stat.icon className="size-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                          <p className="text-lg font-bold">{display}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {dailyData.length > 0 && (
              <Card className="mb-6">
                <CardContent className="pt-5">
                  <h3 className="text-sm font-semibold mb-4">שימוש יומי — 30 ימים אחרונים</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dailyData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => {
                          const d = new Date(v);
                          return `${d.getDate()}/${d.getMonth() + 1}`;
                        }}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === "tokens" ? formatTokens(value) : value,
                          name === "tokens" ? "טוקנים" : "קריאות",
                        ]}
                        labelFormatter={(label) => new Date(label).toLocaleDateString("he-IL")}
                      />
                      <Bar dataKey="calls" fill="var(--primary)" radius={[4, 4, 0, 0]} name="calls" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-0">
                <div className="px-5 py-4 border-b">
                  <h3 className="text-sm font-semibold">כל המשתמשים</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">משתמש</th>
                        <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">תפקיד</th>
                        <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">הצטרף</th>
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">קריאות</th>
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">עלות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(allUsers ?? []).map((u) => (
                        <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-sm">{u.name || "—"}</p>
                              <p className="text-[11px] text-muted-foreground">{u.email || "—"}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-[11px]">
                              {u.role === "admin" ? "מנהל" : "משתמש"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(u.createdAt).toLocaleDateString("he-IL")}
                          </td>
                          <td className="px-4 py-3 text-left font-mono text-xs">{Number(u.callCount)}</td>
                          <td className="px-4 py-3 text-left font-mono text-xs text-rose-600">
                            {formatCost(Number(u.totalCost))}
                          </td>
                        </tr>
                      ))}
                      {(allUsers ?? []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center">
                            <p className="text-sm text-muted-foreground">אין משתמשים רשומים עדיין</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
