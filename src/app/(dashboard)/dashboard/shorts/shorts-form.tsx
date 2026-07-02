"use client";

import { useState } from "react";

import { submitShortsAction } from "@/app/(dashboard)/dashboard/shorts/_actions/submit-shorts";
import { usePipelinePoller } from "@/app/(dashboard)/dashboard/multi-shot/_hooks/use-pipeline-poller";
import { PipelineTracker } from "@/components/studio/pipeline-tracker";
import { StudioShell } from "@/components/studio/studio-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ASPECT_RATIOS = ["9:16", "16:9", "1:1"] as const;

// Approximate fixed estimate; actual hold is computed server-side by the
// pipeline definition (script + voice + music + scenes + concat + mux + subtitle).
const EST_COST = 50;

export function ShortsForm({ modelsReady }: { modelsReady: boolean }) {
  const [topic, setTopic] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = usePipelinePoller(pipelineId);

  async function handleGenerate() {
    setSubmitting(true);
    setError(null);
    const res = await submitShortsAction({ topic, aspectRatio });
    if (res.ok) {
      setPipelineId(res.pipelineId);
    } else {
      setError(res.error);
    }
    setSubmitting(false);
  }

  const estCostChip = <Badge variant="secondary">up to {EST_COST} credits</Badge>;

  const generateButton = (
    <Button onClick={handleGenerate} disabled={submitting || !topic.trim()}>
      {submitting ? "Starting…" : "Generate"}
    </Button>
  );

  const inputPanel = !modelsReady ? (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      Shorts models not configured yet — seed the fal script, voice, music,
      subtitle, mux, image, and video models to enable Shorts.
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="shorts-topic">Topic</Label>
        <Textarea
          id="shorts-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Describe the topic for your short (e.g. the history of coffee)…"
          rows={5}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Aspect ratio</Label>
        <div className="flex gap-2">
          {ASPECT_RATIOS.map((ratio) => (
            <Button
              key={ratio}
              type="button"
              size="sm"
              variant={aspectRatio === ratio ? "default" : "outline"}
              className={cn(aspectRatio === ratio && "pointer-events-none")}
              onClick={() => setAspectRatio(ratio)}
            >
              {ratio}
            </Button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );

  const tracker = (
    <PipelineTracker
      status={view?.status ?? "QUEUED"}
      progress={view?.progress ?? 0}
      steps={view?.steps ?? []}
    />
  );

  const preview =
    view?.status === "COMPLETED" && view.outputUrl ? (
      <video src={view.outputUrl} controls className="w-full rounded-lg" />
    ) : view?.status === "FAILED" ? (
      <p className="text-sm text-destructive">{view.error ?? "Generation failed."}</p>
    ) : (
      <p className="text-sm text-muted-foreground">Your short will appear here</p>
    );

  return (
    <StudioShell
      title="Shorts"
      description="Turn a topic into a fully narrated, scored, and subtitled short video."
      estCost={modelsReady ? estCostChip : undefined}
      action={modelsReady ? generateButton : undefined}
      inputPanel={inputPanel}
      tracker={tracker}
      preview={preview}
    />
  );
}
