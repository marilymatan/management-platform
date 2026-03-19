import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppShell } from "./components/AppShell";
import LumiDashboard from "./pages/LumiDashboard";
import Insurance from "./pages/Insurance";
import Home from "./pages/Home";
import Expenses from "./pages/SmartInvoices";
import Reminders from "./pages/Reminders";
import Documents from "./pages/Documents";
import Settings from "./pages/Settings";
import Login from "./pages/Login";

function Router() {
  const [location] = useLocation();
  const { user, loading } = useAuth();

  if (location === "/login") {
    return <Login />;
  }

  if (loading) {
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
    <AppShell>
      <Switch>
        <Route path="/" component={LumiDashboard} />
        <Route path="/insurance" component={Insurance} />
        <Route path="/insurance/new" component={Home} />
        <Route path="/insurance/:sessionId" component={Home} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/reminders" component={Reminders} />
        <Route path="/documents" component={Documents} />
        <Route path="/settings" component={Settings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
