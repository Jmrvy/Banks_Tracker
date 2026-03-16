import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';

interface PrivacyContextType {
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export const PrivacyProvider = ({ children }: { children: ReactNode }) => {
  const [isPrivacyMode, setIsPrivacyMode] = useState(() => {
    const saved = localStorage.getItem('privacyMode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('privacyMode', String(isPrivacyMode));
  }, [isPrivacyMode]);

  const togglePrivacyMode = useCallback(() => {
    setIsPrivacyMode(prev => !prev);
  }, []);

  const value = useMemo(() => ({ isPrivacyMode, togglePrivacyMode }), [isPrivacyMode, togglePrivacyMode]);

  return (
    <PrivacyContext.Provider value={value}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = () => {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }
  return context;
};
