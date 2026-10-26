import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="dev-login" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy" />
    </Stack>
  )
}
