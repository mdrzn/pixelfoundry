"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { X } from "lucide-react";

import type { NoteNodeData } from "../_lib/canvas-types";
import { useCanvasStore } from "../_store/canvas-store";

function NoteNodeInner({ id, data }: NodeProps) {
  const nodeData = data as unknown as NoteNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useCanvasStore((s) => s.deleteNode);

  return (
    <div className="group/node relative w-[200px] rounded-lg border border-yellow-300 bg-yellow-50 p-3 shadow-sm dark:border-yellow-700 dark:bg-yellow-950">
      <button
        type="button"
        className="absolute right-1 top-1 rounded p-0.5 text-yellow-600 opacity-0 transition-opacity hover:bg-yellow-200 group-hover/node:opacity-100 dark:text-yellow-400 dark:hover:bg-yellow-900"
        onClick={() => deleteNode(id)}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <textarea
        className="w-full resize-none border-none bg-transparent text-sm outline-none placeholder:text-yellow-600/50 dark:placeholder:text-yellow-400/50"
        rows={4}
        placeholder="Add a note..."
        value={nodeData.text}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
      />
    </div>
  );
}

export const NoteNode = memo(NoteNodeInner);
