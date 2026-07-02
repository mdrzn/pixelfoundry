"use client";

import { useState } from "react";

import { submitTranslateTextAction } from "@/app/(dashboard)/dashboard/translate-text/_actions/submit-translate-text";
import { usePipelinePoller } from "@/app/(dashboard)/dashboard/multi-shot/_hooks/use-pipeline-poller";
import { PipelineTracker } from "@/components/studio/pipeline-tracker";
import { StudioShell } from "@/components/studio/studio-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupportedLanguage } from "@/lib/i18n/languages";

// Fixed llm cost (1 credit). Actual hold is computed server-side.
const EST_COST = 1;

export function TranslateTextForm({
  modelsReady,
  languages,
}: {
  modelsReady: boolean;
  languages: SupportedLanguage[];
}) {
  const [text, setText] = useState("");
  const [targetLanguage, setTargetLanguage] = useState(languages[0]?.code ?? "");
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const view = usePipelinePoller(pipelineId);
  const translation =
    (view?.outputData as { translation?: string } | null | undefined)?.translation ?? "";

  async function handleGenerate() {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await submitTranslateTextAction({ text, targetLanguage });
    if (res.ok) {
      setPipelineId(res.pipelineId);
    } else {
      setError(res.error);
    }
    setSubmitting(false);
  }

  async function handleCopy() {
    if (!translation) return;
    await navigator.clipboard.writeText(translation);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const estCostChip = <Badge variant="secondary">up to {EST_COST} credit</Badge>;

  const generateButton = (
    <Button onClick={handleGenerate} disabled={submitting || !text.trim() || !targetLanguage}>
      {submitting ? "Starting…" : "Generate"}
    </Button>
  );

  const inputPanel = !modelsReady ? (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      Translation model not configured yet — seed the fal any-llm model to enable Translate Text.
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="tt-source">Source text</Label>
        <Textarea
          id="tt-source"
          rows={8}
          maxLength={5000}
          placeholder="Paste the text you want to translate…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{text.length} / 5000 characters</p>
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
    view?.status === "COMPLETED" && translation ? (
      <div className="flex flex-col gap-2">
        <Textarea readOnly rows={8} value={translation} className="resize-none" />
        <Button variant="secondary" size="sm" onClick={handleCopy} className="self-start">
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    ) : view?.status === "FAILED" ? (
      <p className="text-sm text-destructive">{view.error ?? "Translation failed."}</p>
    ) : (
      <p className="text-sm text-muted-foreground">Your translation will appear here</p>
    );

  return (
    <StudioShell
      title="Translate Text"
      description="Translate any text into a target language with a single LLM call."
      estCost={modelsReady ? estCostChip : undefined}
      action={modelsReady ? generateButton : undefined}
      inputPanel={inputPanel}
      tracker={tracker}
      preview={preview}
    />
  );
}
