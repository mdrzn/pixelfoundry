"use client";

import { memo, useCallback, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Loader2, AlertCircle, Sparkles, X, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { PromptNodeData } from "../_lib/canvas-types";
import { useCanvasStore } from "../_store/canvas-store";
import { generateFromCanvasAction } from "../_actions/canvas-actions";

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "3:2", "4:5"] as const;

function PromptNodeInner({ id, data }: NodeProps) {
  const nodeData = data as unknown as PromptNodeData;
  const { updateNodeData, startGeneration, deleteNode, getConnectedReferenceAssetIds, models, edges } = useCanvasStore();

  const isGenerating =
    nodeData.jobStatus === "queued" || nodeData.jobStatus === "processing";

  // Count connected reference images (re-derive when edges change)
  const referenceCount = useMemo(() => {
    return getConnectedReferenceAssetIds(id).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, edges, getConnectedReferenceAssetIds]);

  const handleGenerate = useCallback(async () => {
    if (!nodeData.prompt.trim() || !nodeData.providerModelId) return;

    const referenceAssetIds = getConnectedReferenceAssetIds(id);

    const result = await generateFromCanvasAction({
      prompt: nodeData.prompt,
      negativePrompt: nodeData.negativePrompt,
      providerModelId: nodeData.providerModelId,
      aspectRatio: nodeData.aspectRatio,
      referenceAssetIds,
    });

    if (result.ok && result.jobId) {
      startGeneration(id, result.jobId);
    } else {
      updateNodeData(id, {
        jobStatus: "failed",
        error: result.error ?? "Generation failed",
      });
    }
  }, [id, nodeData, startGeneration, updateNodeData, getConnectedReferenceAssetIds]);

  return (
    <div className="w-[300px] rounded-lg border bg-card p-3 shadow-md">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-blue-500 !bg-background"
      />

      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Prompt
        </span>
        <div className="flex items-center gap-1">
          {nodeData.jobStatus === "completed" && (
            <span className="text-xs text-green-600">Done</span>
          )}
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => deleteNode(id)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {referenceCount > 0 && (
        <div className="mb-2 flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          <ImageIcon className="h-3 w-3 shrink-0" />
          <span>{referenceCount} reference image{referenceCount > 1 ? "s" : ""} connected</span>
        </div>
      )}

      <Textarea
        placeholder="Describe what you want to generate..."
        className="mb-2 min-h-[80px] resize-none text-sm"
        value={nodeData.prompt}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        disabled={isGenerating}
      />

      <Textarea
        placeholder="Negative prompt (optional)"
        className="mb-2 min-h-[40px] resize-none text-xs"
        value={nodeData.negativePrompt ?? ""}
        onChange={(e) => updateNodeData(id, { negativePrompt: e.target.value })}
        disabled={isGenerating}
      />

      <Select
        value={nodeData.providerModelId ?? ""}
        onValueChange={(value) => updateNodeData(id, { providerModelId: value })}
        disabled={isGenerating}
      >
        <SelectTrigger className="mb-2 h-8 text-xs">
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.value} value={model.value}>
              <span>{model.label}</span>
              <span className="ml-1 text-muted-foreground">
                ({model.creditCost}cr)
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mb-3 flex gap-1">
        {ASPECT_RATIOS.map((ratio) => (
          <button
            key={ratio}
            type="button"
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              nodeData.aspectRatio === ratio
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            onClick={() => updateNodeData(id, { aspectRatio: ratio })}
            disabled={isGenerating}
          >
            {ratio}
          </button>
        ))}
      </div>

      {nodeData.jobStatus === "failed" && nodeData.error && (
        <div className="mb-2 flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{nodeData.error}</span>
        </div>
      )}

      <Button
        size="sm"
        className="w-full text-xs"
        onClick={handleGenerate}
        disabled={isGenerating || !nodeData.prompt.trim() || !nodeData.providerModelId}
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="mr-1 h-3 w-3" />
            Generate
          </>
        )}
      </Button>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-primary !bg-background"
      />
    </div>
  );
}

export const PromptNode = memo(PromptNodeInner);
