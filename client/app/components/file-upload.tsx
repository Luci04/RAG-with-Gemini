"use client"
import { UploadCloud } from "lucide-react"

export function FileUpload() {
  const handleUpload = () => {
    const fileInput = document.createElement("input")
    fileInput.type = "file"
    fileInput.accept = "application/pdf"
    fileInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const formData = new FormData()
      formData.append("file", file)

      try {
        const res = await fetch("http://localhost:8000/upload/pdf", {
          method: "POST",
          body: formData,
        })
        const data = await res.json()
        console.log(data)
      } catch (err) {
        console.error("Upload failed:", err)
      }
    }
    fileInput.click()
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <UploadCloud className="w-10 h-10" onClick={handleUpload} />
    </div>
  )
}
