"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FilterIcon,
  Grid2X2Icon,
  Grid3X3Icon,
  InfoIcon,
  LayersIcon,
  ListIcon,
  PencilIcon,
  RefreshCcwIcon,
  SearchIcon,
  Share2Icon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { deleteAssetsAction, deleteJobsAction, getAssetUsageAction, rerunJobAction, updateAssetMetadataAction } from "@/server/actions/library";
import type { AssetLibraryItem, LibraryAsset } from "@/types/library";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { ShareAssetDialog } from "./share-asset-dialog";
import { useShareActions } from "./use-share-actions";

type SortOption = "created-desc" | "created-asc" | "title" | "status" | "favorite";
type GridMode = "comfortable" | "compact" | "list";
type StatusFilter = "all" | LibraryAsset["jobStatus"] | "failed";

const statusLabels: Record<LibraryAsset["jobStatus"], string> = {
  QUEUED: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

const typeLabels: Record<LibraryAsset["jobType"], string> = {
  CREATE_IMAGE: "Image",
  EDIT_IMAGE: "Edit",
  CREATE_VIDEO: "Video",
};

function sanitizeFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-z0-9\-\._]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "download"
  );
}

function buildDownloadFileName(asset: LibraryAsset) {
  const baseTitle = sanitizeFileName(asset.title ?? asset.prompt.slice(0, 40) ?? asset.jobId);
  const extension = asset.assetType === "VIDEO" ? "mp4" : "png";
  return `${baseTitle}.${extension}`;
}

function buildDuplicateUrl(asset: LibraryAsset) {
  const params = new URLSearchParams();
  params.set("sourceJobId", asset.jobId);
  params.set("prefill", "1");
  params.set("prompt", asset.prompt);

  if (asset.negativePrompt) {
    params.set("negativePrompt", asset.negativePrompt);
  }
  if (asset.providerModelId) {
    params.set("providerModelId", asset.providerModelId);
  }

  switch (asset.jobType) {
    case "CREATE_IMAGE":
      if (asset.aspectRatio) {
        params.set("aspectRatio", asset.aspectRatio);
      }
      return `/dashboard/create-image?${params.toString()}`;
    case "EDIT_IMAGE":
      if (asset.mode) {
        params.set("mode", asset.mode);
      }
      if (asset.inputImageUrl) {
        params.set("inputImageUrl", asset.inputImageUrl);
      }
      if (asset.maskUrl) {
        params.set("maskUrl", asset.maskUrl);
      }
      return `/dashboard/edit-image?${params.toString()}`;
    case "CREATE_VIDEO":
      if (asset.duration !== null && !Number.isNaN(asset.duration)) {
        params.set("duration", String(asset.duration));
      }
      if (asset.frameRate !== null && !Number.isNaN(asset.frameRate)) {
        params.set("frameRate", String(asset.frameRate));
      }
      if (asset.referenceUrl) {
        params.set("referenceUrl", asset.referenceUrl);
      }
      return `/dashboard/create-video?${params.toString()}`;
    default:
      return `/dashboard/create-image?${params.toString()}`;
  }
}

function filterByStatus(asset: LibraryAsset, status: StatusFilter) {
  if (status === "all") {
    return true;
  }
  if (status === "failed") {
    return asset.jobStatus === "FAILED";
  }
  return asset.jobStatus === status;
}

