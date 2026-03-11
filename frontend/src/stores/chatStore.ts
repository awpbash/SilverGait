import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  actions?: Array<{ label: string; route?: string; prompt?: string }>;
}

interface ChatState {
  messages: ChatMessage[];
  loading: boolean;
  setMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setLoading: (loading: boolean) => void;
  addMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, update: Partial<ChatMessage>) => void;
  appendToMessage: (id: string, chunk: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  loading: false,
  setMessages: (msgs) =>
    set((state) => ({
      messages: typeof msgs === 'function' ? msgs(state.messages) : msgs,
    })),
  setLoading: (loading) => set({ loading }),
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  updateMessage: (id, update) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...update } : m)),
    })),
  appendToMessage: (id, chunk) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, text: m.text + chunk } : m
      ),
    })),
}));
