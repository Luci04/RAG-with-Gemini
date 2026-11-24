import "dotenv/config"
import fs from "fs"
import { Worker } from "bullmq"
import { Document } from "@langchain/core/documents"
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { TaskType } from "@google/generative-ai"
import { QdrantVectorStore } from "@langchain/qdrant"
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import Tesseract from "tesseract.js"

const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 150
const COLLECTION = "pdf-docs"
const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333"

async function getStore() {
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-embedding-001",
    taskType: TaskType.RETRIEVAL_DOCUMENT,
  })
  const store = await QdrantVectorStore.fromExistingCollection(embeddings, {
    url: QDRANT_URL,
    collectionName: COLLECTION,
  })
  try {
    await store.client.createPayloadIndex(COLLECTION, {
      field_name: "metadata.userId",
      field_schema: "keyword",
    })
  } catch {
    // index may already exist
  }
  try {
    await store.client.createPayloadIndex(COLLECTION, {
      field_name: "metadata.type",
      field_schema: "keyword",
    })
  } catch {
    // index may already exist
  }
  return store
}

async function indexChunks(chunks) {
  const store = await getStore()
  await store.addDocuments(chunks)
  return chunks.length
}

async function processPdf(data) {
  if (!data.path || !fs.existsSync(data.path)) {
    throw new Error(`PDF not found at path: ${data.path}`)
  }

  const docs = await new PDFLoader(data.path).load()
  if (!docs.length) throw new Error("PDFLoader returned 0 pages")

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  })
  const chunks = await splitter.splitDocuments(docs)

  for (const chunk of chunks) {
    chunk.metadata = {
      ...chunk.metadata,
      userId: data.userId,
      type: "pdf",
      filename: data.filename,
      originalname: data.originalname,
      source: data.path,
    }
  }

  console.log(`pdf user=${data.userId} pages=${docs.length} chunks=${chunks.length}`)
  await indexChunks(chunks)
  console.log(`stored ${chunks.length} PDF chunks for ${data.userId}`)
}

async function processImage(data) {
  if (!data.path || !fs.existsSync(data.path)) {
    throw new Error(`Image not found at path: ${data.path}`)
  }

  console.log(`ocr start user=${data.userId} file=${data.path}`)
  const result = await Tesseract.recognize(data.path, "eng", {
    logger: (info) => {
      if (info.status === "recognizing text") {
        console.log(`ocr ${Math.round((info.progress || 0) * 100)}%`)
      }
    },
  })

  const text = (result.data.text || "").trim()
  if (!text) {
    throw new Error("OCR extracted no text from image")
  }

  const doc = new Document({
    pageContent: text,
    metadata: {
      userId: data.userId,
      type: "image",
      filename: data.filename,
      originalname: data.originalname,
      source: data.path,
      mimeType: data.mimeType || "image/*",
      ocrConfidence: result.data.confidence,
    },
  })

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  })
  const chunks = await splitter.splitDocuments([doc])

  // Keep image metadata on every chunk
  for (const chunk of chunks) {
    chunk.metadata = {
      ...chunk.metadata,
      userId: data.userId,
      type: "image",
      filename: data.filename,
      originalname: data.originalname,
      source: data.path,
      mimeType: data.mimeType || "image/*",
      ocrConfidence: result.data.confidence,
    }
  }

  console.log(
    `image user=${data.userId} chars=${text.length} chunks=${chunks.length} confidence=${result.data.confidence}`
  )
  await indexChunks(chunks)
  console.log(`stored ${chunks.length} image OCR chunks for ${data.userId}`)
}

const worker = new Worker(
  "pdf-processing",
  async (job) => {
    const data = typeof job.data === "string" ? JSON.parse(job.data) : job.data
    if (!data.userId) {
      throw new Error("Missing userId on job — reject unscoped indexing")
    }

    if (job.name === "process-image" || data.type === "image") {
      await processImage(data)
      return
    }

    await processPdf(data)
  },
  {
    concurrency: 1,
    connection: { host: "localhost", port: 6379 },
  }
)

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} (${job?.name}) failed:`, err.message)
})
