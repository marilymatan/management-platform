import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sparkles,
  LayoutDashboard,
  Shield,
  Wallet,
  Bell,
  FolderOpen,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "דשבורד", icon: <LayoutDashboard className="size-5" />, path: "/" },
  { label: "ביטוחים", icon: <Shield className="size-5" />, path: "/insurance" },
  { label: "הוצאות", icon: <Wallet className="size-5" />, path: "/expenses" },
  { label: "תזכורות", icon: <Bell className="size-5" />, path: "/reminders" },
  { label: "מסמכים", icon: <FolderOpen className="size-5" />, path: "/documents" },
];

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location, isMobile]);

  useEffect(() => {
    if (sidebarOpen && isMobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen, isMobile]);

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  const filteredNavItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === "admin"
  );

  const { data: profileImageUrl } = trpc.profile.getImageUrl.useQuery(undefined, { enabled: !!user });

  const userInitials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)
    : "U";

  const sidebarWidth = collapsed ? "w-[72px]" : "w-[260px]";

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <button onClick={() => setLocation("/")} className={cn("flex items-center gap-3 px-5 py-6 w-full hover:opacity-80 transition-opacity cursor-pointer", collapsed && "justify-center px-0")}>
        <div className="rounded-xl bg-gradient-to-br from-amber-400/20 to-orange-400/20 p-2 shrink-0 border border-amber-300/20">
          <Sparkles className="size-6 text-amber-300" />
        </div>
        {!collapsed && (
          <div className="min-w-0 text-right">
            <h1 className="text-base font-bold text-white truncate tracking-wide">Lumi</h1>
            <p className="text-[11px] text-white/50">מאיר לך את הדרך הפיננסית</p>
          </div>
        )}
      </button>

      <nav className="flex-1 px-3 space-y-1 mt-2">
        {filteredNavItems.map((item) => {
          const active = isActive(item.path);
          const navButton = (
            <button
              key={item.path}
              onClick={() => {
                setLocation(item.path);
                if (isMobile) setSidebarOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                collapsed && "justify-center px-0",
                active
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-white/60 hover:text-white hover:bg-white/8"
              )}
            >
              <span className={cn("shrink-0", active && "text-white")}>{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && active && (
                <ChevronRight className="size-4 mr-auto opacity-50" />
              )}
            </button>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.path} delayDuration={0}>
                <TooltipTrigger asChild>{navButton}</TooltipTrigger>
                <TooltipContent side="left" className="font-medium">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }
          return navButton;
        })}
      </nav>

      <div className={cn("px-3 pb-4 mt-auto space-y-2", collapsed && "px-2")}>
        {!collapsed && <div className="mx-2 border-t border-white/10 mb-3" />}

        {user && (
          <button
            onClick={() => {
              setLocation("/settings");
              if (isMobile) setSidebarOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
              collapsed && "justify-center px-0",
              isActive("/settings")
                ? "bg-white/15 text-white"
                : "text-white/60 hover:text-white hover:bg-white/8"
            )}
          >
            {collapsed ? (
              <Settings className="size-5 shrink-0" />
            ) : (
              <>
                <Settings className="size-5 shrink-0" />
                <span>הגדרות</span>
              </>
            )}
          </button>
        )}

        {user && (
          <button
            onClick={() => {
              setLocation("/settings");
              if (isMobile) setSidebarOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
              "text-white/60 hover:text-white hover:bg-white/8",
              collapsed && "justify-center px-0",
            )}
          >
            <Avatar className="size-8 shrink-0 border border-white/20">
              {profileImageUrl && <AvatarImage src={profileImageUrl} alt={user.name || "Profile"} />}
              <AvatarFallback className="bg-white/10 text-white text-xs font-medium">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 text-right">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-[11px] text-white/40 truncate">{user.email}</p>
              </div>
            )}
          </button>
        )}

        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => logout()}
                className="w-full flex justify-center py-2.5 rounded-xl text-white/40 hover:text-red-300 hover:bg-white/8 transition-all duration-200"
              >
                <LogOut className="size-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">התנתקות</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/40 hover:text-red-300 hover:bg-white/8 transition-all duration-200"
          >
            <LogOut className="size-5 shrink-0" />
            <span>התנתקות</span>
          </button>
        )}
      </div>
    </div>
  );

  if (!user) {
    return <div dir="rtl">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-in fade-in duration-200"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "shrink-0 bg-gradient-to-b from-[#1a1b3d] via-[#151631] to-[#0d0e24] flex flex-col z-50 transition-all duration-300",
          isMobile
            ? cn(
                "fixed top-0 right-0 h-full w-[280px] shadow-2xl",
                sidebarOpen ? "translate-x-0" : "translate-x-full"
              )
            : cn(sidebarWidth, "sticky top-0 h-screen")
        )}
      >
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="absolute top-4 left-4 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="size-5" />
          </button>
        )}
        {sidebarContent}
        {!isMobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -left-3 top-8 size-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={cn("size-3.5 transition-transform duration-300", collapsed && "rotate-180")}
            />
          </button>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {isMobile && (
          <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b px-4 py-3 flex items-center justify-between">
            <button onClick={() => setLocation("/")} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer">
              <div className="rounded-lg bg-amber-500/10 p-1.5">
                <Sparkles className="size-5 text-amber-500" />
              </div>
              <span className="text-sm font-bold text-foreground tracking-wide">Lumi</span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
          </header>
        )}

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
