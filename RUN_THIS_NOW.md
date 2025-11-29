# 🔧 QUICK FIX - Run This Now!

## The Problem
The `recurring_transactions` table is missing the `installment_payment_id` column.

## The Solution - Choose ONE option:

### ⚡ Option 1: Supabase Dashboard (EASIEST - 30 seconds)

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click "SQL Editor" in the left menu
4. Click "New query"
5. Copy and paste this SQL:

```sql
ALTER TABLE public.recurring_transactions
ADD COLUMN IF NOT EXISTS installment_payment_id UUID;

ALTER TABLE public.recurring_transactions
ADD CONSTRAINT fk_recurring_transactions_installment_payment
FOREIGN KEY (installment_payment_id)
REFERENCES public.installment_payments(id)
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_recurring_transactions_installment_payment_id
ON public.recurring_transactions(installment_payment_id)
WHERE installment_payment_id IS NOT NULL;
```

6. Click "Run" (or press Ctrl+Enter)
7. Done! ✅

### 🖥️ Option 2: Supabase CLI

```bash
cd /home/user/jmrvycb
supabase db push
```

### 📝 Option 3: Already created the file

Run the SQL file I created:
```bash
# If you have psql installed
psql <your-connection-string> < QUICK_FIX.sql
```

---

## After Running
Try creating a "paiement échelonné" again - it will work! 🎉
