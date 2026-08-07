import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { safeNext } from "@/lib/nextParam";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PeriodProvider } from "./contexts/PeriodContext";
import { PrivacyProvider } from "./contexts/PrivacyContext";
import { CommandPaletteProvider } from "./contexts/CommandPaletteContext";
import { FinancialDataProvider } from "@/hooks/useFinancialData";
import { AppSidebar } from "@/components/AppSidebar";
import { AppTopbar } from "@/components/AppTopbar";
import { MobileNavigation } from "@/components/MobileNavigation";

// Eagerly loaded (critical path)
import Auth from "@/pages/Auth";

// Dashboard lazy-loaded to reduce initial bundle
const Index = lazy(() => import("@/pages/Index"));

// Lazy-loaded pages (loaded on navigation)
const Reports = lazy(() => import("@/pages/Reports"));
const Settings = lazy(() => import("@/pages/Settings"));
const NewTransaction = lazy(() => import("@/pages/NewTransaction"));
const Accounts = lazy(() => import("@/pages/Accounts"));
const Transactions = lazy(() => import("@/pages/Transactions"));
// `RecurringTransactions`, `Debts`, `InstallmentPayments` are now reached
// through the unified `/scheduled` page (which lazy-imports them itself);
// the legacy paths only emit Navigate redirects in this router.
const Savings = lazy(() => import("@/pages/Savings"));
const Budget = lazy(() => import("@/pages/Budget"));
const Scheduled = lazy(() => import("@/pages/Scheduled"));
const InstallmentPaymentDetail = lazy(() => import("@/pages/InstallmentPaymentDetail"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Trace = lazy(() => import("@/pages/Trace"));
const OAuthConsent = lazy(() => import("@/pages/OAuthConsent"));
const NotFound = lazy(() => import("@/pages/NotFound"));

import { OfflineIndicator } from "@/components/OfflineIndicator";
import { CommandPalette } from "@/components/CommandPalette";
import { useIsMobile } from "@/hooks/use-mobile";
import { InlineSpinner } from "@/components/LoadingSpinner";
import { TourProvider } from "@/contexts/TourContext";
import { TourEngine } from "@/components/tour/TourEngine";
import { TraceProvider } from "@/contexts/TraceContext";
import { TraceSurfaces } from "@/components/trace/TraceSurfaces";
import { TraceFab } from "@/components/trace/TraceFab";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><InlineSpinner /></div>;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();
  const isOnboardingPage = location.pathname === '/onboarding';

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <div>Chargement...</div>
        </div>
      </div>
    );
  }

  // The shell (sidebar, topbar, tab bar) only wraps signed-in pages. Auth and
  // onboarding own the full viewport.
  const inShell = Boolean(user) && !isOnboardingPage;

  return (
    <>
      {inShell && !isMobile && <AppSidebar />}
      <div className={inShell && !isMobile ? "ml-[250px] min-h-screen" : inShell && isMobile ? "pb-24 min-h-screen" : "min-h-screen"}>
        {inShell && !isMobile && <AppTopbar />}
        <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><InlineSpinner /></div>}>
        <Routes>
          {/* OAuth 2.1 consent screen for MCP clients connecting to this app. */}
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
          <Route 
            path="/auth" 
            element={user ? <Navigate to={safeNext(location.search) ?? "/"} replace /> : <Auth />} 
          />
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/new-transaction" 
            element={
              <ProtectedRoute>
                <NewTransaction />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/savings" 
            element={
              <ProtectedRoute>
                <Savings />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/analyse"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/settings" 
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } 
          />
          {/* Legacy route — redirect to /scheduled with the matching tab. */}
          <Route
            path="/recurring-transactions"
            element={<Navigate to="/scheduled?tab=subscriptions" replace />}
          />
          <Route 
            path="/accounts" 
            element={
              <ProtectedRoute>
                <Accounts />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/transactions" 
            element={
              <ProtectedRoute>
                <Transactions />
              </ProtectedRoute>
            } 
          />
          {/* Legacy routes — both redirect into the unified Scheduled page.
              Old links from emails / bookmarks land on the right tab. */}
          <Route path="/debts" element={<Navigate to="/scheduled?tab=loans" replace />} />
          <Route
            path="/installment-payments"
            element={<Navigate to="/scheduled?tab=plans" replace />}
          />
          <Route
            path="/installment-payments/:id"
            element={
              <ProtectedRoute>
                <InstallmentPaymentDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scheduled"
            element={
              <ProtectedRoute>
                <Scheduled />
              </ProtectedRoute>
            }
          />
          <Route
            path="/budget"
            element={
              <ProtectedRoute>
                <Budget />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trace"
            element={
              <ProtectedRoute>
                <Trace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </div>
      {inShell && isMobile && <MobileNavigation />}
      {user && <CommandPalette />}
      {user && <TraceSurfaces />}
      {inShell && <TraceFab />}
    </>
  );
}

const I18nLoadingFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <InlineSpinner />
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
          <Suspense fallback={<I18nLoadingFallback />}>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AuthProvider>
                <FinancialDataProvider>
                <PeriodProvider>
                  <PrivacyProvider>
                    <CommandPaletteProvider>
                      <TraceProvider>
                        <TourProvider>
                          <AppRoutes />
                          <OfflineIndicator />
                          <TourEngine />
                        </TourProvider>
                      </TraceProvider>
                    </CommandPaletteProvider>
                  </PrivacyProvider>
                </PeriodProvider>
                </FinancialDataProvider>
              </AuthProvider>
            </BrowserRouter>
          </Suspense>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
