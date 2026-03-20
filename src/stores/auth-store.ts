import { create } from 'zustand';
import { SessionUser, ViewAsUser } from '@/types';

interface AuthState {
  user: SessionUser | null;
  isLoading: boolean;
  viewAsUser: ViewAsUser | null;
  setUser: (user: SessionUser | null) => void;
  setLoading: (loading: boolean) => void;
  setViewAs: (user: ViewAsUser) => void;
  clearViewAs: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  viewAsUser: null,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  setViewAs: (viewAsUser) => set({ viewAsUser }),
  clearViewAs: () => set({ viewAsUser: null }),
  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    set({ user: null, viewAsUser: null });
    window.location.href = '/login';
  },
}));
