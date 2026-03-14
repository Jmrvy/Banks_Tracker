import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PeriodProvider } from "./contexts/PeriodContext";
import { PrivacyProvider } from "./contexts/PrivacyContext";
import Index from "@/pages/Index";
import { FinancialDataProvider } from "@/hooks/useFinancialData";
import Auth from "@/pages/Auth";
import NotFound from "@/pages/NotFound";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import RecurringTransactions from "@/pages/RecurringTransactions";
import NewTransaction from "@/pages/NewTransaction";
import Debts from "@/pages/Debts";
import Accounts from "@/pages/Accounts";
import Transactions from "@/pages/Transactions";
import InstallmentPayments from "@/pages/InstallmentPayments";
import Savings from "@/pages/Savings";
import Install from "@/pages/Install";
import Onboarding from "@/pages/Onboarding";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileNavigation } from "@/components/MobileNavigation";

import { OfflineIndicator } from "@/components/OfflineIndicator";
import { useIsMobile } from "@/hooks/use-mobile";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
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

  return (
    <>
      {user && !isOnboardingPage && !isMobile && <AppSidebar />}
      <div className={user && !isOnboardingPage && !isMobile ? "ml-64 min-h-screen" : user && !isOnboardingPage && isMobile ? "pb-20 min-h-screen" : "min-h-screen"}>
        <Routes>
          <Route 
            path="/auth" 
            element={user ? <Navigate to="/" replace /> : <Auth />} 
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
          <Route 
            path="/recurring-transactions" 
            element={
              <ProtectedRoute>
                <RecurringTransactions />
              </ProtectedRoute>
            } 
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
          <Route 
            path="/debts" 
            element={
              <ProtectedRoute>
                <Debts />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/installment-payments" 
            element={
              <ProtectedRoute>
                <InstallmentPayments />
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
          <Route path="/install" element={<Install />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      {user && !isOnboardingPage && isMobile && <MobileNavigation />}
    </>
  );
}

const I18nLoadingFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="text-center space-y-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
    </div>
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Suspense fallback={<I18nLoadingFallback />}>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AuthProvider>
                <FinancialDataProvider>
                <PeriodProvider>
                  <PrivacyProvider>
                    <AppRoutes />
                    <OfflineIndicator />
                  </PrivacyProvider>
                </PeriodProvider>
                </FinancialDataProvider>
              </AuthProvider>
            </BrowserRouter>
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
