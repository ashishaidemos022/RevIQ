import { create } from 'zustand';
import { SessionUser, ViewAsUser } from '@/types';

interface AuthState {
  user: SessionUser | null;
  isLoading: boolean;
  viewAsUser: ViewAsUser | null;
  viewAsLogId: string | null;
  setUser: (user: SessionUser | null) => void;
  setLoading: (loading: boolean) => void;
  setViewAs: (user: ViewAsUser, logId?: string) => void;
  clearViewAs: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  viewAsUser: null,
  viewAsLogId: null,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  setViewAs: (viewAsUser, logId) => set({ viewAsUser, viewAsLogId: logId ?? null }),
  clearViewAs: () => set({ viewAsUser: null, viewAsLogId: null }),
  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    set({ user: null, viewAsUser: null, viewAsLogId: null });
    window.location.href = '/login';
  },
}));
