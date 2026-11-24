import "dotenv/config"
import { Worker } from "bullmq"
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { TaskType } from "@google/generative-ai"
import { QdrantVectorStore } from "@langchain/qdrant"
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"

// ── Tunable knobs (re-upload PDF after changing these) ──────────────────────
const CHUNK_SIZE = 800 // chars per chunk. Smaller = more precise matches, more chunks/cost. Larger = more context per hit, fuzzier match.
const CHUNK_OVERLAP = 150 // chars shared between neighbors. Helps answers that span a chunk boundary. ~10–20% of CHUNK_SIZE is a good start.
const COLLECTION = "pdf-docs" // must match index.js search collection name
const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333"
// ────────────────────────────────────────────────────────────────────────────

const worker = new Worker(
  "pdf-processing",
  async (job) => {
    const data = typeof job.data === "string" ? JSON.parse(job.data) : job.data

    // 1) Load PDF → one Document per page (pageContent + metadata.page)
    const docs = await new PDFLoader(data.path).load()

    // 2) Split pages into overlapping text chunks for retrieval
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    })
    const chunks = await splitter.splitDocuments(docs)
    console.log(`pages=${docs.length} chunks=${chunks.length}`)

    // 3) Embedding model turns each chunk into a vector (must match search model)
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      model: "gemini-embedding-001",
      taskType: TaskType.RETRIEVAL_DOCUMENT, // DOCUMENT at index time; QUERY at search time
    })

    // 4) Store chunk vectors in Qdrant so /search can find nearest neighbors
    await QdrantVectorStore.fromDocuments(chunks, embeddings, {
      url: QDRANT_URL,
      collectionName: COLLECTION,
    })

    console.log(`stored ${chunks.length} chunks → ${COLLECTION}`)
  },
  {
    concurrency: 1, // keep 1 while learning; raise later if Redis/Qdrant can handle it
    connection: { host: "localhost", port: 6379 },
  }
)

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message)
})
