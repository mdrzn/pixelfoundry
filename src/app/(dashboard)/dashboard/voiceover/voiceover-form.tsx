"use client";

import { useState } from "react";

import { submitVoiceoverAction } from "@/app/(dashboard)/dashboard/voiceover/_actions/submit-voiceover";
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

// Approximate fixed estimate (STT 2 + TTS 3 + clone 2 = 7). Actual hold is
// computed server-side by the pipeline definition.
const EST_COST = 7;

type UploadedAudio = { id: string; url: string; title: string | null };

export function VoiceoverForm({
  modelsReady,
  languages,
}: {
  modelsReady: boolean;
  languages: SupportedLanguage[];
}) {
  const [audio, setAudio] = useState<UploadedAudio | null>(null);
  const [targetLanguage, setTargetLanguage] = useState(languages[0]?.code ?? "");
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
    const res = await submitVoiceoverAction({
      audioAssetId: audio.id,
      targetLanguage,
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
    <Button
      onClick={handleGenerate}
      disabled={submitting || uploading || !audio || !targetLanguage}
    >
      {submitting ? "Starting…" : "Generate"}
    </Button>
  );

  const inputPanel = !modelsReady ? (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      Voice-over models not configured yet — seed the fal STT, TTS, and voice-clone
      models to enable Voice-over.
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="vo-audio">Audio</Label>
        <Input
          id="vo-audio"
          type="file"
          accept="audio/*"
          disabled={uploading}
          onChange={(e) => void handleUpload(e.target.files?.[0])}
        />
        {uploading ? (
          <p className="text-xs text-muted-foreground">Uploading…</p>
        ) : audio ? (
          <p className="text-xs text-muted-foreground">
            Uploaded: {audio.title ?? "audio file"}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Upload a voice recording (MP3, WAV, M4A, WEBM).
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Target language</Label>
        <Select value={targetLanguage} onValueChange={setTargetLanguage}>
          <SelectTrigger>
            <SelectValue placeholder="Select a target language" />
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
      <audio src={view.outputUrl} controls className="w-full" />
    ) : view?.status === "FAILED" ? (
      <p className="text-sm text-destructive">{view.error ?? "Generation failed."}</p>
    ) : (
      <p className="text-sm text-muted-foreground">Your voice-over will appear here</p>
    );

  return (
    <StudioShell
      title="Voice-over"
      description="Translate and re-voice an audio clip in your target language, keeping the original voice."
      estCost={modelsReady ? estCostChip : undefined}
      action={modelsReady ? generateButton : undefined}
      inputPanel={inputPanel}
      tracker={tracker}
      preview={preview}
    />
  );
}
