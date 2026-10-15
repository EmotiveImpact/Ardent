import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Send } from 'lucide-react-native'
import { useJobMessages, type MessageRow } from '@/hooks/useJobMessages'

// Job Chat — a message thread between the field engineer and the office,
// scoped to a single job. Polled (not realtime); see useJobMessages header.
export default function JobChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const { messages, loading, error, sending, send, currentUserId } = useJobMessages(id)

  const [draft, setDraft] = useState('')
  const scrollRef = useRef<ScrollView>(null)

  // Auto-scroll to the latest message on load and whenever the thread grows
  // (covers both the initial fetch and post-send refetch).
  useEffect(() => {
    if (messages.length > 0) {
      // A tiny delay lets the new bubble lay out before we scroll.
      const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
      return () => clearTimeout(t)
    }
  }, [messages.length])

  async function handleSend() {
    const body = draft.trim()
    if (!body || sending) return
    Haptics.selectionAsync()
    // Clear the input only once the message is actually persisted. On any
    // failure (offline, RLS reject, context not ready) keep the text so the
    // engineer can retry instead of silently losing it.
    const ok = await send(body)
    if (ok) setDraft('')
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Messages' }} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
      >
        <View className="flex-1 bg-background">
          {error && messages.length > 0 ? (
            <View className="border-b border-[#fecaca] bg-[#fff5f5] px-4 py-2.5">
              <Text className="text-[13px] font-medium text-[#b91c1c]">Message not sent: {error}</Text>
            </View>
          ) : null}
          {loading && messages.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#e8772e" />
            </View>
          ) : error && messages.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-base font-semibold text-foreground">Couldn't load messages</Text>
              <Text className="mt-1 text-center text-[13px] text-muted">{error}</Text>
            </View>
          ) : messages.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-base font-semibold text-foreground">No messages yet</Text>
              <Text className="mt-1 text-center text-[13px] text-muted">
                Start the conversation.
              </Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              contentContainerClassName="p-4 gap-3"
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} mine={m.sender_id === currentUserId} />
              ))}
            </ScrollView>
          )}

          {/* Input bar */}
          <View
            className="flex-row items-end gap-2 border-t border-border bg-surface px-3 pt-2.5"
            style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 10 }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message the office…"
              placeholderTextColor="#94a3b8"
              multiline
              className="flex-1 max-h-28 rounded-2xl border border-border bg-surface-secondary px-3.5 py-2.5 text-[15px] text-foreground"
            />
            <Pressable
              onPress={handleSend}
              disabled={sending || !draft.trim()}
              className="h-11 w-11 items-center justify-center rounded-full bg-[#e8772e]"
              style={{ opacity: sending || !draft.trim() ? 0.5 : 1 }}
            >
              {sending ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Send size={18} color="#ffffff" />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  )
}

function MessageBubble({ message, mine }: { message: MessageRow; mine: boolean }) {
  const time = new Date(message.created_at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

  if (mine) {
    return (
      <View className="items-end">
        <View className="max-w-[80%] rounded-2xl bg-[#e8772e] px-3.5 py-2.5">
          <Text className="text-[15px] leading-5 text-white">{message.body}</Text>
        </View>
        <Text className="mr-1 mt-1 text-[11px] text-muted">{time}</Text>
      </View>
    )
  }

  return (
    <View className="items-start">
      <Text className="ml-1 mb-1 text-[11px] font-medium text-muted">
        {message.sender_name ?? 'Office'}
      </Text>
      <View className="max-w-[80%] rounded-2xl border border-border bg-surface px-3.5 py-2.5">
        <Text className="text-[15px] leading-5 text-foreground">{message.body}</Text>
      </View>
      <Text className="ml-1 mt-1 text-[11px] text-muted">{time}</Text>
    </View>
  )
}
