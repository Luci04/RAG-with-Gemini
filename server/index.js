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

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)

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
  url: process.env.QDRANT_URL ?? "http://localhost:6333",
  collectionName: "pdf-docs",
})

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { userId } = getAuth(req)
    const dir = path.join("uploads/pdf", userId || "anonymous")
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
  next()
}

app.get("/", (req, res) => {
  res.send("Hello World")
})

app.get("/search", requireUser, async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const query = String(req.query.q || "").trim()
    if (!query) {
      return res.status(400).json({ error: "Missing query parameter q" })
    }

    // Only search this user's chunks
    const docs = await vectorStore.similaritySearch(query, 4, {
      must: [{ key: "metadata.userId", match: { value: userId } }],
    })

    const context = docs.map((d, i) => `[${i + 1}] ${d.pageContent}`).join("\n\n")

    const prompt = `You are a helpful assistant. Answer ONLY using the documents below.
If the answer is not in the documents, say "I don't know".

Documents:
${context}

Question: ${query}

Answer:`

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
    const result = await model.generateContent(prompt)
    const answer = result.response.text()

    res.json({
      answer,
      userId,
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
  const { userId } = getAuth(req)

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" })
  }

  const job = await pdfQueue.add(
    "process-pdf",
    JSON.stringify({
      userId,
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: req.file.path,
      source: req.file.destination,
    })
  )

  res.json({ message: "File uploaded", jobId: job.id, userId })
})

app.listen(8000, () => {
  console.log("Server is running on port 8000")
})
