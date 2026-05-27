import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { router } from 'expo-router'

type TestUser = { id: string; name: string; email: string }

export default function LoginScreen() {
  const { setAuth } = useAuthStore()
  const [users, setUsers] = useState<TestUser[]>([])
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [loggingIn, setLoggingIn] = useState<string | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    const res = await api.get('/dev/users')
    if (res.ok) {
      setUsers(res.data)
    }
    setLoading(false)
  }

  const handleSeed = async () => {
    setSeeding(true)
    const res = await api.post('/dev/seed', { userCount: 20, groupSize: 5 })
    if (res.ok) {
      Alert.alert(
        'Seeded!',
        `Created ${res.data.users.length} users and ${res.data.chats.length} group chats`,
      )
      await loadUsers()
    } else {
      Alert.alert('Error', res.error ?? 'Seed failed')
    }
    setSeeding(false)
  }

  const handleReset = async () => {
    Alert.alert('Reset all test data?', 'This will delete all test users and chats.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await api.delete('/dev/seed')
          setUsers([])
        },
      },
    ])
  }

  const handleLoginAs = async (userId: string) => {
    setLoggingIn(userId)
    const res = await api.post('/dev/login-as', { userId })
    if (res.ok) {
      await setAuth(res.data.token, res.data.user)
      router.replace('/(tabs)/chat')
    } else {
      Alert.alert('Error', res.error ?? 'Login failed')
    }
    setLoggingIn(null)
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Title */}
      <View style={styles.titleSection}>
        <Text style={styles.title}>GroupChat</Text>
        <Text style={styles.subtitle}>Dev Mode — pick a user to log in as</Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.seedButton}
          onPress={handleSeed}
          disabled={seeding}
        >
          {seeding ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.seedButtonText}>Seed 20 Users + Chats</Text>
          )}
        </TouchableOpacity>

        {users.length > 0 && (
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>Reset All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* User list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : users.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            No test users yet.{'\n'}Tap "Seed" to create some.
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.userRow}
              onPress={() => handleLoginAs(item.id)}
              disabled={loggingIn !== null}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.name.replace('User_', '')}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.name}</Text>
                <Text style={styles.userEmail}>{item.email}</Text>
              </View>
              {loggingIn === item.id ? (
                <ActivityIndicator size="small" color="#4F46E5" />
              ) : (
                <Text style={styles.chevron}>→</Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  titleSection: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
  title: { fontSize: 32, fontWeight: '800', color: '#4F46E5' },
  subtitle: { fontSize: 15, color: '#6B7280', marginTop: 4 },

  actions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 10,
  },
  seedButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seedButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  resetButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetButtonText: { fontSize: 15, fontWeight: '600', color: '#DC2626' },

  emptyText: { fontSize: 16, color: '#9CA3AF', textAlign: 'center', lineHeight: 24 },

  list: { paddingHorizontal: 16, paddingBottom: 40 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  userEmail: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  chevron: { fontSize: 18, color: '#9CA3AF' },
})
