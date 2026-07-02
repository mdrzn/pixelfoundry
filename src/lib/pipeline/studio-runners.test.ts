import { describe, it, expect, vi } from "vitest";

// Mock only runFalModelStep (and the job helpers, so existing runners don't hit
// the network). Keep extractFalAssets real via importActual so the factory's
// asset extraction is exercised end to end.
vi.mock("@/lib/providers/fal", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    runFalModelStep: vi.fn(),
    runFalStep: vi.fn(),
    runFalImageJob: vi.fn(),
    runFalVideoJob: vi.fn(),
  };
});

import { getRunner } from "./runners";
import type { RunnerContext } from "./runners";
import { runFalModelStep } from "@/lib/providers/fal";

const ctx = {
  userId: "u",
  stepId: "s",
  getModel: vi.fn(async () => ({}) as never),
  readAsset: vi.fn(),
} as unknown as RunnerContext;

const NEW_TYPES = [
  "music",
  "image-edit",
  "trim-video",
  "mux-audio",
  "auto-subtitle",
  "lipsync",
];
const EXISTING_TYPES = [
  "llm",
  "image",
  "video",
  "merge",
  "stt",
  "tts",
  "voice-clone",
  "audio-merge",
];

describe("studio step runners", () => {
  it("resolves each new studio step type to a function", () => {
    for (const t of NEW_TYPES) {
      expect(typeof getRunner(t)).toBe("function");
    }
  });

  it("still resolves existing step types", () => {
    for (const t of EXISTING_TYPES) {
      expect(typeof getRunner(t)).toBe("function");
    }
  });

  it("throws for an unknown step type", () => {
    expect(() => getRunner("nope")).toThrow();
  });

  it("image-edit returns an IMAGE asset from a fal image response", async () => {
    vi.mocked(runFalModelStep).mockResolvedValueOnce({
      requestId: "r",
      data: { images: [{ url: "u" }] },
    } as never);
    const result = await getRunner("image-edit")({ prompt: "x" }, "m", ctx);
    expect(result).toEqual({
      asset: { type: "IMAGE", url: "u", thumbnail: "u" },
    });
  });

  it("auto-subtitle returns a VIDEO asset from a fal video response", async () => {
    vi.mocked(runFalModelStep).mockResolvedValueOnce({
      data: { video: { url: "v" } },
    } as never);
    const result = await getRunner("auto-subtitle")({}, "m", ctx);
    expect(result).toEqual({
      asset: { type: "VIDEO", url: "v", thumbnail: undefined },
    });
  });

  it("music returns an AUDIO asset from a fal audio response", async () => {
    vi.mocked(runFalModelStep).mockResolvedValueOnce({
      data: { audio: { url: "a" } },
    } as never);
    const result = await getRunner("music")({}, "m", ctx);
    expect(result).toEqual({
      asset: { type: "AUDIO", url: "a", thumbnail: undefined },
    });
  });

  it("throws when providerModelId is missing", async () => {
    await expect(
      getRunner("lipsync")({}, undefined, ctx),
    ).rejects.toThrow(/lipsync/);
  });
});
