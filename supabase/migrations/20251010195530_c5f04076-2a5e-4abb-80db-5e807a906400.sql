-- Enable required extensions (safe if already installed)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Schedule hourly invocation of the edge function
select cron.schedule(
  'process-recurring-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/process-recurring-transactions',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1YW5sYWRpaHRwdmttamh2cmxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2MDM1NDUsImV4cCI6MjA3MzE3OTU0NX0.Og9jTCPVr-_yNtzuvt22TMVWMxOiQo5jp0I87L6WY7Y"}'::jsonb,
    body := '{"triggered_by": "pg_cron"}'::jsonb
  ) as request_id;
  $$
);