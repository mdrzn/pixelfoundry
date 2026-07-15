import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Two-pane, full-height studio layout.
 *
 * Left  = "Brief" input rail (fixed-ish width, scrolls internally).
 * Right = "Workspace": a slim pipeline strip on top + a large preview stage
 *         that fills the remaining height.
 *
 * On large screens the whole shell is pinned to the viewport height so a short
 * form no longer leaves the page mostly empty. On small screens it stacks and
 * flows naturally.
 *
 * The public API (title/description/estCost/action/inputPanel/tracker/preview)
 * is unchanged, so every studio form gets the new layout for free.
 */
export function StudioShell({
  title,
  description,
  estCost,
  action,
  inputPanel,
  tracker,
  preview,
}: {
  title: string;
  description?: string;
  estCost?: React.ReactNode;
  action?: React.ReactNode;
  inputPanel: React.ReactNode;
  tracker: React.ReactNode;
  preview: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 lg:h-[calc(100dvh-7rem)]">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {estCost || action ? (
          <div className="flex shrink-0 items-center gap-3">
            {estCost}
            {action}
          </div>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 items-stretch gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Brief */}
        <Panel label="Brief">
          <div className="p-5">{inputPanel}</div>
        </Panel>

        {/* Workspace: pipeline strip + preview stage */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          <PanelHeader label="Workspace" />
          <div className="max-h-[40%] shrink-0 overflow-y-auto border-b bg-muted/40 px-5 py-4">
            {tracker}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-brand-wash p-5">
            {preview}
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  label,
  accessory,
}: {
  label: string;
  accessory?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h2>
      {accessory}
    </div>
  );
}

function Panel({
  label,
  accessory,
  children,
  className,
}: {
  label: string;
  accessory?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <PanelHeader label={label} accessory={accessory} />
      <div className={cn("min-h-0 flex-1 overflow-y-auto", className)}>
        {children}
      </div>
    </div>
  );
}
