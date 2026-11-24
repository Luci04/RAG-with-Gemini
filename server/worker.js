import "dotenv/config"
import { Worker } from "bullmq"
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { TaskType } from "@google/generative-ai"
import { QdrantVectorStore } from "@langchain/qdrant"
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"

// ── Tunable knobs (re-upload PDF after changing these) ──────────────────────
const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 150
const COLLECTION = "pdf-docs"
const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333"
// ────────────────────────────────────────────────────────────────────────────

const worker = new Worker(
  "pdf-processing",
  async (job) => {
    const data = typeof job.data === "string" ? JSON.parse(job.data) : job.data
    if (!data.userId) {
      throw new Error("Missing userId on job — reject unscoped indexing")
    }

    const docs = await new PDFLoader(data.path).load()

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    })
    const chunks = await splitter.splitDocuments(docs)

    // Tag every chunk with the owning user for filtered search later
    for (const chunk of chunks) {
      chunk.metadata = {
        ...chunk.metadata,
        userId: data.userId,
        filename: data.filename,
        originalname: data.originalname,
      }
    }

    console.log(`user=${data.userId} pages=${docs.length} chunks=${chunks.length}`)

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      model: "gemini-embedding-001",
      taskType: TaskType.RETRIEVAL_DOCUMENT,
    })

    await QdrantVectorStore.fromDocuments(chunks, embeddings, {
      url: QDRANT_URL,
      collectionName: COLLECTION,
    })

    console.log(`stored ${chunks.length} chunks for ${data.userId} → ${COLLECTION}`)
  },
  {
    concurrency: 1,
    connection: { host: "localhost", port: 6379 },
  }
)

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message)
})
