import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '@/store/store';
import { useCallback } from 'react';
import { fetchUser, logout } from '@/store/authSlice';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = <T>(selector: (state: RootState) => T) => useSelector(selector);

export function useAuth() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const isLoading = useAppSelector((s) => s.auth.isLoading);
  const error = useAppSelector((s) => s.auth.error);

  const refreshUser = useCallback(() => {
    dispatch(fetchUser());
  }, [dispatch]);

  const logoutUser = useCallback(() => {
    dispatch(logout());
  }, [dispatch]);

  return { user, isAuthenticated, isLoading, error, refreshUser, logoutUser };
}