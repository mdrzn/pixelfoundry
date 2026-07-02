"use client";

import { useState } from "react";

import { submitSubtitlesAction } from "@/app/(dashboard)/dashboard/subtitles/_actions/submit-subtitles";
import { usePipelinePoller } from "@/app/(dashboard)/dashboard/multi-shot/_hooks/use-pipeline-poller";
import { PipelineTracker } from "@/components/studio/pipeline-tracker";
import { StudioShell } from "@/components/studio/studio-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupportedLanguage } from "@/lib/i18n/languages";

// Approximate fixed estimate (auto-subtitle ≈ 4). Actual hold is computed server-side.
const EST_COST = 4;

// Sentinel for "keep the original spoken language" (no translation).
const KEEP_ORIGINAL = "__original__";

type UploadedVideo = { id: string; url: string; title: string | null };

export function SubtitlesForm({
  modelsReady,
  languages,
}: {
  modelsReady: boolean;
  languages: SupportedLanguage[];
}) {
  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [targetLanguage, setTargetLanguage] = useState(KEEP_ORIGINAL);
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
    if (!video) return;
    setSubmitting(true);
    setError(null);
    const res = await submitSubtitlesAction({
      videoAssetId: video.id,
      ...(targetLanguage !== KEEP_ORIGINAL ? { targetLanguage } : {}),
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
    <Button onClick={handleGenerate} disabled={submitting || uploading || !video}>
      {submitting ? "Starting…" : "Generate"}
    </Button>
  );

  const inputPanel = !modelsReady ? (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      Subtitle model not configured yet — seed the fal auto-subtitle model to enable this tool.
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="sub-video">Video</Label>
        <Input
          id="sub-video"
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
          <p className="text-xs text-muted-foreground">
            Upload a video (MP4, WEBM).
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Target language (optional)</Label>
        <Select value={targetLanguage} onValueChange={setTargetLanguage}>
          <SelectTrigger>
            <SelectValue placeholder="Keep original language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={KEEP_ORIGINAL}>Keep original language</SelectItem>
            {languages.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      <p className="text-sm text-destructive">{view.error ?? "Subtitle generation failed."}</p>
    ) : (
      <p className="text-sm text-muted-foreground">Your subtitled video will appear here</p>
    );

  return (
    <StudioShell
      title="Subtitles"
      description="Automatically generate (and optionally translate) subtitles burned into a video."
      estCost={modelsReady ? estCostChip : undefined}
      action={modelsReady ? generateButton : undefined}
      inputPanel={inputPanel}
      tracker={tracker}
      preview={preview}
    />
  );
}
