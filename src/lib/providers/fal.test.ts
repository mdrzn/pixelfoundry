import { describe, it, expect, vi, afterEach } from "vitest";
import { extractFalAssets, buildFalInput, runFalStep } from "./fal";
import { AssetType } from "@prisma/client";
import { ProviderJobError } from "@/lib/providers/types";

vi.mock("@/lib/admin", () => ({
  getProviderCredentialSecret: vi.fn(async () => ({ apiKey: "test-key" })),
}));

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
  it("extracts bare-string images[]", () => {
    const a = extractFalAssets({ images: ["https://x/a.png", "https://x/b.png"] }, AssetType.IMAGE);
    expect(a).toEqual([
      { type: AssetType.IMAGE, url: "https://x/a.png", thumbnail: "https://x/a.png" },
      { type: AssetType.IMAGE, url: "https://x/b.png", thumbnail: "https://x/b.png" },
    ]);
  });
  it("extracts bare-string video", () => {
    const a = extractFalAssets({ video: "https://x/v.mp4" }, AssetType.VIDEO);
    expect(a).toEqual([{ type: AssetType.VIDEO, url: "https://x/v.mp4", thumbnail: undefined }]);
  });
  it("extracts multiple {url} objects preserving order", () => {
    const a = extractFalAssets(
      { images: [{ url: "https://x/1.png" }, { url: "https://x/2.png" }] },
      AssetType.IMAGE,
    );
    expect(a.map((x) => x.url)).toEqual(["https://x/1.png", "https://x/2.png"]);
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
  it("preserves falsy-but-valid values (seed:0 and static generate_audio:false)", () => {
    const out = buildFalInput(
      { prompt: "x", seed: 0 },
      { prompt: "prompt", seed: "seed" },
      { generate_audio: false },
    );
    expect(out).toEqual({ prompt: "x", seed: 0, generate_audio: false });
  });
});

describe("runFalStep", () => {
  afterEach(() => vi.unstubAllGlobals());

  const jsonResponse = (body: unknown, ok = true) => ({
    ok,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  it("resolves { requestId, data } on COMPLETED", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ request_id: "req1" }))
      .mockResolvedValueOnce(jsonResponse({ status: "COMPLETED" }))
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: "https://x/i.png" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runFalStep("ep", {});
    expect(result).toEqual({ requestId: "req1", data: { images: [{ url: "https://x/i.png" }] } });
  });

  it("polls the status_url/response_url fal returns (subpath models)", async () => {
    // fal returns URLs based on the BASE app id (fal-ai/flux), not the
    // subpath submit endpoint (fal-ai/flux/schnell). Must use what fal sends.
    const statusUrl = "https://queue.fal.run/fal-ai/flux/requests/req9/status";
    const responseUrl = "https://queue.fal.run/fal-ai/flux/requests/req9";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ request_id: "req9", status_url: statusUrl, response_url: responseUrl }))
      .mockResolvedValueOnce(jsonResponse({ status: "COMPLETED" }))
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: "https://x/i.png" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runFalStep("fal-ai/flux/schnell", {});
    expect(result.requestId).toBe("req9");
    // 2nd fetch hits the returned status_url, 3rd hits response_url — NOT the
    // constructed .../fal-ai/flux/schnell/requests/... paths.
    expect(fetchMock.mock.calls[1][0]).toBe(statusUrl);
    expect(fetchMock.mock.calls[2][0]).toBe(responseUrl);
  });

  it("throws with providerJobId on FAILED", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ request_id: "req2" }))
      .mockResolvedValueOnce(jsonResponse({ status: "FAILED" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runFalStep("ep", {})).rejects.toMatchObject({
      name: "ProviderJobError",
      providerJobId: "req2",
    });
  });

  it("throws when submit is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ detail: "bad" }, false));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runFalStep("ep", {})).rejects.toBeInstanceOf(ProviderJobError);
  });
});
