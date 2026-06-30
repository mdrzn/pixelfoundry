"use client";

import { useState } from "react";
import { ChevronDown, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

type CollapsibleSectionProps = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  summaryBadge?: string | null;
  icon?: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
  disabledMessage?: string;
};

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  summaryBadge,
  icon,
  children,
  disabled = false,
  disabledMessage = "Not supported by this model",
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Don't allow opening if disabled
  const handleOpenChange = (open: boolean) => {
    if (!disabled) {
      setIsOpen(open);
    }
  };

  return (
    <Collapsible
      open={isOpen && !disabled}
      onOpenChange={handleOpenChange}
      className="space-y-3"
    >
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center justify-between rounded-md border bg-card/50 px-4 py-3 text-left transition-colors",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:bg-accent/50"
        )}
        disabled={disabled}
      >
        <div className="flex items-center gap-3">
          {icon || (disabled && <Lock className="h-4 w-4 text-muted-foreground" />)}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{title}</span>
              {summaryBadge && !isOpen ? (
                <Badge variant="secondary" className="text-xs">
                  {summaryBadge}
                </Badge>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">
              {disabled ? disabledMessage : subtitle}
            </span>
          </div>
        </div>
        {!disabled && (
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        )}
      </CollapsibleTrigger>
      {!disabled && (
        <CollapsibleContent className="space-y-4 rounded-md border bg-card p-4">
          {children}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
