import { useState, useEffect, useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
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
  Shield,
  LogOut,
  Mail,
  User as UserIcon,
  Info,
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
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
  businessName: z.string().max(160).nullable().optional(),
  businessTaxId: z.string().max(64).nullable().optional(),
  businessEmailDomains: z.string().max(1000).nullable().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type ProfileQueryData = {
  dateOfBirth: string | null;
  gender: "male" | "female" | "other" | null;
  maritalStatus: "single" | "married" | "divorced" | "widowed" | null;
  numberOfChildren: number;
  childrenAges: string | null;
  employmentStatus: "salaried" | "self_employed" | "business_owner" | "student" | "retired" | "unemployed" | null;
  incomeRange: "below_5k" | "5k_10k" | "10k_15k" | "15k_25k" | "25k_40k" | "above_40k" | null;
  ownsApartment: boolean;
  hasActiveMortgage: boolean;
  numberOfVehicles: number;
  hasExtremeSports: boolean;
  hasSpecialHealthConditions: boolean;
  healthConditionsDetails: string | null;
  hasPets: boolean;
  businessName: string | null;
  businessTaxId: string | null;
  businessEmailDomains: string | null;
  profileImageKey: string | null;
};

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

export default function Profile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [saving, setSaving] = useState(false);
  const utils = trpc.useUtils();

  const profileQuery = trpc.profile.get.useQuery(undefined, {
    enabled: !!user,
  });
  const updateMutation = trpc.profile.update.useMutation();

  const toFormValues = (profile: ProfileQueryData): ProfileFormValues => ({
    dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.split("T")[0] : null,
    gender: profile.gender as any,
    maritalStatus: profile.maritalStatus as any,
    numberOfChildren: profile.numberOfChildren ?? 0,
    childrenAges: profile.childrenAges,
    employmentStatus: profile.employmentStatus as any,
    incomeRange: profile.incomeRange as any,
    ownsApartment: profile.ownsApartment ?? false,
    hasActiveMortgage: profile.hasActiveMortgage ?? false,
    numberOfVehicles: profile.numberOfVehicles ?? 0,
    hasExtremeSports: profile.hasExtremeSports ?? false,
    hasSpecialHealthConditions: profile.hasSpecialHealthConditions ?? false,
    healthConditionsDetails: profile.healthConditionsDetails,
    hasPets: profile.hasPets ?? false,
    businessName: profile.businessName ?? null,
    businessTaxId: profile.businessTaxId ?? null,
    businessEmailDomains: profile.businessEmailDomains ?? null,
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
      businessName: null,
      businessTaxId: null,
      businessEmailDomains: null,
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      form.reset(toFormValues(profileQuery.data));
    }
  }, [profileQuery.data, form]);

  const watchedValues = form.watch();
  const completeness = useMemo(() => computeCompleteness(watchedValues), [watchedValues]);
  const numberOfChildren = form.watch("numberOfChildren") ?? 0;
  const ownsApartment = form.watch("ownsApartment") ?? false;
  const hasSpecialHealth = form.watch("hasSpecialHealthConditions") ?? false;
  const employmentStatus = form.watch("employmentStatus");
  const isBusinessProfile = employmentStatus === "business_owner" || employmentStatus === "self_employed";

  const onSubmit = async (data: ProfileFormValues) => {
    setSaving(true);
    try {
      const result = await updateMutation.mutateAsync(data);
      if (result.profile) {
        utils.profile.get.setData(undefined, result.profile);
        form.reset(toFormValues(result.profile));
      }
      await profileQuery.refetch();
      toast.success("הפרופיל עודכן בהצלחה");
    } catch {
      toast.error("שגיאה בעדכון הפרופיל");
    } finally {
      setSaving(false);
    }
  };

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
    ? user.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)
    : "U";

  return (
    <div className="page-container max-w-2xl mx-auto pb-10">
      <div className="text-center mb-6 animate-fade-in-up">
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
              ? "השלם את הפרופיל שלך כדי לקבל המלצות ביטוח מותאמות אישית"
              : "הפרופיל שלך מלא! ההמלצות שלנו יותאמו למצבך האישי"}
          </p>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <Card className="animate-fade-in-up stagger-1">
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

          <Card className="animate-fade-in-up stagger-2">
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
                        <FormLabel className="text-xs font-medium text-muted-foreground">
                          גילאי ילדים
                        </FormLabel>
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

          <Card className="animate-fade-in-up stagger-2">
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
                {isBusinessProfile && (
                  <>
                    <FormField
                      control={form.control}
                      name="businessName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground">שם העסק</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="לדוגמה: לומי פתרונות ביטוח"
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
                      name="businessTaxId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground">ח.פ / עוסק מורשה</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="לדוגמה: 514123456"
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
                      name="businessEmailDomains"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground">דומיינים או כתובות מייל עסקיות</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={4}
                              placeholder={"mybusiness.co.il\nbilling@mybusiness.co.il"}
                              value={field.value || ""}
                              onChange={(e) => field.onChange(e.target.value || null)}
                              className="mt-1.5"
                            />
                          </FormControl>
                          <p className="text-[11px] text-muted-foreground">הזן כל דומיין או כתובת בשורה נפרדת או מופרדים בפסיקים</p>
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="animate-fade-in-up stagger-3">
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
                        <Switch
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                        />
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
                          <Switch
                            checked={field.value ?? false}
                            onCheckedChange={field.onChange}
                          />
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

          <Card className="animate-fade-in-up stagger-3">
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
                        <Switch
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                        />
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
                        <Switch
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                        />
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
                        <FormLabel className="text-xs font-medium text-muted-foreground">
                          פרטים נוספים (אופציונלי)
                        </FormLabel>
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
                      <FormLabel className="text-sm font-normal cursor-pointer">
                        חיות מחמד?
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full gap-2"
            size="lg"
            disabled={saving}
          >
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

      <Card className="border-red-200/60 bg-red-50/30 mt-5 animate-fade-in-up stagger-3">
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

      <Card className="bg-blue-50/30 border-blue-200/60 mt-5 animate-fade-in-up stagger-3">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
              <Info className="size-4 text-blue-600" />
            </div>
            <p className="text-sm text-blue-900/80">
              המידע שלך נשמר בצורה מאובטחת ומשמש אך ורק לצורך התאמת המלצות ביטוח אישיות. סריקות עתידיות יכללו המלצות מותאמות למצבך האישי.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
