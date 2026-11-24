"use client"

import { useAuth } from "@clerk/nextjs"
import { useCallback, useEffect, useState } from "react"
import { Eye, Lock, MessageSquarePlus, Trash2 } from "lucide-react"
import { ChatSummary, deleteChat, listChats } from "../lib/api"

type Props = {
  activeChatId: string | null
  refreshKey: number
  onSelect: (chatId: string) => void
  onNewChat: () => void
}

export function ChatHistory({ activeChatId, refreshKey, onSelect, onNewChat }: Props) {
  const { getToken } = useAuth()
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const token = await getToken()
      if (!token) throw new Error("Not signed in")
      const data = await listChats(token)
      setChats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history")
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const onDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("Delete this chat?")) return
    try {
      const token = await getToken()
      if (!token) return
      await deleteChat(token, id)
      setChats((prev) => prev.filter((c) => c.id !== id))
      if (activeChatId === id) onNewChat()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Chat history</h2>
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {loading && <p className="text-xs text-gray-400">Loading…</p>}
        {error && <p className="text-xs text-red-500">{error}</p>}
        {!loading && chats.length === 0 && (
          <p className="text-xs text-gray-400">No saved chats yet. Ask a question to start one.</p>
        )}
        {chats.map((chat) => (
          <button
            key={chat.id}
            type="button"
            onClick={() => onSelect(chat.id)}
            className={`group flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
              activeChatId === chat.id
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "hover:bg-gray-100 dark:hover:bg-gray-900"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{chat.title}</p>
              <p
                className={`mt-0.5 flex items-center gap-1 text-[11px] ${
                  activeChatId === chat.id ? "text-gray-300 dark:text-gray-600" : "text-gray-400"
                }`}
              >
                {chat.isReadable ? <Eye className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {chat.messageCount} msgs · {new Date(chat.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => void onDelete(chat.id, e)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onDelete(chat.id, e as unknown as React.MouseEvent)
              }}
              className={`mt-0.5 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                activeChatId === chat.id
                  ? "hover:bg-white/10"
                  : "text-gray-400 hover:bg-gray-200 hover:text-red-600 dark:hover:bg-gray-800"
              }`}
              aria-label="Delete chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
