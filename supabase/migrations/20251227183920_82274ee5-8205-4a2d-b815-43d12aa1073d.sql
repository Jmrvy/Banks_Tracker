-- Drop the old restrictive policy that blocks all insertions
DROP POLICY IF EXISTS "Only system can insert notification logs" ON public.notification_logs;