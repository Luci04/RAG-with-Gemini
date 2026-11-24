import { Worker } from "bullmq"
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { QdrantVectorStore } from "@langchain/qdrant";
import {PDFLoader} from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";


const worker = new Worker("pdf-processing", async (job) => {
  const data = JSON.parse(job.data)
  /*
  * Take Path:
  * Load PDF Document
  * Create Chunks
  * Embedding of each chuks: 
  * store the chunk in qdrant db
  */
  
  //Load PDF Document
  const loader = new PDFLoader(data.path)
  const docs = await loader.load()
  const textsplitters = new CharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 0,
  })
  console.log(docs[0])
  const chunks = await textsplitters.splitDocuments(docs[0])
  console.log(chunks)
},{
    concurrency: 10,
    connection: {
        host: "localhost",
        port: 6379,
  },
})