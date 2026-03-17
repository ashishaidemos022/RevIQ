"use client";

import { useAuthStore } from "@/stores/auth-store";
import { useTheme } from "@/providers/theme-provider";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { SYNC_ROLES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, Bell, RefreshCw, LogOut } from "lucide-react";
import { UserRole } from "@/types";

function formatRelativeTime(dateStr: string | null): { text: string; stale: "ok" | "warn" | "error" } {
  if (!dateStr) return { text: "Never", stale: "error" };

  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = diff / (1000 * 60 * 60);

  let text: string;
  if (hours < 1) {
    const mins = Math.floor(diff / (1000 * 60));
    text = mins <= 1 ? "just now" : `${mins}m ago`;
  } else if (hours < 24) {
    text = `${Math.floor(hours)}h ago`;
  } else {
    const days = Math.floor(hours / 24);
    text = `${days}d ago`;
  }

  const stale = hours < 24 ? "ok" : hours < 72 ? "warn" : "error";
  return { text, stale };
}

const staleStyles = {
  ok: "text-muted-foreground",
  warn: "text-amber-500",
  error: "text-red-500",
};

export function Header() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { theme, toggleTheme } = useTheme();
  const isDevAdmin = user?.user_id === "dev-admin";
  const canSync = user && SYNC_ROLES.includes(user.role as UserRole);

  const { data: lastSync } = useQuery({
    queryKey: ["sync-last"],
    queryFn: () => apiFetch<{ salesforce: string | null; looker: string | null }>("/api/sync/last"),
    refetchInterval: 60_000,
  });

  const sf = formatRelativeTime(lastSync?.salesforce ?? null);
  const looker = formatRelativeTime(lastSync?.looker ?? null);

  const initials = user?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <>
      {isDevAdmin && (
        <div className="bg-red-600 text-white text-center text-xs font-bold py-1 px-4">
          DEV ADMIN — Development Environment Only
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card px-4 md:px-6">
        <div className="flex items-center gap-4 md:hidden">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xs">TD</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className={staleStyles[sf.stale]}>SF: {sf.text}</span>
          <span className="text-border">|</span>
          <span className={staleStyles[looker.stale]}>Looker: {looker.text}</span>
        </div>

        <div className="flex items-center gap-2">
          {canSync && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sync Now</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-50 cursor-not-allowed"
            disabled
            aria-label="Notifications (coming soon)"
          >
            <Bell className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger className="relative h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-accent">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user?.full_name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                <p className="text-xs text-muted-foreground capitalize mt-0.5">
                  {user?.role?.replace("_", " ")}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
