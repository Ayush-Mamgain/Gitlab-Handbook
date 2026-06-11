import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { ChatState, ChatSummary, Message } from '@/types';
import { api } from '@/services/api';

const initialState: ChatState = {
  chats: [],
  activeChatId: null,
  activeMessages: [],
  isLoading: false,
  isStreaming: false,
  error: null,
  streamingContent: '',
};

export const loadChat = createAsyncThunk(
  'chat/loadChat',
  async (chatId: string, { rejectWithValue }) => {
    try {
      return await api.getChat(chatId);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : 'Failed to load chat');
    }
  }
);

export const createChat = createAsyncThunk(
  'chat/createChat',
  async (query: string, { rejectWithValue }) => {
    try {
      return await api.createChat(query);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : 'Failed to create chat');
    }
  }
);

export const deleteChat = createAsyncThunk(
  'chat/deleteChat',
  async (chatId: string, { rejectWithValue }) => {
    try {
      await api.deleteChat(chatId);
      return chatId;
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : 'Failed to delete chat');
    }
  }
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setChats(state, action: PayloadAction<ChatSummary[]>) {
      state.chats = action.payload;
    },
    setActiveChatId(state, action: PayloadAction<string | null>) {
      state.activeChatId = action.payload;
      if (!action.payload) {
        state.activeMessages = [];
      }
    },
    addUserMessage(state, action: PayloadAction<string>) {
      state.activeMessages.push({ role: 'user', content: action.payload });
    },
    startStreaming(state) {
      state.isStreaming = true;
      state.streamingContent = '';
    },
    appendStreamChunk(state, action: PayloadAction<string>) {
      state.streamingContent += action.payload;
    },
    finishStreaming(state) {
      if (state.streamingContent) {
        state.activeMessages.push({
          role: 'assistant',
          content: state.streamingContent,
        });
      }
      state.streamingContent = '';
      state.isStreaming = false;
    },
    cancelStreaming(state) {
      state.streamingContent = '';
      state.isStreaming = false;
    },
    clearActiveChat(state) {
      state.activeChatId = null;
      state.activeMessages = [];
      state.streamingContent = '';
      state.isStreaming = false;
    },
    addChatToList(state, action: PayloadAction<ChatSummary>) {
      state.chats.unshift(action.payload);
    },
    clearChatError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Load chat
    builder
      .addCase(loadChat.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.activeMessages = [];
      })
      .addCase(loadChat.fulfilled, (state, action) => {
        state.isLoading = false;
        state.activeChatId = action.payload.chatId;
        // Filter out system messages for display
        state.activeMessages = action.payload.messages.filter((m) => m.role !== 'system');
      })
      .addCase(loadChat.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Create chat
    builder
      .addCase(createChat.pending, (state) => {
        state.error = null;
      })
      .addCase(createChat.fulfilled, (state, action) => {
        state.activeChatId = action.payload.chatId;
        state.chats.unshift({
          _id: action.payload.chatId,
          title: action.payload.title,
        });
      })
      .addCase(createChat.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Delete chat
    builder
      .addCase(deleteChat.pending, (state) => {
        state.error = null;
      })
      .addCase(deleteChat.fulfilled, (state, action) => {
        const deletedId = action.payload;
        state.chats = state.chats.filter((c) => c._id !== deletedId);
        if (state.activeChatId === deletedId) {
          state.activeChatId = null;
          state.activeMessages = [];
          state.streamingContent = '';
          state.isStreaming = false;
        }
      })
      .addCase(deleteChat.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const {
  setChats,
  setActiveChatId,
  addUserMessage,
  startStreaming,
  appendStreamChunk,
  finishStreaming,
  cancelStreaming,
  clearActiveChat,
  addChatToList,
  clearChatError,
} = chatSlice.actions;

export default chatSlice.reducer;