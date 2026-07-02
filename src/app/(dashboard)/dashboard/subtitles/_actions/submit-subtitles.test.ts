import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineType, Provider } from "@prisma/client";

import { TRANSLATION_ASSET_MODEL_SLUGS } from "@/lib/pipeline/audio-models";

const getSession = vi.fn();
const submitPipeline = vi.fn();
const findUnique = vi.fn();
const findFirst = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

vi.mock("@/lib/pipeline/submit", () => ({
  submitPipeline: (...args: unknown[]) => submitPipeline(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findUnique: (...args: unknown[]) => findUnique(...args) },
    providerModel: { findFirst: (...args: unknown[]) => findFirst(...args) },
  },
}));

import { submitSubtitlesAction } from "./submit-subtitles";

const validInput = { videoAssetId: "asset-1" };

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "u1" } });
  submitPipeline.mockResolvedValue({ pipelineId: "p1", heldCost: 4 });
  findUnique.mockResolvedValue({ id: "asset-1", userId: "u1", url: "https://cdn/video.mp4" });
  findFirst.mockResolvedValue({ id: "sub-id" });
});

describe("submitSubtitlesAction", () => {
  it("submits with resolved subtitle model + asset url when authed + valid", async () => {
    const result = await submitSubtitlesAction(validInput);

    expect(submitPipeline).toHaveBeenCalledWith({
      userId: "u1",
      type: PipelineType.SUBTITLES,
      params: {
        videoUrl: "https://cdn/video.mp4",
        videoAssetId: "asset-1",
        subtitleModelId: "sub-id",
      },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: Provider.FAL,
          slug: TRANSLATION_ASSET_MODEL_SLUGS.subtitle,
        }),
      }),
    );
    expect(result).toEqual({ ok: true, pipelineId: "p1", heldCost: 4 });
  });

  it("passes targetLanguage through when supplied", async () => {
    await submitSubtitlesAction({ videoAssetId: "asset-1", targetLanguage: "es" });
    expect(submitPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ targetLanguage: "es" }),
      }),
    );
  });

  it("rejects when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const result = await submitSubtitlesAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects when asset not owned by user", async () => {
    findUnique.mockResolvedValue({ id: "asset-1", userId: "other", url: "https://cdn/x.mp4" });
    const result = await submitSubtitlesAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects when asset does not exist", async () => {
    findUnique.mockResolvedValue(null);
    const result = await submitSubtitlesAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns configured-error when the model is missing", async () => {
    findFirst.mockResolvedValue(null);
    const result = await submitSubtitlesAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured yet/i);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects invalid input", async () => {
    const result = await submitSubtitlesAction({ videoAssetId: "" });
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });
});
