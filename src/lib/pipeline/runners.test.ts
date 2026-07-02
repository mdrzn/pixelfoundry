import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/providers/fal", () => ({
  runFalStep: vi.fn(async () => ({
    requestId: "r",
    data: { output: '```json\n{"shots":[{"image_prompt":"a"}]}\n```' },
  })),
  runFalImageJob: vi.fn(),
  runFalVideoJob: vi.fn(),
}));

import { extractJson, getRunner } from "./runners";
import type { RunnerContext } from "./runners";
import { runFalStep } from "@/lib/providers/fal";

describe("extractJson", () => {
  it("parses a bare object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses a ```json fenced block", () => {
    expect(extractJson('```json\n{"a":1,"b":[2,3]}\n```')).toEqual({ a: 1, b: [2, 3] });
  });
  it("parses a bare array", () => {
    expect(extractJson("[1, 2, 3]")).toEqual([1, 2, 3]);
  });
  it("parses JSON with surrounding prose", () => {
    expect(extractJson('Here you go: {"ok":true} enjoy!')).toEqual({ ok: true });
  });
  it("throws on garbage", () => {
    expect(() => extractJson("no json here at all")).toThrow();
  });
});

describe("getRunner", () => {
  it("returns a function for known step types", () => {
    for (const t of ["llm", "image", "video", "merge"]) {
      expect(typeof getRunner(t)).toBe("function");
    }
  });
  it("throws for an unknown step type", () => {
    expect(() => getRunner("nope")).toThrow();
  });
});

describe("llm runner", () => {
  it("extracts JSON from a fenced fal response", async () => {
    const ctx = {
      userId: "u",
      stepId: "s",
      getModel: vi.fn(),
      readAsset: vi.fn(),
    } as unknown as RunnerContext;
    const result = await getRunner("llm")({ prompt: "x" }, undefined, ctx);
    expect(result).toEqual({ data: { shots: [{ image_prompt: "a" }] } });
  });

  it("appends serialized context to the prompt sent to fal", async () => {
    const ctx = {
      userId: "u",
      stepId: "s",
      getModel: vi.fn(),
      readAsset: vi.fn(),
    } as unknown as RunnerContext;
    vi.mocked(runFalStep).mockClear();
    await getRunner("llm")({ prompt: "P", context: { text: "hello" } }, undefined, ctx);
    expect(runFalStep).toHaveBeenCalledTimes(1);
    const [, body] = vi.mocked(runFalStep).mock.calls[0];
    const sentPrompt = (body as { prompt: string }).prompt;
    expect(sentPrompt).toContain("P");
    expect(sentPrompt).toContain(JSON.stringify({ text: "hello" }));
  });
});
