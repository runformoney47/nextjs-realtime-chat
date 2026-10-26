import { useCallback, useEffect, useRef, useState } from 'react'
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
  Alert,
} from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { api } from '@/lib/api'
import { usePusher } from '@/lib/pusher'
import { useAuthStore } from '@/stores/authStore'
import type { Message, GroupChat } from '@groupchat/shared'
import { CHAT_COLOR_HEX, LIGHT_COLORS, toPusherKey, isChatWritable } from '@groupchat/shared'
import type { ChatColor } from '@groupchat/shared'
import { ChatBanners } from '@/components/ChatBanners'
import { addBlockedUser, fetchBlockedUsers } from '@/lib/blocks'

/**
 * Per-chat screen (e.g. opened from History).
 * Loads metadata via GET /api/chat/:id — not inferred from the message list.
 */
export default function ChatScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [chat, setChat] = useState<GroupChat | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set())
  const flatListRef = useRef<FlatList>(null)

  const chatWritable = chat ? isChatWritable(chat) : false

  const loadChat = useCallback(async () => {
    if (!chatId) return
    const res = await api.get<GroupChat>(`/chat/${chatId}`)
    if (res.ok) {
      setChat(res.data)
    } else {
      setChat(null)
      Alert.alert('Chat unavailable', res.error ?? 'Could not load chat')
    }
  }, [chatId])

  const loadMessages = useCallback(async () => {
    if (!chatId) return
    const res = await api.get<Message[]>(`/message/list?chatId=${chatId}&limit=100`)
    if (res.ok) {
      setMessages(res.data)
    }
  }, [chatId])

  useEffect(() => {
    if (!chatId) return
    ;(async () => {
      setLoading(true)
      await Promise.all([loadChat(), loadMessages(), fetchBlockedUsers().then(setBlockedSet)])
      setLoading(false)
    })()
  }, [chatId, loadChat, loadMessages])

  usePusher(
    chatId ? toPusherKey(`chat:${chatId}`) : null,
    'incoming-message',
    (message: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev
        return [...prev, message].sort((a, b) => a.timestamp - b.timestamp)
      })
    },
  )

  const handleSend = async () => {
    if (!text.trim() || sending || !chatId || !chatWritable) return
    setSending(true)
    const trimmed = text.trim()
    setText('')

    const optimistic: Message = {
      id: `tmp_${Date.now()}`,
      senderId: user?.id ?? '',
      text: trimmed,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, optimistic])

    const res = await api.post<Message>('/message/send', {
      chatId,
      text: trimmed,
      clientId: optimistic.id,
    })

    if (res.ok) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? res.data : m)),
      )
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      Alert.alert('Could not send', res.error ?? 'Something went wrong')
      if (res.error?.toLowerCase().includes('expired')) {
        await loadChat()
      }
    }

    setSending(false)
  }

  const getColorForUser = (userId: string): ChatColor | null => {
    if (!chat?.memberColors) return null
    return (chat.memberColors[userId] as ChatColor) ?? null
  }

  const reportMessage = (message: Message) => {
    if (message.senderId === user?.id) {
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
              chatId,
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
              chatId,
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
              chatId,
              reason: 'hate_speech',
            })
            Alert.alert('Reported', 'Thank you for reporting this message.')
          },
        },
        {
          text: 'Inappropriate',
          onPress: async () => {
            await api.post('/report', {
              targetType: 'message',
              targetId: message.id,
              chatId,
              reason: 'inappropriate',
            })
            Alert.alert('Reported', 'Thank you for reporting this message.')
          },
        },
        {
          text: 'Block user',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Block user', 'Block this user? Their messages will be hidden.', [
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
            ])
          },
        },
      ],
      { cancelable: true },
    )
  }

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    if (blockedSet.has(item.senderId)) return <View />
    const isMe = item.senderId === user?.id
    const color = getColorForUser(item.senderId)
    const bgColor = color ? CHAT_COLOR_HEX[color] : isMe ? '#4F46E5' : '#F3F4F6'
    const textColor = color
      ? LIGHT_COLORS.includes(color)
        ? '#000000'
        : '#FFFFFF'
      : isMe
        ? '#FFFFFF'
        : '#111827'

    const prevMsg = index > 0 ? messages[index - 1] : null
    const showLabel = !isMe && (!prevMsg || prevMsg.senderId !== item.senderId)

    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        {showLabel && color && (
          <Text style={[styles.colorLabel, { color: CHAT_COLOR_HEX[color] }]}>
            {color}
          </Text>
        )}
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={() => reportMessage(item)}
          delayLongPress={400}
          style={[styles.bubble, { backgroundColor: bgColor }, isMe && styles.bubbleMe]}
        >
          <Text style={[styles.msgText, { color: textColor }]}>{item.text}</Text>
          <Text style={[styles.msgTime, { color: textColor, opacity: 0.6 }]}>
            {new Date(item.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Group Chat' }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      </>
    )
  }

  if (!chat) {
    return (
      <>
        <Stack.Screen options={{ title: 'Group Chat' }} />
        <View style={styles.center}>
          <Text style={styles.errorText}>Chat not found</Text>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: chat.active ? 'Group Chat' : 'Chat (ended)',
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ChatBanners chat={chat} />

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Text style={styles.emptyMessages}>No messages in this chat</Text>
          }
        />

        {chatWritable ? (
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Type a message..."
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={5000}
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
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#6B7280' },
  messageList: { padding: 12, gap: 4 },
  emptyMessages: { textAlign: 'center', color: '#9CA3AF', paddingTop: 24 },
  msgRow: { alignItems: 'flex-start', marginBottom: 2 },
  msgRowMe: { alignItems: 'flex-end' },
  colorLabel: { fontSize: 12, fontWeight: '600', marginBottom: 2, marginLeft: 4 },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: { borderBottomLeftRadius: 18, borderBottomRightRadius: 4 },
  msgText: { fontSize: 16, lineHeight: 22 },
  msgTime: { fontSize: 11, marginTop: 4, textAlign: 'right' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 8,
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
})
