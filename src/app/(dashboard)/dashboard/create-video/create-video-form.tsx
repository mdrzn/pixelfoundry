"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import Link from "next/link";
import { Provider } from "@prisma/client";
import { Check, Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";

import {
  submitCreateVideoAction,
  type CreateVideoActionState,
} from "@/server/actions/create-video";
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
import { Textarea } from "@/components/ui/textarea";
import { CreateImageSidebar } from "../create-image/_components/create-image-sidebar";
import { GenerationCanvas } from "../create-image/_components/generation-canvas";
import { ModelCombobox } from "../create-image/_components/model-combobox";
import {
  calculatePricing,
  getAvailableDurations,
  getAvailableResolutions,
  getAvailableAspectRatios,
} from "@/lib/pricing-calculator";

type ModelOption = {
  value: string;
  label: string;
  description?: string | null;
  creditCost: number;
  providerLabel: string;
  provider: Provider;
  metadata: unknown;
};

type RecentAssetOption = {
  id: string;
  title: string | null;
  url: string;
  thumbnail: string;
  createdAt: string;
};

type CreateVideoFormProps = {
  modelOptions: ModelOption[];
  recentAssets: RecentAssetOption[];
};

export function CreateVideoForm({ modelOptions, recentAssets }: CreateVideoFormProps) {
  const [state, formAction] = useFormState(submitCreateVideoAction, {
    ok: false,
  } as CreateVideoActionState);
  const { update } = useSession();
  const [selectedModelId, setSelectedModelId] = useState(modelOptions[0]?.value ?? "");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(4);
  const [aspectRatio, setAspectRatio] = useState("landscape");
  const [resolution, setResolution] = useState("720p");

  const selectedModel = useMemo(
    () => modelOptions.find((option) => option.value === selectedModelId),
    [modelOptions, selectedModelId],
  );

  // Get available options from model capabilities
  const availableDurations = useMemo(
    () => getAvailableDurations(selectedModel?.metadata),
    [selectedModel],
  );

  const availableResolutions = useMemo(
    () => getAvailableResolutions(selectedModel?.metadata),
    [selectedModel],
  );

  const availableAspectRatios = useMemo(
    () => getAvailableAspectRatios(selectedModel?.metadata),
    [selectedModel],
  );

  // Calculate dynamic pricing
  const pricing = useMemo(() => {
    if (!selectedModel) return null;
    return calculatePricing(selectedModel.creditCost, selectedModel.metadata, {
      duration,
      resolution,
    });
  }, [selectedModel, duration, resolution]);

  useEffect(() => {
    if (!selectedModelId && modelOptions[0]) {
      setSelectedModelId(modelOptions[0].value);
    }
  }, [modelOptions, selectedModelId]);

  useEffect(() => {
    // Reset duration if not available in new model
    if (!availableDurations.includes(duration)) {
      setDuration(availableDurations[0] ?? 4);
    }
  }, [availableDurations, duration]);

  useEffect(() => {
    // Reset resolution if not available in new model
    if (!availableResolutions.includes(resolution)) {
      setResolution(availableResolutions[0] ?? "720p");
    }
  }, [availableResolutions, resolution]);

  useEffect(() => {
    // Reset aspect ratio if not available in new model
    if (!availableAspectRatios.includes(aspectRatio)) {
      setAspectRatio(availableAspectRatios[0] ?? "landscape");
    }
  }, [availableAspectRatios, aspectRatio]);

  useEffect(() => {
    if (state.ok) {
      void update();
      setPrompt("");
    }
  }, [state.ok, update]);

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-5 lg:flex-row">
      {/* Sidebar with form controls */}
      <form action={formAction} className="contents">
        <CreateImageSidebar
          footer={
            <div className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={!modelOptions.length}
                size="lg"
                className="w-full justify-between border-0 bg-gradient-to-r from-brand to-brand-2 text-white shadow-md transition-opacity hover:opacity-95"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Generate Video
                </span>
                <span className="text-sm font-medium text-white/90">
                  {pricing?.totalCredits ?? selectedModel?.creditCost ?? "…"} credits
                </span>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {state.ok && typeof state.balanceAfter === "number"
                  ? `Balance: ${state.balanceAfter} credits`
                  : `This will use ${pricing?.totalCredits ?? selectedModel?.creditCost ?? "…"} credits from your balance.`}
              </p>
            </div>
          }
        >
          <div className="space-y-4">
            {state.error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </div>
            ) : null}
            {state.ok ? (
              <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    <span className="font-medium">Video request queued</span>
                  </div>
                  <span className="text-xs">
                    Check{" "}
                    <Link href="/dashboard/library" className="underline">
                      your library
                    </Link>{" "}
                    for output shortly
                  </span>
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2.5 pb-1">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-2 text-white shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-none">Create Video</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Synthesize motion from text or images.
                </p>
              </div>
            </div>

            {/* Essentials Section */}
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <input type="hidden" name="providerModelId" value={selectedModelId} />
                  <ModelCombobox
                    models={modelOptions}
                    value={selectedModelId}
                    onValueChange={(value) => {
                      setSelectedModelId(value);
                    }}
                    disabled={!modelOptions.length}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration</Label>
                  <Select
                    value={duration.toString()}
                    onValueChange={(value) => setDuration(Number(value))}
                  >
                    <SelectTrigger id="duration">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDurations.map((d) => (
                        <SelectItem key={d} value={d.toString()}>
                          {d} seconds
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="duration" value={duration} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="aspectRatio">Aspect Ratio</Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger id="aspectRatio">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAspectRatios.map((ar) => (
                        <SelectItem key={ar} value={ar}>
                          {ar.charAt(0).toUpperCase() + ar.slice(1)} (
                          {ar === "portrait" ? "720x1280" : "1280x720"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="aspectRatio" value={aspectRatio} />
                </div>

                {availableResolutions.length > 1 && (
                  <div className="space-y-2">
                    <Label htmlFor="resolution">Resolution</Label>
                    <Select value={resolution} onValueChange={setResolution}>
                      <SelectTrigger id="resolution">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableResolutions.map((res) => (
                          <SelectItem key={res} value={res}>
                            {res}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="resolution" value={resolution} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="prompt">Prompt</Label>
                  <Textarea
                    id="prompt"
                    name="prompt"
                    placeholder="Describe the video scene, motion, and subject..."
                    rows={5}
                    required
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                  />
                </div>

                {pricing && pricing.unitType === "second" && (
                  <div className="rounded-md border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
                    <p>
                      <strong>Pricing:</strong> {pricing.creditsPerUnit} credits/second × {duration}s
                      = <strong>{pricing.totalCredits} credits</strong>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CreateImageSidebar>
      </form>

      {/* Canvas with recent generations */}
      <div className="flex-1 overflow-y-auto rounded-xl border bg-card p-6 shadow-sm">
        <GenerationCanvas
          recentAssets={recentAssets}
          emptyStateMessage="Your recent video generations will appear here. Start by creating your first video!"
          jobType="CREATE_VIDEO"
        />
      </div>
    </div>
  );
}
