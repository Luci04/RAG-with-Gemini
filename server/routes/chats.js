import { Router } from "express"
import { getAuth } from "@clerk/express"
import { Chat } from "../models/Chat.js"

const router = Router()

function requireUser(req, res, next) {
  const { userId } = getAuth(req)
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized — sign in and send a Bearer token" })
  }
  next()
}

router.use(requireUser)

/** List chats owned by the current user */
router.get("/", async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const chats = await Chat.find({ userId })
      .select("title isReadable createdAt updatedAt messages")
      .sort({ updatedAt: -1 })
      .lean()

    res.json(
      chats.map((chat) => ({
        id: chat._id.toString(),
        title: chat.title,
        isReadable: chat.isReadable,
        messageCount: chat.messages?.length ?? 0,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      }))
    )
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

/** Create a new chat for the current user */
router.post("/", async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const title = String(req.body?.title || "New chat").slice(0, 120)
    const isReadable = Boolean(req.body?.isReadable)

    const chat = await Chat.create({
      userId,
      title,
      isReadable,
      messages: [],
    })

    res.status(201).json({
      id: chat._id.toString(),
      title: chat.title,
      isReadable: chat.isReadable,
      messages: [],
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      readOnly: false,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

/** Get one chat — owner full access, or any signed-in user if isReadable */
router.get("/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const chat = await Chat.findById(req.params.id).lean()
    if (!chat) return res.status(404).json({ error: "Chat not found" })

    const isOwner = chat.userId === userId
    if (!isOwner && !chat.isReadable) {
      return res.status(403).json({ error: "This chat is private" })
    }

    res.json({
      id: chat._id.toString(),
      title: chat.title,
      isReadable: chat.isReadable,
      messages: chat.messages,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      userId: chat.userId,
      readOnly: !isOwner,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

/** Update title / isReadable — owner only */
router.patch("/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const chat = await Chat.findById(req.params.id)
    if (!chat) return res.status(404).json({ error: "Chat not found" })
    if (chat.userId !== userId) {
      return res.status(403).json({ error: "Only the owner can update this chat" })
    }

    if (typeof req.body?.title === "string") {
      chat.title = req.body.title.trim().slice(0, 120) || chat.title
    }
    if (typeof req.body?.isReadable === "boolean") {
      chat.isReadable = req.body.isReadable
    }

    await chat.save()

    res.json({
      id: chat._id.toString(),
      title: chat.title,
      isReadable: chat.isReadable,
      updatedAt: chat.updatedAt,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

/** Append messages — owner only */
router.post("/:id/messages", async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const chat = await Chat.findById(req.params.id)
    if (!chat) return res.status(404).json({ error: "Chat not found" })
    if (chat.userId !== userId) {
      return res.status(403).json({ error: "Read-only chat — cannot add messages" })
    }

    const incoming = Array.isArray(req.body?.messages) ? req.body.messages : [req.body]
    const toAdd = incoming
      .filter((m) => m && m.content && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({
        id: m.id || crypto.randomUUID(),
        role: m.role,
        content: String(m.content),
        sources: Array.isArray(m.sources) ? m.sources : [],
        createdAt: new Date(),
      }))

    if (toAdd.length === 0) {
      return res.status(400).json({ error: "No valid messages provided" })
    }

    chat.messages.push(...toAdd)

    // Auto-title from first user message
    if (chat.title === "New chat") {
      const firstUser = chat.messages.find((m) => m.role === "user")
      if (firstUser) {
        chat.title = firstUser.content.slice(0, 60)
      }
    }

    await chat.save()

    res.json({
      id: chat._id.toString(),
      title: chat.title,
      isReadable: chat.isReadable,
      messages: chat.messages,
      updatedAt: chat.updatedAt,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

/** Delete chat — owner only */
router.delete("/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const chat = await Chat.findById(req.params.id)
    if (!chat) return res.status(404).json({ error: "Chat not found" })
    if (chat.userId !== userId) {
      return res.status(403).json({ error: "Only the owner can delete this chat" })
    }

    await chat.deleteOne()
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

export default router
