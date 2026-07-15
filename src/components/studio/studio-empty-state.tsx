import * as React from "react";
import { Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared "nothing here yet" placeholder used across every studio surface
 * (StudioShell preview stages + the Create Image/Video generation canvas) so
 * empty states look identical product-wide.
 */
export function StudioEmptyState({
  icon: Icon = Sparkles,
  title = "Nothing here yet",
  description,
  hint = "Fill in the brief and hit Generate",
  className,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[280px] flex-col items-center justify-center gap-4 p-8 text-center",
        className
      )}
    >
      <div className="rounded-full bg-brand/10 p-4 ring-1 ring-brand/15">
        <Icon className="h-7 w-7 text-brand" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-xs text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {hint ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          <span>{hint}</span>
        </div>
      ) : null}
    </div>
  );
}
