"use client";

import { useState } from "react";
import { Video } from "lucide-react";

import { submitDubbingAction } from "@/app/(dashboard)/dashboard/dubbing/_actions/submit-dubbing";
import { usePipelinePoller } from "@/app/(dashboard)/dashboard/multi-shot/_hooks/use-pipeline-poller";
import { PipelineTracker } from "@/components/studio/pipeline-tracker";
import { StudioEmptyState } from "@/components/studio/studio-empty-state";
import { StudioShell } from "@/components/studio/studio-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupportedLanguage } from "@/lib/i18n/languages";

// Approximate fixed estimate; actual hold is computed server-side and grows
// with the lip-sync toggle (lip-sync is far more expensive than a plain mux).
const EST_COST_MUX = 60;
const EST_COST_LIPSYNC = 150;

type UploadedVideo = { id: string; url: string; title: string | null };

export function DubbingForm({
  modelsReady,
  languages,
}: {
  modelsReady: boolean;
  languages: SupportedLanguage[];
}) {
  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("");
  const [lipsync, setLipsync] = useState(false);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = usePipelinePoller(pipelineId);

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Upload failed.");
      }
      const asset = (await response.json()) as { id: string; url: string; title: string | null };
      setVideo({ id: asset.id, url: asset.url, title: asset.title });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload video.");
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate() {
    if (!video || !targetLanguage) return;
    setSubmitting(true);
    setError(null);
    const res = await submitDubbingAction({
      videoAssetId: video.id,
      targetLanguage,
      lipsync,
    });
    if (res.ok) {
      setPipelineId(res.pipelineId);
    } else {
      setError(res.error);
    }
    setSubmitting(false);
  }

  const estCost = lipsync ? EST_COST_LIPSYNC : EST_COST_MUX;
  const estCostChip = <Badge variant="secondary">up to {estCost} credits</Badge>;

  const generateButton = (
    <Button onClick={handleGenerate} disabled={submitting || uploading || !video || !targetLanguage}>
      {submitting ? "Starting…" : "Generate"}
    </Button>
  );

  const inputPanel = !modelsReady ? (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      Dubbing models are not configured yet — seed the fal STT, voice-clone, TTS, mux, and lip-sync
      models to enable this tool.
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="dub-video">Video</Label>
        <Input
          id="dub-video"
          type="file"
          accept="video/*"
          disabled={uploading}
          onChange={(e) => void handleUpload(e.target.files?.[0])}
        />
        {uploading ? (
          <p className="text-xs text-muted-foreground">Uploading…</p>
        ) : video ? (
          <p className="text-xs text-muted-foreground">Uploaded: {video.title ?? "video file"}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Upload a video (MP4, WEBM).</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Target language</Label>
        <Select value={targetLanguage} onValueChange={setTargetLanguage}>
          <SelectTrigger>
            <SelectValue placeholder="Select a language to dub into" />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="dub-lipsync">Lip-sync</Label>
          <p className="text-xs text-muted-foreground">
            Reanimate the speaker&apos;s mouth to match the dubbed audio (slower, costs more).
          </p>
        </div>
        <Switch id="dub-lipsync" checked={lipsync} onCheckedChange={setLipsync} />
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
      <video controls src={view.outputUrl} className="w-full rounded-lg border" />
    ) : view?.status === "FAILED" ? (
      <p className="text-sm text-destructive">{view.error ?? "Dubbing failed."}</p>
    ) : (
      <StudioEmptyState icon={Video} description="Your dubbed video will appear here." />
    );

  return (
    <StudioShell
      title="Dubbing"
      description="Translate and re-voice a video in the speaker's own cloned voice, optionally lip-synced."
      estCost={modelsReady ? estCostChip : undefined}
      action={modelsReady ? generateButton : undefined}
      inputPanel={inputPanel}
      tracker={tracker}
      preview={preview}
    />
  );
}
