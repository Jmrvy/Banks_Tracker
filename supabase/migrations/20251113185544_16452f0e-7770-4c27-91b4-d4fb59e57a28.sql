-- Add category tracking to notification logs
ALTER TABLE public.notification_logs 
ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
ADD COLUMN alert_month date;

-- Create index for faster lookups
CREATE INDEX idx_notification_logs_user_category_month 
ON public.notification_logs(user_id, category_id, alert_month) 
WHERE notification_type = 'budget_alert';

COMMENT ON COLUMN public.notification_logs.category_id IS 'Category associated with budget alert notifications';
COMMENT ON COLUMN public.notification_logs.alert_month IS 'Month for which the budget alert was sent (YYYY-MM-01 format)';