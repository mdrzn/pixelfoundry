import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Viewport,
} from "@xyflow/react";
import { v4 as uuid } from "uuid";

import type {
  PromptNodeData,
  ImageNodeData,
  NoteNodeData,
  ModelOption,
  SerializedCanvas,
} from "../_lib/canvas-types";

type CanvasState = {
  canvasId: string;
  nodes: Node[];
  edges: Edge[];
  models: ModelOption[];
  viewport: Viewport;
  isDirty: boolean;
  isSaving: boolean;

  // React Flow handlers
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  // Node CRUD
  addPromptNode: (position: { x: number; y: number }) => void;
  addImageNode: (
    position: { x: number; y: number },
    data: ImageNodeData,
    sourcePromptNodeId?: string,
  ) => void;
  addNoteNode: (position: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, data: Partial<PromptNodeData | ImageNodeData | NoteNodeData>) => void;
  deleteSelectedNodes: () => void;
  deleteNode: (nodeId: string) => void;

  // Generation
  startGeneration: (nodeId: string, jobId: string) => void;
  onJobCompleted: (
    nodeId: string,
    asset: { id: string; url: string; thumbnail: string; prompt: string; jobId: string },
  ) => void;
  onJobFailed: (nodeId: string, error: string) => void;

  // References
  getConnectedReferenceAssetIds: (promptNodeId: string) => string[];

  // Persistence
  saveCanvas: () => Promise<void>;
  hydrateFromServer: (canvas: SerializedCanvas, models: ModelOption[]) => void;
  setViewport: (viewport: Viewport) => void;
};

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useCanvasStore = create<CanvasState>()(
  subscribeWithSelector((set, get) => ({
    canvasId: "",
    nodes: [],
    edges: [],
    models: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    isDirty: false,
    isSaving: false,

    onNodesChange: (changes) => {
      set((state) => ({
        nodes: applyNodeChanges(changes, state.nodes),
        isDirty: true,
      }));
    },

    onEdgesChange: (changes) => {
      set((state) => ({
        edges: applyEdgeChanges(changes, state.edges),
        isDirty: true,
      }));
    },

    onConnect: (connection) => {
      set((state) => ({
        edges: addEdge(
          { ...connection, type: "smoothstep", animated: true },
          state.edges,
        ),
        isDirty: true,
      }));
    },

    addPromptNode: (position) => {
      const id = `prompt-${uuid()}`;
      const newNode: Node = {
        id,
        type: "prompt",
        position,
        data: {
          prompt: "",
          negativePrompt: "",
          providerModelId: get().models[0]?.value ?? null,
          aspectRatio: "1:1",
          jobId: null,
          jobStatus: "idle",
        } satisfies PromptNodeData,
      };
      set((state) => ({
        nodes: [...state.nodes, newNode],
        isDirty: true,
      }));
    },

    addImageNode: (position, data, sourcePromptNodeId) => {
      const id = `image-${uuid()}`;
      const newNode: Node = {
        id,
        type: "image",
        position,
        data,
      };

      const newEdges: Edge[] = [];
      if (sourcePromptNodeId) {
        newEdges.push({
          id: `edge-${sourcePromptNodeId}-${id}`,
          source: sourcePromptNodeId,
          target: id,
          type: "smoothstep",
          animated: true,
        });
      }

      set((state) => ({
        nodes: [...state.nodes, newNode],
        edges: [...state.edges, ...newEdges],
        isDirty: true,
      }));
    },

    addNoteNode: (position) => {
      const id = `note-${uuid()}`;
      const newNode: Node = {
        id,
        type: "note",
        position,
        data: {
          text: "",
        } satisfies NoteNodeData,
      };
      set((state) => ({
        nodes: [...state.nodes, newNode],
        isDirty: true,
      }));
    },

    updateNodeData: (nodeId, data) => {
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...data } }
            : node,
        ),
        isDirty: true,
      }));
    },

    deleteSelectedNodes: () => {
      set((state) => {
        const selectedIds = new Set(
          state.nodes.filter((n) => n.selected).map((n) => n.id),
        );
        return {
          nodes: state.nodes.filter((n) => !selectedIds.has(n.id)),
          edges: state.edges.filter(
            (e) => !selectedIds.has(e.source) && !selectedIds.has(e.target),
          ),
          isDirty: true,
        };
      });
    },

    deleteNode: (nodeId) => {
      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        edges: state.edges.filter(
          (e) => e.source !== nodeId && e.target !== nodeId,
        ),
        isDirty: true,
      }));
    },

    getConnectedReferenceAssetIds: (promptNodeId) => {
      const state = get();
      // Find all edges where this prompt node is the target (image → prompt)
      const incomingEdges = state.edges.filter((e) => e.target === promptNodeId);
      const sourceNodeIds = incomingEdges.map((e) => e.source);

      // Get asset IDs from connected image nodes
      return state.nodes
        .filter((n) => sourceNodeIds.includes(n.id) && n.type === "image")
        .map((n) => (n.data as ImageNodeData).assetId)
        .filter(Boolean);
    },

    startGeneration: (nodeId, jobId) => {
      get().updateNodeData(nodeId, {
        jobId,
        jobStatus: "processing",
        error: undefined,
      } as Partial<PromptNodeData>);
    },

    onJobCompleted: (nodeId, asset) => {
      const state = get();
      const sourceNode = state.nodes.find((n) => n.id === nodeId);

      get().updateNodeData(nodeId, {
        jobStatus: "completed",
      } as Partial<PromptNodeData>);

      const imagePosition = sourceNode
        ? { x: sourceNode.position.x + 380, y: sourceNode.position.y }
        : { x: 400, y: 200 };

      get().addImageNode(
        imagePosition,
        {
          assetId: asset.id,
          url: asset.url,
          thumbnail: asset.thumbnail,
          prompt: asset.prompt,
          jobId: asset.jobId,
        },
        nodeId,
      );
    },

    onJobFailed: (nodeId, error) => {
      get().updateNodeData(nodeId, {
        jobStatus: "failed",
        error,
      } as Partial<PromptNodeData>);
    },

    saveCanvas: async () => {
      const state = get();
      if (!state.canvasId || state.isSaving) return;

      set({ isSaving: true });
      try {
        const { saveCanvasAction } = await import("../_actions/canvas-actions");
        await saveCanvasAction(state.canvasId, {
          nodes: state.nodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            data: n.data,
          })),
          edges: state.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: e.type,
            animated: e.animated,
          })),
          viewport: state.viewport,
        });
        set({ isDirty: false });
      } catch {
        // Silently fail — will retry on next change
      } finally {
        set({ isSaving: false });
      }
    },

    hydrateFromServer: (canvas, models) => {
      set({
        canvasId: canvas.id,
        nodes: (canvas.nodes as Node[]) ?? [],
        edges: (canvas.edges as Edge[]) ?? [],
        viewport: canvas.viewport ?? { x: 0, y: 0, zoom: 1 },
        models,
        isDirty: false,
        isSaving: false,
      });
    },

    setViewport: (viewport) => {
      set({ viewport, isDirty: true });
    },
  })),
);

// Auto-save: subscribe to node/edge changes, debounce 2s
useCanvasStore.subscribe(
  (state) => ({ nodes: state.nodes, edges: state.edges }),
  () => {
    const state = useCanvasStore.getState();
    if (!state.canvasId || !state.isDirty) return;

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      useCanvasStore.getState().saveCanvas();
    }, 2000);
  },
  { equalityFn: (a, b) => a.nodes === b.nodes && a.edges === b.edges },
);
