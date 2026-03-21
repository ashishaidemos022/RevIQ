"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { NAV_ITEMS } from "@/lib/constants";
import { UserRole } from "@/types";
import {
  Home,
  BarChart3,
  FlaskConical,
  Zap,
  TrendingUp,
  Trophy,
  Handshake,
  Building2,
  Radio,
  Users,
  Settings,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  BarChart3,
  FlaskConical,
  Zap,
  TrendingUp,
  Trophy,
  Handshake,
  Building2,
  Radio,
  Users,
  Settings,
};

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const userRole = (viewAsUser?.role ?? user?.role) as UserRole | undefined;

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-sidebar-border bg-sidebar z-30">
      <div className="flex items-center justify-center px-4 py-4 border-b border-sidebar-border">
        <div className="w-full rounded-lg bg-white px-4 py-3">
          <img src="/revenueiq-logo.svg" alt="Talkdesk RevenueIQ" className="w-full" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            // Role check
            if (item.roles !== "all" && userRole && !item.roles.includes(userRole)) {
              return null;
            }

            const Icon = iconMap[item.icon];
            const isActive =
              pathname === item.href ||
              (item.href !== "/home" && pathname.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
