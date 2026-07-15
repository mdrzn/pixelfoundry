"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import Link from "next/link";
import { Provider } from "@prisma/client";
import { Check, ImagePlus, Loader2, Plus, Save, SlidersHorizontal, Sparkles, Trash2, Settings2, Minus, RectangleHorizontal, RectangleVertical, Smartphone, Square, Wand2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSession } from "next-auth/react";

import {
  submitCreateImageAction,
  type CreateImageActionState,
} from "@/server/actions/create-image";
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
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CreateImageSidebar } from "./_components/create-image-sidebar";
import { CollapsibleSection } from "./_components/collapsible-section";
import { GenerationCanvas } from "./_components/generation-canvas";
import { ModelCombobox } from "./_components/model-combobox";
import { useModelCapabilities } from "@/hooks/use-model-capabilities";

type ModelOption = {
  value: string;
  label: string;
  description?: string | null;
  creditCost: number;
  providerLabel: string;
  provider: Provider;
  metadata: unknown;
};

type PresetReference = {
  assetId: string;
  asset: {
    id: string;
    title: string | null;
    url: string;
    thumbnail: string;
    createdAt: string;
  };
};

type PresetOption = {
  id: string;
  userId: string | null;
  visibility: "PRIVATE" | "TEAM" | "GLOBAL";
  name: string;
  description?: string | null;
  providerModelId: string | null;
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio?: string | null;
  width?: number | null;
  height?: number | null;
  cfgScale?: number | null;
  steps?: number | null;
  seed?: number | null;
  sampler?: string | null;
  outputCount?: number | null;
  upscale?: boolean | null;
  metadata?: unknown;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  references: PresetReference[];
  providerModel: {
    id: string;
    displayName: string;
    provider: Provider;
    creditCost: number | null;
    metadata: unknown;
  } | null;
};

type RecentAssetOption = {
  id: string;
  title: string | null;
  url: string;
  thumbnail: string;
  createdAt: string;
};

type ReferenceAsset = {
  id: string;
  title: string | null;
  url: string;
  thumbnail: string;
  createdAt?: string;
};

type CreateImageFormProps = {
  modelOptions: ModelOption[];
  presets: PresetOption[];
  recentAssets: RecentAssetOption[];
  currentUserId: string | null;
};

const DEFAULT_CFG_SCALE = 7.5;
const DEFAULT_STEPS = 30;
const DEFAULT_WIDTH = 1024;

// Quick aspect-ratio picker shown as icon buttons (2026 studio look).
const ASPECT_PRESETS: { value: string; label: string; icon: typeof Square }[] = [
  { value: "1:1", label: "1:1", icon: Square },
  { value: "16:9", label: "16:9", icon: RectangleHorizontal },
  { value: "4:5", label: "4:5", icon: RectangleVertical },
  { value: "3:2", label: "3:2", icon: RectangleHorizontal },
  { value: "9:16", label: "9:16", icon: Smartphone },
];

const NEGATIVE_PROMPT_SUGGESTIONS = [
  "blurry",
  "low resolution",
  "overexposed",
  "distorted anatomy",
  "text artifacts",
  "watermark",
  "muted colors",
];

const SAMPLER_OPTIONS = [
  "DPM++ 2M Karras",
  "Euler a",
  "UniPC",
  "DDIM",
  "Heun",
];

const STYLE_TEMPLATES = [
  {
    id: "cinematic",
    name: "Cinematic drama",
    prompt:
      "Cinematic wide-angle shot of a protagonist standing in gentle rain at dusk, dramatic rim lighting, volumetric fog, cinematic color grading",
    negativePrompt: "grainy, washed out, cartoonish, low detail",
    aspectRatio: "16:9",
  },
  {
    id: "illustration",
    name: "Whimsical illustration",
    prompt:
      "Hand-painted storybook illustration of a cozy forest cabin with warm glowing windows, lush foliage, soft watercolor textures, intricate whimsical details",
    negativePrompt: "photorealistic, harsh shadows, low detail, modern",
    aspectRatio: "4:5",
  },
  {
    id: "product",
    name: "Product spotlight",
    prompt:
      "Studio photograph of a premium gadget on a reflective surface, dramatic spotlight, gradient backdrop, crisp shadows, ultra sharp focus",
    negativePrompt: "fingerprints, dust, low contrast, reflections on lens",
    aspectRatio: "3:2",
  },
  {
    id: "portrait",
    name: "Editorial portrait",
    prompt:
      "Editorial portrait of a confident person lit with Rembrandt lighting, shallow depth of field, medium format cinematic look",
    negativePrompt: "overexposed, low contrast, awkward pose, harsh flash",
    aspectRatio: "4:5",
  },
];

