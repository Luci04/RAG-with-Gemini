"use client"

import { useAuth } from "@clerk/nextjs"
import { FormEvent, useEffect, useRef, useState } from "react"
import { Loader2, Mic, MicOff, SendHorizontal, Trash2 } from "lucide-react"

type Source = {
  content: string
  metadata?: {
    source?: string
    loc?: { pageNumber?: number }
  }
}

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  sources?: Source[]
}

type SpeechRecognitionResultLike = {
  isFinal: boolean
  0: { transcript: string }
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export function Chat() {
  const { getToken } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const baseInputRef = useRef("")

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
    setSpeechSupported(Boolean(SpeechRecognitionAPI))
    if (!SpeechRecognitionAPI) return

    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"

    recognition.onresult = (event) => {
      let finalTranscript = ""
      let interimTranscript = ""

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) finalTranscript += result[0].transcript
        else interimTranscript += result[0].transcript
      }

      if (finalTranscript) {
        baseInputRef.current = `${baseInputRef.current}${baseInputRef.current ? " " : ""}${finalTranscript.trim()}`
      }

      const next = `${baseInputRef.current}${interimTranscript ? `${baseInputRef.current ? " " : ""}${interimTranscript.trim()}` : ""}`
      setInput(next)
    }

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return
      setError(
        event.error === "not-allowed"
          ? "Microphone permission denied. Allow mic access in the browser."
          : `Speech recognition error: ${event.error}`
      )
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition

    return () => {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.abort()
      recognitionRef.current = null
    }
  }, [])

  const toggleListening = () => {
    const recognition = recognitionRef.current
    if (!recognition) {
      setError("Speech recognition is not supported in this browser. Try Chrome.")
      return
    }

    if (listening) {
      recognition.stop()
      setListening(false)
      return
    }

    setError(null)
    baseInputRef.current = input.trim()
    try {
      recognition.start()
      setListening(true)
    } catch {
      setError("Could not start the microphone. Try again.")
      setListening(false)
    }
  }

  const sendMessage = async (text: string) => {
    const question = text.trim()
    if (!question || loading) return

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
    }

    setError(null)
    setInput("")
    baseInputRef.current = ""
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: question },
    ])
    setLoading(true)

    try {
      const token = await getToken()
      if (!token) throw new Error("Not signed in")

      const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(question)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Search failed")

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer ?? "No answer returned.",
          sources: data.sources ?? [],
        },
      ])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      setError(message)
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I couldn't answer that. Check that the server is running and a PDF is indexed.",
        },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void sendMessage(input)
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-1 pb-3 dark:border-gray-800">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Chat with PDF</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Ask questions about your uploaded documents</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([])
              setError(null)
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-900 dark:hover:text-gray-100"
            aria-label="Clear chat"
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
        {messages.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Upload a PDF on the left, then ask something like:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["Who is Avinash Shukla?", "What projects has he built?", "Summarize work experience"].map(
                (suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void sendMessage(suggestion)}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    {suggestion}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                message.role === "user"
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                <details className="mt-3 border-t border-gray-200 pt-2 dark:border-gray-700">
                  <summary className="cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400">
                    Sources ({message.sources.length})
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {message.sources.map((source, index) => (
                      <li
                        key={`${message.id}-source-${index}`}
                        className="rounded-lg bg-white/70 p-2 text-xs text-gray-600 dark:bg-black/30 dark:text-gray-300"
                      >
                        <p className="mb-1 font-medium text-gray-800 dark:text-gray-200">
                          {source.metadata?.source?.split("/").pop() ?? `Source ${index + 1}`}
                          {source.metadata?.loc?.pageNumber
                            ? ` · p.${source.metadata.loc.pageNumber}`
                            : ""}
                        </p>
                        <p className="line-clamp-4 whitespace-pre-wrap">{source.content}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="shrink-0 pb-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <form onSubmit={onSubmit} className="shrink-0 border-t border-gray-200 pt-3 dark:border-gray-800">
        <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-black">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void sendMessage(input)
              }
            }}
            rows={1}
            placeholder="Ask about your PDF…"
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-gray-400"
            disabled={loading}
          />
          {speechSupported && (
            <button
              type="button"
              onClick={toggleListening}
              disabled={loading}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:cursor-not-allowed disabled:opacity-40 ${
                listening
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              }`}
              aria-label={listening ? "Stop listening" : "Start voice input"}
              title={listening ? "Stop listening" : "Speak to type"}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
            aria-label="Send message"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-gray-400">
          {listening
            ? "Listening… click the mic again to stop"
            : "Enter to send · Shift+Enter for new line · Mic for voice input"}
        </p>
      </form>
    </div>
  )
}
