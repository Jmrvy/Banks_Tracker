import { useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";

export function useOnboarding() {
  const { accounts, loading } = useFinancialData();

  const needsOnboarding = useMemo(() => {
    if (loading) return false;
    const done = localStorage.getItem('budget-app-onboarding-done');
    if (done) return false;
    // New user: no accounts created yet
    return accounts.length === 0;
  }, [accounts, loading]);

  return {
    isOnboarding: false, // Keep false to not show loading spinner
    needsOnboarding,
  };
}
