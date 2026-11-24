import "dotenv/config"
import express from "express"
import cors from "cors"
import multer from "multer"
import path from "path"
import { Queue } from "bullmq"
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

// Must use the SAME embedding model as worker.js (gemini-embedding-001)
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "gemini-embedding-001",
  taskType: TaskType.RETRIEVAL_QUERY,
})

const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
  url: process.env.QDRANT_URL ?? "http://localhost:6333",
  collectionName: "pdf-docs",
})

// k = how many chunks to return. Higher = more context, more noise.
const retriever = vectorStore.asRetriever({ k: 4 })

const storage = multer.diskStorage({
  destination: "uploads/pdf",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext)
    cb(null, `${base}-${Date.now()}${ext}`)
  },
})

const upload = multer({ storage })

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get("/", (req, res) => {
  res.send("Hello World")
})

app.get("/search", async (req, res) => {
  try {
    // 1) User question (?q=... or hardcoded for testing)
    const query = req.query.q || "Who is Avinash Shukla"

    // 2) Retrieve similar chunks from Qdrant (embeddings → nearest neighbors)
    const docs = await retriever.invoke(query)
    const context = docs.map((d, i) => `[${i + 1}] ${d.pageContent}`).join("\n\n")

    // 3) Build one prompt: instructions + retrieved docs + question
    const prompt = `You are a helpful assistant. Answer ONLY using the documents below.
If the answer is not in the documents, say "I don't know".

Documents:
${context}

Question: ${query}

Answer:`

    // 4) Ask Gemini to write the final answer
    const model = genAI.getGenerativeModel({  model: "gemini-3.5-flash-lite"})
    const result = await model.generateContent(prompt)
    const answer = result.response.text()

    res.json({
      answer,
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

app.post("/upload/pdf", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" })
  }
  const job = await pdfQueue.add(
    "process-pdf",
    JSON.stringify({
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: req.file.path,
      source: req.file.destination,
    })
  )
  res.json({ message: "File uploaded", jobId: job.id })
})

app.listen(8000, () => {
  console.log("Server is running on port 8000")
})
