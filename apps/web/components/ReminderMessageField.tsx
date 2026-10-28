"use client";

import {
  REMINDER_MESSAGE_MAX_LENGTH,
  REMINDER_PREVIEW_VALUES,
  renderReminderMessage,
} from "@/lib/reminderMessage";

// An official event's own reminder message, on the New and Edit jam forms. Blank
// means the event uses the shared message from /admin/settings.
export default function ReminderMessageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium">
        Reminder message
        <span className="ml-1.5 text-xs font-normal text-zinc-400">optional</span>
      </label>
      <p className="mt-0.5 text-xs text-zinc-500">
        Sent in both reminder emails for this event. Leave blank to use the default message from admin
        settings. Filled in per email: <code>{"{name}"}</code>, <code>{"{day}"}</code>,{" "}
        <code>{"{date}"}</code>, <code>{"{time}"}</code>, <code>{"{location}"}</code>,{" "}
        <code>{"{song_menu}"}</code>.
      </p>
      <textarea
        className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
        rows={5}
        maxLength={REMINDER_MESSAGE_MAX_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Leave blank to use the default message"
      />
      {value.trim() && (
        <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Preview</p>
          <div dangerouslySetInnerHTML={{ __html: renderReminderMessage(value, REMINDER_PREVIEW_VALUES) }} />
        </div>
      )}
    </div>
  );
}
