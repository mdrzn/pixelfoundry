import { describe, it, expect } from "vitest";
import { resolveInput, type StepOutput } from "./refs";

const outputs: Record<string, StepOutput> = {
  shots: { data: { shots: [{ prompt: "a" }, { prompt: "b" }, { prompt: "c" }] } },
  "shot:1:image": { assetUrl: "/media/img1.png", assetId: "a1" },
};

describe("resolveInput", () => {
  it("passes through primitives and plain objects unchanged", () => {
    expect(resolveInput({ x: 1, y: "z", b: false }, outputs)).toEqual({ x: 1, y: "z", b: false });
  });
  it("resolves a whole-data $data ref", () => {
    expect(resolveInput({ all: { $data: "shots" } }, outputs)).toEqual({ all: { shots: [{ prompt: "a" }, { prompt: "b" }, { prompt: "c" }] } });
  });
  it("resolves a $data ref with a dot+bracket path", () => {
    expect(resolveInput({ p: { $data: "shots", path: "shots[2].prompt" } }, outputs)).toEqual({ p: "c" });
  });
  it("resolves a $asset ref to the assetUrl", () => {
    expect(resolveInput({ image_url: { $asset: "shot:1:image" } }, outputs)).toEqual({ image_url: "/media/img1.png" });
  });
  it("resolves tokens nested inside arrays", () => {
    expect(resolveInput([{ $asset: "shot:1:image" }, { $data: "shots", path: "shots[0].prompt" }], outputs)).toEqual(["/media/img1.png", "a"]);
  });
  it("throws on a missing step", () => {
    expect(() => resolveInput({ x: { $data: "nope" } }, outputs)).toThrow();
  });
  it("throws when $asset step has no assetUrl", () => {
    expect(() => resolveInput({ x: { $asset: "shots" } }, outputs)).toThrow();
  });
  it("throws on an unnavigable $data path", () => {
    expect(() => resolveInput({ x: { $data: "shots", path: "shots[99].prompt" } }, outputs)).toThrow();
  });
});
