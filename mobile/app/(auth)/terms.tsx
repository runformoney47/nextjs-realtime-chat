import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native'
import { Stack, router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Terms & Community Guidelines', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.text}>
          By using Lunchtable, you agree to use the app respectfully. You must be 18 or older to use this service.
        </Text>

        <Text style={styles.title}>Community Guidelines</Text>
        <Text style={styles.bullet}>• Be kind and respectful to other users.</Text>
        <Text style={styles.bullet}>• No harassment, hate speech, or abusive content.</Text>
        <Text style={styles.bullet}>• No explicit, illegal, or harmful content.</Text>
        <Text style={styles.bullet}>• No spam or solicitation.</Text>
        <Text style={styles.bullet}>• Respect others' privacy - do not share personal information.</Text>

        <Text style={styles.title}>Content Moderation</Text>
        <Text style={styles.text}>
          We rely on our community to help keep Lunchtable safe. You can report messages or users using the report option. 
          Violations may result in content removal or account restrictions.
        </Text>

        <Text style={styles.footer}>
          Last updated: October 2026
        </Text>

        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Got it</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginTop: 24,
    marginBottom: 12,
  },
  text: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  bullet: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 6,
  },
  footer: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 32,
    textAlign: 'center',
  },
  button: {
    marginTop: 24,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
