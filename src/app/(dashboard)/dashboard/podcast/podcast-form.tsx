"use client";

import { useState } from "react";

import { submitPodcastAction } from "@/app/(dashboard)/dashboard/podcast/_actions/submit-podcast";
import { usePipelinePoller } from "@/app/(dashboard)/dashboard/multi-shot/_hooks/use-pipeline-poller";
import { PipelineTracker } from "@/components/studio/pipeline-tracker";
import { StudioShell } from "@/components/studio/studio-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Approximate fixed estimate; actual hold is computed server-side by the
// pipeline definition (script + 2 portraits + tts + stt + per-segment
// trim/lipsync + concat + mux).
const EST_COST = 624;

type Mode = "topic" | "script";

export function PodcastForm({ modelsReady }: { modelsReady: boolean }) {
  const [mode, setMode] = useState<Mode>("topic");
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [speaker1, setSpeaker1] = useState("Host");
  const [speaker2, setSpeaker2] = useState("Guest");
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = usePipelinePoller(pipelineId);

  const hasInput = mode === "topic" ? topic.trim().length > 0 : script.trim().length > 0;

  async function handleGenerate() {
    setSubmitting(true);
    setError(null);
    const res = await submitPodcastAction({
      topic: mode === "topic" ? topic : undefined,
      script: mode === "script" ? script : undefined,
      speaker1,
      speaker2,
    });
    if (res.ok) {
      setPipelineId(res.pipelineId);
    } else {
      setError(res.error);
    }
    setSubmitting(false);
  }

  const estCostChip = <Badge variant="secondary">up to {EST_COST} credits</Badge>;

  const generateButton = (
    <Button onClick={handleGenerate} disabled={submitting || !hasInput}>
      {submitting ? "Starting…" : "Generate episode"}
    </Button>
  );

  const inputPanel = !modelsReady ? (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      Podcast models not configured yet — seed the fal script, text-to-speech,
      speech-to-text, lip-sync, and image models to enable the Podcast studio.
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        {(["topic", "script"] as const).map((m) => (
          <Button
            key={m}
            type="button"
            size="sm"
            variant={mode === m ? "default" : "outline"}
            className={cn(mode === m && "pointer-events-none")}
            onClick={() => setMode(m)}
          >
            {m === "topic" ? "From a topic" : "From a script"}
          </Button>
        ))}
      </div>

      {mode === "topic" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="podcast-topic">Topic</Label>
          <Textarea
            id="podcast-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What should the two hosts talk about?"
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            We&apos;ll write a two-person conversation, voice it, diarize the
            speakers, and lip-sync each turn to its host.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="podcast-script">Script</Label>
          <Textarea
            id="podcast-script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={"Host: Welcome back to the show…\nGuest: Thanks for having me!"}
            rows={8}
          />
          <p className="text-xs text-muted-foreground">
            Paste a two-person script. We&apos;ll assign turns to each host.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="podcast-speaker1">Speaker 1</Label>
          <Input
            id="podcast-speaker1"
            value={speaker1}
            onChange={(e) => setSpeaker1(e.target.value)}
            placeholder="Host"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="podcast-speaker2">Speaker 2</Label>
          <Input
            id="podcast-speaker2"
            value={speaker2}
            onChange={(e) => setSpeaker2(e.target.value)}
            placeholder="Guest"
          />
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
      <p className="text-sm text-muted-foreground">Your podcast episode will appear here</p>
    );

  return (
    <StudioShell
      title="Podcast"
      description="Turn a topic or script into a two-host video podcast — voiced, diarized, and lip-synced per speaker."
      estCost={modelsReady ? estCostChip : undefined}
      action={modelsReady ? generateButton : undefined}
      inputPanel={inputPanel}
      tracker={tracker}
      preview={preview}
    />
  );
}
