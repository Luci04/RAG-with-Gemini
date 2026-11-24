"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Chat } from "./chat"
import { ChatHistory } from "./chat-history"
import { FileUpload } from "./file-upload"

export function HomeShell() {
  const searchParams = useSearchParams()
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [historyKey, setHistoryKey] = useState(0)

  useEffect(() => {
    const fromUrl = searchParams.get("chat")
    if (fromUrl) setActiveChatId(fromUrl)
  }, [searchParams])

  const onNewChat = () => {
    setActiveChatId(null)
    const url = new URL(window.location.href)
    url.searchParams.delete("chat")
    window.history.replaceState({}, "", url.pathname)
  }

  const onSelect = (chatId: string) => {
    setActiveChatId(chatId)
    const url = new URL(window.location.href)
    url.searchParams.set("chat", chatId)
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`)
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex w-[22%] min-w-[200px] flex-col border-r border-gray-200 px-3 py-4 dark:border-gray-800">
        <ChatHistory
          activeChatId={activeChatId}
          refreshKey={historyKey}
          onSelect={onSelect}
          onNewChat={onNewChat}
        />
      </div>

      <div className="flex w-[34%] flex-col items-center justify-center px-6">
        <FileUpload />
      </div>

      <div className="flex h-full min-h-0 w-[44%] flex-col overflow-hidden border-l border-gray-200 px-6 py-4 dark:border-gray-800">
        <Chat
          chatId={activeChatId}
          onChatChange={(id) => {
            setActiveChatId(id)
            if (id) {
              const url = new URL(window.location.href)
              url.searchParams.set("chat", id)
              window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`)
            }
          }}
          onHistoryRefresh={() => setHistoryKey((k) => k + 1)}
        />
      </div>
    </div>
  )
}
