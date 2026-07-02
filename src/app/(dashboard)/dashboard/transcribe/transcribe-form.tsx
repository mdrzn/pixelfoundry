"use client";

import { useState } from "react";

import { submitTranscribeAction } from "@/app/(dashboard)/dashboard/transcribe/_actions/submit-transcribe";
import { usePipelinePoller } from "@/app/(dashboard)/dashboard/multi-shot/_hooks/use-pipeline-poller";
import { PipelineTracker } from "@/components/studio/pipeline-tracker";
import { StudioShell } from "@/components/studio/studio-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Approximate fixed estimate (STT ≈ 2). Actual hold is computed server-side.
const EST_COST = 2;

type UploadedAudio = { id: string; url: string; title: string | null };

export function TranscribeForm({ modelsReady }: { modelsReady: boolean }) {
  const [audio, setAudio] = useState<UploadedAudio | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const view = usePipelinePoller(pipelineId);
  const transcript =
    (view?.outputData as { text?: string } | null | undefined)?.text ?? "";

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
      setAudio({ id: asset.id, url: asset.url, title: asset.title });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload audio.");
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate() {
    if (!audio) return;
    setSubmitting(true);
    setError(null);
    const res = await submitTranscribeAction({ audioAssetId: audio.id });
    if (res.ok) {
      setPipelineId(res.pipelineId);
    } else {
      setError(res.error);
    }
    setSubmitting(false);
  }

  async function handleCopy() {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const estCostChip = <Badge variant="secondary">up to {EST_COST} credits</Badge>;

  const generateButton = (
    <Button onClick={handleGenerate} disabled={submitting || uploading || !audio}>
      {submitting ? "Starting…" : "Generate"}
    </Button>
  );

  const inputPanel = !modelsReady ? (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      Transcription model not configured yet — seed the fal speech-to-text model to enable Transcribe.
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="tr-audio">Audio</Label>
        <Input
          id="tr-audio"
          type="file"
          accept="audio/*"
          disabled={uploading}
          onChange={(e) => void handleUpload(e.target.files?.[0])}
        />
        {uploading ? (
          <p className="text-xs text-muted-foreground">Uploading…</p>
        ) : audio ? (
          <p className="text-xs text-muted-foreground">Uploaded: {audio.title ?? "audio file"}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Upload an audio recording (MP3, WAV, M4A, WEBM).
          </p>
        )}
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
    view?.status === "COMPLETED" && transcript ? (
      <div className="flex flex-col gap-2">
        <Textarea readOnly rows={8} value={transcript} className="resize-none" />
        <Button variant="secondary" size="sm" onClick={handleCopy} className="self-start">
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    ) : view?.status === "FAILED" ? (
      <p className="text-sm text-destructive">{view.error ?? "Transcription failed."}</p>
    ) : (
      <p className="text-sm text-muted-foreground">Your transcript will appear here</p>
    );

  return (
    <StudioShell
      title="Transcribe"
      description="Turn an audio recording into text with speech-to-text."
      estCost={modelsReady ? estCostChip : undefined}
      action={modelsReady ? generateButton : undefined}
      inputPanel={inputPanel}
      tracker={tracker}
      preview={preview}
    />
  );
}
