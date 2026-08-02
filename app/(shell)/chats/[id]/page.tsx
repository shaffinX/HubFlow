import { ChatConversation } from "@/components/features/chat/chat-conversation"

type Ctx = { params: Promise<{ id: string }> }

export default async function ChatPage({ params }: Ctx) {
  const { id } = await params
  return <ChatConversation chatId={id} />
}
