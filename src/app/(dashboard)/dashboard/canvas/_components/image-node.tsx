"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Maximize2, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { ImageNodeData } from "../_lib/canvas-types";
import { useCanvasStore } from "../_store/canvas-store";

function ImageNodeInner({ id, data }: NodeProps) {
  const nodeData = data as unknown as ImageNodeData;
  const [isOpen, setIsOpen] = useState(false);
  const deleteNode = useCanvasStore((s) => s.deleteNode);

  return (
    <div className="group/node w-[240px] overflow-hidden rounded-lg border bg-card shadow-md">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-primary !bg-background"
      />

      <button
        type="button"
        className="absolute right-1 top-1 z-10 rounded bg-black/50 p-0.5 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/node:opacity-100"
        onClick={() => deleteNode(id)}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <div className="group relative cursor-pointer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={nodeData.thumbnail}
              alt={nodeData.prompt}
              className="aspect-square w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
              <Maximize2 className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </div>
        </DialogTrigger>
        <DialogContent className="max-w-2xl p-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={nodeData.url}
            alt={nodeData.prompt}
            className="w-full rounded-lg"
          />
        </DialogContent>
      </Dialog>

      <div className="p-2">
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {nodeData.prompt}
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-primary !bg-background"
      />
    </div>
  );
}

export const ImageNode = memo(ImageNodeInner);
