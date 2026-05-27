import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { api } from '@/lib/api'
import type { GroupChat } from '@groupchat/shared'
import { CHAT_COLOR_HEX } from '@groupchat/shared'

export default function HistoryTab() {
  const [pastChats, setPastChats] = useState<GroupChat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPastChats()
  }, [])

  const loadPastChats = async () => {
    setLoading(true)
    const res = await api.get('/chat/list?active=false')
    if (res.ok) {
      setPastChats(res.data)
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={pastChats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No past chats yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/chat/${item.id}`)}
          >
            <View style={styles.colorDots}>
              {Object.values(item.memberColors ?? {}).map((color, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    { backgroundColor: CHAT_COLOR_HEX[color as keyof typeof CHAT_COLOR_HEX] ?? '#ccc' },
                  ]}
                />
              ))}
            </View>
            <View style={styles.info}>
              <Text style={styles.title}>{item.members.length} people</Text>
              <Text style={styles.date}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 10 },
  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#9CA3AF' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  colorDots: { flexDirection: 'row', gap: 4, marginRight: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  info: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#374151' },
  date: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
})


