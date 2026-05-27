import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/lib/api'
import { usePusher } from '@/lib/pusher'
import { useAuthStore } from '@/stores/authStore'
import type { Message, GroupChat } from '@groupchat/shared'
import { CHAT_COLOR_HEX, LIGHT_COLORS, toPusherKey } from '@groupchat/shared'
import type { ChatColor } from '@groupchat/shared'

export default function ChatScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [chat, setChat] = useState<GroupChat | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const flatListRef = useRef<FlatList>(null)

  // Subscribe to realtime messages
  usePusher(chatId ? toPusherKey(`chat:${chatId}`) : null, 'incoming-message', (message: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev
      return [...prev, message].sort((a, b) => a.timestamp - b.timestamp)
    })
  })

  useEffect(() => {
    if (!chatId) return
    loadChat()
    loadMessages()
  }, [chatId])

  const loadChat = async () => {
    // We get chat details from the list endpoint, but ideally we'd have a /chat/:id route
    // For now, we embed it in the messages load
  }

  const loadMessages = async () => {
    const res = await api.get(`/message/list?chatId=${chatId}&limit=100`)
    if (res.ok) {
      setMessages(res.data)
    }
  }

  const handleSend = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    const trimmed = text.trim()
    setText('')

    // Optimistic add
    const optimistic: Message = {
      id: `tmp_${Date.now()}`,
      senderId: user?.id ?? '',
      text: trimmed,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, optimistic])

    const res = await api.post('/message/send', {
      chatId,
      text: trimmed,
      clientId: optimistic.id,
    })

    if (res.ok) {
      // Replace optimistic message with server response
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? res.data : m)),
      )
    }

    setSending(false)
  }

  const getColorForUser = (userId: string): ChatColor | null => {
    if (!chat?.memberColors) return null
    return (chat.memberColors[userId] as ChatColor) ?? null
  }

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.senderId === user?.id
    const color = getColorForUser(item.senderId)
    const bgColor = color ? CHAT_COLOR_HEX[color] : (isMe ? '#4F46E5' : '#F3F4F6')
    const textColor = color
      ? (LIGHT_COLORS.includes(color) ? '#000000' : '#FFFFFF')
      : (isMe ? '#FFFFFF' : '#111827')

    // Show color label for other users
    const prevMsg = index > 0 ? messages[index - 1] : null
    const showLabel = !isMe && (!prevMsg || prevMsg.senderId !== item.senderId)

    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        {showLabel && color && (
          <Text style={[styles.colorLabel, { color: CHAT_COLOR_HEX[color] }]}>
            {color}
          </Text>
        )}
        <View style={[styles.bubble, { backgroundColor: bgColor }, isMe && styles.bubbleMe]}>
          <Text style={[styles.msgText, { color: textColor }]}>{item.text}</Text>
          <Text style={[styles.msgTime, { color: textColor, opacity: 0.6 }]}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      {/* Icebreaker banner */}
      {chat?.icebreaker && (
        <View style={styles.icebreaker}>
          <Text style={styles.icebreakerText}>💡 {chat.icebreaker}</Text>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Input */}
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
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  icebreaker: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E7FF',
  },
  icebreakerText: { fontSize: 15, color: '#4338CA', lineHeight: 22 },
  messageList: { padding: 12, gap: 4 },
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


