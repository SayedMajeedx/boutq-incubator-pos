-- The original validation accidentally used a double backslash before the dot,
-- which rejected otherwise valid addresses such as name@example.com.
-- Keep this separate migration so already-deployed databases are repaired too.

ALTER TABLE public.brand_notification_recipients
  DROP CONSTRAINT IF EXISTS brand_notification_recipients_email_format;

ALTER TABLE public.brand_notification_recipients
  ADD CONSTRAINT brand_notification_recipients_email_format
  CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$');

NOTIFY pgrst, 'reload schema';
