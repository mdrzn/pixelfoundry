import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineType, Provider } from "@prisma/client";

import { AUDIO_MODEL_SLUGS } from "@/lib/pipeline/audio-models";

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

import { submitVoiceoverAction } from "./submit-voiceover";

const validInput = { audioAssetId: "asset-1", targetLanguage: "es" };

const allModels = [
  { id: "stt-id", slug: AUDIO_MODEL_SLUGS.stt },
  { id: "tts-id", slug: AUDIO_MODEL_SLUGS.tts },
  { id: "clone-id", slug: AUDIO_MODEL_SLUGS.clone },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "u1" } });
  submitPipeline.mockResolvedValue({ pipelineId: "p1", heldCost: 7 });
  findUnique.mockResolvedValue({ id: "asset-1", userId: "u1", url: "https://cdn/audio.mp3" });
  findMany.mockResolvedValue(allModels);
});

describe("submitVoiceoverAction", () => {
  it("submits with resolved model ids + asset url when authed + valid", async () => {
    const result = await submitVoiceoverAction(validInput);

    expect(submitPipeline).toHaveBeenCalledTimes(1);
    expect(submitPipeline).toHaveBeenCalledWith({
      userId: "u1",
      type: PipelineType.VOICEOVER,
      params: {
        audioUrl: "https://cdn/audio.mp3",
        audioAssetId: "asset-1",
        targetLanguage: "es",
        sttModelId: "stt-id",
        ttsModelId: "tts-id",
        cloneModelId: "clone-id",
      },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ provider: Provider.FAL, isActive: true }),
      }),
    );
    expect(result).toEqual({ ok: true, pipelineId: "p1", heldCost: 7 });
  });

  it("rejects when unauthenticated and does not call submitPipeline", async () => {
    getSession.mockResolvedValue(null);

    const result = await submitVoiceoverAction(validInput);

    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects when the asset is not owned by the user", async () => {
    findUnique.mockResolvedValue({ id: "asset-1", userId: "someone-else", url: "https://cdn/x.mp3" });

    const result = await submitVoiceoverAction(validInput);

    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects when the asset does not exist", async () => {
    findUnique.mockResolvedValue(null);

    const result = await submitVoiceoverAction(validInput);

    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns a configured-error when any audio model is missing", async () => {
    findMany.mockResolvedValue([
      { id: "stt-id", slug: AUDIO_MODEL_SLUGS.stt },
      { id: "tts-id", slug: AUDIO_MODEL_SLUGS.tts },
    ]);

    const result = await submitVoiceoverAction(validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured yet/i);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects invalid input without calling submitPipeline", async () => {
    const result = await submitVoiceoverAction({ audioAssetId: "", targetLanguage: "es" });

    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });
});
