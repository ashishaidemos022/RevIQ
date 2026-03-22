"use client";

import { useAuthStore } from "@/stores/auth-store";
import { useTheme } from "@/providers/theme-provider";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { VIEW_AS_ROLES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, Bell, LogOut, Eye, Search, X } from "lucide-react";
import { UserRole, ViewAsUser } from "@/types";

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
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const setViewAs = useAuthStore((s) => s.setViewAs);
  const clearViewAs = useAuthStore((s) => s.clearViewAs);
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const isDevAdmin = user?.user_id === "dev-admin";
  const canViewAs = user && VIEW_AS_ROLES.includes(user.role as UserRole);

  // View As dialog state
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ViewAsUser[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced user search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const json = await res.json();
          setSearchResults(json.data || []);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const viewAsLogId = useAuthStore((s) => s.viewAsLogId);

  const handleSelectUser = async (target: ViewAsUser) => {
    // End previous view-as session if active
    if (viewAsLogId) {
      fetch('/api/view-as-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', log_id: viewAsLogId }),
      }).catch(() => {});
    }

    // Log the new view-as session
    let logId: string | undefined;
    try {
      const res = await fetch('/api/view-as-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          viewed_as_id: target.user_id,
          viewed_as_role: target.role,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        logId = json.log_id;
      }
    } catch {
      // Non-blocking — don't prevent view-as if logging fails
    }

    setViewAs(target, logId);
    setViewAsOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    queryClient.invalidateQueries();
  };

  const handleClearViewAs = () => {
    // End view-as session log
    if (viewAsLogId) {
      fetch('/api/view-as-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', log_id: viewAsLogId }),
      }).catch(() => {});
    }
    clearViewAs();
    queryClient.invalidateQueries();
  };

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
      {viewAsUser && (
        <div className="bg-amber-500 text-white text-center text-xs font-bold py-1 px-4 flex items-center justify-center gap-2">
          <Eye className="h-3 w-3" />
          <span>
            Viewing as: {viewAsUser.full_name} ({viewAsUser.role.replace("_", " ")}) — {viewAsUser.email}
          </span>
          <button
            onClick={handleClearViewAs}
            className="ml-2 underline hover:no-underline"
          >
            Exit
          </button>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card px-4 md:px-6">
        <div className="flex items-center md:hidden">
          <img src="/revenueiq-logo.svg" alt="Talkdesk RevenueIQ" className="h-8 dark:hidden" />
          <img src="/revenueiq-logo-dark.svg" alt="Talkdesk RevenueIQ" className="h-8 hidden dark:block" />
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className={staleStyles[sf.stale]}>SF: {sf.text}</span>
          <span className="text-border">|</span>
          <span className={staleStyles[looker.stale]}>Looker: {looker.text}</span>
        </div>

        <div className="flex items-center gap-2">
          {canViewAs && (
            <Button
              variant={viewAsUser ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setViewAsOpen(true)}
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {viewAsUser ? `Viewing: ${viewAsUser.full_name}` : "View As"}
              </span>
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

      {/* View As Dialog */}
      <Dialog open={viewAsOpen} onOpenChange={setViewAsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>View As Another User</DialogTitle>
            <DialogDescription>
              Search for a user to view the app from their perspective. All data will be read-only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {searching && (
                <p className="text-xs text-muted-foreground py-2 text-center">Searching...</p>
              )}
              {!searching && searchResults.length === 0 && searchQuery.length >= 2 && (
                <p className="text-xs text-muted-foreground py-2 text-center">No users found</p>
              )}
              {searchResults.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => handleSelectUser(u)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{u.full_name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <span className="text-xs bg-muted px-2 py-0.5 rounded capitalize">
                    {u.role.replace("_", " ")}
                  </span>
                </button>
              ))}
            </div>
            {viewAsUser && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  handleClearViewAs();
                  setViewAsOpen(false);
                }}
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Stop Viewing As {viewAsUser.full_name}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
