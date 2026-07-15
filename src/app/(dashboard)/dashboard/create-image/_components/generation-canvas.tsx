"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { ImageIcon, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StudioEmptyState } from "@/components/studio/studio-empty-state";

type RecentAssetOption = {
  id: string;
  title: string | null;
  url: string;
  thumbnail: string;
  createdAt: string;
};

type RecentJob = {
  id: string;
  type: string;
  status: string;
  prompt: string;
  createdAt: string;
  completedAt: string | null;
  outputAsset: RecentAssetOption | null;
};

type GenerationCanvasProps = {
  recentAssets: RecentAssetOption[];
  onAssetClick?: (asset: RecentAssetOption) => void;
  selectedAssetIds?: string[];
  emptyStateMessage?: string;
  jobType?: string;
};

export function GenerationCanvas({
  recentAssets,
  onAssetClick,
  selectedAssetIds = [],
  emptyStateMessage = "Your recent generations will appear here. Start by creating your first image!",
  jobType = "CREATE_IMAGE",
}: GenerationCanvasProps) {
  const [jobs, setJobs] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Poll for recent jobs
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch(`/api/jobs/recent?type=${jobType}&limit=24`, {
          cache: "no-store",
        });
        if (response.ok) {
          const data = await response.json();
          setJobs(data.jobs || []);
        }
      } catch (error) {
        console.error("Failed to fetch recent jobs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();

    // Poll every 3 seconds
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [jobType]);

  const hasJobs = jobs.length > 0;
  const processingCount = jobs.filter((j) => j.status === "PROCESSING" || j.status === "QUEUED").length;

  if (!loading && !hasJobs) {
    return (
      <StudioEmptyState
        icon={ImageIcon}
        title="No generations yet"
        description={emptyStateMessage}
        hint="Configure your prompt in the sidebar and click Generate"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Recent Generations</h3>
          <p className="text-xs text-muted-foreground">
            {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
            {processingCount > 0 && ` (${processingCount} processing)`}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Last 24 jobs
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {jobs.map((job) => {
          const isProcessing = job.status === "PROCESSING" || job.status === "QUEUED";
          const isFailed = job.status === "FAILED";
          const asset = job.outputAsset;
          const isSelected = asset ? selectedAssetIds.includes(asset.id) : false;

          return (
            <button
              key={job.id}
              type="button"
              onClick={() => asset && onAssetClick?.(asset)}
              disabled={!asset}
              className={cn(
                "group relative overflow-hidden rounded-lg border bg-card transition-all",
                asset && !isFailed && "hover:border-primary hover:shadow-md cursor-pointer",
                !asset && "cursor-default",
                isSelected && "border-primary ring-2 ring-primary ring-offset-2",
                isFailed && "opacity-60",
              )}
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                {asset ? (
                  <>
                    <Image
                      src={asset.thumbnail || asset.url}
                      alt={asset.title ?? "Generated image"}
                      fill
                      unoptimized
                      className="object-cover transition-transform duration-300 group-hover:scale-105 pointer-events-none"
                    />
                    {isSelected && <div className="absolute inset-0 bg-primary/20 pointer-events-none" />}
                  </>
                ) : isProcessing ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-xs font-medium text-muted-foreground">Processing...</p>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-xs font-medium text-destructive">Failed</p>
                  </div>
                )}
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-medium">
                  {asset?.title ?? job.prompt.slice(0, 30) + (job.prompt.length > 30 ? "..." : "")}
                </p>
                <p className="text-[10px] uppercase text-muted-foreground">
                  {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
