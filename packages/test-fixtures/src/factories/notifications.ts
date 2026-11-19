import type { FixtureContext } from "../context";
import type { JamRow, NotificationRow, NotificationType, SetRow } from "../types";

type NotificationSpec = {
  key: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  read?: boolean;
  hoursAgo: number;
};

export function buildNotification(ctx: FixtureContext, spec: NotificationSpec): NotificationRow {
  return {
    id: ctx.id("notification", spec.key),
    user_id: spec.userId,
    type: spec.type,
    title: spec.title,
    body: spec.body ?? null,
    link: spec.link ?? null,
    read: spec.read ?? false,
    created_at: new Date(ctx.now.getTime() - spec.hoursAgo * 3_600_000).toISOString(),
  };
}

export function jamLink(jam: JamRow): string {
  return `/jam/${jam.id}`;
}

export function setLink(set: SetRow): string {
  return `/set/${set.id}`;
}
