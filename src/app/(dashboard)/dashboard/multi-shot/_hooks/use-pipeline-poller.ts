"use client";
import { useEffect, useState } from "react";
import { getPipelineStatusAction } from "@/app/(dashboard)/dashboard/_actions/pipeline-actions";

export type PipelineView = {
  id: string;
  status: string;
  progress: number;
  error: string | null;
  outputUrl: string | null;
  steps: { key: string; name: string; status: string }[];
};
const TERMINAL = ["COMPLETED", "FAILED", "PARTIAL", "CANCELED"];

export function usePipelinePoller(pipelineId: string | null) {
  const [view, setView] = useState<PipelineView | null>(null);
  useEffect(() => {
    if (!pipelineId) {
      setView(null);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const res = await getPipelineStatusAction(pipelineId);
      if (!active) return;
      if (res.ok) {
        setView(res.pipeline);
        if (!TERMINAL.includes(res.pipeline.status)) timer = setTimeout(tick, 3000);
      } else {
        timer = setTimeout(tick, 3000);
      }
    };
    tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pipelineId]);
  return view;
}
