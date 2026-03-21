import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { PendingScanNotifications } from "./components/PendingScanNotifications";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppShell } from "./components/AppShell";
import NotFound from "./pages/NotFound";

const Assistant = lazy(() => import("./pages/Assistant"));
const LumiDashboard = lazy(() => import("./pages/LumiDashboard"));
const FamilyInsuranceMap = lazy(() => import("./pages/FamilyInsuranceMap"));
const Family = lazy(() => import("./pages/Family"));
const Insurance = lazy(() => import("./pages/Insurance"));
const InsuranceCategoryPage = lazy(() => import("./pages/InsuranceCategoryPage"));
const Home = lazy(() => import("./pages/Home"));
const Expenses = lazy(() => import("./pages/SmartInvoices"));
const Reminders = lazy(() => import("./pages/Reminders"));
const Documents = lazy(() => import("./pages/Documents"));
const SavingsCenter = lazy(() => import("./pages/SavingsCenter"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const Login = lazy(() => import("./pages/Login"));

const KNOWN_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/chat$/,
  /^\/assistant$/,
  /^\/family$/,
  /^\/insurance-map$/,
  /^\/dashboard$/,
  /^\/insurance$/,
  /^\/insurance\/category\/[^/]+$/,
  /^\/insurance\/new$/,
  /^\/insurance\/[^/]+$/,
  /^\/savings$/,
  /^\/money$/,
  /^\/expenses$/,
  /^\/reminders$/,
  /^\/documents$/,
  /^\/settings$/,
  /^\/admin$/,
  /^\/404$/,
];

function isKnownRoute(location: string) {
  return KNOWN_ROUTE_PATTERNS.some((pattern) => pattern.test(location));
}

function RouteLoading() {
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

function Router() {
  const [location] = useLocation();
  const { user, loading } = useAuth();
  const isNotFoundRoute = location === "/404" || !isKnownRoute(location);

  if (location === "/login") {
    return (
      <Suspense fallback={<RouteLoading />}>
        <Login />
      </Suspense>
    );
  }

  if (isNotFoundRoute) {
    return (
      <AppShell>
        <NotFound />
      </AppShell>
    );
  }

  if (loading) {
    return <RouteLoading />;
  }

  return (
    <AppShell>
      <Suspense fallback={<RouteLoading />}>
        <Switch>
          <Route path="/" component={LumiDashboard} />
          <Route path="/dashboard" component={LumiDashboard} />
          <Route path="/chat" component={Assistant} />
          <Route path="/assistant" component={Assistant} />
          <Route path="/insurance-map" component={FamilyInsuranceMap} />
          <Route path="/family" component={Family} />
          <Route path="/savings" component={SavingsCenter} />
          <Route path="/insurance" component={Insurance} />
          <Route path="/insurance/category/:category" component={InsuranceCategoryPage} />
          <Route path="/insurance/new" component={Home} />
          <Route path="/insurance/:sessionId" component={Home} />
          <Route path="/money" component={Expenses} />
          <Route path="/expenses" component={Expenses} />
          <Route path="/reminders" component={Reminders} />
          <Route path="/documents" component={Documents} />
          <Route path="/settings" component={Settings} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AppShell>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <PendingScanNotifications />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
