import { useMemo, useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Users,
  Baby,
  Shield,
  FolderOpen,
  Home,
  Car,
  Heart,
  Briefcase,
  Sparkles,
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  UserPlus,
  CalendarDays,
  Stethoscope,
} from "lucide-react";

type FamilyMemberRelation = "spouse" | "child" | "parent" | "dependent" | "other";
type FamilyMemberGender = "male" | "female" | "other" | "";

type FamilyMemberRecord = {
  id: number;
  fullName: string;
  relation: FamilyMemberRelation;
  birthDate: string | null;
  ageLabel: string | null;
  gender: Exclude<FamilyMemberGender, ""> | null;
  allergies: string | null;
  medicalNotes: string | null;
  activities: string | null;
  insuranceNotes: string | null;
  notes: string | null;
};

type FamilyMemberFormState = {
  id?: number;
  fullName: string;
  relation: FamilyMemberRelation;
  birthDate: string;
  ageLabel: string;
  gender: FamilyMemberGender;
  allergies: string;
  medicalNotes: string;
  activities: string;
  insuranceNotes: string;
  notes: string;
};

const incomeLabels: Record<string, string> = {
  below_5k: "מתחת ל-5,000 ₪",
  "5k_10k": "5,000 - 10,000 ₪",
  "10k_15k": "10,000 - 15,000 ₪",
  "15k_25k": "15,000 - 25,000 ₪",
  "25k_40k": "25,000 - 40,000 ₪",
  above_40k: "מעל 40,000 ₪",
};

const employmentLabels: Record<string, string> = {
  salaried: "שכיר/ה",
  self_employed: "עצמאי/ת",
  business_owner: "בעל/ת עסק",
  student: "סטודנט/ית",
  retired: "פנסיונר/ית",
  unemployed: "לא עובד/ת",
};

const maritalLabels: Record<string, string> = {
  single: "רווק/ה",
  married: "נשוי/אה",
  divorced: "גרוש/ה",
  widowed: "אלמן/ה",
};

const relationLabels: Record<FamilyMemberRelation, string> = {
  spouse: "בן/בת זוג",
  child: "ילד/ה",
  parent: "הורה",
  dependent: "בן בית",
  other: "אחר",
};

const genderLabels: Record<Exclude<FamilyMemberGender, "">, string> = {
  male: "זכר",
  female: "נקבה",
  other: "אחר",
};

const relationTone: Record<FamilyMemberRelation, string> = {
  spouse: "bg-blue-50 text-blue-700 border-blue-200",
  child: "bg-amber-50 text-amber-700 border-amber-200",
  parent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  dependent: "bg-violet-50 text-violet-700 border-violet-200",
  other: "bg-muted text-muted-foreground border-border",
};

const emptyFormState: FamilyMemberFormState = {
  fullName: "",
  relation: "child",
  birthDate: "",
  ageLabel: "",
  gender: "",
  allergies: "",
  medicalNotes: "",
  activities: "",
  insuranceNotes: "",
  notes: "",
};

function toFormState(member?: FamilyMemberRecord): FamilyMemberFormState {
  if (!member) {
    return emptyFormState;
  }
  return {
    id: member.id,
    fullName: member.fullName,
    relation: member.relation,
    birthDate: member.birthDate ? member.birthDate.slice(0, 10) : "",
    ageLabel: member.ageLabel ?? "",
    gender: member.gender ?? "",
    allergies: member.allergies ?? "",
    medicalNotes: member.medicalNotes ?? "",
    activities: member.activities ?? "",
    insuranceNotes: member.insuranceNotes ?? "",
    notes: member.notes ?? "",
  };
}

