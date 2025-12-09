import { z } from 'zod';

// Transaction validation schema
export const transactionSchema = z.object({
  description: z.string().max(500, "Description trop longue (max 500 caractères)"),
  amount: z.string()
    .refine(val => val !== '', "Montant requis")
    .refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Le montant doit être un nombre positif")
    .refine(val => parseFloat(val) <= 999999999, "Montant trop élevé"),
  type: z.enum(['income', 'expense', 'transfer']),
  account_id: z.string().min(1, "Compte requis"),
  to_account_id: z.string().optional(),
  category_id: z.string().optional(),
  transfer_fee: z.string()
    .refine(val => val === '' || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), "Frais invalides")
    .optional(),
  transaction_date: z.string().min(1, "Date comptable requise"),
  value_date: z.string().min(1, "Date valeur requise"),
  include_in_stats: z.boolean(),
});

export const transactionSchemaWithTransfer = transactionSchema.refine(
  (data) => {
    if (data.type === 'transfer') {
      return !!data.to_account_id && data.to_account_id !== data.account_id;
    }
    return true;
  },
  { message: "Compte de destination invalide pour le transfert" }
).refine(
  (data) => {
    if (data.type !== 'transfer') {
      return data.description.trim().length > 0;
    }
    return true;
  },
  { message: "Description requise" }
);

// Account validation schema
export const accountSchema = z.object({
  name: z.string()
    .min(1, "Nom du compte requis")
    .max(100, "Nom trop long (max 100 caractères)"),
  bank: z.string(),
  account_type: z.enum(['checking', 'savings', 'credit', 'investment']),
  balance: z.string()
    .refine(val => val === '' || !isNaN(parseFloat(val)), "Solde invalide")
    .refine(val => val === '' || (parseFloat(val) >= -999999999 && parseFloat(val) <= 999999999), "Solde trop élevé"),
});

// Savings goal validation schema
export const savingsGoalSchema = z.object({
  name: z.string()
    .min(1, "Nom de l'objectif requis")
    .max(100, "Nom trop long (max 100 caractères)"),
  description: z.string().max(500, "Description trop longue").optional(),
  target_amount: z.string()
    .refine(val => val !== '', "Montant cible requis")
    .refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Le montant doit être positif")
    .refine(val => parseFloat(val) <= 999999999, "Montant trop élevé"),
  current_amount: z.string()
    .refine(val => val === '' || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), "Montant actuel invalide")
    .optional(),
  target_date: z.string().optional(),
  category: z.string().optional(),
  color: z.string(),
});

// Debt validation schema
export const debtSchema = z.object({
  description: z.string()
    .min(1, "Description requise")
    .max(200, "Description trop longue (max 200 caractères)"),
  type: z.enum(['loan_given', 'loan_received']),
  contact_name: z.string().max(100, "Nom trop long").optional(),
  contact_info: z.string().max(200, "Info contact trop longue").optional(),
  notes: z.string().max(1000, "Notes trop longues").optional(),
});

// Helper to validate and get first error
export function validateForm<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstError = result.error.errors[0];
  return { success: false, error: firstError?.message || 'Erreur de validation' };
}
