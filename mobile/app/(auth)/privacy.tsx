import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native'
import { Stack, router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Privacy Policy', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.text}>
          We collect minimal data to operate Lunchtable: account information, profile quiz responses, messages in group chats, and device tokens for notifications.
        </Text>
        <Text style={styles.title}>Data Usage</Text>
        <Text style={styles.text}>
          Your data is used to match you into group chats and to provide the service. Messages are stored to enable chat history.
        </Text>
        <Text style={styles.title}>Your Rights</Text>
        <Text style={styles.text}>
          You can delete your account at any time from the Profile tab. You can also block or report other users.
        </Text>
        <Text style={styles.footer}>Last updated: October 2026</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Got it</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { paddingHorizontal: 24, paddingVertical: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 24, marginBottom: 12 },
  text: { fontSize: 15, color: '#374151', lineHeight: 22 },
  footer: { fontSize: 13, color: '#9CA3AF', marginTop: 32 },
  button: { marginTop: 24, height: 48, borderRadius: 12, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
})
