import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineType } from "@prisma/client";

import { SCENE_BUILDER_MODEL_SLUGS } from "@/lib/pipeline/audio-models";

const getSession = vi.fn();
const submitPipeline = vi.fn();
const findMany = vi.fn();
const findFirst = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

vi.mock("@/lib/pipeline/submit", () => ({
  submitPipeline: (...args: unknown[]) => submitPipeline(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    providerModel: {
      findMany: (...args: unknown[]) => findMany(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
    },
  },
}));

import { submitSceneBuilderAction } from "./submit-scene-builder";

const validInput = { concept: "Two heroes cross a desert to reach a hidden oasis" };

const slugModels = [
  { id: "script-id", slug: SCENE_BUILDER_MODEL_SLUGS.script },
  { id: "edit-id", slug: SCENE_BUILDER_MODEL_SLUGS.imageEdit },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "u1" } });
  submitPipeline.mockResolvedValue({ pipelineId: "p1", heldCost: 300 });
  findMany.mockResolvedValue(slugModels);
  // first call = image, second = video
  findFirst.mockResolvedValueOnce({ id: "img-id" }).mockResolvedValueOnce({ id: "vid-id" });
});

describe("submitSceneBuilderAction", () => {
  it("submits with resolved model ids when authed + valid", async () => {
    const result = await submitSceneBuilderAction(validInput);

    expect(submitPipeline).toHaveBeenCalledTimes(1);
    expect(submitPipeline).toHaveBeenCalledWith({
      userId: "u1",
      type: PipelineType.SCENE_BUILDER,
      params: {
        concept: validInput.concept,
        aspectRatio: "16:9",
        scriptModelId: "script-id",
        imageModelId: "img-id",
        imageEditModelId: "edit-id",
        videoModelId: "vid-id",
      },
    });
    expect(result).toEqual({ ok: true, pipelineId: "p1", heldCost: 300 });
  });

  it("rejects when unauthenticated and does not call submitPipeline", async () => {
    getSession.mockResolvedValue(null);
    const result = await submitSceneBuilderAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects invalid input (concept too short) without calling submitPipeline", async () => {
    const result = await submitSceneBuilderAction({ concept: "too short" });
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns configured-error when a slug model is missing", async () => {
    findMany.mockResolvedValue(slugModels.slice(0, 1));
    const result = await submitSceneBuilderAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured yet/i);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns configured-error when no image/video model is found", async () => {
    findFirst.mockReset();
    findFirst.mockResolvedValue(null);
    const result = await submitSceneBuilderAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured yet/i);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns the error message when submitPipeline throws", async () => {
    submitPipeline.mockRejectedValue(new Error("Insufficient credits for this action."));
    const result = await submitSceneBuilderAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/insufficient/i);
  });
});
