import { useAuthStore } from '@/stores/auth-store';

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const viewAsUser = useAuthStore.getState().viewAsUser;

  let finalUrl = url;
  if (viewAsUser) {
    const separator = url.includes('?') ? '&' : '?';
    finalUrl = `${url}${separator}viewAs=${viewAsUser.user_id}`;
  }

  const res = await fetch(finalUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}
