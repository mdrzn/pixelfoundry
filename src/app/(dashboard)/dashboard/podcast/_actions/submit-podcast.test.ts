import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineType } from "@prisma/client";

import { PODCAST_MODEL_SLUGS } from "@/lib/pipeline/audio-models";

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

import { submitPodcastAction } from "./submit-podcast";

const validInput = { topic: "The future of home robotics", speaker1: "Ada", speaker2: "Grace" };

const slugModels = [
  { id: "script-id", slug: PODCAST_MODEL_SLUGS.script },
  { id: "tts-id", slug: PODCAST_MODEL_SLUGS.tts },
  { id: "stt-id", slug: PODCAST_MODEL_SLUGS.stt },
  { id: "lip-id", slug: PODCAST_MODEL_SLUGS.lipsync },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "u1" } });
  submitPipeline.mockResolvedValue({ pipelineId: "p1", heldCost: 600 });
  findMany.mockResolvedValue(slugModels);
  findFirst.mockResolvedValue({ id: "img-id" });
});

describe("submitPodcastAction", () => {
  it("submits with resolved model ids when authed + valid", async () => {
    const result = await submitPodcastAction(validInput);

    expect(submitPipeline).toHaveBeenCalledTimes(1);
    expect(submitPipeline).toHaveBeenCalledWith({
      userId: "u1",
      type: PipelineType.PODCAST,
      params: {
        topic: validInput.topic,
        script: undefined,
        speaker1: "Ada",
        speaker2: "Grace",
        scriptModelId: "script-id",
        imageModelId: "img-id",
        ttsModelId: "tts-id",
        sttModelId: "stt-id",
        lipsyncModelId: "lip-id",
      },
    });
    expect(result).toEqual({ ok: true, pipelineId: "p1", heldCost: 600 });
  });

  it("defaults speaker names to Host / Guest", async () => {
    await submitPodcastAction({ topic: "x".repeat(20) });
    const call = submitPipeline.mock.calls[0][0];
    expect(call.params.speaker1).toBe("Host");
    expect(call.params.speaker2).toBe("Guest");
  });

  it("accepts a script instead of a topic", async () => {
    const result = await submitPodcastAction({ script: "Ada: hi. Grace: hello." });
    expect(result.ok).toBe(true);
    const call = submitPipeline.mock.calls[0][0];
    expect(call.params.script).toBe("Ada: hi. Grace: hello.");
  });

  it("rejects when neither topic nor script is given", async () => {
    const result = await submitPodcastAction({ speaker1: "A", speaker2: "B" });
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects when unauthenticated and does not call submitPipeline", async () => {
    getSession.mockResolvedValue(null);
    const result = await submitPodcastAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns configured-error when a slug model is missing", async () => {
    findMany.mockResolvedValue(slugModels.slice(0, 2));
    const result = await submitPodcastAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured yet/i);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns configured-error when no image model is found", async () => {
    findFirst.mockResolvedValue(null);
    const result = await submitPodcastAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured yet/i);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns the error message when submitPipeline throws", async () => {
    submitPipeline.mockRejectedValue(new Error("Insufficient credits for this action."));
    const result = await submitPodcastAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/insufficient/i);
  });
});
