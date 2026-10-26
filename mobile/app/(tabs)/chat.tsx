import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  Animated,
  Dimensions,
  Pressable,
  Alert,
} from 'react-native'
import { api } from '@/lib/api'
import { usePusher } from '@/lib/pusher'
import { useAuthStore } from '@/stores/authStore'
import type { Message, GroupChat } from '@groupchat/shared'
import {
  CHAT_COLOR_HEX,
  LIGHT_COLORS,
  toPusherKey,
  isChatWritable,
  formatChatExpiry,
} from '@groupchat/shared'
import type { ChatColor } from '@groupchat/shared'
import DragToReorder from '@/components/DragToReorder'
import { ChatBanners } from '@/components/ChatBanners'
import { addBlockedUser, fetchBlockedUsers } from '@/lib/blocks'

const SCREEN_WIDTH = Dimensions.get('window').width
const DRAWER_WIDTH = SCREEN_WIDTH * 0.82

// ─── Typing indicator state ──────────────────────────────────────────────────

type TypingUser = { userId: string; color: ChatColor | null }

// ─── Main component ──────────────────────────────────────────────────────────

export default function ChatTab() {
  const { user } = useAuthStore()
  const [chat, setChat] = useState<GroupChat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const [showRanking, setShowRanking] = useState(false)
  const [ranking, setRanking] = useState<string[]>([])
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set())
  const flatListRef = useRef<FlatList>(null)
  const drawerAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasTypingRef = useRef(false)

  const loadCurrentChat = useCallback(async () => {
    setLoading(true)
    const res = await api.get<GroupChat | null>('/chat/current')
    if (res.ok && res.data) {
      setChat(res.data)
      const msgRes = await api.get<Message[]>(
        `/message/list?chatId=${res.data.id}&limit=100`,
      )
      if (msgRes.ok) {
        setMessages(msgRes.data)
      }
    } else {
      setChat(null)
      setMessages([])
    }
    setLoading(false)
  }, [])

  // ─── Load the user's one active chat ─────────────────────────────
  useEffect(() => {
    loadCurrentChat()
    fetchBlockedUsers().then(setBlockedSet)
  }, [loadCurrentChat])

  const chatWritable = chat ? isChatWritable(chat) : false

  // ─── Subscribe to realtime messages ──────────────────────────────
  usePusher(
    chat ? toPusherKey(`chat:${chat.id}`) : null,
    'incoming-message',
    (message: Message) => {
      setMessages((prev) => {
        if (blockedSet.has(message.senderId)) return prev
        if (prev.some((m) => m.id === message.id)) return prev
        return [...prev, message].sort((a, b) => a.timestamp - b.timestamp)
      })
      // Remove typing indicator for this sender (they just sent a message)
      setTypingUsers((prev) => prev.filter((t) => t.userId !== message.senderId))
    },
  )

  // ─── Subscribe to typing events ──────────────────────────────────
  usePusher(
    chat ? toPusherKey(`chat:${chat.id}`) : null,
    'typing',
    (payload: { userId: string; color: string | null; status: 'start' | 'stop' }) => {
      if (!payload?.userId || payload.userId === user?.id) return

      // Clear existing timeout for this user
      const existing = typingTimeoutsRef.current[payload.userId]
      if (existing) clearTimeout(existing)

      if (payload.status === 'start') {
        setTypingUsers((prev) => {
          if (prev.some((t) => t.userId === payload.userId)) return prev
          return [...prev, { userId: payload.userId, color: (payload.color as ChatColor) ?? null }]
        })
        // Auto-expire after 8 seconds if no stop received
        typingTimeoutsRef.current[payload.userId] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((t) => t.userId !== payload.userId))
          delete typingTimeoutsRef.current[payload.userId]
        }, 8000)
      } else {
        setTypingUsers((prev) => prev.filter((t) => t.userId !== payload.userId))
        delete typingTimeoutsRef.current[payload.userId]
      }
    },
  )

  // ─── Send typing indicators on text change ───────────────────────
  const handleTextChange = useCallback(
    (newText: string) => {
      setText(newText)
      if (!chat || !chatWritable) return

      const isTyping = newText.trim().length > 0

      if (isTyping && !wasTypingRef.current) {
        wasTypingRef.current = true
        api.post('/message/typing', { chatId: chat.id, status: 'start' })
      }

      // Debounce the stop event
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
      typingDebounceRef.current = setTimeout(() => {
        if (wasTypingRef.current) {
          wasTypingRef.current = false
          api.post('/message/typing', { chatId: chat.id, status: 'stop' })
        }
      }, 2000)

      if (!isTyping && wasTypingRef.current) {
        wasTypingRef.current = false
        if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
        api.post('/message/typing', { chatId: chat.id, status: 'stop' })
      }
    },
    [chat, chatWritable],
  )

  // ─── Send message ────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!text.trim() || sending || !chat || !chatWritable) return
    setSending(true)
    const trimmed = text.trim()
    setText('')
    try {
      const Haptics = require('expo-haptics')
      Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle?.Light)
    } catch {}

    // Stop typing indicator
    if (wasTypingRef.current) {
      wasTypingRef.current = false
      api.post('/message/typing', { chatId: chat.id, status: 'stop' })
    }

    const optimistic: Message = {
      id: `tmp_${Date.now()}`,
      senderId: user?.id ?? '',
      text: trimmed,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, optimistic])

    const res = await api.post<Message>('/message/send', {
      chatId: chat.id,
      text: trimmed,
      clientId: optimistic.id,
    })

    if (res.ok) {
      // Replace optimistic row; Pusher may also deliver the same id — deduped in usePusher
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? res.data : m)),
      )
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      Alert.alert('Could not send', res.error ?? 'Something went wrong')
      if (res.error?.toLowerCase().includes('expired')) {
        await loadCurrentChat()
      }
    }
    setSending(false)
  }, [text, sending, chat, chatWritable, user, loadCurrentChat])

  const handleDevExpireChat = useCallback(async () => {
    if (!chat || !__DEV__) return
    Alert.alert('Expire this chat?', 'Sets active=false for testing read-only mode.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Expire',
        style: 'destructive',
        onPress: async () => {
          const res = await api.post<{ chat: GroupChat }>('/dev/expire-chat', {
            chatId: chat.id,
          })
          if (res.ok) {
            setChat(res.data.chat)
            setText('')
          } else {
            Alert.alert('Error', res.error ?? 'Expire failed')
          }
        },
      },
    ])
  }, [chat])

  // ─── Ranking drawer ─────────────────────────────────────────────

  const openRanking = useCallback(() => {
    if (!chat || !user) return
    const others = chat.members.filter((id) => id !== user.id)
    setRanking(others)
    setShowRanking(true)
    Animated.spring(drawerAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start()
  }, [chat, user, drawerAnim])

  const closeRanking = useCallback(() => {
    Animated.timing(drawerAnim, {
      toValue: DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setShowRanking(false))
  }, [drawerAnim])

  const handleReorder = useCallback(
    (newRanking: string[]) => {
      // Don't setRanking — DragToReorder manages its own order.
      // Just submit to the API.
      if (chat) {
        api.post('/ranking', { chatId: chat.id, ranking: newRanking })
      }
    },
    [chat],
  )

  // ─── Report / Block ─────────────────────────────────────────────
  const reportMessage = useCallback(
    (message: Message) => {
      if (!user || message.senderId === user.id) {
        Alert.alert('Report', 'You cannot report your own message')
        return
      }
      Alert.alert(
        'Report message',
        'Select a reason',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Spam',
            onPress: async () => {
              await api.post('/report', {
                targetType: 'message',
                targetId: message.id,
                chatId: chat?.id,
                reason: 'spam',
              })
              Alert.alert('Reported', 'Thank you for reporting this message.')
            },
          },
          {
            text: 'Harassment',
            onPress: async () => {
              await api.post('/report', {
                targetType: 'message',
                targetId: message.id,
                chatId: chat?.id,
                reason: 'harassment',
              })
              Alert.alert('Reported', 'Thank you for reporting this message.')
            },
          },
          {
            text: 'Hate speech',
            onPress: async () => {
              await api.post('/report', {
                targetType: 'message',
                targetId: message.id,
                chatId: chat?.id,
                reason: 'hate_speech',
              })
              Alert.alert('Reported', 'Thank you for reporting this message.')
            },
          },
          {
            text: 'Block user',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Block user',
                'Block this user? Their messages will be hidden.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Block',
                    style: 'destructive',
                    onPress: async () => {
                      const res = await api.post('/block', { userId: message.senderId })
                      if (res.ok) {
                        addBlockedUser(message.senderId)
                        setBlockedSet((prev) => new Set([...prev, message.senderId]))
                        Alert.alert('Blocked', 'This user has been blocked.')
                      }
                    },
                  },
                ],
              )
            },
          },
        ],
        { cancelable: true },
      )
    },
    [chat?.id, user],
  )

  // ─── Helpers ─────────────────────────────────────────────────────
  const getColorForUser = (userId: string): ChatColor | null => {
    if (!chat?.memberColors) return null
    return (chat.memberColors[userId] as ChatColor) ?? null
  }

  const myColor = user ? getColorForUser(user.id) : null

  // ─── Swipe left to open ranking ────────────────────────────────
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 })

  const onTouchStart = useCallback((e: any) => {
    touchStartRef.current = {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      time: Date.now(),
    }
  }, [])

  const onTouchEnd = useCallback((e: any) => {
    const dx = e.nativeEvent.pageX - touchStartRef.current.x
    const dy = e.nativeEvent.pageY - touchStartRef.current.y
    const dt = Date.now() - touchStartRef.current.time

    // Detect a quick left swipe: moved left > 60px, mostly horizontal, under 400ms
    if (dx < -60 && Math.abs(dy) < Math.abs(dx) * 0.7 && dt < 400 && !showRanking) {
      openRanking()
    }
  }, [showRanking, openRanking])

  // ─── Loading state ───────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    )
  }

  // ─── No active chat ──────────────────────────────────────────────
  if (!chat) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyTitle}>No active chat</Text>
          <Text style={styles.emptySubtitle}>
            New group chats drop Wednesday and Saturday night.{'\n'}
            You'll get a notification when yours is ready!
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  // ─── Message rendering with burst grouping ───────────────────────
  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    if (blockedSet.has(item.senderId)) return <View />
    const isMe = item.senderId === user?.id
    const color = getColorForUser(item.senderId)
    const bgColor = color ? CHAT_COLOR_HEX[color] : isMe ? '#4F46E5' : '#F3F4F6'
    const textColor = color
      ? LIGHT_COLORS.includes(color) ? '#000000' : '#FFFFFF'
      : isMe ? '#FFFFFF' : '#111827'

    // ── Burst grouping logic ──
    const prevMsg = index > 0 ? messages[index - 1] : null
    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null
    const BURST_MS = 2 * 60 * 1000 // 2 minutes

    const isSameAsPrev =
      prevMsg?.senderId === item.senderId &&
      item.timestamp - prevMsg.timestamp < BURST_MS

    const isSameAsNext =
      nextMsg?.senderId === item.senderId &&
      nextMsg.timestamp - item.timestamp < BURST_MS

    // Show label only at the start of a burst from another user
    const showLabel = !isMe && !isSameAsPrev
    // Show timestamp only at the end of a burst
    const showTime = !isSameAsNext

    // Tighter spacing within a burst
    const burstSpacing = isSameAsPrev ? 1 : 8

    // Bubble corner rounding — flatten inner edges of a burst
    const borderRadii = isMe
      ? {
          borderTopRightRadius: isSameAsPrev ? 6 : 18,
          borderBottomRightRadius: isSameAsNext ? 6 : 4,
          borderTopLeftRadius: 18,
          borderBottomLeftRadius: 18,
        }
      : {
          borderTopLeftRadius: isSameAsPrev ? 6 : 18,
          borderBottomLeftRadius: isSameAsNext ? 6 : 4,
          borderTopRightRadius: 18,
          borderBottomRightRadius: 18,
        }

    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe, { marginTop: burstSpacing }]}>
        {showLabel && color && (
          <Text style={[styles.colorLabel, { color: CHAT_COLOR_HEX[color] }]}>
            {color}
          </Text>
        )}
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={() => reportMessage(item)}
          delayLongPress={400}
          style={[
            styles.bubble,
            { backgroundColor: bgColor },
            borderRadii,
          ]}
        >
          <Text style={[styles.msgText, { color: textColor }]}>{item.text}</Text>
          {showTime && (
            <Text style={[styles.msgTime, { color: textColor, opacity: 0.5 }]}>
              {new Date(item.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar — your color + rank button */}
      <SafeAreaView style={styles.topBar}>
        <View style={styles.topBarInner}>
          <View style={styles.topBarLeft}>
            {myColor && (
              <View style={styles.topBarColorRow}>
                <View
                  style={[styles.topBarDot, { backgroundColor: CHAT_COLOR_HEX[myColor] }]}
                />
                <Text style={styles.topBarColorText}>You are {myColor}</Text>
              </View>
            )}
            {chat && (
              <Text style={styles.topBarExpiry}>{formatChatExpiry(chat)}</Text>
            )}
          </View>
          <View style={styles.topBarActions}>
            {__DEV__ && chatWritable && (
              <TouchableOpacity style={styles.devExpireButton} onPress={handleDevExpireChat}>
                <Text style={styles.devExpireText}>Expire</Text>
              </TouchableOpacity>
            )}
          <TouchableOpacity style={styles.rankButton} onPress={openRanking}>
            <Text style={styles.rankChevron}>‹</Text>
            <Text style={styles.rankButtonText}>Rate</Text>
          </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <ChatBanners chat={chat} />

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Text style={styles.emptyMessagesText}>No messages yet — say hello! 👋</Text>
          </View>
        }
      />

      {/* Typing indicators */}
      {typingUsers.length > 0 && (
        <View style={styles.typingBar}>
          {typingUsers.map((t) => {
            const c = t.color
            const bgColor = c ? CHAT_COLOR_HEX[c] : '#E5E7EB'
            const dotColor = c && LIGHT_COLORS.includes(c) ? '#000000' : '#FFFFFF'
            return (
              <View key={t.userId} style={[styles.typingBubble, { backgroundColor: bgColor }]}>
                <View style={[styles.typingDot, { backgroundColor: dotColor }]} />
                <View style={[styles.typingDot, styles.typingDot2, { backgroundColor: dotColor }]} />
                <View style={[styles.typingDot, styles.typingDot3, { backgroundColor: dotColor }]} />
              </View>
            )
          })}
        </View>
      )}

      {/* Input — hidden when chat is read-only */}
      {chatWritable ? (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={handleTextChange}
            placeholder="Type a message..."
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={5000}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
            disabled={!text.trim() || sending}
            onPress={handleSend}
          >
            <Text style={styles.sendButtonText}>↑</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ─── Ranking Side Drawer ─────────────────────────────────────── */}
      {showRanking && (
        <>
          {/* Overlay */}
          <Pressable style={styles.drawerOverlay} onPress={closeRanking} />

          {/* Drawer from right */}
          <Animated.View
            style={[
              styles.drawer,
              { transform: [{ translateX: drawerAnim }] },
            ]}
          >
            <SafeAreaView style={styles.drawerInner}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>Rank</Text>
                <TouchableOpacity onPress={closeRanking}>
                  <Text style={styles.drawerClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.rankPrompt}>
                Rank by how compatible you feel with them
              </Text>
              <Text style={styles.rankHint}>Hold and drag to reorder</Text>

              <View style={styles.rankListContainer}>
                <DragToReorder
                  items={ranking}
                  keyExtractor={(id) => id}
                  onReorder={handleReorder}
                  renderItem={(memberId, displayIndex, isActive) => {
                    const memberColor = getColorForUser(memberId)
                    return (
                      <View
                        style={[
                          styles.rankRow,
                          isActive && styles.rankRowActive,
                        ]}
                      >
                        <Text style={styles.rankPosition}>{displayIndex + 1}</Text>
                        <View
                          style={[
                            styles.rankColorDot,
                            {
                              backgroundColor: memberColor
                                ? CHAT_COLOR_HEX[memberColor]
                                : '#ccc',
                            },
                          ]}
                        />
                        <Text style={styles.rankLabel}>
                          {memberColor ?? 'Unknown'}
                        </Text>
                        <Text style={styles.dragHandle}>☰</Text>
                      </View>
                    )
                  }}
                />
              </View>

              <Text style={styles.rankAutoSave}>Rankings save automatically</Text>
            </SafeAreaView>
          </Animated.View>
        </>
      )}
    </KeyboardAvoidingView>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },

  // Empty state
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8 },
  emptySubtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24 },

  // Top bar
  topBar: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  topBarInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  topBarLeft: { flex: 1 },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarColorRow: { flexDirection: 'row', alignItems: 'center' },
  topBarDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  topBarColorText: { fontSize: 14, color: '#6B7280' },
  topBarExpiry: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  devExpireButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  devExpireText: { fontSize: 12, fontWeight: '600', color: '#DC2626' },

  // Rank button
  rankButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    gap: 4,
  },
  rankChevron: { fontSize: 16, color: '#4F46E5', opacity: 0.5 },
  rankButtonText: { fontSize: 14, fontWeight: '600', color: '#4F46E5' },

  // Messages
  messageList: { padding: 12, paddingBottom: 8 },
  emptyMessages: { paddingTop: 40, alignItems: 'center' },
  emptyMessagesText: { fontSize: 16, color: '#9CA3AF' },
  msgRow: { alignItems: 'flex-start' },
  msgRowMe: { alignItems: 'flex-end' },
  colorLabel: { fontSize: 12, fontWeight: '600', marginBottom: 2, marginLeft: 4 },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  msgText: { fontSize: 16, lineHeight: 22 },
  msgTime: { fontSize: 11, marginTop: 3, textAlign: 'right' },

  // Typing indicators
  typingBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.7,
  },
  typingDot2: { opacity: 0.5 },
  typingDot3: { opacity: 0.3 },

  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    fontSize: 16,
    color: '#111827',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },

  // Ranking side drawer
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#FFFFFF',
    zIndex: 11,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  drawerInner: { flex: 1 },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  drawerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  drawerClose: { fontSize: 20, color: '#9CA3AF', padding: 4 },
  rankPrompt: {
    fontSize: 14,
    color: '#6B7280',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    lineHeight: 20,
  },
  rankHint: {
    fontSize: 12,
    color: '#9CA3AF',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  rankListContainer: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    height: 64,
  },
  rankRowActive: {
    backgroundColor: '#EEF2FF',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  rankPosition: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9CA3AF',
    width: 28,
  },
  rankColorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 12,
  },
  rankLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827' },
  dragHandle: { fontSize: 18, color: '#C4C4C4', paddingLeft: 8 },
  rankAutoSave: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
})
