-- Remove email column from notification_preferences table
-- Email will now be fetched from auth.users via service role in edge functions
ALTER TABLE public.notification_preferences DROP COLUMN IF EXISTS email;