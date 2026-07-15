"use client";

import { useState } from "react";
import { Clapperboard } from "lucide-react";

import { submitMultiShotAction } from "@/app/(dashboard)/dashboard/multi-shot/_actions/submit-multi-shot";
import { usePipelinePoller } from "@/app/(dashboard)/dashboard/multi-shot/_hooks/use-pipeline-poller";
import { PipelineTracker } from "@/components/studio/pipeline-tracker";
import { StudioEmptyState } from "@/components/studio/studio-empty-state";
import { StudioShell } from "@/components/studio/studio-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type Opt = { value: string; label: string; creditCost: number };

const ASPECT_RATIOS = ["9:16", "16:9", "1:1"] as const;
const SHOT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

export function MultiShotForm({
  imageModels,
  videoModels,
}: {
  imageModels: Opt[];
  videoModels: Opt[];
}) {
  const [story, setStory] = useState("");
  const [imageModelId, setImageModelId] = useState(imageModels[0]?.value ?? "");
  const [videoModelId, setVideoModelId] = useState(videoModels[0]?.value ?? "");
  const [maxShots, setMaxShots] = useState(4);
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = usePipelinePoller(pipelineId);

  const noVideoModel = videoModels.length === 0;

  const imageCost = imageModels.find((m) => m.value === imageModelId)?.creditCost ?? 0;
  const videoCost = videoModels.find((m) => m.value === videoModelId)?.creditCost ?? 0;
  const estCost = 1 + maxShots * (imageCost + videoCost) + 2;

  async function handleGenerate() {
    setSubmitting(true);
    setError(null);
    const res = await submitMultiShotAction({
      story,
      imageModelId,
      videoModelId,
      maxShots,
      aspectRatio,
    });
    if (res.ok) {
      setPipelineId(res.pipelineId);
    } else {
      setError(res.error);
    }
    setSubmitting(false);
  }

  const estCostChip = (
    <Badge variant="secondary">up to {estCost} credits</Badge>
  );

  const generateButton = (
    <Button
      onClick={handleGenerate}
      disabled={submitting || !story.trim() || !videoModelId}
    >
      {submitting ? "Starting…" : "Generate"}
    </Button>
  );

  const inputPanel = noVideoModel ? (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      No video model configured yet — seed a fal video model to enable
      Multi-Shot.
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ms-story">Story</Label>
        <Textarea
          id="ms-story"
          value={story}
          onChange={(e) => setStory(e.target.value)}
          placeholder="Describe the story you want to turn into a sequence of shots…"
          rows={6}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Image model</Label>
        <Select value={imageModelId} onValueChange={setImageModelId}>
          <SelectTrigger>
            <SelectValue placeholder="Select an image model" />
          </SelectTrigger>
          <SelectContent>
            {imageModels.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Video model</Label>
        <Select value={videoModelId} onValueChange={setVideoModelId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a video model" />
          </SelectTrigger>
          <SelectContent>
            {videoModels.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Max shots</Label>
        <Select
          value={String(maxShots)}
          onValueChange={(v) => setMaxShots(Number(v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHOT_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} {n === 1 ? "shot" : "shots"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      <p className="text-sm text-destructive">
        {view.error ?? "Generation failed."}
      </p>
    ) : (
      <StudioEmptyState icon={Clapperboard} description="Your multi-shot video will appear here." />
    );

  return (
    <StudioShell
      title="Multi-Shot"
      description="Turn a story into a sequence of cinematic shots, stitched into one video."
      estCost={noVideoModel ? undefined : estCostChip}
      action={noVideoModel ? undefined : generateButton}
      inputPanel={inputPanel}
      tracker={tracker}
      preview={preview}
    />
  );
}
