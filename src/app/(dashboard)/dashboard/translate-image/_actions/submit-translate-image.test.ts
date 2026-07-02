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

import { submitTranslateImageAction } from "./submit-translate-image";

const validInput = { imageAssetId: "asset-1", targetLanguage: "es" };

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "u1" } });
  submitPipeline.mockResolvedValue({ pipelineId: "p1", heldCost: 8 });
  findUnique.mockResolvedValue({ id: "asset-1", userId: "u1", url: "https://cdn/image.png" });
  findFirst.mockResolvedValue({ id: "edit-id" });
});

describe("submitTranslateImageAction", () => {
  it("submits with resolved edit model + asset url when authed + valid", async () => {
    const result = await submitTranslateImageAction(validInput);

    expect(submitPipeline).toHaveBeenCalledWith({
      userId: "u1",
      type: PipelineType.TRANSLATE_IMAGE,
      params: {
        imageUrl: "https://cdn/image.png",
        imageAssetId: "asset-1",
        targetLanguage: "es",
        editModelId: "edit-id",
      },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: Provider.FAL,
          slug: TRANSLATION_ASSET_MODEL_SLUGS.translateImage,
        }),
      }),
    );
    expect(result).toEqual({ ok: true, pipelineId: "p1", heldCost: 8 });
  });

  it("rejects when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const result = await submitTranslateImageAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects when asset not owned by user", async () => {
    findUnique.mockResolvedValue({ id: "asset-1", userId: "other", url: "https://cdn/x.png" });
    const result = await submitTranslateImageAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects when asset does not exist", async () => {
    findUnique.mockResolvedValue(null);
    const result = await submitTranslateImageAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns configured-error when the model is missing", async () => {
    findFirst.mockResolvedValue(null);
    const result = await submitTranslateImageAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured yet/i);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects invalid input", async () => {
    const result = await submitTranslateImageAction({ imageAssetId: "", targetLanguage: "es" });
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });
});
