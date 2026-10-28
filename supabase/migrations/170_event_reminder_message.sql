-- An official event's own reminder message, used for both its two-day and
-- five-hour reminders in place of the shared one saved at /admin/settings.
-- NULL = use the shared message. Same 2000-character limit as the shared one.
alter table public.jams
  add column if not exists reminder_message text
  check (reminder_message is null or char_length(reminder_message) <= 2000);
