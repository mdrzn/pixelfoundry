"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Provider } from "@prisma/client";
import { Check, ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { formatDistanceToNow } from "date-fns";

import {
  submitEditImageAction,
  type EditImageActionState,
} from "@/server/actions/edit-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CreateImageSidebar } from "../create-image/_components/create-image-sidebar";
import { GenerationCanvas } from "../create-image/_components/generation-canvas";
import { ModelCombobox } from "../create-image/_components/model-combobox";
import { calculatePricing } from "@/lib/pricing-calculator";
import { cn } from "@/lib/utils";

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

type ReferenceAsset = {
  id: string;
  title: string | null;
  url: string;
  thumbnail: string;
  createdAt?: string;
};

type EditImageFormProps = {
  modelOptions: ModelOption[];
  recentAssets: RecentAssetOption[];
};

function isImageMime(mime: string) {
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime);
}

export function EditImageForm({ modelOptions, recentAssets }: EditImageFormProps) {
  const searchParams = useSearchParams();
  const prefillMode = searchParams.get("mode");
  const initialMode: "INPAINT" | "OUTPAINT" | "STYLE" =
    prefillMode === "OUTPAINT" || prefillMode === "STYLE" ? prefillMode : "INPAINT";
  const [mode, setMode] = useState<"INPAINT" | "OUTPAINT" | "STYLE">(initialMode);
  const [state, formAction] = useFormState(submitEditImageAction, {
    ok: false,
  } as EditImageActionState);
  const { update } = useSession();
  const modelParam = searchParams.get("providerModelId");
  const prefillPrompt = searchParams.get("prompt") ?? "";
  const prefillInput = searchParams.get("inputImageUrl") ?? "";
  const prefillMask = searchParams.get("maskUrl") ?? "";
  const isPrefill = searchParams.get("prefill") === "1";
  const sourceJobId = searchParams.get("sourceJobId");

  const initialModelId =
    modelParam && modelOptions.some((option) => option.value === modelParam)
      ? modelParam
      : modelOptions[0]?.value ?? "";

  const [selectedModelId, setSelectedModelId] = useState(initialModelId);
  const [referenceAssets, setReferenceAssets] = useState<ReferenceAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => modelOptions.find((option) => option.value === selectedModelId),
    [modelOptions, selectedModelId],
  );

  // Calculate dynamic pricing
  const pricing = useMemo(() => {
    if (!selectedModel) return null;
    return calculatePricing(selectedModel.creditCost, selectedModel.metadata);
  }, [selectedModel]);

  useEffect(() => {
    if (!selectedModelId && modelOptions[0]) {
      setSelectedModelId(modelOptions[0].value);
    }
  }, [modelOptions, selectedModelId]);

  useEffect(() => {
    if (state.ok) {
      void update();
      setReferenceAssets([]);
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

  const promptCopy = {
    INPAINT: "Describe how you want to modify the selected area...",
    OUTPAINT: "Extend the canvas and describe the new scene...",
    STYLE: "Provide styling guidance or reference URL...",
  } as const;

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-5 lg:flex-row">
      {/* Sidebar with form controls */}
      <form action={formAction} className="contents">
        <input type="hidden" name="mode" value={mode} />
        <input
          type="hidden"
          name="referenceAssetIds"
          value={referenceAssets.map((a) => a.id).join(",")}
        />
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
                  Apply Edit
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
                    <span className="font-medium">Edit request queued</span>
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
            {isPrefill ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                Prefilled{sourceJobId ? ` from job #${sourceJobId}` : ""}. Update fields before
                resubmitting.
              </div>
            ) : null}

            <div className="flex items-center gap-2.5 pb-1">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-2 text-white shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-none">Edit Image</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reimagine an existing image with AI.
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

                {/* Image Upload/Selection Section - Prominently Below Model */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Reference images (optional)</Label>
                    <p className="text-sm text-muted-foreground">
                      Upload or select images to use as input for editing.
                    </p>
                  </div>
                  <div
                    className="relative rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center transition-colors hover:border-muted-foreground/50"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const files = Array.from(e.dataTransfer.files);
                      void uploadFiles(files);
                    }}
                    onPaste={(e) => {
                      const items = Array.from(e.clipboardData.items);
                      const files = items
                        .filter((item) => item.kind === "file")
                        .map((item) => item.getAsFile())
                        .filter((file): file is File => file !== null);
                      if (files.length) {
                        void uploadFiles(files);
                      }
                    }}
                  >
                    <input
                      type="file"
                      id="reference-upload"
                      className="hidden"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        void uploadFiles(files);
                      }}
                    />
                    <label
                      htmlFor="reference-upload"
                      className="flex cursor-pointer flex-col items-center gap-2"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          <p className="text-sm font-medium">Uploading...</p>
                        </>
                      ) : (
                        <>
                          <ImagePlus className="h-6 w-6 text-muted-foreground" />
                          <p className="text-sm font-medium">Drop, paste, or click to browse</p>
                          <p className="text-xs text-muted-foreground">PNG, JPEG, WEBP, or GIF</p>
                        </>
                      )}
                    </label>
                  </div>
                  {uploadError ? (
                    <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {uploadError}
                    </div>
                  ) : null}
                  {referenceAssets.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Selected ({referenceAssets.length})</p>
                      <div className="grid grid-cols-3 gap-2">
                        {referenceAssets.map((asset) => (
                          <div key={asset.id} className="group relative aspect-square">
                            <img
                              src={asset.thumbnail}
                              alt={asset.title ?? "Reference image"}
                              className="h-full w-full rounded-md object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeReferenceAsset(asset.id)}
                              className="absolute right-1 top-1 rounded-md bg-destructive/90 p-1 text-destructive-foreground opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                              aria-label="Remove reference image"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {recentAssets.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Recent images</p>
                      <div className="grid grid-cols-3 gap-2">
                        {recentAssets.slice(0, 12).map((asset) => {
                          const isSelected = referenceAssets.some((r) => r.id === asset.id);
                          return (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() => toggleReferenceAsset(asset)}
                              className={cn(
                                "group relative aspect-square overflow-hidden rounded-md border-2 transition-all",
                                isSelected
                                  ? "border-primary ring-2 ring-primary/20"
                                  : "border-transparent hover:border-muted-foreground/25",
                              )}
                            >
                              <img
                                src={asset.thumbnail}
                                alt={asset.title ?? "Recent asset"}
                                className="h-full w-full object-cover"
                              />
                              {isSelected ? (
                                <div className="absolute inset-0 bg-primary/10" />
                              ) : null}
                              {asset.createdAt ? (
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                                  {formatDistanceToNow(new Date(asset.createdAt), {
                                    addSuffix: true,
                                  })}
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Edit Mode Tabs */}
                <div className="space-y-2">
                  <Label>Edit Mode</Label>
                  <Tabs
                    value={mode}
                    onValueChange={(value) => setMode(value as "INPAINT" | "OUTPAINT" | "STYLE")}
                  >
                    <TabsList className="w-full">
                      <TabsTrigger value="INPAINT" className="flex-1">
                        Inpaint
                      </TabsTrigger>
                      <TabsTrigger value="OUTPAINT" className="flex-1">
                        Outpaint
                      </TabsTrigger>
                      <TabsTrigger value="STYLE" className="flex-1">
                        Style
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* Source Image URL */}
                <div className="space-y-2">
                  <Label htmlFor="inputImageUrl">Source image URL</Label>
                  <Input
                    id="inputImageUrl"
                    name="inputImageUrl"
                    placeholder="https://..."
                    defaultValue={prefillInput}
                  />
                </div>

                {/* Mask URL */}
                <div className="space-y-2">
                  <Label htmlFor="maskUrl">Mask image URL (optional)</Label>
                  <Input
                    id="maskUrl"
                    name="maskUrl"
                    placeholder="https://..."
                    defaultValue={prefillMask}
                  />
                </div>

                {/* Prompt */}
                <div className="space-y-2">
                  <Label htmlFor="prompt">Prompt</Label>
                  <Textarea
                    id="prompt"
                    name="prompt"
                    placeholder={promptCopy[mode]}
                    rows={5}
                    required
                    key={mode}
                    defaultValue={prefillPrompt}
                  />
                </div>
              </div>
            </div>
          </div>
        </CreateImageSidebar>
      </form>

      {/* Canvas with recent generations */}
      <div className="flex-1 overflow-y-auto rounded-xl border bg-card p-6 shadow-sm">
        <GenerationCanvas
          recentAssets={recentAssets}
          emptyStateMessage="Your recent image edits will appear here. Start by editing your first image!"
          jobType="EDIT_IMAGE"
        />
      </div>
    </div>
  );
}
