
-- Remove old cron jobs missing the x-cron-secret header
SELECT cron.unschedule(2);
SELECT cron.unschedule(3);

-- Recreate check-budgets cron with proper x-cron-secret header
SELECT cron.schedule(
  'check-budgets-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/check-budgets',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1YW5sYWRpaHRwdmttamh2cmxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2MDM1NDUsImV4cCI6MjA3MzE3OTU0NX0.Og9jTCPVr-_yNtzuvt22TMVWMxOiQo5jp0I87L6WY7Y", "x-cron-secret": "ponzyS-7xudxu-tudtog"}'::jsonb
  ) as request_id;
  $$
);

-- Recreate send-monthly-reports cron with proper x-cron-secret header
SELECT cron.schedule(
  'send-monthly-reports',
  '0 8 1 * *',
  $$
  SELECT net.http_post(
    url:='https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/send-monthly-reports',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1YW5sYWRpaHRwdmttamh2cmxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2MDM1NDUsImV4cCI6MjA3MzE3OTU0NX0.Og9jTCPVr-_yNtzuvt22TMVWMxOiQo5jp0I87L6WY7Y", "x-cron-secret": "ponzyS-7xudxu-tudtog"}'::jsonb
  ) as request_id;
  $$
);
