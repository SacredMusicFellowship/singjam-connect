-- Official SingJam events get a reminder two days before (reminder_type '48h'),
-- sent by apps/web/lib/sendEventReminders.ts.
alter table public.jam_reminders_sent
  drop constraint if exists jam_reminders_sent_reminder_type_check;

alter table public.jam_reminders_sent
  add constraint jam_reminders_sent_reminder_type_check
  check (reminder_type in ('24h', '48h'));

-- sendEventReminders releases its claim row when every send fails, so the next
-- hourly run retries.
grant delete on public.jam_reminders_sent to service_role;
