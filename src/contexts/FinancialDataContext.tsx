import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Account, Transaction, Category, RecurringTransaction } from '@/hooks/useFinancialData';

interface FinancialDataContextType {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  recurringTransactions: RecurringTransaction[];
  loading: boolean;
  createAccount: (account: Omit<Account, 'id' | 'created_at'>) => Promise<{ error: any } | undefined>;
  createTransaction: (transaction: any) => Promise<{ error: any } | undefined>;
  createTransfer: (transfer: any) => Promise<{ error: any } | undefined>;
  createCategory: (category: Omit<Category, 'id'>) => Promise<{ error: any } | undefined>;
  createRecurringTransaction: (recurring: any) => Promise<{ error: any }>;
  updateRecurringTransaction: (id: string, updates: any) => Promise<{ error: any } | undefined>;
  deleteRecurringTransaction: (id: string) => Promise<{ error: any } | undefined>;
  updateTransaction: (id: string, updates: any) => Promise<{ error: any } | undefined>;
  deleteTransaction: (id: string) => Promise<{ error: any } | undefined>;
  createRefund: (refund: any) => Promise<any>;
  processDueRecurringTransactions: () => Promise<void>;
  executeRecurringTransactionEarly: (id: string) => Promise<{ error: any } | undefined>;
  fetchRecurringTransactions: () => Promise<void>;
  refetch: () => void;
  manualProcessRecurring: () => Promise<void>;
}

const FinancialDataContext = createContext<FinancialDataContextType | null>(null);

export function FinancialDataProvider({ children }: { children: React.ReactNode }) {
  // We dynamically import the actual hook implementation to avoid circular deps
  // The hook logic stays in useFinancialData.ts but is only instantiated ONCE here
  const { user } = useAuth();
  const [data, setData] = useState<FinancialDataContextType | null>(null);

  // We'll render children and provide context once the internal hook is ready
  return (
    <FinancialDataProviderInner>
      {children}
    </FinancialDataProviderInner>
  );
}

// This inner component actually uses the hook
function FinancialDataProviderInner({ children }: { children: React.ReactNode }) {
  // Import the raw implementation
  const { useFinancialDataInternal } = require('@/hooks/useFinancialData');
  const value = useFinancialDataInternal();

  return (
    <FinancialDataContext.Provider value={value}>
      {children}
    </FinancialDataContext.Provider>
  );
}

export function useFinancialDataFromContext(): FinancialDataContextType {
  const context = useContext(FinancialDataContext);
  if (!context) {
    throw new Error('useFinancialData must be used within FinancialDataProvider');
  }
  return context;
}
