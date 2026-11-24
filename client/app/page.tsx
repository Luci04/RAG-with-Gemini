import { FileUpload } from "./components/file-upload";

export default function Home() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full">
      <div className="flex w-1/2 flex-col items-center justify-center px-8">
        <FileUpload />
      </div>
      <div className="flex w-1/2 flex-col items-center justify-center border-l border-gray-200 px-8 dark:border-gray-800">
        <h1 className="text-4xl font-bold tracking-tight">Welcome to the Home Page</h1>
      </div>
    </div>
  );
}
