import { useState, useEffect } from 'react';

export interface UserPreferences {
  currency: string;
  dateFormat: string;
  enableNotifications: boolean;
  dateType: 'accounting' | 'value'; // Date utilisée pour les calculs
}

const defaultPreferences: UserPreferences = {
  currency: "EUR",
  dateFormat: "DD/MM/YYYY",
  enableNotifications: true,
  dateType: "accounting" // Par défaut, utiliser la date comptable
};

export const useUserPreferences = () => {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);

  useEffect(() => {
    const savedPrefs = localStorage.getItem('userPreferences');
    if (savedPrefs) {
      setPreferences(JSON.parse(savedPrefs));
    }
  }, []);

  const updatePreferences = (newPreferences: Partial<UserPreferences>) => {
    const updated = { ...preferences, ...newPreferences };
    setPreferences(updated);
    localStorage.setItem('userPreferences', JSON.stringify(updated));
  };

  const formatCurrency = (amount: number, locale: string = 'fr-FR') => {
    return amount.toLocaleString(locale, {
      style: 'currency',
      currency: preferences.currency
    });
  };

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    switch (preferences.dateFormat) {
      case 'MM/DD/YYYY':
        return dateObj.toLocaleDateString('en-US');
      case 'YYYY-MM-DD':
        return dateObj.toISOString().split('T')[0];
      default:
        return dateObj.toLocaleDateString('fr-FR');
    }
  };

  return {
    preferences,
    updatePreferences,
    formatCurrency,
    formatDate
  };
};