function parseAspectRatio(value: string | undefined | null) {
  if (!value) return null;
  const [w, h] = value.split(":").map((segment) => Number(segment));
  if (!w || !h || Number.isNaN(w) || Number.isNaN(h)) {
    return null;
  }
  return { width: w, height: h };
}

function computeDimensionsFromRatio(aspectRatio: string | undefined | null, baseWidth: number) {
  const parsed = parseAspectRatio(aspectRatio);
  if (!parsed) {
    return { width: baseWidth, height: baseWidth };
  }
  const height = Math.round((baseWidth / parsed.width) * parsed.height);
  return { width: baseWidth, height };
}

function formatVisibilityLabel(visibility: PresetOption["visibility"]) {
  switch (visibility) {
    case "PRIVATE":
      return "Private";
    case "TEAM":
      return "Team";
    case "GLOBAL":
      return "Global";
    default:
      return visibility;
  }
}

function isImageMime(mime: string) {
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime);
}

export function CreateImageForm({
  modelOptions,
  presets,
  recentAssets,
  currentUserId,
}: CreateImageFormProps) {
  const [state, formAction] = useFormState(submitCreateImageAction, { ok: false } as CreateImageActionState);
  const { update } = useSession();
  const [selectedModelId, setSelectedModelId] = useState(modelOptions[0]?.value ?? "");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState(modelOptions.length ? "1:1" : "");
  const [customAspectRatio, setCustomAspectRatio] = useState("");
  const [manualDimensions, setManualDimensions] = useState(false);
  const [width, setWidth] = useState<number | undefined>();
  const [height, setHeight] = useState<number | undefined>();
  const [cfgScale, setCfgScale] = useState<number>(DEFAULT_CFG_SCALE);
  const [steps, setSteps] = useState<number>(DEFAULT_STEPS);
  const [seed, setSeed] = useState<number | undefined>();
  const [sampler, setSampler] = useState<string>(SAMPLER_OPTIONS[0] ?? "");
  const [upscale, setUpscale] = useState(false);
  const [outputCount, setOutputCount] = useState(1);
  const [enhancePrompt, setEnhancePrompt] = useState(false);
  const [referenceAssets, setReferenceAssets] = useState<ReferenceAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetVisibility, setPresetVisibility] = useState<"PRIVATE" | "TEAM" | "GLOBAL">("PRIVATE");
  const [presetDescription, setPresetDescription] = useState("");
  const [presetTags, setPresetTags] = useState("");
  const [isSavingPreset, startSavingPreset] = useTransition();
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetList, setPresetList] = useState<PresetOption[]>(presets);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [appliedPresetId, setAppliedPresetId] = useState<string>("");

  const dropzoneRef = useRef<HTMLDivElement>(null);

  const selectedModel = useMemo(
    () => modelOptions.find((option) => option.value === selectedModelId),
    [modelOptions, selectedModelId],
  );

  // Fetch model capabilities
  const { capabilities, isLoading: capabilitiesLoading } = useModelCapabilities(
    selectedModelId
  );

  useEffect(() => {
    if (!selectedModelId && modelOptions[0]) {
      setSelectedModelId(modelOptions[0].value);
    }
  }, [modelOptions, selectedModelId]);

  // Initialize dimensions from aspect ratio on mount
  useEffect(() => {
    if (!width && !height && aspectRatio) {
      const inferred = computeDimensionsFromRatio(aspectRatio, DEFAULT_WIDTH);
      setWidth(inferred.width);
      setHeight(inferred.height);
    }
  }, [aspectRatio, width, height]);

  useEffect(() => {
    setPresetList(presets);
  }, [presets]);

  useEffect(() => {
    if (state.ok) {
      void update();
      setReferenceAssets([]);
      setAppliedPresetId("");
      setSelectedPresetId("");
    }
  }, [state.ok, update]);


  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of files) {
        if (!isImageMime(file.type)) {
          setUploadError("Only PNG, JPEG, WEBP, or GIF files are supported.");
          continue;
        }
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Upload failed.");
        }
        const asset = (await response.json()) as {
          id: string;
          title: string | null;
          url: string;
          thumbnail: string;
          createdAt: string;
        };
        setReferenceAssets((previous) => {
          if (previous.some((item) => item.id === asset.id)) {
            return previous;
          }
          return [
            ...previous,
            {
              id: asset.id,
              title: asset.title,
              url: asset.url,
              thumbnail: asset.thumbnail,
              createdAt: asset.createdAt,
            },
          ];
        });
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to upload reference image.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files ?? []).filter((file) => isImageMime(file.type));
    void uploadFiles(files);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(event.clipboardData.files ?? []).filter((file) => isImageMime(file.type));
    if (items.length) {
      event.preventDefault();
      void uploadFiles(items);
    }
  }

  function toggleReferenceAsset(asset: RecentAssetOption) {
    setReferenceAssets((previous) => {
      if (previous.some((item) => item.id === asset.id)) {
        return previous.filter((item) => item.id !== asset.id);
      }
      return [
        ...previous,
        {
          id: asset.id,
          title: asset.title,
          url: asset.url,
          thumbnail: asset.thumbnail,
          createdAt: asset.createdAt,
        },
      ];
    });
  }

  function removeReferenceAsset(assetId: string) {
    setReferenceAssets((previous) => previous.filter((asset) => asset.id !== assetId));
  }

  function applyPreset(presetId: string) {
    const preset = presetList.find((item) => item.id === presetId);
    if (!preset) return;

    setPrompt(preset.prompt);
    setNegativePrompt(preset.negativePrompt ?? "");
    setSelectedPresetId(preset.id);
    setAppliedPresetId(preset.id);
    if (preset.providerModelId) {
      setSelectedModelId(preset.providerModelId);
    }
    if (preset.aspectRatio) {
      setAspectRatio(preset.aspectRatio ?? "");
      setCustomAspectRatio("");
      setManualDimensions(false);
    }
    if (preset.width && preset.height) {
      setWidth(preset.width);
      setHeight(preset.height);
      setManualDimensions(true);
    } else {
      const inferred = computeDimensionsFromRatio(preset.aspectRatio ?? aspectRatio, DEFAULT_WIDTH);
      setWidth(inferred.width);
      setHeight(inferred.height);
      setManualDimensions(false);
    }
    setCfgScale(preset.cfgScale ?? DEFAULT_CFG_SCALE);
    setSteps(preset.steps ?? DEFAULT_STEPS);
    setSeed(preset.seed ?? undefined);
    setSampler(preset.sampler ?? (SAMPLER_OPTIONS[0] ?? ""));
    setUpscale(Boolean(preset.upscale));
    setOutputCount(preset.outputCount ?? 1);

    setReferenceAssets(
      preset.references.map((reference) => ({
        id: reference.assetId,
        title: reference.asset.title,
        url: reference.asset.url,
        thumbnail: reference.asset.thumbnail,
        createdAt: reference.asset.createdAt,
      })),
    );
  }

  function resetDimensionsFromRatio() {
    const inferred = computeDimensionsFromRatio(aspectRatio || customAspectRatio, DEFAULT_WIDTH);
    setWidth(inferred.width);
    setHeight(inferred.height);
    setManualDimensions(false);
  }

  function handleAspectRatioChange(value: string) {
    if (value === "custom") {
      setAspectRatio("");
      setCustomAspectRatio("");
      setManualDimensions(true);
      return;
    }
    setAspectRatio(value);
    setCustomAspectRatio("");
    if (!manualDimensions) {
      const inferred = computeDimensionsFromRatio(value, width ?? DEFAULT_WIDTH);
      setWidth(inferred.width);
      setHeight(inferred.height);
    }
  }

  const referenceIds = referenceAssets.map((asset) => asset.id);

  async function handleSavePreset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPresetError(null);
    const tags = presetTags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    startSavingPreset(async () => {
      try {
        const response = await fetch("/api/presets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: presetName,
            description: presetDescription || undefined,
            visibility: presetVisibility,
            providerModelId: selectedModelId,
            prompt,
            negativePrompt,
            aspectRatio: aspectRatio || customAspectRatio || undefined,
            width,
            height,
            cfgScale,
            steps,
            seed,
            sampler,
            outputCount,
            upscale,
            tags,
            referenceAssetIds: referenceIds,
          }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Unable to save preset.");
        }

        const saved = (await response.json()) as PresetOption;
        setPresetList((previous) => {
          if (previous.some((item) => item.id === saved.id)) {
            return previous.map((item) => (item.id === saved.id ? saved : item));
          }
          return [...previous, saved].sort((a, b) => a.name.localeCompare(b.name));
        });
        setPresetDialogOpen(false);
        setPresetName("");
        setPresetDescription("");
        setPresetTags("");
        setPresetVisibility("PRIVATE");
        setSelectedPresetId(saved.id);
        setAppliedPresetId(saved.id);
      } catch (error) {
        setPresetError(error instanceof Error ? error.message : "Unable to save preset.");
      }
    });
  }

  async function handleDeletePreset(presetId: string) {
    const preset = presetList.find((item) => item.id === presetId);
    if (!preset) return;
    setPresetError(null);
    try {
      const response = await fetch(`/api/presets/${preset.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Unable to delete preset.");
      }
      setPresetList((previous) => previous.filter((item) => item.id !== preset.id));
      setSelectedPresetId("");
      setAppliedPresetId("");
    } catch (error) {
      setPresetError(error instanceof Error ? error.message : "Unable to delete preset.");
    }
  }

  const personalPresets = presetList.filter((preset) => preset.userId === currentUserId);
  const sharedPresets = presetList.filter((preset) => preset.userId !== currentUserId);

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-5 lg:flex-row">
      {/* Sidebar with form controls */}
      <form action={formAction} className="contents">
        <CreateImageSidebar
          footer={
            <div className="flex flex-col gap-3">
              <input type="hidden" name="sampler" value={sampler} />
              {/* Hidden inputs for reference assets - must be outside CollapsibleContent */}
              {referenceAssets.map((asset) => (
                <input key={asset.id} type="hidden" name="referenceAssetIds" value={asset.id} />
              ))}
              <Button
                type="submit"
                disabled={!modelOptions.length}
                size="lg"
                className="w-full justify-between border-0 bg-gradient-to-r from-brand to-brand-2 text-white shadow-md transition-opacity hover:opacity-95"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Generate Image
                </span>
                <span className="text-sm font-medium text-white/90">
                  {selectedModel?.creditCost ?? "…"} credits
                </span>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {state.ok && typeof state.balanceAfter === "number"
                  ? `Balance: ${state.balanceAfter} credits`
                  : `This will use ${selectedModel?.creditCost ?? "…"} credits from your balance.`}
              </p>
            </div>
          }
        >
          <div className="space-y-4">
          <div className="flex items-center gap-2.5 pb-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-2 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-none">Create Image</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Describe your idea and watch it come to life.
              </p>
            </div>
          </div>
          {capabilitiesLoading && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              Loading model capabilities...
            </div>
          )}
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
                  <span className="font-medium">
                    {state.jobCount && state.jobCount > 1
                      ? `${state.jobCount} requests queued`
                      : "Request queued"}
                  </span>
                </div>
                <span className="text-xs">
                  Check{" "}
                  <Link href="/dashboard/library" className="underline">
                    your library
                  </Link>{" "}
                  for outputs shortly
                </span>
              </div>
            </div>
          ) : null}

          {/* Essentials Section - Always visible */}
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
                      setAppliedPresetId("");
                      setSelectedPresetId("");
                    }}
                    disabled={!modelOptions.length}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Aspect ratio</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {ASPECT_PRESETS.map((option) => {
                      const Icon = option.icon;
                      const active = (aspectRatio || customAspectRatio) === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleAspectRatioChange(option.value)}
                          aria-pressed={active}
                          className={cn(
                            "flex flex-col items-center gap-1.5 rounded-lg border py-2.5 text-xs font-medium transition-colors",
                            active
                              ? "border-brand bg-brand/10 text-brand"
                              : "border-border bg-card text-muted-foreground hover:border-brand/40 hover:text-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <input type="hidden" name="aspectRatio" value={aspectRatio || customAspectRatio} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="prompt">Prompt</Label>
                  <button
                    type="button"
                    onClick={() => setEnhancePrompt((v) => !v)}
                    aria-pressed={enhancePrompt}
                    title="Auto-enhance the prompt with cinematic detail before generating"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      enhancePrompt
                        ? "bg-brand/10 text-brand"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    Enhance
                  </button>
                </div>
                <div className="relative">
                  <Textarea
                    id="prompt"
                    name="prompt"
                    placeholder="What do you want to create?"
                    rows={4}
                    required
                    maxLength={1200}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    className="pb-6"
                  />
                  <span className="pointer-events-none absolute bottom-2 right-3 text-[0.7rem] text-muted-foreground">
                    {prompt.length} / 1200
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {STYLE_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
                      onClick={() => {
                        setPrompt(template.prompt);
                        setNegativePrompt(template.negativePrompt ?? "");
                        if (template.aspectRatio) {
                          setAspectRatio(template.aspectRatio);
                          setCustomAspectRatio("");
                          setManualDimensions(false);
                          const inferred = computeDimensionsFromRatio(template.aspectRatio, DEFAULT_WIDTH);
                          setWidth(inferred.width);
                          setHeight(inferred.height);
                        }
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      {template.name}
                    </button>
                  ))}
                </div>
              </div>

              <CollapsibleSection
                title="Negative Prompt"
                subtitle="Specify elements to avoid in generation"
                defaultOpen={false}
                icon={<Minus className="h-4 w-4" />}
                summaryBadge={negativePrompt ? "Active" : null}
                disabled={!capabilities?.supportsNegativePrompt}
                disabledMessage="This model doesn't support negative prompts"
              >
                <div className="space-y-2">
                  <Textarea
                    id="negativePrompt"
                    name="negativePrompt"
                    placeholder="List any elements to avoid..."
                    rows={3}
                    value={negativePrompt}
                    onChange={(event) => setNegativePrompt(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2 text-xs">
                    {NEGATIVE_PROMPT_SUGGESTIONS.map((suggestion) => (
                      <Button
                        key={suggestion}
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (!negativePrompt.toLowerCase().includes(suggestion)) {
                            setNegativePrompt((previous) =>
                              previous
                                ? `${previous}, ${suggestion}`
                                : suggestion,
                            );
                          }
                        }}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title="Reference Images"
                subtitle="Upload or select images to guide the generation"
                defaultOpen={false}
                icon={<ImagePlus className="h-4 w-4" />}
                summaryBadge={referenceAssets.length > 0 ? `${referenceAssets.length} selected` : null}
                disabled={!capabilities?.supportsReferenceImages}
                disabledMessage="This model doesn't support reference images"
              >
                <div className="space-y-3">
                  <div
                    ref={dropzoneRef}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border border-dashed p-6 text-sm transition-colors",
                      uploading ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/70 hover:bg-muted/30",
                    )}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDrop}
                    onPaste={handlePaste}
                    role="button"
                    tabIndex={0}
                  >
                    <ImagePlus className="mb-2 h-6 w-6 text-muted-foreground" />
                    <p className="text-center text-sm text-muted-foreground">
                      Drag & drop, paste, or{" "}
                      <label className="cursor-pointer text-primary underline">
                        browse
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="sr-only"
                          multiple
                          onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            void uploadFiles(files);
                          }}
                        />
                      </label>{" "}
                      reference images.
                    </p>
                    {uploading ? (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading…
                      </div>
                    ) : null}
                    {uploadError ? <p className="mt-2 text-xs text-destructive">{uploadError}</p> : null}
                  </div>

                  {referenceAssets.length ? (
                    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {referenceAssets.map((asset) => (
                        <div key={asset.id} className="group relative overflow-hidden rounded-md border bg-muted/40">
                          <img
                            src={asset.thumbnail || asset.url}
                            alt={asset.title ?? "Reference"}
                            className="h-32 w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeReferenceAsset(asset.id)}
                            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove</span>
                          </button>
                          <div className="border-t p-2">
                            <p className="truncate text-xs font-medium">{asset.title ?? "Uploaded reference"}</p>
                            {asset.createdAt ? (
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(asset.createdAt), { addSuffix: true })}
                              </p>
                            ) : null}
                          </div>
                          <input type="hidden" name="referenceAssetIds" value={asset.id} />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {recentAssets.length ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase text-muted-foreground">Recent generations</p>
                      <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
                        {recentAssets.map((asset) => {
                          const isActive = referenceAssets.some((item) => item.id === asset.id);
                          return (
                            <button
                              type="button"
                              key={asset.id}
                              onClick={() => toggleReferenceAsset(asset)}
                              className={cn(
                                "relative overflow-hidden rounded-md border",
                                isActive ? "border-primary ring-2 ring-primary ring-offset-1" : "border-transparent bg-muted/40 hover:border-primary",
                              )}
                            >
                              <img src={asset.thumbnail || asset.url} alt={asset.title ?? "Asset"} className="h-20 w-full object-cover" />
                              <div className="border-t p-1 text-left">
                                <p className="truncate text-[11px] font-medium">{asset.title ?? "Library asset"}</p>
                                <p className="text-[10px] uppercase text-muted-foreground">
                                  {formatDistanceToNow(new Date(asset.createdAt), { addSuffix: true })}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title="Presets"
                subtitle="Apply or save curated settings"
                defaultOpen={false}
                icon={<Save className="h-4 w-4" />}
                summaryBadge={appliedPresetId ? presetList.find((p) => p.id === appliedPresetId)?.name : null}
              >
                <div className="space-y-4">
                  <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" size="sm" variant="outline">
                        <Save className="mr-2 h-4 w-4" />
                        Save preset
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <form onSubmit={handleSavePreset} className="space-y-4">
                        <DialogHeader>
                          <DialogTitle>Save preset</DialogTitle>
                          <DialogDescription>Capture the current prompt, references, and advanced settings.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                          <Label htmlFor="presetName">Name</Label>
                          <Input
                            id="presetName"
                            value={presetName}
                            onChange={(event) => setPresetName(event.target.value)}
                            required
                            placeholder="Cinematic hero shot"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="presetDescription">Description (optional)</Label>
                          <Textarea
                            id="presetDescription"
                            value={presetDescription}
                            onChange={(event) => setPresetDescription(event.target.value)}
                            rows={3}
                            placeholder="Explain when to use this preset..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="presetTags">Tags</Label>
                          <Input
                            id="presetTags"
                            value={presetTags}
                            onChange={(event) => setPresetTags(event.target.value)}
                            placeholder="Portrait, cinematic, promo"
                          />
                          <p className="text-xs text-muted-foreground">Separate tags with commas to make discovery easier.</p>
                        </div>
                        <div className="space-y-2">
                          <Label>Visibility</Label>
                          <Select
                            value={presetVisibility}
                            onValueChange={(value: "PRIVATE" | "TEAM" | "GLOBAL") => setPresetVisibility(value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PRIVATE">Private (only you)</SelectItem>
                              <SelectItem value="TEAM">Team (workspace)</SelectItem>
                              <SelectItem value="GLOBAL">Global (all users)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {presetError ? (
                          <p className="text-sm text-destructive">{presetError}</p>
                        ) : null}
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setPresetDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={isSavingPreset}>
                            {isSavingPreset ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving…
                              </>
                            ) : (
                              "Save preset"
                            )}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>

                  {presetError && !presetDialogOpen ? (
                  <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{presetError}</div>
                ) : null}

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="presetSelect">Load preset</Label>
                    <Select
                      value={selectedPresetId}
                      onValueChange={(value) => {
                        setSelectedPresetId(value);
                        applyPreset(value);
                      }}
                    >
                      <SelectTrigger id="presetSelect">
                        <SelectValue placeholder="Select a preset" />
                      </SelectTrigger>
                      <SelectContent>
                        {personalPresets.length ? (
                          <>
                            <SelectItem disabled value="__heading_my">
                              — My presets —
                            </SelectItem>
                            {personalPresets.map((preset) => (
                              <SelectItem key={preset.id} value={preset.id}>
                                {preset.name}
                              </SelectItem>
                            ))}
                          </>
                        ) : null}
                        {sharedPresets.length ? (
                          <>
                            <SelectItem disabled value="__heading_shared">
                              — Shared —
                            </SelectItem>
                            {sharedPresets.map((preset) => (
                              <SelectItem key={preset.id} value={preset.id}>
                                {preset.name} · {formatVisibilityLabel(preset.visibility)}
                              </SelectItem>
                            ))}
                          </>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedPresetId ? (
                    <div className="flex flex-col gap-3 rounded-md border border-muted-foreground/20 bg-muted/20 p-3 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{formatVisibilityLabel(presetList.find((item) => item.id === selectedPresetId)?.visibility ?? "PRIVATE")}</Badge>
                        <span className="font-medium">
                          {presetList.find((item) => item.id === selectedPresetId)?.name}
                        </span>
                      </div>
                      {presetList.find((item) => item.id === selectedPresetId)?.description ? (
                        <p className="text-muted-foreground">
                          {presetList.find((item) => item.id === selectedPresetId)?.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {presetList
                          .find((item) => item.id === selectedPresetId)
                          ?.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                      </div>
                      {presetList.find((item) => item.id === selectedPresetId)?.userId === currentUserId ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleDeletePreset(selectedPresetId)}>
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      ) : null}
                      <input type="hidden" name="appliedPresetId" value={appliedPresetId} />
                    </div>
                  ) : null}
                </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title="Advanced Options"
                subtitle="Fine-tune sampler, seed, and upscale settings"
                defaultOpen={false}
                icon={<Settings2 className="h-4 w-4" />}
              >
                <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="width">Width (px)</Label>
                        <Input
                          id="width"
                          name="width"
                          type="number"
                          min={256}
                          max={2048}
                          step={64}
                          value={width ?? ""}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isNaN(value)) {
                              setWidth(undefined);
                            } else {
                              setWidth(value);
                              setManualDimensions(true);
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="height">Height (px)</Label>
                        <Input
                          id="height"
                          name="height"
                          type="number"
                          min={256}
                          max={2048}
                          step={64}
                          value={height ?? ""}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isNaN(value)) {
                              setHeight(undefined);
                            } else {
                              setHeight(value);
                              setManualDimensions(true);
                            }
                          }}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={resetDimensionsFromRatio}
                    >
                      <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                      Reset to aspect ratio
                    </Button>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="cfgScale">CFG scale</Label>
                        <Input
                          id="cfgScale"
                          name="cfgScale"
                          type="number"
                          min={1}
                          max={30}
                          step={0.5}
                          value={cfgScale}
                          onChange={(event) => setCfgScale(Number(event.target.value) || DEFAULT_CFG_SCALE)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="steps">Steps</Label>
                        <Input
                          id="steps"
                          name="steps"
                          type="number"
                          min={10}
                          max={250}
                          step={1}
                          value={steps}
                          onChange={(event) => setSteps(Number(event.target.value) || DEFAULT_STEPS)}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="sampler">Sampler</Label>
                        <Select value={sampler} onValueChange={(value) => setSampler(value)}>
                          <SelectTrigger id="sampler">
                            <SelectValue placeholder="Sampler" />
                          </SelectTrigger>
                          <SelectContent>
                            {SAMPLER_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="seed">Seed</Label>
                        <Input
                          id="seed"
                          name="seed"
                          type="number"
                          min={0}
                          max={2_147_483_647}
                          value={seed ?? ""}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setSeed(Number.isNaN(value) ? undefined : value);
                          }}
                        />
                        <p className="text-xs text-muted-foreground">Leave blank for random seed. Each batch increment increases seed by 1.</p>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="outputCount">Batch size</Label>
                        <Input
                          id="outputCount"
                          name="outputCount"
                          type="number"
                          min={1}
                          max={8}
                          value={outputCount}
                          onChange={(event) => setOutputCount(Math.max(1, Number(event.target.value) || 1))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="flex items-center gap-2">
                          <Switch
                            checked={upscale}
                            onCheckedChange={setUpscale}
                            id="upscale-switch"
                          />
                          Enable upscale
                        </Label>
                        <input type="hidden" name="upscale" value={upscale ? "true" : "false"} />
                        <p className="text-xs text-muted-foreground">
                          Upscaling increases sharpness with a slight credit premium on some models.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="flex items-center gap-2">
                        <Switch
                          checked={enhancePrompt}
                          onCheckedChange={setEnhancePrompt}
                          id="enhance-switch"
                        />
                        Enhance prompt automatically
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Adds cinematic detail and camera hints to the prompt before submission.
                      </p>
                      <input type="hidden" name="enhancePrompt" value={enhancePrompt ? "true" : "false"} />
                    </div>
                </div>
              </CollapsibleSection>
          </div>
          </div>
        </CreateImageSidebar>
      </form>

      {/* Canvas with recent generations */}
      <div className="flex-1 overflow-y-auto rounded-xl border bg-card p-6 shadow-sm">
        <GenerationCanvas
          recentAssets={recentAssets}
          selectedAssetIds={referenceAssets.map((a) => a.id)}
          onAssetClick={(asset) => toggleReferenceAsset(asset)}
        />
      </div>
    </div>
  );
}
