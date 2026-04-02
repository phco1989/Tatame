import { create } from "zustand";
import type { Conversation, Message, ConversationTopic, UserRole } from "@/types";

interface ChatState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  activeConversationId: string | null;
  addConversation: (conversation: Conversation) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateConversationStatus: (conversationId: string, status: Conversation["status"]) => void;
  assignManager: (conversationId: string, managerId: string, managerName: string) => void;
  markMessagesAsRead: (conversationId: string) => void;
  setActiveConversation: (conversationId: string | null) => void;
  getUnreadCount: () => number;
  getConversationForUser: (userId: string) => Conversation | undefined;
  getMessagesForConversation: (conversationId: string) => Message[];
  // Security: Role-based data access filters
  getConversationsForUser: (userId: string, userRole: UserRole, assignedToId?: string) => Conversation[];
}

// Bot responses for different topics
export const BOT_RESPONSES: Record<ConversationTopic, string> = {
  booking: "I'd be happy to help you book a class! You can tap the 'Book' tab below to schedule your training session. Would you like me to explain our class types?",
  prices: "Here are our prices:\n\n- Drop-in Class: $35\n- Private Class: $100\n- 8-Class Package: $200\n- 12-Class Package: $270\n- Monthly Unlimited: $150\n\nWould you like to book now?",
  schedule: "Here's our weekly schedule:\n\n- Morning classes: 7-8:30 AM\n- Midday classes: 12-1:30 PM\n- Evening classes: 6-7:30 PM\n\nGi and No-Gi classes available. Check the schedule tab for details!",
  reschedule: "I understand you need to reschedule. Please let us know your booking details and preferred new date/time, and our team will help you out!",
  other: "Thanks for reaching out! A team member will respond shortly. In the meantime, feel free to share more details about your question.",
};

export const TOPIC_LABELS: Record<ConversationTopic, string> = {
  booking: "Book a class",
  prices: "Prices & packages",
  schedule: "Class schedule",
  reschedule: "Reschedule",
  other: "Talk to team",
};

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: {},
  activeConversationId: null,

  addConversation: (conversation) => {
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      messages: {
        ...state.messages,
        [conversation.id]: [],
      },
    }));
  },

  addMessage: (conversationId, message) => {
    set((state) => {
      const conversationMessages = state.messages[conversationId] || [];
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...conversationMessages, message],
        },
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessageAt: message.timestamp,
                unreadCount: message.sender !== "student" ? c.unreadCount + 1 : c.unreadCount,
              }
            : c
        ),
      };
    });
  },

  updateConversationStatus: (conversationId, status) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, status } : c
      ),
    }));
  },

  assignManager: (conversationId, managerId, managerName) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, assignedManagerId: managerId, assignedManagerName: managerName }
          : c
      ),
    }));
  },

  markMessagesAsRead: (conversationId) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: state.messages[conversationId]?.map((m) => ({ ...m, isRead: true })) || [],
      },
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    }));
  },

  setActiveConversation: (conversationId) => {
    set({ activeConversationId: conversationId });
  },

  getUnreadCount: () => {
    const { conversations } = get();
    return conversations.reduce((total, c) => total + c.unreadCount, 0);
  },

  getConversationForUser: (userId) => {
    const { conversations } = get();
    return conversations.find((c) => c.userId === userId && c.status !== "closed");
  },

  getMessagesForConversation: (conversationId) => {
    const { messages } = get();
    return messages[conversationId] || [];
  },

  // Security: Role-based conversation access
  // - Students can only see their own conversations
  // - Coaches can only see conversations assigned to them
  // - Managers can see all conversations
  getConversationsForUser: (userId, userRole, assignedToId) => {
    const { conversations } = get();

    if (userRole === "manager") {
      // Manager can see all conversations
      return conversations;
    }

    if (userRole === "coach" && assignedToId) {
      // Coach can only see conversations assigned to them
      return conversations.filter(
        (c) => c.assignedManagerId === assignedToId
      );
    }

    // Students can only see their own conversations
    return conversations.filter((c) => c.userId === userId);
  },
}));
