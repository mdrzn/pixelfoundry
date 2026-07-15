"use client";

import { useState } from "react";
import { FileImage } from "lucide-react";

import { submitTranslateImageAction } from "@/app/(dashboard)/dashboard/translate-image/_actions/submit-translate-image";
import { usePipelinePoller } from "@/app/(dashboard)/dashboard/multi-shot/_hooks/use-pipeline-poller";
import { PipelineTracker } from "@/components/studio/pipeline-tracker";
import { StudioEmptyState } from "@/components/studio/studio-empty-state";
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

// Approximate fixed estimate (image-edit ≈ 8). Actual hold is computed server-side.
const EST_COST = 8;

type UploadedImage = { id: string; url: string; title: string | null };

export function TranslateImageForm({
  modelsReady,
  languages,
}: {
  modelsReady: boolean;
  languages: SupportedLanguage[];
}) {
  const [image, setImage] = useState<UploadedImage | null>(null);
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
      setImage({ id: asset.id, url: asset.url, title: asset.title });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload image.");
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate() {
    if (!image || !targetLanguage) return;
    setSubmitting(true);
    setError(null);
    const res = await submitTranslateImageAction({
      imageAssetId: image.id,
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
    <Button onClick={handleGenerate} disabled={submitting || uploading || !image || !targetLanguage}>
      {submitting ? "Starting…" : "Generate"}
    </Button>
  );

  const inputPanel = !modelsReady ? (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      Image translation model not configured yet — seed the fal image-edit model to enable this tool.
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ti-image">Image</Label>
        <Input
          id="ti-image"
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => void handleUpload(e.target.files?.[0])}
        />
        {uploading ? (
          <p className="text-xs text-muted-foreground">Uploading…</p>
        ) : image ? (
          <p className="text-xs text-muted-foreground">Uploaded: {image.title ?? "image file"}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Upload an image with text (PNG, JPEG, WEBP, GIF).
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
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={view.outputUrl}
        alt="Translated image"
        className="w-full rounded-lg border"
      />
    ) : view?.status === "FAILED" ? (
      <p className="text-sm text-destructive">{view.error ?? "Image translation failed."}</p>
    ) : (
      <StudioEmptyState icon={FileImage} description="Your translated image will appear here." />
    );

  return (
    <StudioShell
      title="Translate Image"
      description="Translate the text inside an image into another language, preserving its layout."
      estCost={modelsReady ? estCostChip : undefined}
      action={modelsReady ? generateButton : undefined}
      inputPanel={inputPanel}
      tracker={tracker}
      preview={preview}
    />
  );
}
