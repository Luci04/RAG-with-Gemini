import express from "express"
import cors from "cors"
import multer from "multer"
import path from "path"
import { Queue } from "bullmq"  // for background processing



const app = express()
const pdfQueue = new Queue("pdf-processing",{
  connection: {
    host: "localhost",
    port: 6379,
  },
})

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

app.post("/upload/pdf", upload.single("file"), async(req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" })
  }
  const job = await pdfQueue.add("process-pdf",JSON.stringify({
    filename: req.file.filename,
    originalname: req.file.originalname,
    path: req.file.path,
    source: req.file.destination,
  }))
  res.json({ message: "File uploaded", jobId: job.id })
})

app.listen(8000, () => {
  console.log("Server is running on port 8000")
})
