import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineType } from "@prisma/client";

import { SHORTS_MODEL_SLUGS } from "@/lib/pipeline/audio-models";

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

import { submitShortsAction } from "./submit-shorts";

const validInput = { topic: "The history of coffee culture" };

const slugModels = [
  { id: "script-id", slug: SHORTS_MODEL_SLUGS.script },
  { id: "voice-id", slug: SHORTS_MODEL_SLUGS.voice },
  { id: "music-id", slug: SHORTS_MODEL_SLUGS.music },
  { id: "sub-id", slug: SHORTS_MODEL_SLUGS.subtitle },
  { id: "mux-id", slug: SHORTS_MODEL_SLUGS.mux },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "u1" } });
  submitPipeline.mockResolvedValue({ pipelineId: "p1", heldCost: 200 });
  findMany.mockResolvedValue(slugModels);
  // first call = image, second = video
  findFirst.mockResolvedValueOnce({ id: "img-id" }).mockResolvedValueOnce({ id: "vid-id" });
});

describe("submitShortsAction", () => {
  it("submits with resolved model ids when authed + valid", async () => {
    const result = await submitShortsAction(validInput);

    expect(submitPipeline).toHaveBeenCalledTimes(1);
    expect(submitPipeline).toHaveBeenCalledWith({
      userId: "u1",
      type: PipelineType.SHORTS,
      params: {
        topic: validInput.topic,
        aspectRatio: "9:16",
        scriptModelId: "script-id",
        imageModelId: "img-id",
        videoModelId: "vid-id",
        voiceModelId: "voice-id",
        musicModelId: "music-id",
        subtitleModelId: "sub-id",
        muxModelId: "mux-id",
      },
    });
    expect(result).toEqual({ ok: true, pipelineId: "p1", heldCost: 200 });
  });

  it("rejects when unauthenticated and does not call submitPipeline", async () => {
    getSession.mockResolvedValue(null);
    const result = await submitShortsAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects invalid input (topic too short) without calling submitPipeline", async () => {
    const result = await submitShortsAction({ topic: "hi" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least 5/);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns configured-error when a slug model is missing", async () => {
    findMany.mockResolvedValue(slugModels.slice(0, 3));
    const result = await submitShortsAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured yet/i);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns configured-error when no image/video model is found", async () => {
    findFirst.mockReset();
    findFirst.mockResolvedValue(null);
    const result = await submitShortsAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured yet/i);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns the error message when submitPipeline throws", async () => {
    submitPipeline.mockRejectedValue(new Error("Insufficient credits for this action."));
    const result = await submitShortsAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/insufficient/i);
  });
});
