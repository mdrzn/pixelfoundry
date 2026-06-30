"use client";

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  MessageSquarePlus,
  StickyNote,
  ZoomIn,
  ZoomOut,
  Maximize,
  Check,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

import { useCanvasStore } from "../_store/canvas-store";

export function CanvasToolbar() {
  const { addPromptNode, addNoteNode, isDirty, isSaving } = useCanvasStore();
  const reactFlow = useReactFlow();

  const addNodeAtCenter = useCallback(
    (type: "prompt" | "note") => {
      const viewport = reactFlow.getViewport();
      const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
      const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;

      if (type === "prompt") {
        addPromptNode({ x: centerX - 150, y: centerY - 100 });
      } else {
        addNoteNode({ x: centerX - 100, y: centerY - 50 });
      }
    },
    [reactFlow, addPromptNode, addNoteNode],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-md backdrop-blur-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => addNodeAtCenter("prompt")}
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Add Prompt</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => addNodeAtCenter("note")}
            >
              <StickyNote className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Add Note</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => reactFlow.zoomIn()}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Zoom In</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => reactFlow.zoomOut()}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Zoom Out</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => reactFlow.fitView({ padding: 0.2, duration: 300 })}
            >
              <Maximize className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Fit View</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-border" />

        <div className="flex h-8 items-center px-2">
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : isDirty ? (
            <span className="text-xs text-muted-foreground">Unsaved</span>
          ) : (
            <Check className="h-3.5 w-3.5 text-green-600" />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
