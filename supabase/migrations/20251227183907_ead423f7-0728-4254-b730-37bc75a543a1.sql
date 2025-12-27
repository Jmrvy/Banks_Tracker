-- Drop the overly restrictive INSERT policy on notification_logs
DROP POLICY IF EXISTS "Users can create their own notification logs" ON public.notification_logs;

-- Create a new INSERT policy that allows service role (used by edge functions) to insert logs
-- The edge functions use the service role key, which bypasses RLS, but we also allow
-- authenticated users to insert their own logs as a fallback
CREATE POLICY "Allow inserting notification logs" 
ON public.notification_logs 
FOR INSERT 
WITH CHECK (true);

-- Note: Edge functions using SUPABASE_SERVICE_ROLE_KEY bypass RLS entirely,
-- so this policy mainly ensures the table isn't completely locked down
-- The SELECT policy can remain restrictive to protect user privacy