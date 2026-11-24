import { Suspense } from "react"
import { HomeShell } from "./components/home-shell"

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-gray-400">
          Loading…
        </div>
      }
    >
      <HomeShell />
    </Suspense>
  )
}
