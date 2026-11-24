# RAG with Gemini

Chat with your **PDFs** and **images** using Retrieval-Augmented Generation (RAG).

Upload a document → text is extracted (PDF parse or image OCR) → chunked → embedded with **Gemini** → stored in **Qdrant**. Ask questions in a chat UI; answers are grounded in your files, with clickable source citations. Auth is handled by **Clerk**, chats are saved in **MongoDB**, and heavy work runs in the background via **BullMQ + Valkey/Redis**.

---

## Features

- Clerk sign-in / sign-up (app is gated until authenticated)
- PDF upload + image upload (OCR via Tesseract.js)
- Async processing queue (BullMQ)
- Gemini embeddings (`gemini-embedding-001`) + Gemini answers
- Per-user isolation (`userId` on vectors and uploads)
- Chat history in MongoDB
- Share chats as **read-only** (`isReadable`)
- Source citations (open PDF at page / open image)
- Drag-and-drop upload with progress bar
- Voice input (browser speech recognition)

---

## Architecture

```text
┌─────────────┐     Bearer token      ┌──────────────────┐
│  Next.js    │ ───────────────────►  │  Express API     │
│  (client)   │                       │  :8000           │
│  Clerk UI   │                       │  /upload /search │
└─────────────┘                       │  /chats /files   │
                                      └────────┬─────────┘
                                               │ enqueue job
                                               ▼
                                      ┌──────────────────┐
                                      │  BullMQ worker   │
                                      │  PDF load / OCR  │
                                      │  chunk + embed   │
                                      └────────┬─────────┘
                                               │
                    ┌──────────────┬───────────┴───────────┐
                    ▼              ▼                       ▼
               Valkey/Redis     Qdrant                  MongoDB
               (queue :6379)    (vectors :6333)         (chats)
```

### Request flow (ask a question)

1. Client sends `GET /search?q=...` with Clerk `Authorization: Bearer <token>`
2. API verifies the token and gets `userId`
3. Query is embedded and searched in Qdrant **only for that user’s chunks**
4. Top chunks are sent to Gemini as context
5. Answer + sources are returned; client can save them to a chat in MongoDB

### Upload flow

1. Client uploads PDF → `POST /upload/pdf` or image → `POST /upload/image`
2. File is stored under `server/uploads/{pdf|images}/<userId>/`
3. A BullMQ job is queued
4. Worker extracts text → splits into chunks → embeds → writes to Qdrant with `metadata.userId`

---

## Project structure

```text
.
├── docker-compose.yml      # Valkey (Redis) + Qdrant
├── client/                 # Next.js frontend (Clerk + chat UI)
│   ├── app/
│   │   ├── components/     # Chat, history, file upload
│   │   └── lib/api.ts      # API helpers
│   └── middleware.ts       # Clerk middleware
└── server/                 # Express API + BullMQ worker
    ├── index.js            # HTTP API
    ├── worker.js           # PDF / image indexing worker
    ├── db.js               # MongoDB connection
    ├── models/Chat.js
    ├── routes/chats.js
    └── uploads/            # Local files (gitignored)
```

---

## Prerequisites

- **Node.js** 20+ (22 recommended)
- **Docker Desktop** (for Valkey + Qdrant)
- Accounts / keys:
  - [Clerk](https://clerk.com) (publishable + secret keys)
  - [Google AI Studio](https://aistudio.google.com/apikey) (`GOOGLE_API_KEY` for Gemini)
  - [MongoDB Atlas](https://www.mongodb.com/atlas) (or local MongoDB)

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Luci04/RAG-with-Gemini.git
cd RAG-with-Gemini

cd client && npm install && cd ..
cd server && npm install && cd ..
```

### 2. Start infrastructure

From the repo root:

```bash
docker compose up -d
```

This starts:

| Service | Port | Purpose          |
|---------|------|------------------|
| Valkey  | 6379 | BullMQ broker    |
| Qdrant  | 6333 | Vector database  |

### 3. Configure environment

**`client/.env`**

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**`server/.env`**

```env
GOOGLE_API_KEY=your_google_ai_studio_key
CLERK_PUBLISHABLE_KEY=pk_test_...   # same Clerk app as client
CLERK_SECRET_KEY=sk_test_...
MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/chat-with-pdf?retryWrites=true&w=majority
QDRANT_URL=http://localhost:6333
CLIENT_ORIGIN=http://localhost:3000
```

> Never commit `.env` files. They are gitignored.

### 4. Run the apps (3 terminals)

**Terminal A — API**

```bash
cd server
npm run dev
# → http://localhost:8000
```

**Terminal B — Worker** (required for indexing uploads)

```bash
cd server
npm run worker
```

**Terminal C — Frontend**

```bash
cd client
npm run dev
# → http://localhost:3000
```

### 5. Use the app

1. Open [http://localhost:3000](http://localhost:3000)
2. Sign up / sign in with Clerk
3. Upload a **PDF** or **image** (wait until the worker finishes — check worker logs)
4. Ask questions in the chat panel
5. Expand **Sources** to open the cited PDF page or image
6. Optionally toggle **Shared** to copy a read-only chat link (`/?chat=<id>`)

---

## Important API routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/upload/pdf` | Bearer | Upload PDF → queue indexing |
| `POST` | `/upload/image` | Bearer | Upload image → OCR + index |
| `GET`  | `/search?q=` | Bearer | RAG Q&A for current user |
| `GET`  | `/files?path=` | Bearer | Download/open owned file |
| `GET`  | `/chats` | Bearer | List your chats |
| `POST` | `/chats` | Bearer | Create chat |
| `GET`  | `/chats/:id` | Bearer | Get chat (owner, or anyone if `isReadable`) |
| `PATCH`| `/chats/:id` | Bearer | Update title / `isReadable` (owner) |
| `POST` | `/chats/:id/messages` | Bearer | Append messages (owner) |
| `DELETE` | `/chats/:id` | Bearer | Delete chat (owner) |

All protected routes expect:

```http
Authorization: Bearer <Clerk session JWT>
```

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js, React, Tailwind, Clerk |
| Backend | Express, Multer, BullMQ |
| Auth | Clerk (Next.js + `@clerk/express`) |
| Embeddings / LLM | Google Gemini via LangChain / Generative AI SDK |
| Vector DB | Qdrant |
| Queue | Valkey/Redis + BullMQ |
| OCR | Tesseract.js |
| Chat DB | MongoDB (Mongoose) |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Upload works but search finds nothing | Ensure **worker** is running; re-upload after sign-in so chunks get `userId` |
| `Unauthorized` on API | Sign in; client must send Clerk Bearer token |
| Docker / `docker` not found | Start Docker Desktop; ensure `~/.docker/bin` is on `PATH` |
| Mongo connection errors | Allow your IP in Atlas Network Access; check `MONGODB_URI` |
| Qdrant errors | `docker compose ps` and open http://localhost:6333/dashboard |
| OCR weak results | Use sharp, high-contrast images with clear printed text |

---

## Security notes

- Do not commit secrets (`.env`, API keys, Mongo passwords)
- Search is scoped by Clerk `userId` — re-upload documents after enabling auth so vectors are tagged
- Shared chats (`isReadable: true`) are **read-only** for other signed-in users

---

## License

ISC
