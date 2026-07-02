import { describe, it, expect } from "vitest";
import { buildCostFn, FIXED_STEP_COSTS } from "./costs";

describe("buildCostFn", () => {
  it("returns the model cost for a model-backed step", () => {
    const cost = buildCostFn({ img: 6, vid: 30 });
    expect(cost("image", "img")).toBe(6);
    expect(cost("video", "vid")).toBe(30);
  });

  it("throws for an unknown provider model id", () => {
    const cost = buildCostFn({ img: 6 });
    expect(() => cost("image", "nope")).toThrow(/unknown provider model cost/i);
  });

  it("uses FIXED_STEP_COSTS for steps without a model: llm->1, merge->2", () => {
    const cost = buildCostFn({});
    expect(cost("llm")).toBe(FIXED_STEP_COSTS.llm);
    expect(cost("llm")).toBe(1);
    expect(cost("merge")).toBe(FIXED_STEP_COSTS.merge);
    expect(cost("merge")).toBe(2);
  });

  it("returns 0 for an unknown stepType with no model", () => {
    const cost = buildCostFn({});
    expect(cost("mystery")).toBe(0);
    expect(cost("image", null)).toBe(0);
  });
});
