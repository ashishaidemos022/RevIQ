"use client";

import { Badge } from "@/components/ui/badge";

const CREDIT_PATH_STYLES: Record<string, { label: string; className: string }> = {
  channel_owner: {
    label: "Channel Owner",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  rv_account_owner: {
    label: "RV Account",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  },
  partner_channel_owner: {
    label: "Partner",
    className: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  },
};

export function CreditPathBadge({ creditPath }: { creditPath: string | null }) {
  if (!creditPath) return <span className="text-muted-foreground">—</span>;
  const style = CREDIT_PATH_STYLES[creditPath];
  if (!style) return <Badge variant="outline">{creditPath}</Badge>;
  return (
    <Badge variant="outline" className={style.className}>
      {style.label}
    </Badge>
  );
}
