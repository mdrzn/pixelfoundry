import { describe, it, expect } from "vitest";
import { extractFalAssets, buildFalInput } from "./fal";
import { AssetType } from "@prisma/client";

describe("extractFalAssets", () => {
  it("extracts images[]", () => {
    const a = extractFalAssets({ images: [{ url: "https://x/i.png" }] }, AssetType.IMAGE);
    expect(a).toEqual([{ type: AssetType.IMAGE, url: "https://x/i.png", thumbnail: "https://x/i.png" }]);
  });
  it("extracts video.url", () => {
    const a = extractFalAssets({ video: { url: "https://x/v.mp4" } }, AssetType.VIDEO);
    expect(a[0]).toMatchObject({ type: AssetType.VIDEO, url: "https://x/v.mp4" });
  });
  it("extracts video_url", () => {
    expect(extractFalAssets({ video_url: "https://x/v.mp4" }, AssetType.VIDEO)[0].url).toBe("https://x/v.mp4");
  });
  it("extracts audio.url", () => {
    expect(extractFalAssets({ audio: { url: "https://x/a.mp3" } }, AssetType.AUDIO)[0].url).toBe("https://x/a.mp3");
  });
  it("returns [] when nothing matches", () => {
    expect(extractFalAssets({ foo: 1 }, AssetType.IMAGE)).toEqual([]);
  });
});

describe("buildFalInput", () => {
  it("maps generic fields via inputMap", () => {
    const out = buildFalInput(
      { prompt: "a cat", aspectRatio: "9:16", negativePrompt: "blur" },
      { prompt: "prompt", aspectRatio: "aspect_ratio", negativePrompt: "negative_prompt" },
      { generate_audio: true },
    );
    expect(out).toEqual({ prompt: "a cat", aspect_ratio: "9:16", negative_prompt: "blur", generate_audio: true });
  });
  it("drops undefined fields", () => {
    const out = buildFalInput({ prompt: "x", seed: undefined }, { prompt: "prompt", seed: "seed" }, {});
    expect(out).toEqual({ prompt: "x" });
  });
});
