import mongoose from "mongoose"

const messageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    sources: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const chatSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, default: "New chat" },
    isReadable: { type: Boolean, default: false, index: true },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
)

chatSchema.index({ userId: 1, updatedAt: -1 })

export const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema)
