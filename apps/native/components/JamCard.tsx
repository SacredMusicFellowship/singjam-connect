import { View, Text, Image, TouchableOpacity, Linking } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { jamImageFor, jamTicketCta, type JamTicketSummary } from '@singjam/core';

export type JamItem = {
  id: string;
  name: string | null;
  visibility: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  neighborhood: string | null;
  notes: string | null;
  image_url: string | null;
  image_list_url?: string | null;
  tickets_url: string | null;
  capacity: number | null;
  host_id: string | null;
  host_display_name: string | null;
  host_username: string | null;
  tags: string[];
  rsvp_status: string | null;
  rsvp_waitlist_position: number | null;
  invite_status: string | null;
  ticket_summary?: JamTicketSummary | null;
};

// Mirrors web's FormattedDate/FormattedTime (apps/web/components/FormattedTime.tsx):
// device locale (not hardcoded en-US), and the timezone abbreviation is shown
// only when the jam has a stored timezone.
function fmt(iso: string, timezone: string | null, options: Intl.DateTimeFormatOptions) {
  const { timeZoneName, ...rest } = options;
  return new Date(iso).toLocaleString(undefined, {
    ...rest,
    ...(timezone ? { timeZone: timezone, ...(timeZoneName ? { timeZoneName } : {}) } : {}),
  });
}

function RsvpBadge({ status, waitlistPosition }: { status: string; waitlistPosition: number | null }) {
  if (status === 'attending') {
    return (
      <View className="shrink-0 rounded-full bg-green-50 px-2 py-0.5">
        <Text className="text-xs font-medium text-green-700">Attending</Text>
      </View>
    );
  }
  if (status === 'waitlist') {
    return (
      <View className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5">
        <Text className="text-xs font-medium text-amber-700">
          Waitlisted{waitlistPosition != null ? ` #${waitlistPosition}` : ''}
        </Text>
      </View>
    );
  }
  return null;
}

