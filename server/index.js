import "dotenv/config"
import express from "express"
import cors from "cors"
import fs from "fs"
import multer from "multer"
import path from "path"
import { Queue } from "bullmq"
import { clerkMiddleware, getAuth } from "@clerk/express"
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai"
import { QdrantVectorStore } from "@langchain/qdrant"
import { connectDB } from "./db.js"
import chatsRouter from "./routes/chats.js"

await connectDB()

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333"
const COLLECTION = "pdf-docs"

const app = express()
const pdfQueue = new Queue("pdf-processing", {
  connection: {
    host: "localhost",
    port: 6379,
  },
})

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "gemini-embedding-001",
  taskType: TaskType.RETRIEVAL_QUERY,
})

const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
  url: QDRANT_URL,
  collectionName: COLLECTION,
})

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.authUserId || "anonymous"
    const dir = path.join("uploads/pdf", userId)
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext)
    cb(null, `${base}-${Date.now()}${ext}`)
  },
})

const upload = multer({ storage })

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000",
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type"],
  })
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(clerkMiddleware())

function requireUser(req, res, next) {
  const { userId } = getAuth(req)
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized — sign in and send a Bearer token" })
  }
  req.authUserId = userId
  next()
}

async function searchUserDocs(query, userId, k = 4) {
  // 1) Preferred: chunks tagged with this userId
  let docs = await vectorStore.similaritySearch(query, k, {
    must: [{ key: "metadata.userId", match: { value: userId } }],
  })

  if (docs.length > 0) return { docs, mode: "userId" }

  // 2) Path-scoped uploads: uploads/pdf/<userId>/...
  const broad = await vectorStore.similaritySearch(query, Math.max(k * 3, 12))
  docs = broad.filter((d) => {
    const source = String(d.metadata?.source || "")
    const metaUser = d.metadata?.userId
    return metaUser === userId || source.includes(`/uploads/pdf/${userId}/`) || source.includes(`uploads/pdf/${userId}/`)
  })
  if (docs.length > 0) return { docs: docs.slice(0, k), mode: "path" }

  // 3) Legacy index (no userId on any chunk yet) — allow so demo still works
  const hasAnyUserScoped = broad.some((d) => d.metadata?.userId)
  if (!hasAnyUserScoped) {
    console.warn(`[search] legacy Qdrant index has no userId tags; returning unscoped hits for ${userId}`)
    return { docs: broad.slice(0, k), mode: "legacy" }
  }

  return { docs: [], mode: "none" }
}

app.get("/", (req, res) => {
  res.send("Hello World")
})

app.use("/chats", chatsRouter)

app.get("/search", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const query = String(req.query.q || "").trim()
    if (!query) {
      return res.status(400).json({ error: "Missing query parameter q" })
    }

    const { docs, mode } = await searchUserDocs(query, userId, 4)
    console.log(`[search] user=${userId} mode=${mode} hits=${docs.length} q="${query}"`)

    if (docs.length === 0) {
      return res.json({
        answer:
          "I couldn't find any indexed documents for your account. Please re-upload your PDF and wait for processing to finish, then try again.",
        userId,
        sources: [],
        retrievalMode: mode,
      })
    }

    const context = docs.map((d, i) => `[${i + 1}] ${d.pageContent}`).join("\n\n")

    const prompt = `You are a helpful assistant. Answer the question using the documents below.
Prefer information from the documents. If the documents are unrelated to the question, say "I don't know".

Documents:
${context}

Question: ${query}

Answer:`

    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" })
    const result = await model.generateContent(prompt)
    const answer = result.response.text()

    res.json({
      answer,
      userId,
      retrievalMode: mode,
      sources: docs.map((d) => ({
        content: d.pageContent,
        metadata: d.metadata,
      })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post("/upload/pdf", requireUser, upload.single("file"), async (req, res) => {
  const userId = req.authUserId

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" })
  }

  const job = await pdfQueue.add("process-pdf", {
    userId,
    filename: req.file.filename,
    originalname: req.file.originalname,
    path: req.file.path,
    source: req.file.destination,
  })

  res.json({ message: "File uploaded", jobId: job.id, userId, path: req.file.path })
})

/** Authenticated PDF open — used by citation links (page jump via #page=N in the browser) */
app.get("/files/pdf", requireUser, async (req, res) => {
  try {
    const userId = req.authUserId
    const rawPath = String(req.query.path || "").trim()
    if (!rawPath) {
      return res.status(400).json({ error: "Missing path query param" })
    }

    // Normalize and lock to uploads/pdf
    const uploadsRoot = path.resolve("uploads/pdf")
    const absolute = path.resolve(rawPath)
    if (!absolute.startsWith(uploadsRoot + path.sep) && absolute !== uploadsRoot) {
      return res.status(403).json({ error: "Invalid file path" })
    }

    // Owner check: file under uploads/pdf/<userId>/... OR legacy flat file (any signed-in owner of legacy)
    const relative = path.relative(uploadsRoot, absolute)
    const topFolder = relative.split(path.sep)[0]
    const isUserScoped = topFolder === userId
    const isLegacyFlat = !relative.includes(path.sep) // file directly in uploads/pdf
    if (!isUserScoped && !isLegacyFlat) {
      return res.status(403).json({ error: "You do not have access to this file" })
    }

    if (!fs.existsSync(absolute)) {
      return res.status(404).json({ error: "File not found on disk — re-upload the PDF" })
    }

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(absolute)}"`)
    fs.createReadStream(absolute).pipe(res)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.listen(8000, () => {
  console.log("Server is running on port 8000")
})
