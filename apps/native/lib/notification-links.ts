import { isUuid } from '@singjam/core';

// Maps a notification's web link (e.g. /jam/abc) to a native route.
// Used by both the in-app notifications list and push notification taps.
export function hrefForNotificationLink(
  link: string
): { pathname: string; params: { id: string } } | null {
  if (link.startsWith('/jam/')) {
    return { pathname: '/jam/[id]', params: { id: link.replace('/jam/', '') } };
  }
  if (link.startsWith('/set/')) {
    return { pathname: '/set/[id]', params: { id: link.replace('/set/', '') } };
  }
  if (link.startsWith('/songs/')) {
    const id = link.replace('/songs/', '');
    return isUuid(id) ? { pathname: '/song/[id]', params: { id } } : null;
  }
  return null;
}
