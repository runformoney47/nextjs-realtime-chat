import { View, Text, StyleSheet } from 'react-native'
import type { GroupChat } from '@groupchat/shared'
import { formatChatExpiry, isChatEnded } from '@groupchat/shared'

type Props = {
  chat: GroupChat
}

/**
 * Shared header banners for active chat screens (main tab + history detail).
 * - Icebreaker when present
 * - "Chat ended" when not writable
 * - Expiry subtitle while still active
 */
export function ChatBanners({ chat }: Props) {
  const ended = isChatEnded(chat)
  const expiryLabel = formatChatExpiry(chat)

  return (
    <View style={styles.wrap}>
      {chat.icebreaker ? (
        <View style={styles.icebreaker}>
          <Text style={styles.icebreakerText}>💡 {chat.icebreaker}</Text>
        </View>
      ) : null}

      {ended ? (
        <View style={styles.endedBanner}>
          <Text style={styles.endedTitle}>This chat has ended</Text>
          <Text style={styles.endedSubtitle}>
            You can still read messages below. Rank your groupmates with a left swipe.
          </Text>
        </View>
      ) : expiryLabel !== 'Ended' ? (
        <View style={styles.expiryRow}>
          <Text style={styles.expiryText}>{expiryLabel}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {},
  icebreaker: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E7FF',
  },
  icebreakerText: { fontSize: 15, color: '#4338CA', lineHeight: 22 },
  endedBanner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  endedTitle: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  endedSubtitle: { fontSize: 13, color: '#B45309', marginTop: 4, lineHeight: 18 },
  expiryRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  expiryText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
})
