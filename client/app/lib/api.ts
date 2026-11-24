export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export type ChatSource = {
  content: string
  metadata?: {
    source?: string
    type?: "pdf" | "image" | string
    originalname?: string
    filename?: string
    mimeType?: string
    ocrConfidence?: number
    loc?: { pageNumber?: number }
  }
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  sources?: ChatSource[]
  createdAt?: string
}

export type ChatSummary = {
  id: string
  title: string
  isReadable: boolean
  messageCount: number
  createdAt: string
  updatedAt: string
}

export type ChatDetail = {
  id: string
  title: string
  isReadable: boolean
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  userId?: string
  readOnly: boolean
}

async function authFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
}

export function listChats(token: string): Promise<ChatSummary[]> {
  return authFetch("/chats", token)
}

export function getChat(token: string, id: string): Promise<ChatDetail> {
  return authFetch(`/chats/${id}`, token)
}

export function createChat(
  token: string,
  body?: { title?: string; isReadable?: boolean }
): Promise<ChatDetail> {
  return authFetch("/chats", token, {
    method: "POST",
    body: JSON.stringify(body || {}),
  })
}

export function updateChat(
  token: string,
  id: string,
  body: { title?: string; isReadable?: boolean }
): Promise<Pick<ChatDetail, "id" | "title" | "isReadable" | "updatedAt">> {
  return authFetch(`/chats/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function appendMessages(
  token: string,
  id: string,
  messages: ChatMessage[]
): Promise<ChatDetail> {
  return authFetch(`/chats/${id}/messages`, token, {
    method: "POST",
    body: JSON.stringify({ messages }),
  })
}

export function deleteChat(token: string, id: string): Promise<{ ok: boolean }> {
  return authFetch(`/chats/${id}`, token, { method: "DELETE" })
}

export async function searchPdf(token: string, question: string) {
  const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(question)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Search failed")
  return data as { answer: string; sources: ChatSource[] }
}

/** Fetch a stored PDF/image with auth and open it (PDFs jump to #page=N). */
export async function openSourceFile(
  token: string,
  sourcePath: string,
  options?: { pageNumber?: number; type?: string }
) {
  const res = await fetch(`${API_URL}/files?path=${encodeURIComponent(sourcePath)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || "Could not open file")
  }

  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const isPdf = options?.type === "pdf" || sourcePath.toLowerCase().endsWith(".pdf")
  const page = options?.pageNumber && options.pageNumber > 0 ? options.pageNumber : 1
  window.open(
    isPdf ? `${objectUrl}#page=${page}` : objectUrl,
    "_blank",
    "noopener,noreferrer"
  )

  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

/** @deprecated use openSourceFile */
export async function openPdfAtPage(token: string, sourcePath: string, pageNumber?: number) {
  return openSourceFile(token, sourcePath, { pageNumber, type: "pdf" })
}
