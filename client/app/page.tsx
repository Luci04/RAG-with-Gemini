import { Chat } from "./components/chat"
import { FileUpload } from "./components/file-upload"

export default function Home() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex w-1/2 flex-col items-center justify-center px-8">
        <FileUpload />
      </div>
      <div className="flex h-full min-h-0 w-1/2 flex-col overflow-hidden border-l border-gray-200 px-6 py-4 dark:border-gray-800">
        <Chat />
      </div>
    </div>
  )
}
