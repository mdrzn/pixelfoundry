"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { ModelOption, PromptNodeData, SerializedCanvas } from "./_lib/canvas-types";
import { useCanvasStore } from "./_store/canvas-store";
import { getCanvasJobStatusAction } from "./_actions/canvas-actions";
import { PromptNode } from "./_components/prompt-node";
import { ImageNode } from "./_components/image-node";
import { NoteNode } from "./_components/note-node";
import { CanvasToolbar } from "./_components/canvas-toolbar";
import { CanvasMinimap } from "./_components/canvas-minimap";

const nodeTypes = {
  prompt: PromptNode,
  image: ImageNode,
  note: NoteNode,
};

function useJobPoller() {
  const handledJobsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const poll = async () => {
      // Always read fresh state from the store — no stale closures
      const { nodes, onJobCompleted, onJobFailed } = useCanvasStore.getState();

      const activeNodes = nodes.filter(
        (n) =>
          n.type === "prompt" &&
          (n.data as PromptNodeData).jobId &&
          !handledJobsRef.current.has((n.data as PromptNodeData).jobId!) &&
          ((n.data as PromptNodeData).jobStatus === "queued" ||
            (n.data as PromptNodeData).jobStatus === "processing"),
      );

      if (!activeNodes.length) return;

      const jobIds = activeNodes
        .map((n) => (n.data as PromptNodeData).jobId)
        .filter((id): id is string => id !== null);

      if (!jobIds.length) return;

      try {
        const statuses = await getCanvasJobStatusAction(jobIds);

        for (const status of statuses) {
          const matchingNode = activeNodes.find(
            (n) => (n.data as PromptNodeData).jobId === status.jobId,
          );
          if (!matchingNode) continue;

          if (status.status === "COMPLETED" && status.outputAsset) {
            handledJobsRef.current.add(status.jobId);
            onJobCompleted(matchingNode.id, {
              id: status.outputAsset.id,
              url: status.outputAsset.url,
              thumbnail: status.outputAsset.thumbnail,
              prompt: (matchingNode.data as PromptNodeData).prompt,
              jobId: status.jobId,
            });
          } else if (status.status === "FAILED") {
            handledJobsRef.current.add(status.jobId);
            onJobFailed(matchingNode.id, status.error ?? "Generation failed");
          }
        }
      } catch {
        // Silently fail — will retry on next poll
      }
    };

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []); // Stable — single interval, reads fresh state each tick
}

export function CanvasClient({
  canvas,
  models,
}: {
  canvas: SerializedCanvas;
  models: ModelOption[];
}) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    hydrateFromServer,
    setViewport,
  } = useCanvasStore();

  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!hydratedRef.current) {
      hydrateFromServer(canvas, models);
      hydratedRef.current = true;
    }
  }, [canvas, models, hydrateFromServer]);

  useJobPoller();

  const handleViewportChange = useCallback(
    (viewport: Viewport) => {
      setViewport(viewport);
    },
    [setViewport],
  );

  const defaultEdgeOptions = useMemo(
    () => ({ type: "smoothstep" as const, animated: true }),
    [],
  );

  return (
    <div className="h-[calc(100vh-73px)] w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onViewportChange={handleViewportChange}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode="Shift"
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls className="!rounded-lg !border !shadow-md" />
        <CanvasMinimap />
        <Panel position="top-left">
          <CanvasToolbar />
        </Panel>
      </ReactFlow>
    </div>
  );
}
