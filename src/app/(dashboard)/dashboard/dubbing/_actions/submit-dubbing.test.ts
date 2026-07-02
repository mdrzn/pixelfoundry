import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineType, Provider, AssetType } from "@prisma/client";

import {
  AUDIO_MODEL_SLUGS,
  PODCAST_MODEL_SLUGS,
  SHORTS_MODEL_SLUGS,
} from "@/lib/pipeline/audio-models";

const getSession = vi.fn();
const submitPipeline = vi.fn();
const findUnique = vi.fn();
const findMany = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

vi.mock("@/lib/pipeline/submit", () => ({
  submitPipeline: (...args: unknown[]) => submitPipeline(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findUnique: (...args: unknown[]) => findUnique(...args) },
    providerModel: { findMany: (...args: unknown[]) => findMany(...args) },
  },
}));

import { submitDubbingAction } from "./submit-dubbing";

const validInput = { videoAssetId: "video-1", targetLanguage: "es" };

const ALL_MODELS = [
  { id: "stt-id", slug: AUDIO_MODEL_SLUGS.stt },
  { id: "tts-id", slug: AUDIO_MODEL_SLUGS.tts },
  { id: "clone-id", slug: AUDIO_MODEL_SLUGS.clone },
  { id: "lipsync-id", slug: PODCAST_MODEL_SLUGS.lipsync },
  { id: "mux-id", slug: SHORTS_MODEL_SLUGS.mux },
  { id: "llm-id", slug: SHORTS_MODEL_SLUGS.script },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "u1" } });
  submitPipeline.mockResolvedValue({ pipelineId: "p1", heldCost: 42 });
  findUnique.mockResolvedValue({
    id: "video-1",
    userId: "u1",
    url: "https://cdn/video.mp4",
    type: AssetType.VIDEO,
  });
  findMany.mockResolvedValue(ALL_MODELS);
});

describe("submitDubbingAction", () => {
  it("submits with resolved models + asset url + lipsync=false default", async () => {
    const result = await submitDubbingAction(validInput);

    expect(submitPipeline).toHaveBeenCalledWith({
      userId: "u1",
      type: PipelineType.DUBBING,
      params: {
        videoUrl: "https://cdn/video.mp4",
        videoAssetId: "video-1",
        targetLanguage: "es",
        lipsync: false,
        sttModelId: "stt-id",
        ttsModelId: "tts-id",
        cloneModelId: "clone-id",
        lipsyncModelId: "lipsync-id",
        muxModelId: "mux-id",
        llmModelId: "llm-id",
      },
    });
    expect(result).toEqual({ ok: true, pipelineId: "p1", heldCost: 42 });
  });

  it("passes lipsync=true through when supplied", async () => {
    await submitDubbingAction({ ...validInput, lipsync: true });
    expect(submitPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ lipsync: true }),
      }),
    );
  });

  it("passes lipsync=false through when supplied", async () => {
    await submitDubbingAction({ ...validInput, lipsync: false });
    expect(submitPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ lipsync: false }),
      }),
    );
  });

  it("rejects when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const result = await submitDubbingAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects when asset not owned by user", async () => {
    findUnique.mockResolvedValue({
      id: "video-1",
      userId: "other",
      url: "https://cdn/x.mp4",
      type: AssetType.VIDEO,
    });
    const result = await submitDubbingAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects when asset does not exist", async () => {
    findUnique.mockResolvedValue(null);
    const result = await submitDubbingAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects when asset is not a video", async () => {
    findUnique.mockResolvedValue({
      id: "video-1",
      userId: "u1",
      url: "https://cdn/audio.mp3",
      type: AssetType.AUDIO,
    });
    const result = await submitDubbingAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/video/i);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns configured-error when a model is missing", async () => {
    findMany.mockResolvedValue(ALL_MODELS.filter((m) => m.slug !== SHORTS_MODEL_SLUGS.mux));
    const result = await submitDubbingAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured/i);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects invalid input (empty videoAssetId)", async () => {
    const result = await submitDubbingAction({ videoAssetId: "", targetLanguage: "es" });
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });
});
