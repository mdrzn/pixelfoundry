"use client";

import { useState } from "react";

import { submitSceneBuilderAction } from "@/app/(dashboard)/dashboard/scene-builder/_actions/submit-scene-builder";
import { usePipelinePoller } from "@/app/(dashboard)/dashboard/multi-shot/_hooks/use-pipeline-poller";
import { PipelineTracker } from "@/components/studio/pipeline-tracker";
import { StudioShell } from "@/components/studio/studio-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;

// Approximate fixed estimate; actual hold is computed server-side by the
// pipeline definition (analyze + characters + environments + scenes + concat).
const EST_COST = 455;

export function SceneBuilderForm({ modelsReady }: { modelsReady: boolean }) {
  const [concept, setConcept] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = usePipelinePoller(pipelineId);

  async function handleGenerate() {
    setSubmitting(true);
    setError(null);
    const res = await submitSceneBuilderAction({ concept, aspectRatio });
    if (res.ok) {
      setPipelineId(res.pipelineId);
    } else {
      setError(res.error);
    }
    setSubmitting(false);
  }

  const estCostChip = <Badge variant="secondary">up to {EST_COST} credits</Badge>;

  const generateButton = (
    <Button onClick={handleGenerate} disabled={submitting || concept.trim().length < 10}>
      {submitting ? "Starting…" : "Build scenes"}
    </Button>
  );

  const inputPanel = !modelsReady ? (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      Scene Builder models not configured yet — seed the fal script, reference
      image-edit, image, and video models to enable Scene Builder.
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="scene-builder-concept">Concept</Label>
        <Textarea
          id="scene-builder-concept"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="Describe your film concept — the cast, the world, and what happens…"
          rows={6}
        />
        <p className="text-xs text-muted-foreground">
          We&apos;ll design a consistent cast and set of environments, then build
          each scene as a keyframe guided by those references before animating it.
        </p>
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
      <p className="text-sm text-muted-foreground">Your scene film will appear here</p>
    );

  return (
    <StudioShell
      title="Scene Builder"
      description="Turn a concept into a consistent cast and environments, then build and animate each scene into one film."
      estCost={modelsReady ? estCostChip : undefined}
      action={modelsReady ? generateButton : undefined}
      inputPanel={inputPanel}
      tracker={tracker}
      preview={preview}
    />
  );
}
