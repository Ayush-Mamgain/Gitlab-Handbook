'use client';

import { useCallback, useRef } from 'react';
import { useAppDispatch } from './useAuth';
import {
  startStreaming,
  appendStreamChunk,
  finishStreaming,
  cancelStreaming,
} from '@/store/chatSlice';
import { api } from '@/services/api';
import toast from 'react-hot-toast';

export function useStreaming() {
  const dispatch = useAppDispatch();
  const abortRef = useRef<boolean>(false);

  const stream = useCallback(
    async (chatId: string, query: string) => {
      abortRef.current = false;
      dispatch(startStreaming());

      await api.streamCompletion(
        chatId,
        query,
        (chunk) => {
          if (!abortRef.current) {
            dispatch(appendStreamChunk(chunk));
          }
        },
        () => {
          dispatch(finishStreaming());
        },
        (err) => {
          dispatch(cancelStreaming());
          toast.error(err.message || 'Failed to get a response. Please try again.');
        }
      );
    },
    [dispatch]
  );

  const abort = useCallback(() => {
    abortRef.current = true;
    dispatch(cancelStreaming());
  }, [dispatch]);

  return { stream, abort };
}