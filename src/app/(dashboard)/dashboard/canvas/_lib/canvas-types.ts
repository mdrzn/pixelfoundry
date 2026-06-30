export type PromptNodeData = {
  prompt: string;
  negativePrompt?: string;
  providerModelId: string | null;
  aspectRatio: string;
  jobId: string | null;
  jobStatus: "idle" | "queued" | "processing" | "completed" | "failed";
  error?: string;
};

export type ImageNodeData = {
  assetId: string;
  url: string;
  thumbnail: string;
  prompt: string;
  jobId: string;
  width?: number;
  height?: number;
};

export type NoteNodeData = {
  text: string;
};

export type CanvasNodeType = "prompt" | "image" | "note";

export type ModelOption = {
  value: string;
  label: string;
  description: string | null;
  creditCost: number;
  provider: string;
};

export type SerializedCanvas = {
  id: string;
  nodes: unknown[];
  edges: unknown[];
  viewport: { x: number; y: number; zoom: number };
};
