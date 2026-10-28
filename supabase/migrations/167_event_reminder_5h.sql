-- Official SingJam events also get a reminder on the day, five hours before the
-- start (reminder_type '5h'), sent by apps/web/lib/sendEventReminders.ts.
alter table public.jam_reminders_sent
  drop constraint if exists jam_reminders_sent_reminder_type_check;

alter table public.jam_reminders_sent
  add constraint jam_reminders_sent_reminder_type_check
  check (reminder_type in ('24h', '48h', '5h'));
