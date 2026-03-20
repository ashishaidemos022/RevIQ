"use client";

import { Badge } from "@/components/ui/badge";

const CREDIT_PATH_STYLES: Record<string, { label: string; className: string }> = {
  "Channel Owner": {
    label: "Channel Owner",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  "RV Account Owner": {
    label: "RV Account",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  },
  "Partner Channel Owner": {
    label: "Partner",
    className: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  },
};

interface CreditPathBadgeProps {
  creditPath: string | null;
  partnerName?: string | null;
}

export function CreditPathBadge({ creditPath, partnerName }: CreditPathBadgeProps) {
  if (!creditPath) return <span className="text-muted-foreground">—</span>;
  const style = CREDIT_PATH_STYLES[creditPath];
  if (!style) return <Badge variant="outline">{creditPath}</Badge>;

  const label = partnerName ? `${style.label}: ${partnerName}` : style.label;

  return (
    <Badge variant="outline" className={style.className}>
      {label}
    </Badge>
  );
}
