import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native'
import { router } from 'expo-router'
import type { AppUser, CurationRunResult } from '@groupchat/shared'
import { api, getApiBase, getApiNetworkHelpMessage } from '@/lib/api'
import { completeLogin } from '@/lib/post-login'

type TestUser = { id: string; name: string; email: string }

/**
 * Development-only login: seed test users and log in without Apple Sign-In.
 */
export default function DevLoginScreen() {
  const [users, setUsers] = useState<TestUser[]>([])
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [curating, setCurating] = useState(false)
  const [loggingIn, setLoggingIn] = useState<string | null>(null)
  const [connectionHint, setConnectionHint] = useState<string | null>(null)

  const showNetworkHelp = useCallback((title = 'Cannot reach API server') => {
    Alert.alert(title, getApiNetworkHelpMessage())
  }, [])

  const loadUsers = useCallback(async (opts?: { silent?: boolean }) => {
    setLoading(true)
    setConnectionHint(null)
    const res = await api.get<TestUser[]>('/dev/users')
    if (res.ok) {
      setUsers(res.data)
    } else if (res.error === 'Network error' || res.error === 'Request timed out') {
      setConnectionHint(res.error)
      if (!opts?.silent) {
        showNetworkHelp(res.error === 'Request timed out' ? 'Request timed out' : undefined)
      }
    }
    setLoading(false)
  }, [showNetworkHelp])

  useEffect(() => {
    loadUsers({ silent: true })
  }, [loadUsers])

  const handleSeed = async () => {
    setSeeding(true)
    const res = await api.post<{ users: { id: string }[]; chats: { id: string }[] }>(
      '/dev/seed',
      { userCount: 20, groupSize: 5 },
    )
    if (res.ok) {
      Alert.alert(
        'Seeded!',
        `Created ${res.data.users.length} users and ${res.data.chats.length} group chats`,
      )
      await loadUsers({ silent: true })
    } else if (res.error === 'Network error' || res.error === 'Request timed out') {
      setConnectionHint(res.error)
      showNetworkHelp()
    } else {
      Alert.alert('Error', res.error ?? 'Seed failed')
    }
    setSeeding(false)
  }

  const handleCuration = () => {
    Alert.alert(
      'Run curation?',
      'Expires all active chats and assigns new groups from the pool.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run',
          onPress: async () => {
            setCurating(true)
            const res = await api.post<CurationRunResult>('/curation/run')
            if (res.ok) {
              const skipped = res.data.skippedUserIds.length
              Alert.alert(
                'Curation done',
                `Created ${res.data.chats.length} group chats` +
                  (skipped ? `\nSkipped ${skipped} user${skipped === 1 ? '' : 's'}` : '') +
                  (res.data.expiredChatIds.length
                    ? `\nExpired ${res.data.expiredChatIds.length} old chat${res.data.expiredChatIds.length === 1 ? '' : 's'}`
                    : ''),
              )
            } else if (res.error === 'Network error' || res.error === 'Request timed out') {
              setConnectionHint(res.error)
              showNetworkHelp()
            } else {
              Alert.alert('Error', res.error ?? 'Curation failed')
            }
            setCurating(false)
          },
        },
      ],
    )
  }

  const handleLoginAs = async (userId: string) => {
    setLoggingIn(userId)
    const res = await api.post<{ token: string; user: AppUser }>('/dev/login-as', { userId })
    if (res.ok) {
      await completeLogin(res.data.token, res.data.user)
    } else if (res.error === 'Network error' || res.error === 'Request timed out') {
      showNetworkHelp()
    } else {
      Alert.alert('Error', res.error ?? 'Login failed')
    }
    setLoggingIn(null)
  }

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.titleSection}>
        <Text style={styles.title}>Developer Login</Text>
        <Text style={styles.subtitle}>Seed users and pick a test account</Text>
        <Text style={styles.apiHint} selectable>
          API: {getApiBase()}
        </Text>
        {connectionHint && (
          <Text style={styles.connectionWarning}>{connectionHint}</Text>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.seedButton} onPress={handleSeed} disabled={seeding}>
          {seeding ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.seedButtonText}>Seed 20 Users + Chats</Text>
          )}
        </TouchableOpacity>
        {users.length > 0 && (
          <TouchableOpacity
            style={styles.resetButton}
            onPress={async () => {
              await api.delete('/dev/seed')
              setUsers([])
            }}
          >
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.curationRow}>
        <TouchableOpacity
          style={styles.curationButton}
          onPress={handleCuration}
          disabled={curating || seeding}
        >
          {curating ? (
            <ActivityIndicator color="#4F46E5" size="small" />
          ) : (
            <Text style={styles.curationButtonText}>Run Curation</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No test users — tap Seed first</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.userRow}
              onPress={() => handleLoginAs(item.id)}
              disabled={loggingIn !== null}
            >
              <Text style={styles.userName}>{item.name}</Text>
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
  back: { paddingHorizontal: 24, paddingTop: 8 },
  backText: { fontSize: 16, color: '#4F46E5', fontWeight: '600' },
  titleSection: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 15, color: '#6B7280', marginTop: 4 },
  apiHint: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  connectionWarning: { fontSize: 13, color: '#DC2626', marginTop: 8 },
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
  curationRow: { paddingHorizontal: 24, paddingBottom: 12 },
  curationButton: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  curationButtonText: { fontSize: 15, fontWeight: '600', color: '#4F46E5' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
  },
  userName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  chevron: { fontSize: 18, color: '#9CA3AF' },
})
