"use client"

import { useAuth } from "@clerk/nextjs"
import { ChangeEvent, DragEvent, useRef, useState } from "react"
import { CheckCircle2, FileText, Loader2, UploadCloud, XCircle } from "lucide-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

type UploadStatus = "idle" | "uploading" | "success" | "error"

export function FileUpload() {
  const { getToken } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<UploadStatus>("idle")
  const [message, setMessage] = useState<string | null>(null)

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = ""
  }

  const uploadFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      setStatus("error")
      setMessage("Only PDF files are supported.")
      setFileName(file.name)
      return
    }

    const token = await getToken()
    if (!token) {
      setStatus("error")
      setMessage("Not signed in — cannot upload.")
      setFileName(file.name)
      return
    }

    setFileName(file.name)
    setStatus("uploading")
    setProgress(0)
    setMessage("Uploading…")

    const formData = new FormData()
    formData.append("file", file)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${API_URL}/upload/pdf`)
    xhr.setRequestHeader("Authorization", `Bearer ${token}`)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      const percent = Math.round((event.loaded / event.total) * 100)
      setProgress(percent)
    }

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || "{}")
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(100)
          setStatus("success")
          setMessage(data.jobId ? `Uploaded · job ${data.jobId}` : "Uploaded successfully")
        } else {
          setStatus("error")
          setMessage(data.error || (xhr.status === 401 ? "Unauthorized" : "Upload failed"))
        }
      } catch {
        setStatus("error")
        setMessage("Upload failed")
      }
      resetInput()
    }

    xhr.onerror = () => {
      setStatus("error")
      setMessage("Network error. Is the server running?")
      resetInput()
    }

    xhr.send(formData)
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void uploadFile(file)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    if (status === "uploading") return
    const file = e.dataTransfer.files?.[0]
    if (file) void uploadFile(file)
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => status !== "uploading" && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && status !== "uploading") {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragging(false)
        }}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
          dragging
            ? "border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-gray-900/40"
            : "border-gray-300 hover:border-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-500 dark:hover:bg-gray-900/30"
        } ${status === "uploading" ? "pointer-events-none opacity-80" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={onFileChange}
        />

        <UploadCloud className="mb-3 h-10 w-10 text-gray-700 dark:text-gray-200" />
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {dragging ? "Drop your PDF here" : "Drag & drop a PDF here"}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">or click to browse · PDF only</p>
      </div>

      {(status !== "idle" || fileName) && (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <div className="mb-3 flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{fileName}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                {status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {status === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                {status === "error" && <XCircle className="h-3.5 w-3.5 text-red-600" />}
                {message}
              </p>
            </div>
            {status === "uploading" && (
              <span className="text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300">
                {progress}%
              </span>
            )}
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                status === "error"
                  ? "bg-red-500"
                  : status === "success"
                    ? "bg-green-500"
                    : "bg-gray-900 dark:bg-gray-100"
              }`}
              style={{ width: `${status === "error" ? 100 : progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
