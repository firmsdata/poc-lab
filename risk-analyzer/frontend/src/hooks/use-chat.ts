import { useState, useCallback } from "react"
import type { ChatMessage } from "@/types"
import { sendChatMessage } from "@/services/api"

export function useChat(domain?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm your Risk Intelligence assistant. I can help you analyze DRHP risk disclosures, identify patterns across companies, and benchmark against SEBI standards. What would you like to explore?",
      timestamp: new Date(),
    },
  ])
  const [isTyping, setIsTyping] = useState(false)

  const sendMessage = useCallback(
    async (content: string) => {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsTyping(true)

      try {
        const updatedMessages = [...messages, userMsg]
        const response = await sendChatMessage(updatedMessages, domain)
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: response,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMsg])
      } catch {
        const errorMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMsg])
      } finally {
        setIsTyping(false)
      }
    },
    [messages, domain]
  )

  const clearMessages = useCallback(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Hi! I'm your Risk Intelligence assistant. I can help you analyze DRHP risk disclosures, identify patterns across companies, and benchmark against SEBI standards. What would you like to explore?",
        timestamp: new Date(),
      },
    ])
  }, [])

  return { messages, isTyping, sendMessage, clearMessages }
}
