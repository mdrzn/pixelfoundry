"use client";

import { cn } from "@/lib/utils";

type CreateImageSidebarProps = {
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function CreateImageSidebar({
  children,
  footer,
  className,
}: CreateImageSidebarProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm lg:w-[380px] xl:w-[420px]",
        className,
      )}
    >
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="space-y-4">{children}</div>
      </div>

      {/* Sticky footer */}
      {footer ? (
        <div className="border-t bg-card px-5 py-4">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
