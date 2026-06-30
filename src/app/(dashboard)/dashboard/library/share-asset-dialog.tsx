"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { CheckIcon, CopyIcon, ExternalLinkIcon, Share2Icon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LibraryAsset } from "@/types/library";
import { cn } from "@/lib/utils";

type ShareAssetDialogProps = {
  asset: LibraryAsset | null;
  state: {
    loading: boolean;
    error: string | null;
    url: string | null;
    token: string | null;
    success: boolean;
    hasShareToken: boolean;
  };
  onClose: () => void;
  onGenerate: () => void;
  onRevoke: () => void;
};

export function ShareAssetDialog({
  asset,
  state,
  onClose,
  onGenerate,
  onRevoke,
}: ShareAssetDialogProps) {
  const open = Boolean(asset);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopied(false);
    }
  }, [open]);

  const handleCopy = async () => {
    if (!state.url) return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const shareText = asset
    ? encodeURIComponent(
        `Check out this ${asset.assetType.toLowerCase()} I generated with PixelFoundry!`,
      )
    : "";

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      {asset ? (
        <DialogContent className="space-y-6">
          <DialogHeader>
            <DialogTitle>Share asset</DialogTitle>
            <DialogDescription>
              Generate a public link to share this asset with teammates or clients.
            </DialogDescription>
          </DialogHeader>

          {state.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </div>
          ) : null}
          {state.success && !state.error ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {state.url ? "Share link ready to copy." : "Share link removed."}
            </div>
          ) : null}

          {state.url ? (
            <div className="space-y-2">
              <Label htmlFor="share-url">Public link</Label>
              <div className="flex items-center gap-2">
                <Input id="share-url" value={state.url} readOnly />
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                  <span className="sr-only">Copy link</span>
                </Button>
                <Button variant="secondary" size="icon" asChild>
                  <Link href={state.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLinkIcon className="size-4" />
                    <span className="sr-only">Open link</span>
                  </Link>
                </Button>
              </div>
              {asset.shareCreatedAt ? (
                <p className="text-xs text-muted-foreground">
                  Shared {formatDistanceToNow(new Date(asset.shareCreatedAt), { addSuffix: true })}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              No share link yet. Generate one to publish a read-only viewer page.
            </div>
          )}

          <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Sharing includes:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>Preview of the asset</li>
              <li>Prompt and negative prompt</li>
              <li>Job type and run status</li>
              <li>Download button for the asset</li>
            </ul>
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              onClick={onRevoke}
              disabled={state.loading || !state.hasShareToken}
              className={cn(
                "flex items-center gap-2 text-destructive hover:text-destructive",
                !state.hasShareToken ? "opacity-60" : "",
              )}
            >
              <Trash2Icon className="size-4" />
              Revoke
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {state.url ? (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="flex items-center gap-2"
                >
                  <Link
                    href={`https://x.com/share?url=${encodeURIComponent(state.url)}&text=${shareText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Share2Icon className="size-4" />
                    Share on X
                  </Link>
                </Button>
              ) : null}
              <Button
                onClick={onGenerate}
                disabled={state.loading}
                className="flex items-center gap-2"
              >
                <Share2Icon className="size-4" />
                {state.hasShareToken ? "Refresh link" : "Generate link"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
