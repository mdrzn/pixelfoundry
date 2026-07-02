"use client";

import { AlertCircle, Check, Circle, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { pipelineHeadline, stepVisual } from "@/lib/studio/step-visual";
import type { StepVisual } from "@/lib/studio/step-visual";
import { cn } from "@/lib/utils";

export type TrackerStep = { key: string; name: string; status: string };

type ToneStyle = {
  Icon: LucideIcon;
  iconClassName: string;
  animate?: boolean;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
};

const TONE_STYLES: Record<StepVisual["tone"], ToneStyle> = {
  done: {
    Icon: Check,
    iconClassName: "text-green-600",
    badgeVariant: "secondary",
  },
  running: {
    Icon: Loader2,
    iconClassName: "text-primary",
    animate: true,
    badgeVariant: "default",
  },
  failed: {
    Icon: AlertCircle,
    iconClassName: "text-destructive",
    badgeVariant: "destructive",
  },
  pending: {
    Icon: Circle,
    iconClassName: "text-muted-foreground",
    badgeVariant: "outline",
  },
  skipped: {
    Icon: Circle,
    iconClassName: "text-muted-foreground",
    badgeVariant: "outline",
  },
};

export function PipelineTracker({
  status,
  progress,
  steps,
}: {
  status: string;
  progress: number;
  steps: TrackerStep[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">
          {pipelineHeadline(status, progress)}
        </p>
        <Progress value={progress} />
      </div>

      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">Waiting to start…</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {steps.map((step) => {
            const visual = stepVisual(step.status);
            const tone = TONE_STYLES[visual.tone];
            const { Icon } = tone;
            return (
              <li
                key={step.key}
                className="flex items-center gap-3 rounded-md py-1.5"
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0",
                    tone.iconClassName,
                    tone.animate && "animate-spin"
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {step.name}
                </span>
                <Badge variant={tone.badgeVariant}>{visual.label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
