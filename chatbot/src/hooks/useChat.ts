'use client';

import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from './useAuth';
import {
  loadChat,
  createChat,
  deleteChat,
  addUserMessage,
  clearActiveChat,
  setActiveChatId,
} from '@/store/chatSlice';
import { useStreaming } from './useStreaming';
import toast from 'react-hot-toast';

export function useChat() {
  const dispatch = useAppDispatch();
  const { stream } = useStreaming();

  const chats = useAppSelector((s) => s.chat.chats);
  const activeChatId = useAppSelector((s) => s.chat.activeChatId);
  const activeMessages = useAppSelector((s) => s.chat.activeMessages);
  const isLoading = useAppSelector((s) => s.chat.isLoading);
  const isStreaming = useAppSelector((s) => s.chat.isStreaming);
  const streamingContent = useAppSelector((s) => s.chat.streamingContent);
  const error = useAppSelector((s) => s.chat.error);

  const selectChat = useCallback(
    async (chatId: string) => {
      try {
        await dispatch(loadChat(chatId)).unwrap();
      } catch (err) {
        toast.error('Failed to load this conversation.');
      }
    },
    [dispatch]
  );

  const sendMessage = useCallback(
    async (query: string) => {
      if (!query.trim() || isStreaming) return;

      let chatId = activeChatId;

      // New conversation — create chat first
      if (!chatId) {
        try {
          const result = await dispatch(createChat(query)).unwrap();
          chatId = result.chatId;
        } catch {
          toast.error('Failed to start a new conversation.');
          return;
        }
      }

      dispatch(addUserMessage(query));
      await stream(chatId, query);
    },
    [activeChatId, isStreaming, dispatch, stream]
  );

  const removeChat = useCallback(
    async (chatId: string) => {
      try {
        await dispatch(deleteChat(chatId)).unwrap();
        toast.success('Conversation deleted.');
      } catch {
        toast.error('Failed to delete conversation.');
      }
    },
    [dispatch]
  );

  const startNewChat = useCallback(() => {
    dispatch(clearActiveChat());
  }, [dispatch]);

  return {
    chats,
    activeChatId,
    activeMessages,
    isLoading,
    isStreaming,
    streamingContent,
    error,
    selectChat,
    sendMessage,
    removeChat,
    startNewChat,
  };
}