function calculateAge(dateValue: string | null) {
  if (!dateValue) return null;
  const birthDate = new Date(dateValue);
  if (Number.isNaN(birthDate.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const hadBirthday =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!hadBirthday) {
    age -= 1;
  }
  return age >= 0 && age <= 120 ? age : null;
}

function getAgeSummary(member: FamilyMemberRecord) {
  const age = calculateAge(member.birthDate);
  if (age !== null) {
    return `גיל ${age}`;
  }
  if (member.ageLabel) {
    return member.ageLabel;
  }
  return "עדיין לא הוגדר גיל או שלב";
}

export default function Family() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formState, setFormState] = useState<FamilyMemberFormState>(emptyFormState);

  const profileQuery = trpc.profile.get.useQuery(undefined, {
    enabled: !!user,
  });
  const profileImageQuery = trpc.profile.getImageUrl.useQuery(undefined, {
    enabled: !!user,
  });
  const membersQuery = trpc.family.list.useQuery(undefined, {
    enabled: !!user,
  });
  const analysesQuery = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const invoicesQuery = trpc.gmail.getInvoices.useQuery({ limit: 100 }, {
    enabled: !!user,
  });

  const refreshHousehold = async () => {
    await Promise.all([
      utils.family.list.invalidate(),
      utils.profile.get.invalidate(),
      utils.assistant.getHomeContext.invalidate(),
    ]);
  };

  const upsertMemberMutation = trpc.family.upsert.useMutation({
    onSuccess: async () => {
      await refreshHousehold();
      toast.success("בן הבית נשמר בהצלחה");
      setIsDialogOpen(false);
      setFormState(emptyFormState);
    },
    onError: () => {
      toast.error("לא הצלחנו לשמור את בן הבית");
    },
  });

  const deleteMemberMutation = trpc.family.delete.useMutation({
    onSuccess: async () => {
      await refreshHousehold();
      toast.success("בן הבית הוסר");
    },
    onError: () => {
      toast.error("לא הצלחנו להסיר את בן הבית");
    },
  });

  const bootstrapMutation = trpc.family.bootstrapFromProfile.useMutation({
    onSuccess: async (result) => {
      await refreshHousehold();
      if (result.createdCount > 0) {
        toast.success(`הועברו ${result.createdCount} בני בית מהפרופיל הישן`);
      } else {
        toast.success("מודל המשפחה כבר מעודכן");
      }
    },
    onError: () => {
      toast.error("לא הצלחנו להעביר את הנתונים הישנים");
    },
  });

  const profile = profileQuery.data;
  const members = (membersQuery.data ?? []) as FamilyMemberRecord[];
  const activePolicies = analysesQuery.data?.filter((analysis) => analysis.status === "completed") ?? [];
  const moneyDocuments = invoicesQuery.data?.filter((invoice) => {
    const extracted = invoice.extractedData as Record<string, unknown> | null;
    return Boolean(extracted?.pdfUrl);
  }) ?? [];

  const childMembers = useMemo(
    () => members.filter((member) => member.relation === "child"),
    [members]
  );
  const membersWithHealthContext = useMemo(
    () => members.filter((member) => member.allergies || member.medicalNotes),
    [members]
  );
  const membersWithInsuranceContext = useMemo(
    () => members.filter((member) => member.insuranceNotes),
    [members]
  );
  const legacyDraftCount =
    (profile?.maritalStatus === "married" ? 1 : 0) + (profile?.numberOfChildren ?? 0);
  const suggestedPrompts = useMemo(() => {
    const firstMemberName = members[0]?.fullName;
    return [
      firstMemberName
        ? `איזה ביטוחים או מסמכים חשובים ל${firstMemberName}?`
        : "איך כדאי להתחיל לבנות את מודל המשפחה שלי?",
      childMembers.length > 0
        ? "יש משהו שחסר לילדים שלי בביטוחים או במסמכים?"
        : "איזה בני בית כדאי להוסיף עכשיו כדי שלומי יעזור טוב יותר?",
      "איך הביטוחים שלי נראים מול המצב המשפחתי העדכני?",
    ];
  }, [members, childMembers.length]);

  const openCreateDialog = (relation: FamilyMemberRelation = "child") => {
    setFormState({ ...emptyFormState, relation });
    setIsDialogOpen(true);
  };

  const openEditDialog = (member: FamilyMemberRecord) => {
    setFormState(toFormState(member));
    setIsDialogOpen(true);
  };

  const handleSaveMember = async () => {
    if (!formState.fullName.trim()) {
      toast.error("צריך להזין שם לבן הבית");
      return;
    }
    await upsertMemberMutation.mutateAsync({
      id: formState.id,
      fullName: formState.fullName,
      relation: formState.relation,
      birthDate: formState.birthDate || null,
      ageLabel: formState.ageLabel || null,
      gender: formState.gender || null,
      allergies: formState.allergies || null,
      medicalNotes: formState.medicalNotes || null,
      activities: formState.activities || null,
      insuranceNotes: formState.insuranceNotes || null,
      notes: formState.notes || null,
    });
  };

  if (!user) return null;

  const userInitials = user.name
    ? user.name.split(" ").map((value) => value[0]).join("").slice(0, 2)
    : "LU";
  const householdSize = members.length + 1;
  const isLoading =
    profileQuery.isLoading ||
    membersQuery.isLoading ||
    analysesQuery.isLoading ||
    invoicesQuery.isLoading;

  return (
    <div className="page-container space-y-6" data-testid="family-page">
      <div className="animate-fade-in-up relative overflow-hidden rounded-2xl bg-gradient-to-bl from-[#1a2744] via-[#1e3a5f] to-[#2563eb] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_-20%,rgba(255,255,255,0.14),transparent_60%)]" />
        <div className="relative p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                <Users className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">המשפחה שלי</h1>
                <p className="text-sm text-white/70 mt-0.5">
                  מודל משפחה אמיתי עם בני בית נפרדים, הקשרים למסמכים ולביטוחים, וכל ההקשר של הבית במקום אחד
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="secondary"
                className="bg-white text-slate-900 hover:bg-white/90 gap-1.5 shadow-lg"
                data-testid="add-family-member"
                onClick={() => openCreateDialog("child")}
              >
                <UserPlus className="size-4" />
                הוסף בן בית
              </Button>
              <Button
                size="sm"
                className="bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-sm gap-1.5 shadow-lg shadow-black/10"
                onClick={() => setLocation("/settings")}
              >
                <Sparkles className="size-4" />
                עדכן פרטי בית
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up stagger-1">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                <Users className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">בני בית</p>
                <p className="text-2xl font-bold">{householdSize}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                <Baby className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ילדים במודל</p>
                <p className="text-2xl font-bold">{childMembers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Shield className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">פוליסות פעילות</p>
                <p className="text-2xl font-bold">{activePolicies.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
                <Heart className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">דגשי בריאות</p>
                <p className="text-2xl font-bold">{membersWithHealthContext.length + (profile?.hasSpecialHealthConditions ? 1 : 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {legacyDraftCount > 0 && members.length === 0 && (
        <Card className="animate-fade-in-up stagger-2 border-blue-200 bg-blue-50/60">
          <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-blue-700">
                <Sparkles className="size-4" />
                <p className="text-sm font-semibold">יש מידע ישן שאפשר להעביר למודל המשפחה החדש</p>
              </div>
              <p className="text-sm text-blue-700/80">
                לומי מצא {legacyDraftCount} בני בית פוטנציאליים בפרופיל הישן ויכול ליצור מהם בסיס התחלתי לעריכה מהירה.
              </p>
            </div>
            <Button
              onClick={() => bootstrapMutation.mutate()}
              disabled={bootstrapMutation.isPending}
              data-testid="import-family-profile"
              className="gap-2"
            >
              <Sparkles className="size-4" />
              העבר מהפרופיל הקיים
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="space-y-6">
          <Card className="animate-fade-in-up stagger-3">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <Avatar className="size-16 border border-border">
                  {profileImageQuery.data && <AvatarImage src={profileImageQuery.data} alt={user.name || "Profile"} />}
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-3">
                  <div>
                    <h2 className="text-lg font-bold">{user.name || "בעל החשבון"}</h2>
                    <p className="text-sm text-muted-foreground">
                      {maritalLabels[profile?.maritalStatus ?? ""] ?? "מנהל/ת משק הבית"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {profile?.ownsApartment && <Badge variant="outline">בעלות על דירה</Badge>}
                    {profile?.hasActiveMortgage && <Badge variant="outline">משכנתא פעילה</Badge>}
                    {(profile?.numberOfVehicles ?? 0) > 0 && <Badge variant="outline">{profile?.numberOfVehicles} רכבים</Badge>}
                    {profile?.hasPets && <Badge variant="outline">חיות מחמד</Badge>}
                    {profile?.businessName && <Badge variant="outline">{profile.businessName}</Badge>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up stagger-4">
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">עבודה והכנסה</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {employmentLabels[profile?.employmentStatus ?? ""] ?? "סטטוס תעסוקתי עדיין לא הוגדר"}
                </p>
                <p className="text-sm">
                  {incomeLabels[profile?.incomeRange ?? ""] ?? "טווח הכנסה עדיין לא הוגדר"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Stethoscope className="size-4 text-rose-500" />
                  <h3 className="text-sm font-semibold">בריאות ורגישויות</h3>
                </div>
                {profile?.hasSpecialHealthConditions ? (
                  <>
                    <Badge className="bg-rose-50 text-rose-700 border border-rose-200">יש מידע בריאותי מיוחד</Badge>
                    <p className="text-sm text-muted-foreground">
                      {profile.healthConditionsDetails || "הוגדר מידע בריאותי מיוחד ללא פירוט נוסף"}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">אין כרגע דגל בריאותי כללי בפרופיל.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Home className="size-4 text-emerald-500" />
                  <h3 className="text-sm font-semibold">בית ומסמכים</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {profile?.ownsApartment ? "יש נכס בבעלות" : "לא סומן נכס בבעלות"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {moneyDocuments.length > 0 ? `${moneyDocuments.length} מסמכים כספיים זמינים` : "אין עדיין מסמכים כספיים מחוברים"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Car className="size-4 text-amber-500" />
                  <h3 className="text-sm font-semibold">תחבורה וביטוחים</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {(profile?.numberOfVehicles ?? 0) > 0 ? `${profile?.numberOfVehicles} רכבים במשק הבית` : "לא הוגדרו רכבים"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {membersWithInsuranceContext.length > 0
                    ? `${membersWithInsuranceContext.length} בני בית עם דגשי ביטוח`
                    : "עדיין לא הוגדרו דגשי ביטוח ברמת בן הבית"}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="animate-fade-in-up stagger-5 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">בני הבית</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => openCreateDialog("spouse")} className="gap-1.5">
                  <Plus className="size-4" />
                  בן/בת זוג
                </Button>
                <Button size="sm" onClick={() => openCreateDialog("child")} className="gap-1.5">
                  <Plus className="size-4" />
                  ילד/ה
                </Button>
              </div>
            </div>

            {isLoading && members.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2].map((item) => (
                  <Card key={item} className="animate-pulse">
                    <CardContent className="p-5 space-y-3">
                      <div className="h-5 rounded bg-muted w-1/2" />
                      <div className="h-3 rounded bg-muted w-2/3" />
                      <div className="h-20 rounded bg-muted w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : members.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {members.map((member) => (
                  <Card key={member.id} data-testid={`family-member-card-${member.id}`} className="overflow-hidden">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-base font-semibold">{member.fullName}</p>
                            <Badge variant="outline" className={relationTone[member.relation]}>
                              {relationLabels[member.relation]}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{getAgeSummary(member)}</p>
                          {member.birthDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              נולד/ה ב־{format(new Date(member.birthDate), "dd.MM.yyyy", { locale: he })}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => openEditDialog(member)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent dir="rtl">
                              <AlertDialogTitle>להסיר את {member.fullName}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                הפעולה תסיר את בן הבית מהמודל המשפחתי, אבל לא תמחק מסמכים או פוליסות קיימים.
                              </AlertDialogDescription>
                              <div className="flex items-center justify-end gap-2">
                                <AlertDialogCancel>ביטול</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteMemberMutation.mutate({ memberId: member.id })}
                                >
                                  הסר
                                </AlertDialogAction>
                              </div>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {member.gender && <Badge variant="secondary">{genderLabels[member.gender]}</Badge>}
                        {member.allergies && <Badge variant="outline">אלרגיות</Badge>}
                        {member.medicalNotes && <Badge variant="outline">בריאות</Badge>}
                        {member.activities && <Badge variant="outline">שגרה/חוגים</Badge>}
                        {member.insuranceNotes && <Badge variant="outline">דגשי ביטוח</Badge>}
                      </div>

                      <div className="space-y-2 text-sm text-muted-foreground">
                        {member.allergies && <p>אלרגיות: {member.allergies}</p>}
                        {member.medicalNotes && <p>בריאות: {member.medicalNotes}</p>}
                        {member.activities && <p>שגרה/חוגים: {member.activities}</p>}
                        {member.insuranceNotes && <p>דגשי ביטוח: {member.insuranceNotes}</p>}
                        {member.notes && <p>הערות: {member.notes}</p>}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <Button size="sm" variant="outline" onClick={() => setLocation("/assistant")} className="gap-1.5">
                          <Sparkles className="size-4" />
                          שאל את לומי
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setLocation("/documents")} className="gap-1.5">
                          <FolderOpen className="size-4" />
                          מסמכים
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-14 text-center">
                  <div className="size-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
                    <Users className="size-8 text-muted-foreground/40" />
                  </div>
                  <h3 className="text-base font-semibold">עדיין אין בני בית נפרדים</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-5">
                    הוסף בני בית כדי שלומי יוכל לחשוב על ביטוחים, מסמכים ודגשים לכל אחד מהם בנפרד.
                  </p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    <Button onClick={() => openCreateDialog("child")} className="gap-2">
                      <Plus className="size-4" />
                      הוסף ילד/ה
                    </Button>
                    <Button variant="outline" onClick={() => openCreateDialog("spouse")} className="gap-2">
                      <Plus className="size-4" />
                      הוסף בן/בת זוג
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-4 animate-fade-in-up stagger-6">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-amber-500" />
                <h3 className="text-sm font-semibold">שאלות טובות ללומי</h3>
              </div>
              <div className="space-y-2">
                {suggestedPrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    className="w-full justify-between rounded-xl h-auto py-3 text-sm"
                    onClick={() => setLocation("/assistant")}
                  >
                    <span className="text-right whitespace-normal">{prompt}</span>
                    <ArrowLeft className="size-4 shrink-0 opacity-50" />
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">הקשר לביטוחים ולמסמכים</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                עכשיו כשבני הבית נשמרים כישויות נפרדות, אפשר לראות מי צריך תשומת לב בביטוחים, באילו מסמכים יש הקשר משפחתי ומה כדאי לשאול את לומי.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">מסמכים זמינים</p>
                  <p className="text-xl font-bold">{moneyDocuments.length}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">דגשי ביטוח</p>
                  <p className="text-xl font-bold">{membersWithInsuranceContext.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={() => setLocation("/insurance")} className="gap-1.5">
                  <Shield className="size-4" />
                  לביטוחים
                </Button>
                <Button size="sm" variant="outline" onClick={() => setLocation("/documents")} className="gap-1.5">
                  <FolderOpen className="size-4" />
                  למסמכים
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-blue-500" />
                <h3 className="text-sm font-semibold">תמונת מצב משפחתית</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {members.length > 0
                  ? `יש כרגע ${members.length} בני בית נפרדים במודל, מתוכם ${childMembers.length} ילדים.`
                  : "החשבון עדיין נשען בעיקר על פרופיל הבית הכללי, וכדאי להתחיל להגדיר בני בית אחד אחד."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{formState.id ? "עריכת בן בית" : "בן בית חדש"}</DialogTitle>
            <DialogDescription>
              פרטי בן הבית יזינו את ההקשר של לומי בביטוחים, במסמכים ובשאלות על הבית.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="family-full-name">שם מלא</Label>
              <Input
                id="family-full-name"
                value={formState.fullName}
                onChange={(event) => setFormState((current) => ({ ...current, fullName: event.target.value }))}
                placeholder="למשל: יעל"
              />
            </div>
            <div className="space-y-2">
              <Label>קשר למשפחה</Label>
              <Select
                value={formState.relation}
                onValueChange={(value: FamilyMemberRelation) =>
                  setFormState((current) => ({ ...current, relation: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר קשר" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(relationLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="family-birth-date">תאריך לידה</Label>
              <Input
                id="family-birth-date"
                type="date"
                value={formState.birthDate}
                onChange={(event) => setFormState((current) => ({ ...current, birthDate: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="family-age-label">גיל או שלב</Label>
              <Input
                id="family-age-label"
                value={formState.ageLabel}
                onChange={(event) => setFormState((current) => ({ ...current, ageLabel: event.target.value }))}
                placeholder="למשל: גיל 8 או כיתה ג׳"
              />
            </div>

            <div className="space-y-2">
              <Label>מגדר</Label>
              <Select
                value={formState.gender || "unspecified"}
                onValueChange={(value) =>
                  setFormState((current) => ({
                    ...current,
                    gender: value === "unspecified" ? "" : (value as FamilyMemberGender),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="לא הוגדר" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unspecified">לא הוגדר</SelectItem>
                  {Object.entries(genderLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="family-allergies">אלרגיות או רגישויות</Label>
              <Input
                id="family-allergies"
                value={formState.allergies}
                onChange={(event) => setFormState((current) => ({ ...current, allergies: event.target.value }))}
                placeholder="למשל: בוטנים, לקטוז"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="family-medical-notes">דגשים בריאותיים</Label>
              <Textarea
                id="family-medical-notes"
                value={formState.medicalNotes}
                onChange={(event) => setFormState((current) => ({ ...current, medicalNotes: event.target.value }))}
                placeholder="מה חשוב לזכור ברמת בריאות, טיפולים או מעקבים"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="family-activities">שגרה, חוגים או מסגרות</Label>
              <Textarea
                id="family-activities"
                value={formState.activities}
                onChange={(event) => setFormState((current) => ({ ...current, activities: event.target.value }))}
                placeholder="למשל: כדורסל, גן, שיעורי פסנתר"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="family-insurance-notes">דגשי ביטוח</Label>
              <Textarea
                id="family-insurance-notes"
                value={formState.insuranceNotes}
                onChange={(event) => setFormState((current) => ({ ...current, insuranceNotes: event.target.value }))}
                placeholder="למשל: צריך כיסוי שיניים, כדאי לבדוק סיעודי"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="family-notes">הערות כלליות</Label>
              <Textarea
                id="family-notes"
                value={formState.notes}
                onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
                placeholder="כל דבר שיעזור ללומי להבין טוב יותר את החיים של בן הבית"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleSaveMember} disabled={upsertMemberMutation.isPending}>
              {formState.id ? "שמור שינויים" : "הוסף בן בית"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