// Mirrors web's JamListCard (apps/web/components/JamsContent.tsx): poster image
// or date block on the left, badge line, name + RSVP/Invited badge, date·time,
// neighborhood, tags, hosted-by, and the ticket-state chip for official events.
export default function JamCard({ jam, myId, canEdit, onPress, onManage }: {
  jam: JamItem;
  myId: string | null;
  /** Shows the ⋯ menu — see canEditJam in @singjam/core. */
  canEdit?: boolean;
  onPress: () => void;
  onManage?: (event: GestureResponderEvent) => void;
}) {
  const isOfficial = jam.visibility === 'official';
  const thumb = jamImageFor(jam, 'list');
  const isHosting = !!myId && jam.host_id === myId;
  const isInvited = jam.invite_status === 'pending';

  // Past events keep their card in the list, where a price or a ticket link
  // would be nonsense — matches web's JamListCard.
  const isPast = (jam.ends_at ?? jam.starts_at ?? '') < new Date().toISOString();
  const cta = isOfficial && !isPast
    ? jamTicketCta(jam.tickets_url, jam.ticket_summary, { timezone: jam.timezone })
    : null;
  // As on web: one row after the place, so every card fits the fixed height.
  // The ticket link wins over tags, and tags over "Details →".
  const showTags = jam.tags.length > 0 && !cta;

  return (
    <View className="relative">
    <TouchableOpacity
      onPress={onPress}
      className={`mx-4 mb-3 h-32 flex-row overflow-hidden rounded-2xl border bg-white ${isOfficial ? 'border-amber-200' : 'border-zinc-200'}`}
    >
      {thumb ? (
        <View className="relative aspect-square h-full shrink-0 overflow-hidden bg-black">
          <Image
            source={{ uri: thumb.src }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            resizeMode="cover"
          />
        </View>
      ) : jam.starts_at ? (
        <View className={`w-20 shrink-0 items-center justify-center border-r px-2 ${isOfficial ? 'bg-amber-50 border-amber-200' : 'bg-zinc-50 border-zinc-100'}`}>
          <Text className={`text-xs font-semibold uppercase tracking-wide ${isOfficial ? 'text-amber-500' : 'text-zinc-400'}`}>
            {fmt(jam.starts_at, jam.timezone, { weekday: 'short' })}
          </Text>
          <Text className="text-3xl font-bold leading-none text-zinc-900">
            {fmt(jam.starts_at, jam.timezone, { day: 'numeric' })}
          </Text>
          <Text className={`text-xs font-semibold uppercase tracking-wide ${isOfficial ? 'text-amber-500' : 'text-zinc-400'}`}>
            {fmt(jam.starts_at, jam.timezone, { month: 'short' })}
          </Text>
        </View>
      ) : null}

      <View className="min-w-0 flex-1 justify-center p-3">
        {isOfficial && (
          <Text className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-amber-500">
            Official SingJam event
          </Text>
        )}
        {!isOfficial && (jam.visibility === 'community' || jam.visibility === 'private' || isHosting) && (
          <View className="mb-0.5 flex-row items-center" style={{ gap: 8 }}>
            {jam.visibility === 'community' && (
              <Text className="text-xs font-semibold uppercase tracking-wide text-sky-600">Public</Text>
            )}
            {jam.visibility === 'private' && (
              <Text className="text-xs font-semibold uppercase tracking-wide text-violet-600">Private</Text>
            )}
            {isHosting && (
              <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Hosting</Text>
            )}
          </View>
        )}

        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Text className="min-w-0 flex-1 font-semibold text-zinc-900" numberOfLines={1}>
            {jam.name ?? (isOfficial ? 'SingJam event' : 'Community jam')}
          </Text>
          {isInvited && !jam.rsvp_status && (
            <View className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5">
              <Text className="text-xs font-medium text-indigo-700">Invited</Text>
            </View>
          )}
          {jam.rsvp_status && (
            <RsvpBadge status={jam.rsvp_status} waitlistPosition={jam.rsvp_waitlist_position} />
          )}
        </View>

        {jam.starts_at && (
          <Text className="mt-0.5 text-xs text-zinc-500" numberOfLines={1}>
            {fmt(jam.starts_at, jam.timezone, { weekday: 'short', month: 'short', day: 'numeric' })}
            {' · '}
            {fmt(jam.starts_at, jam.timezone, { hour: 'numeric', minute: '2-digit', ...(jam.ends_at ? {} : { timeZoneName: 'short' }) })}
            {jam.ends_at ? ` – ${fmt(jam.ends_at, jam.timezone, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}` : ''}
          </Text>
        )}
        {/* Same as mobile web: the host shares the place's line and tags get
            one row, so every card fits the fixed height that keeps its
            thumbnail square. */}
        {jam.neighborhood || (!isOfficial && !isHosting && jam.host_display_name) ? (
          <Text className="mt-0.5 text-xs text-zinc-400" numberOfLines={1}>
            {jam.neighborhood}
            {jam.neighborhood && !isOfficial && !isHosting && jam.host_display_name ? ' · ' : ''}
            {!isOfficial && !isHosting && jam.host_display_name ? (
              <>
                Hosted by <Text className="font-medium text-zinc-500">{jam.host_display_name}</Text>
              </>
            ) : null}
          </Text>
        ) : null}

        {showTags && (
          <View className="mt-1 h-5 flex-row flex-wrap overflow-hidden" style={{ gap: 4 }}>
            {jam.tags.map((t) => (
              <View key={t} className={`rounded-full px-2 py-0.5 ${isOfficial ? 'bg-amber-50' : 'bg-zinc-100'}`}>
                <Text className={`text-xs ${isOfficial ? 'text-amber-700' : 'text-zinc-600'}`}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        {cta ? (
          <View className="mt-1.5 flex-row flex-wrap" style={{ gap: 12 }}>
            <TouchableOpacity onPress={onPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text className={`text-xs font-medium ${cta.hasTickets && !cta.externalUrl ? 'text-amber-600' : 'text-zinc-500'}`}>
                {cta.label} →
              </Text>
            </TouchableOpacity>
            {cta.externalUrl ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(cta.externalUrl!)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text className="text-xs font-medium text-amber-600">Get tickets ↗</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : !showTags ? (
          <Text className="mt-1.5 text-xs font-medium text-zinc-500">Details →</Text>
        ) : null}
      </View>
    </TouchableOpacity>
    {canEdit && onManage ? (
      <TouchableOpacity
        onPress={onManage}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        className="absolute right-6 top-3 rounded-lg bg-white/90 p-1"
        accessibilityLabel="More options"
      >
        <Ionicons name="ellipsis-horizontal" size={16} color="#a1a1aa" />
      </TouchableOpacity>
    ) : null}
    </View>
  );
}
