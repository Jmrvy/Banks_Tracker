import { useCallback, useEffect, useState } from 'react';

export interface UserPreferences {
  currency: string;
  dateFormat: string;
  enableNotifications: boolean;
  dateType: 'accounting' | 'value'; // Date utilisée pour les calculs
  accountAliases: Record<string, string>; // account_id -> alias (e.g. "CB Gold" -> "SocGen")
  /** When true, the Dashboard surfaces the Quick Preview splash on each
   *  login/refresh. Defaults to false: power-user behaviour by default,
   *  no daily-friction click. The toggle in Settings opts users back in. */
  quickPreviewOnLogin: boolean;
}

const defaultPreferences: UserPreferences = {
  currency: "EUR",
  dateFormat: "DD/MM/YYYY",
  enableNotifications: true,
  dateType: "accounting", // Par défaut, utiliser la date comptable
  accountAliases: {},
  quickPreviewOnLogin: false
};

const STORAGE_KEY = 'userPreferences';

// ───────────────────────────────────────────────────────────────────
// Module-level store
//
// Previously each component that called useUserPreferences() got its
// own useState copy and a useEffect that hydrated from localStorage.
// That meant Settings could write a new value but other already-mounted
// consumers (CommandPalette, SearchResultModal, StatsCards, …) kept a
// stale copy until full reload. Bugs like "I set dateType=value in
// Settings but the palette still filters by accounting date" were a
// direct consequence.
//
// The fix is a single source of truth at module scope, plus a subscribe
// pattern so every hook caller re-renders the moment any caller writes.
// ───────────────────────────────────────────────────────────────────

function readFromStorage(): UserPreferences {
  if (typeof window === 'undefined') return defaultPreferences;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultPreferences;
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultPreferences, ...parsed };
  } catch {
    console.warn('Invalid userPreferences in localStorage, using defaults');
    window.localStorage.removeItem(STORAGE_KEY);
    return defaultPreferences;
  }
}

let currentPreferences: UserPreferences = readFromStorage();
const subscribers = new Set<(p: UserPreferences) => void>();

function setPreferencesGlobal(next: UserPreferences) {
  currentPreferences = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota exceeded / private mode — silently skip, in-memory copy still works */
    }
  }
  subscribers.forEach((s) => s(next));
}

// Cross-tab sync: pick up storage events from other tabs / windows.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = readFromStorage();
    currentPreferences = next;
    subscribers.forEach((s) => s(next));
  });
}

export const useUserPreferences = () => {
  const [preferences, setLocal] = useState<UserPreferences>(currentPreferences);

  useEffect(() => {
    // Resync if the store changed between render and effect commit.
    if (preferences !== currentPreferences) setLocal(currentPreferences);
    subscribers.add(setLocal);
    return () => {
      subscribers.delete(setLocal);
    };
    // setLocal is a stable setter; we deliberately don't re-subscribe when
    // `preferences` changes — that's what `setLocal` itself is for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePreferences = useCallback((newPreferences: Partial<UserPreferences>) => {
    setPreferencesGlobal({ ...currentPreferences, ...newPreferences });
  }, []);

  const formatCurrency = useCallback(
    (amount: number, locale: string = 'fr-FR') =>
      amount.toLocaleString(locale, {
        style: 'currency',
        currency: preferences.currency,
      }),
    [preferences.currency]
  );

  const formatDate = useCallback(
    (date: Date | string) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      switch (preferences.dateFormat) {
        case 'MM/DD/YYYY':
          return dateObj.toLocaleDateString('en-US');
        case 'YYYY-MM-DD':
          return dateObj.toISOString().split('T')[0];
        default:
          return dateObj.toLocaleDateString('fr-FR');
      }
    },
    [preferences.dateFormat]
  );

  return {
    preferences,
    updatePreferences,
    formatCurrency,
    formatDate,
  };
};
