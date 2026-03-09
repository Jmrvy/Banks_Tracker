import { useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";

export function useOnboarding() {
  const { accounts, loading } = useFinancialData();

  const needsOnboarding = useMemo(() => {
    if (loading) return false;
    const done = localStorage.getItem('budget-app-onboarding-done');
    if (done) return false;
    // Explicit flag set during signup
    const signupFlag = localStorage.getItem('budget-app-needs-onboarding');
    if (signupFlag) return true;
    // Fallback: new user with no accounts
    return accounts.length === 0;
  }, [accounts, loading]);

  return {
    isOnboarding: false,
    needsOnboarding,
  };
}
