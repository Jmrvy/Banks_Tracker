-- Per-user language for transactional email.
--
-- The app is bilingual (fr/en) but the emails were French-only: the UI
-- language lives in localStorage (`i18nextLng`), which edge functions can't
-- read. Persisting it here lets check-budgets / send-monthly-reports /
-- send-notification-email render in the user's language.
--
-- Defaults to 'fr' to match the app's default locale and to keep existing
-- users on exactly the emails they get today.

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_language TEXT NOT NULL DEFAULT 'fr'
    CHECK (email_language IN ('fr', 'en'));

COMMENT ON COLUMN public.notification_preferences.email_language IS
  'Language used for budget alert and periodic report emails (fr | en).';
