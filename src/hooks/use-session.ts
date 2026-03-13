"use client";

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

export function useSession() {
  const { user, isLoading, setUser } = useAuthStore();

  useEffect(() => {
    if (user) return;

    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null));
  }, [user, setUser]);

  return { user, isLoading };
}
