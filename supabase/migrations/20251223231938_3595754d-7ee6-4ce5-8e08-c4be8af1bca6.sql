-- Only system processes (service role) can insert notification logs
-- Regular authenticated users cannot insert - WITH CHECK (false) blocks all user inserts
-- Service role key used by edge functions bypasses RLS entirely
CREATE POLICY "Only system can insert notification logs" 
ON public.notification_logs 
FOR INSERT 
WITH CHECK (false);