function matchesSearch(asset: LibraryAsset, term: string) {
  if (!term.trim()) {
    return true;
  }
  const haystack = [
    asset.title ?? "",
    asset.prompt,
    asset.negativePrompt ?? "",
    asset.jobId,
    asset.tags.join(" "),
    asset.collections.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(term.toLowerCase());
}

function sortAssets(assets: LibraryAsset[], option: SortOption) {
  return [...assets].sort((a, b) => {
    switch (option) {
      case "title":
        return (a.title ?? "").localeCompare(b.title ?? "");
      case "status":
        return a.jobStatus.localeCompare(b.jobStatus);
      case "favorite":
        if (a.isFavorite === b.isFavorite) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return a.isFavorite ? -1 : 1;
      case "created-asc":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "created-desc":
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
}

function formatRelative(iso: string | null) {
  if (!iso) return "—";
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

type LibraryPageClientProps = {
  generationAssets: LibraryAsset[];
  libraryAssets: AssetLibraryItem[];
};

const ALL_COLLECTIONS = "__library_all__";
const UNCATEGORIZED_COLLECTION = "__library_uncategorized__";

export function LibraryPageClient({ generationAssets, libraryAssets }: LibraryPageClientProps) {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<"generations" | "assets">("generations");
  const [items, setItems] = useState<LibraryAsset[]>(generationAssets);
  const [assetItems, setAssetItems] = useState<AssetLibraryItem[]>(libraryAssets);
  const [tab, setTab] = useState<"all" | "image" | "video">("all");
  const [assetUsageFilter, setAssetUsageFilter] = useState<"all" | "used" | "unused">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("created-desc");
  const [gridMode, setGridMode] = useState<GridMode>("comfortable");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState<string>(ALL_COLLECTIONS);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [hideFailedJobs, setHideFailedJobs] = useState(false);
  const [lightboxAsset, setLightboxAsset] = useState<LibraryAsset | null>(null);
  const [detailsAsset, setDetailsAsset] = useState<LibraryAsset | null>(null);
  const [assetDetailsItem, setAssetDetailsItem] = useState<AssetLibraryItem | null>(null);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error"; message: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    shareAsset,
    shareState,
    openShareForAsset,
    closeShareDialog,
    fetchShareLink,
    revokeShareLink,
  } = useShareActions(items, setItems);

  useEffect(() => {
    setItems(generationAssets);
  }, [generationAssets]);

  useEffect(() => {
    setAssetItems(libraryAssets);
  }, [libraryAssets]);

  useEffect(() => {
    if (feedback) {
      const timeout = window.setTimeout(() => setFeedback(null), 4000);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [feedback]);

  const { collectionOptions, hasUncategorizedCollection } = useMemo(() => {
    const normalized = new Set<string>();
    let hasUncategorized = false;

    items.forEach((item) => {
      if (item.collections.length === 0) {
        hasUncategorized = true;
      }
      item.collections.forEach((collection) => {
        const trimmed = collection.trim();
        if (trimmed.length > 0) {
          normalized.add(trimmed);
        } else {
          hasUncategorized = true;
        }
      });
    });

    return {
      collectionOptions: Array.from(normalized).sort((a, b) => a.localeCompare(b)),
      hasUncategorizedCollection: hasUncategorized,
    };
  }, [items]);

  useEffect(() => {
    if (
      collectionFilter !== ALL_COLLECTIONS &&
      collectionFilter !== UNCATEGORIZED_COLLECTION &&
      !collectionOptions.includes(collectionFilter)
    ) {
      setCollectionFilter(ALL_COLLECTIONS);
    }
  }, [collectionFilter, collectionOptions]);

  const tags = useMemo(() => {
    const all = new Set<string>();
    items.forEach((item) => item.tags.forEach((tag) => all.add(tag)));
    return Array.from(all).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    const byType = items.filter((asset) => {
      if (tab === "image") {
        return asset.assetType === "IMAGE";
      }
      if (tab === "video") {
        return asset.assetType === "VIDEO";
      }
      return true;
    });

    const byStatus = byType.filter((asset) => filterByStatus(asset, statusFilter));

    const byFailedFilter = hideFailedJobs
      ? byStatus.filter((asset) => asset.jobStatus !== "FAILED")
      : byStatus;

    const byFavorite = favoriteOnly ? byFailedFilter.filter((asset) => asset.isFavorite) : byFailedFilter;

    const byCollection = (() => {
      if (collectionFilter === ALL_COLLECTIONS) {
        return byFavorite;
      }
      if (collectionFilter === UNCATEGORIZED_COLLECTION) {
        return byFavorite.filter((asset) => asset.collections.length === 0);
      }
      return byFavorite.filter((asset) =>
        asset.collections.some((collection) => collection === collectionFilter),
      );
    })();

    const byTags =
      activeTags.length > 0
        ? byCollection.filter((asset) =>
            activeTags.every((tag) => asset.tags.includes(tag)),
          )
        : byCollection;

    const bySearch = byTags.filter((asset) => matchesSearch(asset, searchTerm));

    return sortAssets(bySearch, sortOption);
  }, [items, tab, statusFilter, hideFailedJobs, favoriteOnly, collectionFilter, activeTags, searchTerm, sortOption]);

  const filteredAssetItems = useMemo(() => {
    // Assets tab only shows uploaded files, not generated outputs
    const uploadedOnly = assetItems.filter((asset) => asset.source === "uploaded");

    const byType = uploadedOnly.filter((asset) => {
      if (tab === "image") {
        return asset.type === "IMAGE";
      }
      if (tab === "video") {
        return asset.type === "VIDEO";
      }
      return true;
    });

    const bySource = byType;

    const byUsage = (() => {
      if (assetUsageFilter === "all") return bySource;
      if (assetUsageFilter === "used") return bySource.filter((asset) => asset.usageCount > 0 || asset.isJobOutput);
      if (assetUsageFilter === "unused") return bySource.filter((asset) => asset.usageCount === 0 && !asset.isJobOutput);
      return bySource;
    })();

    const byFavorite = favoriteOnly ? byUsage.filter((asset) => asset.isFavorite) : byUsage;

    const byCollection = (() => {
      if (collectionFilter === ALL_COLLECTIONS) {
        return byFavorite;
      }
      if (collectionFilter === UNCATEGORIZED_COLLECTION) {
        return byFavorite.filter((asset) => asset.collections.length === 0);
      }
      return byFavorite.filter((asset) =>
        asset.collections.some((collection) => collection === collectionFilter),
      );
    })();

    const byTags =
      activeTags.length > 0
        ? byCollection.filter((asset) =>
            activeTags.every((tag) => asset.tags.includes(tag)),
          )
        : byCollection;

    const bySearch = byTags.filter((asset) => {
      if (!searchTerm.trim()) return true;
      const haystack = [
        asset.title ?? "",
        asset.id,
        asset.tags.join(" "),
        asset.collections.join(" "),
        asset.uploadInfo?.originalName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchTerm.toLowerCase());
    });

    // Sort assets
    return [...bySearch].sort((a, b) => {
      switch (sortOption) {
        case "title":
          return (a.title ?? "").localeCompare(b.title ?? "");
        case "favorite":
          if (a.isFavorite === b.isFavorite) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          return a.isFavorite ? -1 : 1;
        case "created-asc":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "created-desc":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [assetItems, tab, assetUsageFilter, favoriteOnly, collectionFilter, activeTags, searchTerm, sortOption]);

  const handleToggleSelect = (assetId: string, next: boolean) => {
    setSelectedIds((prev) => {
      if (next) {
        return prev.includes(assetId) ? prev : [...prev, assetId];
      }
      return prev.filter((id) => id !== assetId);
    });
  };

  const handleSelectAllVisible = (value: boolean) => {
    if (value) {
      setSelectedIds(filteredItems.map((asset) => asset.id));
    } else {
      setSelectedIds([]);
    }
  };

  const updateLocalAsset = (assetId: string, updater: (asset: LibraryAsset) => LibraryAsset) => {
    setItems((prev) => prev.map((asset) => (asset.id === assetId ? updater(asset) : asset)));
  };

  const handleFavorite = (asset: LibraryAsset, nextFavorite: boolean) => {
    if (!asset.assetId) {
      setFeedback({
        variant: "error",
        message: "This job has no downloadable asset yet.",
      });
      return;
    }

    startTransition(() => {
      updateAssetMetadataAction({ assetId: asset.assetId as string, favorite: nextFavorite })
        .then((result) => {
          if (!result?.ok) {
            setFeedback({ variant: "error", message: result?.error ?? "Unable to update favorite." });
            return;
          }
          updateLocalAsset(asset.id, (current) => ({
            ...current,
            isFavorite: nextFavorite,
          }));
          setFeedback({
            variant: "success",
            message: nextFavorite ? "Marked as favorite." : "Removed from favorites.",
          });
        })
        .catch(() => {
          setFeedback({ variant: "error", message: "Unable to update favorite." });
        });
    });
  };

  const handleDownload = async (asset: LibraryAsset) => {
    if (!asset.assetId) {
      setFeedback({ variant: "error", message: "No downloadable file available for this job yet." });
      return;
    }

    try {
      setDownloading(true);
      const response = await fetch(`/api/assets/${asset.assetId}/download`);
      if (!response.ok) {
        throw new Error("download failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildDownloadFileName(asset);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setFeedback({ variant: "success", message: "Download started." });
    } catch {
      setFeedback({ variant: "error", message: "Unable to download asset." });
    } finally {
      setDownloading(false);
    }
  };

  const handleBulkDownload = async () => {
    if (selectedIds.length === 0) return;
    const assetsToDownload = items.filter((asset) => selectedIds.includes(asset.id));
    setDownloading(true);
    try {
      for (const asset of assetsToDownload) {
        if (!asset.assetId) continue;
        await handleDownload(asset);
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteSelected = () => {
    const assetIds = items
      .filter((asset) => selectedIds.includes(asset.id) && asset.assetId)
      .map((asset) => asset.assetId as string);

    if (assetIds.length === 0) {
      setFeedback({ variant: "error", message: "Select assets that have outputs before deleting." });
      return;
    }

    if (!window.confirm("Delete selected assets? This will not cancel the original jobs.")) {
      return;
    }

    startTransition(() => {
      deleteAssetsAction(assetIds)
        .then((result) => {
          if (!result?.ok) {
            setFeedback({ variant: "error", message: result?.error ?? "Unable to delete assets." });
            return;
          }

          setItems((prev) => prev.filter((asset) => !selectedIds.includes(asset.id)));
          setSelectedIds([]);
          setFeedback({ variant: "success", message: "Assets removed from library." });
        })
        .catch(() => {
          setFeedback({ variant: "error", message: "Unable to delete assets." });
        });
    });
  };

  const handleSaveMetadata = (asset: LibraryAsset, nextTags: string[], nextCollections: string[]) => {
    if (!asset.assetId) {
      setFeedback({
        variant: "error",
        message: "Cannot edit metadata until the asset is available.",
      });
      return;
    }

    startTransition(() => {
      updateAssetMetadataAction({
        assetId: asset.assetId as string,
        tags: nextTags,
        collections: nextCollections,
      })
        .then((result) => {
          if (!result?.ok) {
            setFeedback({ variant: "error", message: result?.error ?? "Unable to update metadata." });
            return;
          }

          updateLocalAsset(asset.id, (current) => ({
            ...current,
            tags: nextTags,
            collections: nextCollections,
          }));
          setFeedback({ variant: "success", message: "Metadata updated." });
        })
        .catch(() => {
          setFeedback({ variant: "error", message: "Unable to update metadata." });
        });
    });
  };

  const handleRerun = (asset: LibraryAsset) => {
    startTransition(() => {
      rerunJobAction(asset.jobId)
        .then((result) => {
          if (!result?.ok) {
            setFeedback({ variant: "error", message: result?.error ?? "Unable to rerun job." });
            return;
          }
          setFeedback({ variant: "success", message: "Job re-queued with original parameters." });
          router.refresh();
        })
        .catch(() => {
          setFeedback({ variant: "error", message: "Unable to rerun job." });
        });
    });
  };

  const toggleTagFilter = (tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag]));
  };

  const handleAssetFavorite = (asset: AssetLibraryItem, nextFavorite: boolean) => {
    startTransition(() => {
      updateAssetMetadataAction({ assetId: asset.id, favorite: nextFavorite })
        .then((result) => {
          if (!result?.ok) {
            setFeedback({ variant: "error", message: result?.error ?? "Unable to update favorite." });
            return;
          }
          setAssetItems((prev) =>
            prev.map((item) => (item.id === asset.id ? { ...item, isFavorite: nextFavorite } : item)),
          );
          setFeedback({
            variant: "success",
            message: nextFavorite ? "Marked as favorite." : "Removed from favorites.",
          });
        })
        .catch(() => {
          setFeedback({ variant: "error", message: "Unable to update favorite." });
        });
    });
  };

  const handleAssetDownload = async (asset: AssetLibraryItem) => {
    try {
      setDownloading(true);
      const response = await fetch(`/api/assets/${asset.id}/download`);
      if (!response.ok) {
        throw new Error("download failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = sanitizeFileName(asset.title ?? asset.id) + (asset.type === "VIDEO" ? ".mp4" : ".png");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setFeedback({ variant: "success", message: "Download started." });
    } catch {
      setFeedback({ variant: "error", message: "Unable to download asset." });
    } finally {
      setDownloading(false);
    }
  };

  const handleAssetDelete = (asset: AssetLibraryItem) => {
    const usageText = asset.usageCount > 0
      ? `\n\nThis asset is used as reference in ${asset.usageCount} job${asset.usageCount > 1 ? 's' : ''}.`
      : "";
    const outputText = asset.isJobOutput ? "\n\nThis asset is a generated output." : "";

    const confirmMessage = `Delete this asset? This action cannot be undone.${usageText}${outputText}`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    startTransition(() => {
      deleteAssetsAction([asset.id])
        .then((result) => {
          if (!result?.ok) {
            setFeedback({ variant: "error", message: result?.error ?? "Unable to delete asset." });
            return;
          }
          setAssetItems((prev) => prev.filter((item) => item.id !== asset.id));
          setFeedback({ variant: "success", message: "Asset deleted." });
        })
        .catch(() => {
          setFeedback({ variant: "error", message: "Unable to delete asset." });
        });
    });
  };

  const handleAssetSaveMetadata = (asset: AssetLibraryItem, nextTags: string[], nextCollections: string[]) => {
    startTransition(() => {
      updateAssetMetadataAction({
        assetId: asset.id,
        tags: nextTags,
        collections: nextCollections,
      })
        .then((result) => {
          if (!result?.ok) {
            setFeedback({ variant: "error", message: result?.error ?? "Unable to update metadata." });
            return;
          }

          setAssetItems((prev) =>
            prev.map((item) =>
              item.id === asset.id
                ? { ...item, tags: nextTags, collections: nextCollections }
                : item,
            ),
          );
          setFeedback({ variant: "success", message: "Metadata updated." });
        })
        .catch(() => {
          setFeedback({ variant: "error", message: "Unable to update metadata." });
        });
    });
  };

  const gridClasses = cn(
    "grid gap-6",
    gridMode === "list"
      ? "grid-cols-1"
      : gridMode === "compact"
        ? "sm:grid-cols-2 xl:grid-cols-4"
        : "sm:grid-cols-2 xl:grid-cols-3",
  );

  const renderAssets = () => {
    if (filteredItems.length === 0) {
      return (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">No assets found</CardTitle>
            <CardDescription>
              Adjust your filters or head to a creation workflow to queue more jobs.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <div className={gridClasses}>
        {filteredItems.map((asset) => {
          const isSelected = selectedIds.includes(asset.id);
          const isFailed = asset.jobStatus === "FAILED";
          const isProcessing = asset.jobStatus === "PROCESSING" || asset.jobStatus === "QUEUED";

          // Status badge styling
          const statusBadgeClass = cn(
            "font-medium",
            asset.jobStatus === "COMPLETED" && "bg-emerald-100 text-emerald-800 border-emerald-300",
            asset.jobStatus === "PROCESSING" && "bg-blue-100 text-blue-800 border-blue-300",
            asset.jobStatus === "QUEUED" && "bg-gray-100 text-gray-800 border-gray-300",
            asset.jobStatus === "FAILED" && "bg-red-100 text-red-800 border-red-300",
          );

          return (
            <Card
              key={asset.id}
              className={cn(
                "group relative overflow-hidden transition-all",
                isSelected ? "border-primary ring-2 ring-primary/40" : "",
                isFailed && "opacity-75 hover:opacity-100",
              )}
            >
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleSelect(asset.id, !isSelected)}
                  className={cn(
                    "flex size-5 items-center justify-center rounded-sm border bg-background text-xs font-semibold transition shadow-sm",
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted hover:border-primary/50",
                  )}
                >
                  {isSelected ? <CheckIcon className="size-4" /> : ""}
                </button>
                <Badge variant="outline" className={statusBadgeClass}>
                  {statusLabels[asset.jobStatus]}
                </Badge>
                <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300">
                  {typeLabels[asset.jobType]}
                </Badge>
                {asset.jobStatus === "COMPLETED" && asset.cost > 0 && (
                  <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-300">
                    {asset.cost} credits
                  </Badge>
                )}
              </div>
              {asset.isFavorite && (
                <div className="absolute right-3 top-3 z-10">
                  <StarIcon className="size-5 fill-amber-400 text-amber-400 drop-shadow" />
                </div>
              )}
              <button
                type="button"
                onClick={() => setLightboxAsset(asset)}
                className="relative block w-full group/image"
              >
                {asset.previewUrl ? (
                  asset.assetType === "IMAGE" ? (
                    <div className="relative aspect-video w-full bg-muted overflow-hidden">
                      <Image
                        src={asset.previewUrl}
                        alt={asset.title ?? asset.prompt}
                        fill
                        unoptimized
                        className="object-cover transition duration-300 group-hover/image:scale-105"
                      />
                      {/* Hover overlay with quick actions */}
                      <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/30 transition-colors duration-200 flex items-center justify-center gap-3 opacity-0 group-hover/image:opacity-100">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="shadow-lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(asset);
                          }}
                          disabled={!asset.assetId}
                        >
                          <DownloadIcon className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="shadow-lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            openShareForAsset(asset);
                          }}
                          disabled={!asset.assetId}
                        >
                          <Share2Icon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <video
                      src={asset.previewUrl}
                      className="aspect-video w-full bg-black object-cover"
                      controls={false}
                      muted
                      playsInline
                      loop
                    />
                  )
                ) : (
                  <div className={cn(
                    "flex aspect-video w-full flex-col items-center justify-center gap-2 px-6 text-center text-sm",
                    isFailed ? "bg-red-50/50 text-red-600" : "bg-muted/70 text-muted-foreground"
                  )}>
                    {isProcessing ? (
                      <>
                        <div className="relative">
                          <SparklesIcon className="size-6 animate-pulse" />
                          <div className="absolute inset-0 animate-ping opacity-30">
                            <SparklesIcon className="size-6" />
                          </div>
                        </div>
                        <span className="font-medium">
                          {asset.jobStatus === "PROCESSING" ? "Processing..." : "Queued"}
                        </span>
                      </>
                    ) : (
                      <>
                        <XIcon className="size-6" />
                        <span className="font-medium">Job failed</span>
                      </>
                    )}
                  </div>
                )}
              </button>
              <CardHeader className="space-y-1.5">
                <CardTitle className="line-clamp-2 text-base font-semibold">
                  {asset.title ?? asset.prompt.slice(0, 60) + (asset.prompt.length > 60 ? "..." : "")}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span>{formatRelative(asset.createdAt)}</span>
                  <span>•</span>
                  <span
                    className="cursor-help underline decoration-dotted"
                    title={`Job ID: ${asset.jobId}`}
                  >
                    Job
                  </span>
                </CardDescription>
              </CardHeader>
              {!isFailed && (
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p className="line-clamp-2 text-xs">{asset.prompt}</p>
                  {asset.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {asset.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          #{tag}
                        </Badge>
                      ))}
                      {asset.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{asset.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              )}
              <CardFooter className="flex flex-wrap items-center gap-2 pt-4">
                {!isFailed && asset.assetId && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1.5"
                      onClick={() => handleDownload(asset)}
                      disabled={downloading}
                    >
                      <DownloadIcon className="size-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1.5"
                      onClick={() => router.push(buildDuplicateUrl(asset))}
                    >
                      <LayersIcon className="size-3.5" />
                      <span className="hidden sm:inline">Duplicate</span>
                    </Button>
                  </>
                )}
                {asset.jobStatus === "FAILED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5"
                    onClick={() => handleRerun(asset)}
                  >
                    <RefreshCcwIcon className="size-3.5" />
                    Retry
                  </Button>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => handleFavorite(asset, !asset.isFavorite)}
                    title={asset.isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <StarIcon className={cn("size-4", asset.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                    <span className="sr-only">Toggle favorite</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setDetailsAsset(asset)}
                    title="View details"
                  >
                    <InfoIcon className="size-4 text-muted-foreground" />
                    <span className="sr-only">View metadata</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      const confirmMessage = asset.assetId
                        ? "Delete this asset and job? This action cannot be undone."
                        : "Delete this job from your library? This action cannot be undone.";

                      if (window.confirm(confirmMessage)) {
                        startTransition(() => {
                          // Always delete the job, which will also delete any associated asset
                          deleteJobsAction([asset.jobId])
                            .then((result) => {
                              if (!result?.ok) {
                                setFeedback({ variant: "error", message: result?.error ?? "Unable to delete job." });
                                return;
                              }
                              setItems((prev) => prev.filter((item) => item.id !== asset.id));
                              setFeedback({ variant: "success", message: "Job deleted." });
                            })
                            .catch(() => {
                              setFeedback({ variant: "error", message: "Unable to delete job." });
                            });
                        });
                      }
                    }}
                    title="Delete job"
                  >
                    <Trash2Icon className="size-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderAssetItems = () => {
    if (filteredAssetItems.length === 0) {
      return (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">No assets found</CardTitle>
            <CardDescription>
              Upload images or adjust your filters to see assets.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <div className={gridClasses}>
        {filteredAssetItems.map((asset) => {
          const isSelected = selectedIds.includes(asset.id);
          const sourceColor =
            asset.source === "generated"
              ? "bg-blue-100 text-blue-800 border-blue-300"
              : "bg-purple-100 text-purple-800 border-purple-300";

          return (
            <Card
              key={asset.id}
              className={cn(
                "group relative overflow-hidden transition-all",
                isSelected ? "border-primary ring-2 ring-primary/40" : "",
              )}
            >
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleSelect(asset.id, !isSelected)}
                  className={cn(
                    "flex size-5 items-center justify-center rounded-sm border bg-background text-xs font-semibold transition shadow-sm",
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted hover:border-primary/50",
                  )}
                >
                  {isSelected ? <CheckIcon className="size-4" /> : ""}
                </button>
                <Badge variant="outline" className={sourceColor}>
                  {asset.source === "generated" ? "Generated" : "Uploaded"}
                </Badge>
                <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300">
                  {asset.type}
                </Badge>
                {asset.usageCount > 0 && (
                  <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                    Used {asset.usageCount}x
                  </Badge>
                )}
              </div>
              {asset.isFavorite && (
                <div className="absolute right-3 top-3 z-10">
                  <StarIcon className="size-5 fill-amber-400 text-amber-400 drop-shadow" />
                </div>
              )}
              <button
                type="button"
                onClick={() => setAssetDetailsItem(asset)}
                className="relative block w-full group/image"
              >
                {asset.type === "IMAGE" ? (
                  <div className="relative aspect-video w-full bg-muted overflow-hidden">
                    <Image
                      src={asset.thumbnail}
                      alt={asset.title ?? "Asset"}
                      fill
                      unoptimized
                      className="object-cover transition duration-300 group-hover/image:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/30 transition-colors duration-200 flex items-center justify-center gap-3 opacity-0 group-hover/image:opacity-100">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="shadow-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAssetDownload(asset);
                        }}
                      >
                        <DownloadIcon className="size-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <video
                    src={asset.url}
                    className="aspect-video w-full bg-black object-cover"
                    controls={false}
                    muted
                    playsInline
                    loop
                  />
                )}
              </button>
              <CardHeader className="space-y-1.5">
                <CardTitle className="line-clamp-2 text-base font-semibold">
                  {asset.title ?? (asset.uploadInfo?.originalName || "Untitled")}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span>{formatRelative(asset.createdAt)}</span>
                  {asset.uploadInfo && (
                    <>
                      <span>•</span>
                      <span>{(asset.uploadInfo.size / 1024).toFixed(1)} KB</span>
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {asset.isJobOutput && asset.outputJobId && (
                  <p className="text-xs">
                    <span className="font-medium">Output from:</span> Job #{asset.outputJobId.slice(-8)}
                  </p>
                )}
                {asset.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {asset.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                    {asset.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{asset.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                ) : null}
              </CardContent>
              <CardFooter className="flex flex-wrap items-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5"
                  onClick={() => handleAssetDownload(asset)}
                  disabled={downloading}
                >
                  <DownloadIcon className="size-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </Button>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => handleAssetFavorite(asset, !asset.isFavorite)}
                    title={asset.isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <StarIcon className={cn("size-4", asset.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                    <span className="sr-only">Toggle favorite</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setAssetDetailsItem(asset)}
                    title="View details"
                  >
                    <InfoIcon className="size-4 text-muted-foreground" />
                    <span className="sr-only">View metadata</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleAssetDelete(asset)}
                    title="Delete asset"
                  >
                    <Trash2Icon className="size-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as typeof mainTab)} className="space-y-6">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="generations">Generations</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
        </TabsList>

        <TabsContent value="generations" className="space-y-6">
          <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="space-y-6">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="image">Images</TabsTrigger>
              <TabsTrigger value="video">Videos</TabsTrigger>
            </TabsList>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search prompt, tags, job ID..."
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="PROCESSING">Processing</SelectItem>
                <SelectItem value="QUEUED">Queued</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created-desc">Newest first</SelectItem>
                <SelectItem value="created-asc">Oldest first</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="favorite">Favorites</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={favoriteOnly ? "secondary" : "outline"}
              size="sm"
              onClick={() => setFavoriteOnly((prev) => !prev)}
              className="flex items-center gap-2"
            >
              <StarIcon className={cn("size-4", favoriteOnly ? "fill-current" : "")} />
              Favorites
            </Button>
            <Button
              variant={hideFailedJobs ? "secondary" : "outline"}
              size="sm"
              onClick={() => setHideFailedJobs((prev) => !prev)}
              className="flex items-center gap-2"
            >
              <XIcon className={cn("size-4")} />
              {hideFailedJobs ? "Show failed" : "Hide failed"}
            </Button>
            <Select
              value={collectionFilter}
              onValueChange={(value) => setCollectionFilter(value)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Collections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_COLLECTIONS}>All collections</SelectItem>
                {hasUncategorizedCollection ? (
                  <SelectItem value={UNCATEGORIZED_COLLECTION}>No collection</SelectItem>
                ) : null}
                {collectionOptions.map((collection) => (
                  <SelectItem value={collection} key={collection}>
                    {collection}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={gridMode === "comfortable" ? "default" : "outline"}
              size="icon"
              onClick={() => setGridMode("comfortable")}
              aria-label="Comfortable grid"
            >
              <Grid3X3Icon className="size-4" />
            </Button>
            <Button
              variant={gridMode === "compact" ? "default" : "outline"}
              size="icon"
              onClick={() => setGridMode("compact")}
              aria-label="Compact grid"
            >
              <Grid2X2Icon className="size-4" />
            </Button>
            <Button
              variant={gridMode === "list" ? "default" : "outline"}
              size="icon"
              onClick={() => setGridMode("list")}
              aria-label="List view"
            >
              <ListIcon className="size-4" />
            </Button>
          </div>
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-sm">
            <FilterIcon className="size-4 text-muted-foreground" />
            <span className="font-medium">Tags:</span>
            {tags.map((tag) => (
              <Button
                key={tag}
                variant={activeTags.includes(tag) ? "secondary" : "ghost"}
                size="sm"
                onClick={() => toggleTagFilter(tag)}
              >
                #{tag}
              </Button>
            ))}
            {activeTags.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setActiveTags([])}>
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}

        {feedback ? (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              feedback.variant === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {feedback.message}
          </div>
        ) : null}

        {selectedIds.length > 0 ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <span className="text-sm font-medium text-primary">
                {selectedIds.length} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSelectAllVisible(false)}
                disabled={isPending}
              >
                Clear selection
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSelectAllVisible(true)}
                disabled={isPending}
              >
                Select visible
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDownload}
                disabled={downloading || isPending}
                className="flex items-center gap-2"
              >
                <DownloadIcon className="size-4" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={isPending}
                className="flex items-center gap-2 text-destructive hover:text-destructive"
              >
                <Trash2Icon className="size-4" />
                Delete
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <TabsContent value="all" className="space-y-6">
          {renderAssets()}
        </TabsContent>
        <TabsContent value="image" className="space-y-6">
          {renderAssets()}
        </TabsContent>
        <TabsContent value="video" className="space-y-6">
          {renderAssets()}
        </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="assets" className="space-y-6">
          <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="space-y-6">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="image">Images</TabsTrigger>
              <TabsTrigger value="video">Videos</TabsTrigger>
            </TabsList>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search uploaded assets..."
                    className="pl-9"
                  />
                </div>
                <Select value={assetUsageFilter} onValueChange={(value) => setAssetUsageFilter(value as typeof assetUsageFilter)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Usage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All uploads</SelectItem>
                    <SelectItem value="used">Used in jobs</SelectItem>
                    <SelectItem value="unused">Unused</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created-desc">Newest first</SelectItem>
                    <SelectItem value="created-asc">Oldest first</SelectItem>
                    <SelectItem value="title">Title</SelectItem>
                    <SelectItem value="favorite">Favorites</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant={favoriteOnly ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setFavoriteOnly((prev) => !prev)}
                  className="flex items-center gap-2"
                >
                  <StarIcon className={cn("size-4", favoriteOnly ? "fill-current" : "")} />
                  Favorites
                </Button>
                <Select
                  value={collectionFilter}
                  onValueChange={(value) => setCollectionFilter(value)}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Collections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_COLLECTIONS}>All collections</SelectItem>
                    {hasUncategorizedCollection ? (
                      <SelectItem value={UNCATEGORIZED_COLLECTION}>No collection</SelectItem>
                    ) : null}
                    {collectionOptions.map((collection) => (
                      <SelectItem value={collection} key={collection}>
                        {collection}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={gridMode === "comfortable" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setGridMode("comfortable")}
                  aria-label="Comfortable grid"
                >
                  <Grid3X3Icon className="size-4" />
                </Button>
                <Button
                  variant={gridMode === "compact" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setGridMode("compact")}
                  aria-label="Compact grid"
                >
                  <Grid2X2Icon className="size-4" />
                </Button>
                <Button
                  variant={gridMode === "list" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setGridMode("list")}
                  aria-label="List view"
                >
                  <ListIcon className="size-4" />
                </Button>
              </div>
            </div>

            {tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-sm">
                <FilterIcon className="size-4 text-muted-foreground" />
                <span className="font-medium">Tags:</span>
                {tags.map((tag) => (
                  <Button
                    key={tag}
                    variant={activeTags.includes(tag) ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => toggleTagFilter(tag)}
                  >
                    #{tag}
                  </Button>
                ))}
                {activeTags.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setActiveTags([])}>
                    Clear
                  </Button>
                ) : null}
              </div>
            ) : null}

            {feedback ? (
              <div
                className={cn(
                  "rounded-md border px-3 py-2 text-sm",
                  feedback.variant === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                {feedback.message}
              </div>
            ) : null}

            {selectedIds.length > 0 ? (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <span className="text-sm font-medium text-primary">
                    {selectedIds.length} selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIds([])}
                    disabled={isPending}
                  >
                    Clear selection
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIds(filteredAssetItems.map((a) => a.id))}
                    disabled={isPending}
                  >
                    Select visible
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDownload}
                    disabled={downloading || isPending}
                    className="flex items-center gap-2"
                  >
                    <DownloadIcon className="size-4" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(`Delete ${selectedIds.length} selected assets? This cannot be undone.`)) {
                        startTransition(() => {
                          deleteAssetsAction(selectedIds)
                            .then((result) => {
                              if (!result?.ok) {
                                setFeedback({ variant: "error", message: result?.error ?? "Unable to delete assets." });
                                return;
                              }
                              setAssetItems((prev) => prev.filter((item) => !selectedIds.includes(item.id)));
                              setSelectedIds([]);
                              setFeedback({ variant: "success", message: "Assets deleted." });
                            })
                            .catch(() => {
                              setFeedback({ variant: "error", message: "Unable to delete assets." });
                            });
                        });
                      }
                    }}
                    disabled={isPending}
                    className="flex items-center gap-2 text-destructive hover:text-destructive"
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            <TabsContent value="all" className="space-y-6">
              {renderAssetItems()}
            </TabsContent>
            <TabsContent value="image" className="space-y-6">
              {renderAssetItems()}
            </TabsContent>
            <TabsContent value="video" className="space-y-6">
              {renderAssetItems()}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      <LightboxDialog asset={lightboxAsset} onOpenChange={setLightboxAsset} />
      <AssetDetailsDialog
        asset={detailsAsset}
        onOpenChange={setDetailsAsset}
        onSaveMetadata={handleSaveMetadata}
        onRerun={handleRerun}
      />
      <ShareAssetDialog
        asset={shareAsset}
        state={shareState}
        onClose={closeShareDialog}
        onGenerate={fetchShareLink}
        onRevoke={revokeShareLink}
      />
      <AssetItemDetailsDialog
        asset={assetDetailsItem}
        onOpenChange={setAssetDetailsItem}
        onSaveMetadata={handleAssetSaveMetadata}
      />
    </div>
  );
}

function AssetItemDetailsDialog({
  asset,
  onOpenChange,
  onSaveMetadata,
}: {
  asset: AssetLibraryItem | null;
  onOpenChange: (asset: AssetLibraryItem | null) => void;
  onSaveMetadata: (asset: AssetLibraryItem, tags: string[], collections: string[]) => void;
}) {
  const [tagsInput, setTagsInput] = useState("");
  const [collectionsInput, setCollectionsInput] = useState("");

  useEffect(() => {
    if (asset) {
      setTagsInput(asset.tags.join(", "));
      setCollectionsInput(asset.collections.join(", "));
    }
  }, [asset]);

  const open = Boolean(asset);

  const handleSave = () => {
    if (!asset) return;
    const nextTags = tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag, index, arr) => tag.length > 0 && arr.indexOf(tag) === index);

    const nextCollections = collectionsInput
      .split(",")
      .map((value) => value.trim())
      .filter((value, index, arr) => value.length > 0 && arr.indexOf(value) === index);

    onSaveMetadata(asset, nextTags, nextCollections);
    onOpenChange(null);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onOpenChange(null)}>
      {asset ? (
        <DialogContent className="max-w-3xl space-y-6">
          <DialogHeader>
            <DialogTitle>Asset details</DialogTitle>
            <DialogDescription>
              View metadata, usage information, and manage tags or collections.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-md border p-4">
              <h3 className="text-sm font-medium text-foreground">Asset Information</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Type</span>
                  <span className="font-medium text-foreground">{asset.type}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Source</span>
                  <span className="font-medium text-foreground capitalize">{asset.source}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Created</span>
                  <span className="font-medium text-foreground">
                    {formatDistanceToNow(new Date(asset.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {asset.uploadInfo && (
                  <>
                    <div className="flex items-center justify-between">
                      <span>File size</span>
                      <span className="font-medium text-foreground">
                        {(asset.uploadInfo.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Original name</span>
                      <span className="font-medium text-foreground truncate max-w-[200px]" title={asset.uploadInfo.originalName}>
                        {asset.uploadInfo.originalName}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-3 rounded-md border p-4">
              <h3 className="text-sm font-medium text-foreground">Usage</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Used as reference</span>
                  <span className="font-medium text-foreground">{asset.usageCount} times</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Is job output</span>
                  <span className="font-medium text-foreground">{asset.isJobOutput ? "Yes" : "No"}</span>
                </div>
                {asset.isJobOutput && asset.outputJobId && (
                  <div className="flex items-center justify-between">
                    <span>Output of</span>
                    <span className="font-medium text-foreground">Job #{asset.outputJobId.slice(-8)}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="asset-tags">Tags</Label>
                <Input
                  id="asset-tags"
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  placeholder="comma separated"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asset-collections">Collections</Label>
                <Input
                  id="asset-collections"
                  value={collectionsInput}
                  onChange={(event) => setCollectionsInput(event.target.value)}
                  placeholder="comma separated"
                />
              </div>
            </div>
          </div>
          <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
            {asset.type === "IMAGE" ? (
              <Image
                src={asset.url}
                alt={asset.title ?? "Asset preview"}
                fill
                unoptimized
                className="object-contain"
              />
            ) : (
              <video
                controls
                className="h-full w-full"
                src={asset.url}
              />
            )}
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => onOpenChange(null)} className="flex items-center gap-1">
              <XIcon className="size-4" />
              Cancel
            </Button>
            <Button onClick={handleSave} className="flex items-center gap-1">
              <PencilIcon className="size-4" />
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function LightboxDialog({
  asset,
  onOpenChange,
}: {
  asset: LibraryAsset | null;
  onOpenChange: (asset: LibraryAsset | null) => void;
}) {
  const open = Boolean(asset);
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onOpenChange(null)}>
      {asset ? (
        <DialogContent className="max-w-4xl space-y-4">
          <DialogHeader>
            <DialogTitle>{asset.title ?? "Asset preview"}</DialogTitle>
            <DialogDescription>
              Generated {formatDistanceToNow(new Date(asset.createdAt), { addSuffix: true })} • Job #{asset.jobId}
            </DialogDescription>
          </DialogHeader>
          {asset.assetType === "IMAGE" ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
              {asset.previewUrl ? (
                <Image
                  src={asset.previewUrl}
                  alt={asset.title ?? asset.prompt}
                  fill
                  unoptimized
                  className="object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Preview not available yet.
                </div>
              )}
            </div>
          ) : (
            <video
              controls
              className="aspect-video w-full rounded-md bg-black"
              src={asset.assetUrl ?? asset.previewUrl ?? undefined}
              poster={asset.thumbnailUrl ?? undefined}
            />
          )}
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>
              <span className="font-semibold text-foreground">Prompt:</span> {asset.prompt}
            </div>
            {asset.negativePrompt ? (
              <div>
                <span className="font-semibold text-foreground">Negative prompt:</span>{" "}
                {asset.negativePrompt}
              </div>
            ) : null}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function AssetDetailsDialog({
  asset,
  onOpenChange,
  onSaveMetadata,
  onRerun,
}: {
  asset: LibraryAsset | null;
  onOpenChange: (asset: LibraryAsset | null) => void;
  onSaveMetadata: (asset: LibraryAsset, tags: string[], collections: string[]) => void;
  onRerun: (asset: LibraryAsset) => void;
}) {
  const [tagsInput, setTagsInput] = useState("");
  const [collectionsInput, setCollectionsInput] = useState("");

  useEffect(() => {
    if (asset) {
      setTagsInput(asset.tags.join(", "));
      setCollectionsInput(asset.collections.join(", "));
    }
  }, [asset]);

  const open = Boolean(asset);

  const handleSave = () => {
    if (!asset) return;
    const nextTags = tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag, index, arr) => tag.length > 0 && arr.indexOf(tag) === index);

    const nextCollections = collectionsInput
      .split(",")
      .map((value) => value.trim())
      .filter((value, index, arr) => value.length > 0 && arr.indexOf(value) === index);

    onSaveMetadata(asset, nextTags, nextCollections);
    onOpenChange(null);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onOpenChange(null)}>
          {asset ? (
            <DialogContent className="max-w-3xl space-y-6">
              <DialogHeader>
                <DialogTitle>Asset details</DialogTitle>
                <DialogDescription>
                  Inspect prompts, metadata, and manage collections or tags.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-md border p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground">Prompt</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(asset.prompt)}
                      className="flex items-center gap-1"
                    >
                      <CopyIcon className="size-3.5" />
                      Copy
                    </Button>
                  </div>
                  <Textarea value={asset.prompt} readOnly rows={6} />
                  {asset.failureReason ? (
                    <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      Last run failed: {asset.failureReason}
                    </div>
                  ) : null}
                  {asset.negativePrompt ? (
                    <div className="space-y-2">
                      <Label>Negative prompt</Label>
                      <Textarea value={asset.negativePrompt} readOnly rows={4} />
                    </div>
              ) : null}
            </div>
            <div className="space-y-3 rounded-md border p-4">
              <h3 className="text-sm font-medium text-foreground">Generation settings</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Workflow</span>
                  <span className="font-medium text-foreground">{typeLabels[asset.jobType]}</span>
                </div>
                {asset.providerDisplayName ? (
                  <div className="flex items-center justify-between">
                    <span>Model</span>
                    <span className="font-medium text-foreground">{asset.providerDisplayName}</span>
                  </div>
                ) : null}
                {asset.aspectRatio ? (
                  <div className="flex items-center justify-between">
                    <span>Aspect ratio</span>
                    <span className="font-medium text-foreground">{asset.aspectRatio}</span>
                  </div>
                ) : null}
                {asset.duration ? (
                  <div className="flex items-center justify-between">
                    <span>Duration</span>
                    <span className="font-medium text-foreground">{asset.duration} sec</span>
                  </div>
                ) : null}
                {asset.mode ? (
                  <div className="flex items-center justify-between">
                    <span>Edit mode</span>
                    <span className="font-medium text-foreground">{asset.mode}</span>
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  placeholder="comma separated"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collections">Collections</Label>
                <Input
                  id="collections"
                  value={collectionsInput}
                  onChange={(event) => setCollectionsInput(event.target.value)}
                  placeholder="comma separated"
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(buildDuplicateUrl(asset));
                    window.open(buildDuplicateUrl(asset), "_blank");
                  }}
                  className="flex items-center gap-1"
                >
                  <ExternalLinkIcon className="size-3.5" />
                  Open workflow
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onRerun(asset)}
                  className="flex items-center gap-1"
                >
                  <RefreshCcwIcon className="size-3.5" />
                  Re-run job
                </Button>
              </div>
            </div>
          </div>
          {Object.keys(asset.metadata).length > 0 ? (
            <div className="rounded-md border p-4">
              <h3 className="text-sm font-medium text-foreground">Provider metadata</h3>
              <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(asset.metadata, null, 2)}
              </pre>
            </div>
          ) : null}
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => onOpenChange(null)} className="flex items-center gap-1">
              <XIcon className="size-4" />
              Cancel
            </Button>
            <Button onClick={handleSave} className="flex items-center gap-1">
              <PencilIcon className="size-4" />
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
