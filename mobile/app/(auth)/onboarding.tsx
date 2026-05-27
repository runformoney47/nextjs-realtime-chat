import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native'
import { router } from 'expo-router'
import { api } from '@/lib/api'
import type { OnboardingQuizInput } from '@groupchat/shared'

const INTEREST_OPTIONS = [
  'Music', 'Sports', 'Gaming', 'Travel', 'Cooking',
  'Movies', 'Books', 'Fitness', 'Tech', 'Art',
  'Photography', 'Fashion', 'Nature', 'Podcasts', 'Comedy',
]

const COMM_STYLES = [
  { value: 'listener', label: '👂 Listener', desc: 'I prefer to listen and ask questions' },
  { value: 'debater', label: '🔥 Debater', desc: 'I love a good back-and-forth' },
  { value: 'joker', label: '😂 Joker', desc: 'I keep things light and funny' },
  { value: 'storyteller', label: '📖 Storyteller', desc: 'I love sharing experiences' },
  { value: 'supporter', label: '💪 Supporter', desc: 'I hype people up and encourage' },
] as const

const GOALS = [
  { value: 'meet-people', label: 'Meet new people' },
  { value: 'deep-convos', label: 'Have deep conversations' },
  { value: 'just-vibes', label: 'Just vibes & fun' },
  { value: 'debate-ideas', label: 'Debate ideas' },
] as const

export default function OnboardingScreen() {
  const [step, setStep] = useState(0)
  const [interests, setInterests] = useState<string[]>([])
  const [commStyle, setCommStyle] = useState<OnboardingQuizInput['commStyle'] | null>(null)
  const [ageRange, setAgeRange] = useState<OnboardingQuizInput['ageRange'] | null>(null)
  const [chatGoal, setChatGoal] = useState<OnboardingQuizInput['chatGoal'] | null>(null)

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : prev.length < 5
          ? [...prev, interest]
          : prev,
    )
  }

  const handleSubmit = async () => {
    if (!commStyle || !ageRange || !chatGoal || interests.length === 0) return

    const quizData: OnboardingQuizInput = {
      interests,
      commStyle,
      ageRange,
      chatGoal,
    }

    const response = await api.post('/profile/quiz', quizData)
    if (response.ok) {
      router.replace('/(tabs)/chat')
    }
  }

  const canAdvance = () => {
    switch (step) {
      case 0: return interests.length >= 1
      case 1: return commStyle !== null
      case 2: return ageRange !== null
      case 3: return chatGoal !== null
      default: return false
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressContainer}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.progressDot, i <= step && styles.progressDotActive]}
          />
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {step === 0 && (
          <View>
            <Text style={styles.stepTitle}>What are you into?</Text>
            <Text style={styles.stepSubtitle}>Pick up to 5 interests</Text>
            <View style={styles.chipGrid}>
              {INTEREST_OPTIONS.map((interest) => (
                <TouchableOpacity
                  key={interest}
                  style={[styles.chip, interests.includes(interest) && styles.chipSelected]}
                  onPress={() => toggleInterest(interest)}
                >
                  <Text
                    style={[styles.chipText, interests.includes(interest) && styles.chipTextSelected]}
                  >
                    {interest}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>How do you chat?</Text>
            <Text style={styles.stepSubtitle}>Pick your vibe</Text>
            <View style={styles.optionList}>
              {COMM_STYLES.map((style) => (
                <TouchableOpacity
                  key={style.value}
                  style={[styles.optionCard, commStyle === style.value && styles.optionCardSelected]}
                  onPress={() => setCommStyle(style.value)}
                >
                  <Text style={styles.optionLabel}>{style.label}</Text>
                  <Text style={styles.optionDesc}>{style.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>How old are you?</Text>
            <View style={styles.optionList}>
              {(['18-22', '23-27', '28-34', '35+'] as const).map((range) => (
                <TouchableOpacity
                  key={range}
                  style={[styles.optionCard, ageRange === range && styles.optionCardSelected]}
                  onPress={() => setAgeRange(range)}
                >
                  <Text style={styles.optionLabel}>{range}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>What are you looking for?</Text>
            <View style={styles.optionList}>
              {GOALS.map((goal) => (
                <TouchableOpacity
                  key={goal.value}
                  style={[styles.optionCard, chatGoal === goal.value && styles.optionCardSelected]}
                  onPress={() => setChatGoal(goal.value)}
                >
                  <Text style={styles.optionLabel}>{goal.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom buttons */}
      <View style={styles.bottomBar}>
        {step > 0 && (
          <TouchableOpacity style={styles.backButton} onPress={() => setStep((s) => s - 1)}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextButton, !canAdvance() && styles.nextButtonDisabled]}
          disabled={!canAdvance()}
          onPress={() => {
            if (step < 3) {
              setStep((s) => s + 1)
            } else {
              handleSubmit()
            }
          }}
        >
          <Text style={styles.nextButtonText}>{step < 3 ? 'Next' : "Let's go!"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  progressDotActive: { backgroundColor: '#4F46E5' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24 },
  stepTitle: { fontSize: 28, fontWeight: '700', color: '#111827', marginBottom: 8 },
  stepSubtitle: { fontSize: 16, color: '#6B7280', marginBottom: 24 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#F3F4F6',
  },
  chipSelected: { backgroundColor: '#EEF2FF', borderColor: '#4F46E5' },
  chipText: { fontSize: 15, color: '#374151' },
  chipTextSelected: { color: '#4F46E5', fontWeight: '600' },
  optionList: { gap: 12 },
  optionCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#F3F4F6',
  },
  optionCardSelected: { borderColor: '#4F46E5', backgroundColor: '#EEF2FF' },
  optionLabel: { fontSize: 18, fontWeight: '600', color: '#111827' },
  optionDesc: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  bottomBar: {
    flexDirection: 'row',
    padding: 24,
    gap: 12,
  },
  backButton: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  nextButton: {
    flex: 2,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButtonDisabled: { opacity: 0.4 },
  nextButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
})


