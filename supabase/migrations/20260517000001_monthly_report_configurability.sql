-- Make the monthly-report email configurable instead of a single boolean.
--
-- 4 new settings replace the legacy `monthly_reports` toggle (we keep
-- the legacy column for now to avoid breaking any in-flight reader;
-- send-monthly-reports has been updated to read `monthly_report_cadence`
-- as the source of truth).
--
-- - monthly_report_cadence: 'off' | 'weekly' | 'monthly' | 'quarterly'
--   The cron runs daily and gates each user by today's calendar match
--   (Monday for weekly, 1st of the month for monthly, 1st of Jan/Apr/
--   Jul/Oct for quarterly).
-- - monthly_report_sections: ordered text[] of page IDs included in the
--   email body. Matches the wizard's PageId enum: summary, categories,
--   budgets, accounts, income, recurring. cover / contents / cashflow /
--   transactions are not email-friendly so they're not surfaced here.
-- - monthly_report_attach_pdf: when false, skip the PDF generation +
--   attachment step entirely.
-- - monthly_report_top_n: cap on the number of categories surfaced in
--   the email's category-breakdown strip. Clamped 1..20.

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS monthly_report_cadence TEXT NOT NULL DEFAULT 'monthly'
    CHECK (monthly_report_cadence IN ('off', 'weekly', 'monthly', 'quarterly')),
  ADD COLUMN IF NOT EXISTS monthly_report_sections TEXT[] NOT NULL DEFAULT
    ARRAY['summary', 'categories', 'budgets', 'accounts', 'recurring']::TEXT[],
  ADD COLUMN IF NOT EXISTS monthly_report_attach_pdf BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS monthly_report_top_n INTEGER NOT NULL DEFAULT 6
    CHECK (monthly_report_top_n BETWEEN 1 AND 20);

-- Backfill — preserve existing user intent. Users who had the legacy
-- toggle off should not start receiving reports just because the new
-- column defaults to 'monthly'.
UPDATE public.notification_preferences
SET monthly_report_cadence = 'off'
WHERE monthly_reports = FALSE;
