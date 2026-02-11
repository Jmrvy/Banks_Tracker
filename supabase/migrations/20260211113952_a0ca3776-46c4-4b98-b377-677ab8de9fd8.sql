
-- Drop the overly permissive INSERT policy
DROP POLICY IF EXISTS "Allow inserting notification logs" ON public.notification_logs;

-- Create a proper INSERT policy scoped to the user
CREATE POLICY "Users can insert own notification logs"
ON public.notification_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
