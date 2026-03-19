import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Sparkles, Shield, Wallet, Bell, FileSearch, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";

const FEATURES = [
  {
    icon: Shield,
    title: "ניהול ביטוחים",
    description: "ניתוח פוליסות עם AI, השוואת כיסויים וזיהוי חיסכון",
  },
  {
    icon: Wallet,
    title: "מעקב הוצאות",
    description: "סריקה אוטומטית של חשבוניות ומעקב הוצאות חודשיות",
  },
  {
    icon: Bell,
    title: "תזכורות חכמות",
    description: "התראות על חידוש פוליסות, תשלומים ומועדים חשובים",
  },
  {
    icon: FileSearch,
    title: "תובנות AI",
    description: "המלצות מותאמות אישית לחיסכון ושיפור הכיסוי שלך",
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function Login() {
  const [, setLocation] = useLocation();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (meQuery.data) {
      setLocation("/");
    }
  }, [meQuery.data, setLocation]);

  const handleGoogleSignIn = async () => {
    setIsRedirecting(true);
    try {
      const url = await getLoginUrl();
      window.location.href = url;
    } catch {
      setIsRedirecting(false);
    }
  };

  if (meQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="text-center space-y-4">
          <div className="relative size-12 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" dir="rtl">
      <div className="relative lg:w-[55%] bg-gradient-to-bl from-[#1a1b3d] via-[#151631] to-[#0d0e24] px-8 py-12 lg:px-16 lg:py-0 flex flex-col justify-center overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] rounded-full bg-amber-500/[0.05] blur-3xl" />
          <div className="absolute -bottom-1/4 -left-1/4 w-[500px] h-[500px] rounded-full bg-orange-500/[0.08] blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-radial from-white/[0.02] to-transparent" />
        </div>

        <motion.div
          className="relative z-10 max-w-xl mx-auto lg:mx-0"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="flex items-center gap-3 mb-8">
            <div className="rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-400/20 p-3 backdrop-blur-sm border border-amber-300/15">
              <Sparkles className="size-8 text-amber-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-wide">Lumi</h1>
              <p className="text-sm text-white/50">מאיר לך את הדרך הפיננסית</p>
            </div>
          </motion.div>

          <motion.h2
            variants={itemVariants}
            className="text-3xl lg:text-4xl font-bold text-white leading-tight mb-4"
          >
            העוזר הפיננסי
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-amber-300 to-orange-200">
              האישי שלך
            </span>
          </motion.h2>

          <motion.p
            variants={itemVariants}
            className="text-base text-white/60 mb-10 max-w-md leading-relaxed"
          >
            פלטפורמה חכמה לניהול הביטוחים, ההוצאות והמסמכים הפיננסיים שלך — הכל במקום אחד, עם בינה מלאכותית שעובדת בשבילך.
          </motion.p>

          <motion.div variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map((feature) => (
              <motion.div
                key={feature.title}
                variants={itemVariants}
                className="group flex gap-3 rounded-xl bg-white/[0.05] backdrop-blur-sm border border-white/[0.08] p-4 transition-colors hover:bg-white/[0.08]"
              >
                <div className="rounded-lg bg-white/10 p-2 h-fit shrink-0">
                  <feature.icon className="size-5 text-amber-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white mb-1">{feature.title}</h3>
                  <p className="text-xs text-white/45 leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:py-0 bg-background">
        <motion.div
          className="w-full max-w-[400px]"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
        >
          <div className="text-center mb-8">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-6">
              <div className="rounded-xl bg-amber-500/10 p-2">
                <Sparkles className="size-6 text-amber-500" />
              </div>
              <span className="text-lg font-bold text-foreground tracking-wide">Lumi</span>
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">ברוכים הבאים</h3>
            <p className="text-sm text-muted-foreground">
              התחברו עם חשבון Google כדי להתחיל
            </p>
          </div>

          <div className="space-y-6">
            <Button
              onClick={handleGoogleSignIn}
              disabled={isRedirecting}
              variant="outline"
              className="w-full h-12 text-base font-medium rounded-xl border-border/80 bg-card hover:bg-accent/50 shadow-sm transition-all duration-200 hover:shadow-md gap-3"
            >
              {isRedirecting ? (
                <div className="relative size-5">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              ) : (
                <GoogleIcon className="size-5" />
              )}
              {isRedirecting ? "מעביר לגוגל..." : "התחברות עם Google"}
              {!isRedirecting && <ArrowLeft className="size-4 mr-auto opacity-40" />}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-4 text-xs text-muted-foreground">
                  כניסה מאובטחת באמצעות Google
                </span>
              </div>
            </div>

            <div className="space-y-3 text-center">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <div className="size-1.5 rounded-full bg-emerald-500/70" />
                <span>ההתחברות מוגנת ומאובטחת</span>
              </div>
              <p className="text-[11px] text-muted-foreground/60 leading-relaxed max-w-[300px] mx-auto">
                בהתחברות אתם מאשרים את תנאי השימוש ומדיניות הפרטיות שלנו.
                אנחנו לא שומרים את סיסמת Google שלכם.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
