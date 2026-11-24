import type { Metadata } from 'next'
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'
import { Geist, Geist_Mono } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Chat with PDF',
  description: 'Upload PDFs and chat with them using RAG',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex h-full flex-col overflow-hidden">
        <ClerkProvider>
          <Suspense>
            <Show when="signed-out">
              <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 px-6">
                <div className="text-center">
                  <h1 className="text-3xl font-bold tracking-tight">Chat with PDF</h1>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Sign in to upload documents and ask questions
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <SignInButton mode="modal">
                    <button className="h-11 rounded-full border border-gray-300 px-5 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
                      Sign In
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="h-11 rounded-full bg-gray-900 px-5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white">
                      Sign Up
                    </button>
                  </SignUpButton>
                </div>
              </div>
            </Show>

            <Show when="signed-in">
              <header className="flex h-16 shrink-0 items-center justify-end gap-4 p-4">
                <UserButton />
              </header>
              <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
            </Show>
          </Suspense>
        </ClerkProvider>
      </body>
    </html>
  )
}
