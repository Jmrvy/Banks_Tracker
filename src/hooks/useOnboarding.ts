import { useMemo } from "react";

export function useOnboarding() {
  const needsOnboarding = useMemo(() => {
    const done = localStorage.getItem('budget-app-onboarding-done');
    if (done) return false;
    // Only trigger onboarding when explicitly flagged during signup
    const signupFlag = localStorage.getItem('budget-app-needs-onboarding');
    return !!signupFlag;
  }, []);

  return {
    isOnboarding: false,
    needsOnboarding,
  };
}
